from __future__ import annotations

import pandas as pd


def detect_frozen_sensor(series: pd.Series, min_run: int = 8, min_val: float = 1.5) -> pd.Series:
    groups = (series != series.shift()).cumsum()
    run_sizes = series.groupby(groups).transform("count")
    run_vals = series.groupby(groups).transform("first")
    return (run_sizes >= min_run) & (run_vals >= min_val)


def clean_chiller_data(
    df: pd.DataFrame,
    physical_limit: bool = True,
    frozen_sensor: bool = True,
    weather_validation: bool = True,
    phys_limit_32: float = 50.0,
    frozen_min_run: int = 8,
    frozen_min_val: float = 1.5,
    threshold_on: float = 2.0,
    temp_min_chiller: float = 15.0,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    masks = {}
    masks["physical_limit"] = (df["ID_32"] > phys_limit_32) if physical_limit else pd.Series(False, index=df.index)
    month = df["Date"].dt.month
    frozen_all = detect_frozen_sensor(df["ID_32"], frozen_min_run, frozen_min_val)
    masks["frozen_sensor"] = (frozen_all & month.isin([10, 11, 12, 1, 2, 3, 4, 5])) if frozen_sensor else pd.Series(False, index=df.index)
    already = masks["physical_limit"] | masks["frozen_sensor"]
    has_temp = "temp_C" in df.columns
    masks["weather_validation"] = (
        (df["ID_32"] > threshold_on) & (df["temp_C"] < temp_min_chiller) & (~already)
        if weather_validation and has_temp
        else pd.Series(False, index=df.index)
    )
    all_bad = masks["physical_limit"] | masks["frozen_sensor"] | masks["weather_validation"]
    cleaned = df.loc[~all_bad].copy().reset_index(drop=True)
    removed = df.loc[all_bad].copy()
    removed["removal_rule"] = "unknown"
    for key, mask in masks.items():
        removed.loc[mask.loc[removed.index], "removal_rule"] = key.replace("_", " ").title()
    summary = {
        "initial_records": len(df),
        "clean_records": len(cleaned),
        "physical_limit_removed": int(masks["physical_limit"].sum()),
        "frozen_sensor_removed": int(masks["frozen_sensor"].sum()),
        "weather_validation_removed": int(masks["weather_validation"].sum()),
        "total_removed": int(all_bad.sum()),
        "percent_removed": float(100 * all_bad.sum() / max(len(df), 1)),
    }
    return cleaned, removed, summary
