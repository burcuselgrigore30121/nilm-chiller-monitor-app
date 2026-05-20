from __future__ import annotations

import io
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from src.anomaly_detection import isolation_forest_id31, pelt_changepoints, sax_patterns, sax_top_counts
from src.cleaning import clean_chiller_data
from src.data_loader import canonicalize, dataset_summary, guess_columns, make_sample_data
from src.model import train_virtual_sensor, train_logistic_onoff
from src.report import html_report

app = FastAPI(title="NILM Chiller Monitor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://nilm-chiller-monitor-app.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE: dict[str, Any] = {
    "raw": None,
    "cleaned": None,
    "removed": None,
    "predictions": None,
    "result": None,
}
SAMPLE_PATH = Path(__file__).parent / "sample_data.csv"
UPLOAD_DIR = Path(__file__).parent / "uploads"


def json_safe(value: Any) -> Any:
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def downsample_records(df: pd.DataFrame, cols: list[str], max_points: int = 600) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return []
    existing = [c for c in cols if c in df.columns]
    if not existing:
        return []
    step = max(1, len(df) // max_points)
    out = df.iloc[::step][existing].copy()
    if "Date" in out.columns:
        out["Date"] = out["Date"].astype(str)
    return json_safe(out.to_dict(orient="records"))


def read_any_upload(file_bytes: bytes, filename: str) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(file_bytes))
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(file_bytes))
    raise ValueError("Upload a CSV, XLSX, or XLS file.")


def auto_canonicalize(df: pd.DataFrame) -> pd.DataFrame:
    guess = guess_columns(list(df.columns))
    mapping = {
        "Date": guess.date,
        "ID_31": guess.id31,
        "ID_32": guess.id32,
        "temp_C": guess.temperature,
        "humidity": guess.humidity,
    }
    return canonicalize(df, mapping)


def build_alerts(cleaning_summary: dict, predictions: pd.DataFrame | None) -> list[dict[str, Any]]:
    alerts = []
    def add(kind, severity, reason, count, action):
        if int(count or 0) > 0:
            alerts.append({
                "type": kind,
                "severity": severity,
                "reason": reason,
                "affectedInterval": f"{int(count):,} samples",
                "recommendedAction": action,
            })

    add("Physical limit", "critical", "ID_32 contains physically impossible values above 50 kW.", cleaning_summary.get("physical_limit_removed", 0), "Inspect data acquisition and sensor scaling.")
    add("Frozen sensor", "warning", "ID_32 stayed constant for repeated intervals.", cleaning_summary.get("frozen_sensor_removed", 0), "Check wiring, sensor state, and logger updates.")
    add("Cold-weather ON", "warning", "Chiller appeared ON while outside temperature was too low.", cleaning_summary.get("weather_validation_removed", 0), "Verify if this is real operation or a sensor artifact.")

    if predictions is not None and not predictions.empty:
        mismatch = int((predictions["actual_on"] != predictions["predicted_on"]).sum()) if {"actual_on", "predicted_on"}.issubset(predictions.columns) else 0
        high_div = int((predictions["error_kw"].abs() > max(2.0, predictions["ID_32"].std() if "ID_32" in predictions else 2.0)).sum()) if "error_kw" in predictions else 0
        add("ON/OFF mismatch", "critical", "Physical and virtual ON/OFF states do not match.", mismatch, "Inspect intervals with mismatch and compare against weather/context.")
        add("Virtual divergence", "critical", "Virtual sensor prediction diverges from the physical sensor.", high_div, "Use divergence as a trigger for sensor fault diagnostics.")

    if not alerts:
        alerts.append({
            "type": "No active critical alert",
            "severity": "normal",
            "reason": "No critical diagnostic issue detected with the current thresholds.",
            "affectedInterval": "0 samples",
            "recommendedAction": "Continue monitoring and validate with new data.",
        })
    return alerts


