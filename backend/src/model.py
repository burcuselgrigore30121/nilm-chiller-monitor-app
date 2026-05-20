from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from .evaluation import onoff_metrics, regression_metrics
from .features import build_model_features


def _xgb_regressor():
    try:
        from xgboost import XGBRegressor

        return XGBRegressor(
            n_estimators=60,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=3,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        ), "XGBoost"
    except Exception:
        return RandomForestRegressor(n_estimators=250, max_depth=20, min_samples_leaf=5, random_state=42, n_jobs=-1), "Random Forest fallback"


def train_virtual_sensor(df: pd.DataFrame) -> dict:
    featured, features, labels = build_model_features(df)
    years = featured["an"]
    if years.nunique() >= 5:
        train_mask = years.between(2018, 2022)
        test_mask = years.between(2023, 2025)
        if train_mask.sum() < 200 or test_mask.sum() < 100:
            cutoff = int(len(featured) * 0.7)
            train_mask = pd.Series(np.arange(len(featured)) < cutoff, index=featured.index)
            test_mask = ~train_mask
    else:
        cutoff = int(len(featured) * 0.7)
        train_mask = pd.Series(np.arange(len(featured)) < cutoff, index=featured.index)
        test_mask = ~train_mask

    x_train = featured.loc[train_mask, features].to_numpy()
    y_train = featured.loc[train_mask, "ID_32"].to_numpy()
    x_test = featured.loc[test_mask, features].to_numpy()
    y_test = featured.loc[test_mask, "ID_32"].to_numpy()

    model, model_name = _xgb_regressor()
    model.fit(x_train, y_train)
    y_pred = np.clip(model.predict(x_test), 0, None)

    predictions = featured.loc[test_mask, ["Date", "ID_31", "ID_32", "temp_C", "humidity", "heat_index"]].copy()
    predictions["ID_32_pred"] = y_pred
    predictions["error_kw"] = predictions["ID_32_pred"] - predictions["ID_32"]
    predictions["actual_on"] = (predictions["ID_32"] > 2.0).astype(int)
    predictions["predicted_on"] = (predictions["ID_32_pred"] > 2.0).astype(int)
    predictions["pred_on"] = predictions["predicted_on"].astype(bool)

    importance = getattr(model, "feature_importances_", np.zeros(len(features)))
    importances = (
        pd.DataFrame({"feature": labels, "importance": importance})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )
    return {
        "model": model,
        "model_name": model_name,
        "featured": featured,
        "features": features,
        "feature_labels": labels,
        "predictions": predictions,
        "regression_metrics": regression_metrics(y_test, y_pred),
        "onoff_metrics": onoff_metrics(y_test, y_pred),
        "feature_importances": importances,
        "train_period": (featured.loc[train_mask, "Date"].min(), featured.loc[train_mask, "Date"].max()),
        "test_period": (featured.loc[test_mask, "Date"].min(), featured.loc[test_mask, "Date"].max()),
    }


def train_logistic_onoff(df: pd.DataFrame) -> dict | None:
    from sklearn.metrics import roc_auc_score

    featured, _, _ = build_model_features(df)
    features = ["temp_C", "humidity", "heat_index", "ora", "zi_sapt", "luna"]
    y = featured["ID_32_ON"].to_numpy()
    if y.sum() == 0 or len(np.unique(y)) < 2:
        return None
    cutoff = int(len(featured) * 0.7)
    x_train, x_test = featured[features].iloc[:cutoff], featured[features].iloc[cutoff:]
    y_train, y_test = y[:cutoff], y[cutoff:]
    scaler = StandardScaler()
    model = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)
    model.fit(scaler.fit_transform(x_train), y_train)
    prob = model.predict_proba(scaler.transform(x_test))[:, 1]
    pred = (prob >= 0.5).astype(int)
    return {
        "precision": float((pred[y_test == 1].sum() / max(pred.sum(), 1))),
        "recall": float((pred[y_test == 1].sum() / max((y_test == 1).sum(), 1))),
        "auc": float(roc_auc_score(y_test, prob)) if len(np.unique(y_test)) > 1 else None,
    }
