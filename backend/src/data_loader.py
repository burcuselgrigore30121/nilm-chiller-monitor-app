from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd


REQUIRED_CANONICAL = ["Date", "ID_31", "ID_32"]


@dataclass
class ColumnGuess:
    date: Optional[str]
    id31: Optional[str]
    id32: Optional[str]
    temperature: Optional[str]
    humidity: Optional[str]


def read_uploaded_file(file) -> pd.DataFrame:
    name = file.name.lower()
    if name.endswith(".csv"):
        return pd.read_csv(file)
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(file)
    raise ValueError("Upload a CSV, XLSX, or XLS file.")


def guess_columns(columns: list[str]) -> ColumnGuess:
    lower = {c.lower().strip(): c for c in columns}

    def pick(*needles: str) -> Optional[str]:
        for needle in needles:
            for key, original in lower.items():
                if needle in key:
                    return original
        return None

    return ColumnGuess(
        date=pick("date", "time", "timestamp", "datetime"),
        id31=pick("id_31", "id31", "main", "building"),
        id32=pick("id_32", "id32", "chiller"),
        temperature=pick("temp_c", "temperature", "temp", "outdoor"),
        humidity=pick("humidity", "relative_humidity", "rh"),
    )


def canonicalize(df: pd.DataFrame, mapping: dict[str, Optional[str]]) -> pd.DataFrame:
    out = pd.DataFrame()
    for target, source in mapping.items():
        if source and source in df.columns:
            out[target] = df[source]

    missing = [c for c in REQUIRED_CANONICAL if c not in out.columns]
    if missing:
        raise ValueError(f"Missing required mapped columns: {', '.join(missing)}")

    out["Date"] = pd.to_datetime(out["Date"], errors="coerce")
    for col in ["ID_31", "ID_32", "temp_C", "humidity"]:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")

    out = out.dropna(subset=["Date"]).sort_values("Date").reset_index(drop=True)
    out["ID_31"] = out["ID_31"].fillna(0).clip(lower=0)
    out["ID_32"] = out["ID_32"].fillna(0).clip(lower=0)
    return out


def dataset_summary(df: pd.DataFrame) -> dict:
    return {
        "records": len(df),
        "start": df["Date"].min(),
        "end": df["Date"].max(),
        "missing": df.isna().sum().to_dict(),
        "columns": list(df.columns),
        "id31_stats": df["ID_31"].describe().to_dict(),
        "id32_stats": df["ID_32"].describe().to_dict(),
    }


def make_sample_data(periods: int = 180 * 24 * 4, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2023-01-01", periods=periods, freq="15min")
    hour = dates.hour.values
    month = dates.month.values
    day = np.arange(periods)

    seasonal = 11 + 13 * np.sin(2 * np.pi * (day / (365 * 24 * 4)) - 0.8)
    daily = 4 * np.sin(2 * np.pi * (hour - 7) / 24)
    temp = seasonal + daily + rng.normal(0, 1.6, periods)
    humidity = np.clip(68 - 0.8 * temp + rng.normal(0, 6, periods), 35, 90)
    cooling_context = (temp > 18) & np.isin(month, [5, 6, 7, 8, 9])
    work_hours = (hour >= 7) & (hour <= 20)
    on = cooling_context & (rng.random(periods) < np.where(work_hours, 0.68, 0.22))
    id32 = np.where(on, 2.2 + 0.22 * np.maximum(temp - 18, 0), 0.05 + rng.normal(0, 0.04, periods))
    id32 = np.clip(id32 + rng.normal(0, 0.18, periods), 0, None)
    id31 = 5.5 + 0.45 * id32 + 1.2 * work_hours + 0.03 * np.maximum(temp, 0) + rng.normal(0, 0.5, periods)
    id31 = np.clip(id31, 0, None)

    if periods > 6500:
        id32[5200:5264] = 61.0
        id32[5900:6020] = 2.55
        temp[5900:6020] = 8.0

    return pd.DataFrame(
        {"Date": dates, "ID_31": id31, "ID_32": id32, "temp_C": temp, "humidity": humidity}
    )