def run_pipeline(df: pd.DataFrame, source: str) -> dict[str, Any]:
    raw_summary = dataset_summary(df)
    cleaned, removed, cleaning_summary = clean_chiller_data(df)
    analysis_df = cleaned
    if len(cleaned) > 1500:
        step = max(1, len(cleaned) // 1500)
        analysis_df = cleaned.iloc[::step].reset_index(drop=True)

    if_df = isolation_forest_id31(analysis_df) if len(analysis_df) > 50 else analysis_df.assign(if_anomaly=False)
    if_count = int(if_df.get("if_anomaly", pd.Series(dtype=bool)).sum())
    pelt_points = pelt_changepoints(analysis_df, max_points=600)
    sax_df = sax_patterns(analysis_df) if len(analysis_df) > 100 else pd.DataFrame(columns=["Date", "pattern", "energy", "sax_on"])
    sax_counts = sax_top_counts(sax_df, 8).to_dict(orient="records") if not sax_df.empty else []

    model_result = None
    model_error = None
    try:
        model_result = train_virtual_sensor(analysis_df)
    except Exception as exc:
        model_error = str(exc)

    predictions = model_result["predictions"] if model_result else pd.DataFrame()
    alerts = build_alerts(cleaning_summary, predictions if not predictions.empty else None)
    active_alerts = sum(1 for a in alerts if a["severity"] in {"warning", "critical"})

    logistic = None
    try:
        logistic = train_logistic_onoff(cleaned)
    except Exception:
        logistic = None

    weather_columns = {
        "temperature": "temp_C" in df.columns,
        "humidity": "humidity" in df.columns,
    }
    comparison_summary = {}
    if not predictions.empty:
        pred = predictions.copy()
        pred["abs_error_kw"] = pred["error_kw"].abs()
        comparison_summary = {
            "records": int(len(pred)),
            "meanPhysicalKw": float(pred["ID_32"].mean()),
            "meanVirtualKw": float(pred["ID_32_pred"].mean()),
            "meanAbsDivergenceKw": float(pred["abs_error_kw"].mean()),
            "maxAbsDivergenceKw": float(pred["abs_error_kw"].max()),
            "onOffMismatches": int((pred["actual_on"] != pred["predicted_on"]).sum()),
        }

    result = {
        "source": source,
        "dataset": {
            "records": int(raw_summary["records"]),
            "start": json_safe(raw_summary["start"]),
            "end": json_safe(raw_summary["end"]),
            "columns": raw_summary["columns"],
            "missing": json_safe(raw_summary["missing"]),
            "weatherColumns": weather_columns,
            "preview": downsample_records(df.head(20), list(df.columns), 20),
        },
        "cleaning": json_safe({**cleaning_summary, "analysis_records_used": int(len(analysis_df))}),
        "signal": {
            "isolationForestFlags": if_count,
            "peltChangePoints": [json_safe(x) for x in pelt_points[:30]],
            "saxPatterns": json_safe(sax_counts),
            "saxWindows": int(len(sax_df)),
        },
        "model": {
            "name": model_result["model_name"] if model_result else "Unavailable",
            "error": model_error,
            "regression": json_safe(model_result["regression_metrics"] if model_result else {}),
            "onoff": json_safe(model_result["onoff_metrics"] if model_result else {}),
            "features": json_safe(model_result["feature_importances"].head(10).to_dict(orient="records") if model_result else []),
            "trainPeriod": json_safe(model_result["train_period"] if model_result else None),
            "testPeriod": json_safe(model_result["test_period"] if model_result else None),
            "logisticBaseline": json_safe(logistic),
        },
        "charts": {
            "raw": downsample_records(df, ["Date", "ID_31", "ID_32", "temp_C", "humidity"], 700),
            "cleaned": downsample_records(cleaned, ["Date", "ID_31", "ID_32", "temp_C", "humidity"], 700),
            "comparison": downsample_records(predictions, ["Date", "ID_32", "ID_32_pred", "error_kw", "actual_on", "predicted_on"], 700),
            "removed": downsample_records(removed, ["Date", "ID_31", "ID_32", "temp_C", "humidity", "removal_rule"], 200),
        },
        "alerts": alerts,
        "comparison": json_safe(comparison_summary),
        "kpis": {
            "records": int(raw_summary["records"]),
            "cleanedSamples": int(cleaning_summary["clean_records"]),
            "cleanedPercent": round(100 * cleaning_summary["clean_records"] / max(raw_summary["records"], 1), 2),
            "detectedAnomalies": int(if_count + len(pelt_points) + cleaning_summary.get("total_removed", 0)),
            "activeAlerts": int(active_alerts),
            "threshold": 2.0,
        },
    }
    STATE["raw"] = df
    STATE["cleaned"] = cleaned
    STATE["removed"] = removed
    STATE["predictions"] = predictions
    STATE["result"] = result
    return result


def require_result() -> dict[str, Any]:
    result = STATE.get("result")
    if result is None:
        raise HTTPException(status_code=404, detail="No dataset loaded. Load the demo dataset or upload a file first.")
    return result


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "NILM Chiller Monitor"}


