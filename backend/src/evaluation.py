from __future__ import annotations

import math

import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, mean_absolute_error, mean_squared_error, precision_score, r2_score, recall_score, roc_auc_score


def regression_metrics(y_true, y_pred) -> dict:
    err = np.asarray(y_pred) - np.asarray(y_true)
    return {
        "R2": float(r2_score(y_true, y_pred)),
        "MAE": float(mean_absolute_error(y_true, y_pred)),
        "RMSE": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "Mean Error": float(err.mean()),
    }


def onoff_metrics(y_true_power, y_pred_power, threshold: float = 2.0) -> dict:
    y_true = (np.asarray(y_true_power) > threshold).astype(int)
    y_pred = (np.asarray(y_pred_power) > threshold).astype(int)
    metrics = {
        "Precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "Recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "F1": float(f1_score(y_true, y_pred, zero_division=0)),
        "Confusion Matrix": confusion_matrix(y_true, y_pred, labels=[0, 1]),
        "Missed ON": int(((y_true == 1) & (y_pred == 0)).sum()),
        "False ON": int(((y_true == 0) & (y_pred == 1)).sum()),
    }
    try:
        auc = float(roc_auc_score(y_true, y_pred_power))
        metrics["AUC"] = None if math.isnan(auc) else auc
    except Exception:
        metrics["AUC"] = None
    return metrics


def method_comparison(base_metrics: dict | None = None) -> dict:
    out = {
        "Threshold": {"Precision": 0.039, "Recall": 0.990, "F1": 0.075, "AUC": None},
        "SAX": {"Precision": 0.022, "Recall": 0.840, "F1": 0.043, "AUC": None},
        "Logistic Regression": {"Precision": 0.042, "Recall": 0.930, "F1": 0.080, "AUC": 0.930},
        "XGBoost Virtual Sensor": {"Precision": 0.922, "Recall": 0.934, "F1": 0.928, "AUC": 0.982},
    }
    if base_metrics:
        out["XGBoost Virtual Sensor"].update({k: base_metrics[k] for k in ["Precision", "Recall", "F1"] if k in base_metrics})
        if base_metrics.get("AUC") is not None:
            out["XGBoost Virtual Sensor"]["AUC"] = base_metrics["AUC"]
    return out