@app.get("/health")
def health_alias():
    return health()


@app.post("/api/demo")
def load_demo():
    if SAMPLE_PATH.exists():
        df = pd.read_csv(SAMPLE_PATH)
        if len(df) > 2500:
            df = df.head(2500)
        df = auto_canonicalize(df)
    else:
        df = make_sample_data(periods=2500)
    return JSONResponse(json_safe(run_pipeline(df, "Demo dataset")))


@app.post("/dataset/demo")
def load_demo_alias():
    return load_demo()


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(...)):
    try:
        filename = file.filename or "dataset.csv"
        payload = await file.read()
        UPLOAD_DIR.mkdir(exist_ok=True)
        safe_name = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in filename).strip() or "dataset.csv"
        (UPLOAD_DIR / safe_name).write_bytes(payload)
        raw = read_any_upload(payload, filename)
        df = auto_canonicalize(raw)
        return JSONResponse(json_safe(run_pipeline(df, filename)))
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)


@app.post("/dataset/upload")
async def upload_dataset_alias(file: UploadFile = File(...)):
    return await upload_dataset(file)


@app.get("/dataset/summary")
def dataset_summary_endpoint():
    result = require_result()
    return JSONResponse(json_safe(result["dataset"]))


@app.post("/analysis/run")
def analysis_run():
    raw = STATE.get("raw")
    result = STATE.get("result")
    if raw is None:
        raise HTTPException(status_code=404, detail="No dataset loaded. Load the demo dataset or upload a file first.")
    if result is not None:
        return JSONResponse(json_safe(result))
    return JSONResponse(json_safe(run_pipeline(raw, "Current dataset")))


@app.get("/cleaning/results")
def cleaning_results():
    result = require_result()
    return JSONResponse(json_safe({
        "summary": result["cleaning"],
        "removed": result["charts"]["removed"],
        "cleanedChart": result["charts"]["cleaned"],
    }))


@app.get("/signal-analysis/results")
def signal_analysis_results():
    result = require_result()
    return JSONResponse(json_safe(result["signal"]))


@app.get("/virtual-sensor/results")
def virtual_sensor_results():
    result = require_result()
    return JSONResponse(json_safe({
        "model": result["model"],
        "comparisonChart": result["charts"]["comparison"],
    }))


@app.get("/on-off/results")
def on_off_results():
    result = require_result()
    return JSONResponse(json_safe({
        "threshold": result["kpis"]["threshold"],
        "metrics": result["model"]["onoff"],
        "chart": result["charts"]["comparison"],
    }))


@app.get("/sensor-comparison/results")
def sensor_comparison_results():
    result = require_result()
    return JSONResponse(json_safe({
        "summary": result["comparison"],
        "chart": result["charts"]["comparison"],
    }))


@app.get("/alerts")
def alerts_results():
    result = require_result()
    return JSONResponse(json_safe(result["alerts"]))


@app.get("/report/export")
def report_export(kind: str = "summary"):
    result = require_result()
    cleaned = STATE.get("cleaned")
    predictions = STATE.get("predictions")
    alerts = pd.DataFrame(result["alerts"])

    if kind == "cleaned":
        if cleaned is None:
            raise HTTPException(status_code=404, detail="Cleaned dataset is not available.")
        return Response(
            cleaned.to_csv(index=False),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=cleaned_chiller_dataset.csv"},
        )
    if kind == "alerts":
        return Response(
            alerts.to_csv(index=False),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=diagnostic_alerts.csv"},
        )
    if kind == "model-comparison":
        if predictions is None or predictions.empty:
            raise HTTPException(status_code=404, detail="Model comparison results are not available.")
        return Response(
            predictions.to_csv(index=False),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=virtual_sensor_comparison.csv"},
        )

    report = html_report(
        result["dataset"],
        result["cleaning"],
        result["model"].get("regression"),
        result["model"].get("onoff"),
        alerts,
    )
    return Response(
        report,
        media_type="text/html",
        headers={"Content-Disposition": "attachment; filename=nilm_chiller_diagnostic_summary.html"},
    )
