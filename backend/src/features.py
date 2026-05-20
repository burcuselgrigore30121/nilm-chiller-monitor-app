from __future__ import annotations

import numpy as np
import pandas as pd


def add_weather_fallbacks(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    if "temp_C" not in out.columns:
        month = out["Date"].dt.month
        out["temp_C"] = 11 + 12 * np.sin(2 * np.pi * (month - 4) / 12)
        out.attrs["temperature_fallback"] = True
    if "humidity" not in out.columns:
        monthly = {1: 75, 2: 70, 3: 60, 4: 55, 5: 55, 6: 55, 7: 50, 8: 50, 9: 60, 10: 65, 11: 75, 12: 80}
        out["humidity"] = out["Date"].dt.month.map(monthly).astype(float)
        out.attrs["humidity_fallback"] = True
    return out


def heat_index_c(temp_c, humidity):
    temp_f = temp_c * 9 / 5 + 32
    rh = humidity
    hi_f = (
        -42.379
        + 2.04901523 * temp_f
        + 10.14333127 * rh
        - 0.22475541 * temp_f * rh
        - 0.00683783 * temp_f**2
        - 0.05481717 * rh**2
        + 0.00122874 * temp_f**2 * rh
        + 0.00085282 * temp_f * rh**2
        - 0.00000199 * temp_f**2 * rh**2
    )
    hi_c = (hi_f - 32) * 5 / 9
    return np.where(temp_c >= 20, hi_c, temp_c)


def add_calendar_weather_features(df: pd.DataFrame) -> pd.DataFrame:
    out = add_weather_fallbacks(df)
    out["an"] = out["Date"].dt.year
    out["luna"] = out["Date"].dt.month
    out["ora"] = out["Date"].dt.hour
    out["zi_sapt"] = out["Date"].dt.dayofweek
    out["zi_lucratoare"] = (out["zi_sapt"] < 5).astype(int)
    out["Season"] = out["luna"].map({12: "Winter", 1: "Winter", 2: "Winter", 3: "Spring", 4: "Spring", 5: "Spring", 6: "Summer", 7: "Summer", 8: "Summer", 9: "Autumn", 10: "Autumn", 11: "Autumn"})
    out["heat_index"] = heat_index_c(out["temp_C"].to_numpy(float), out["humidity"].to_numpy(float))
    out["ID_32_ON"] = (out["ID_32"] > 2.0).astype(int)
    out["kwh"] = out["ID_32"] * infer_hours_per_sample(out)
    return out


def infer_hours_per_sample(df: pd.DataFrame) -> float:
    diffs = df["Date"].sort_values().diff().dropna()
    if diffs.empty:
        return 0.25
    return max(diffs.median().total_seconds() / 3600, 1 / 60)


def build_model_features(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str], list[str]]:
    out = add_calendar_weather_features(df)
    out["ora_sin"] = np.sin(2 * np.pi * out["ora"] / 24)
    out["ora_cos"] = np.cos(2 * np.pi * out["ora"] / 24)
    out["luna_sin"] = np.sin(2 * np.pi * out["luna"] / 12)
    out["luna_cos"] = np.cos(2 * np.pi * out["luna"] / 12)
    out["temp_delta"] = out["temp_C"].diff().fillna(0)
    out["temp_lag4"] = out["temp_C"].shift(4)

    for lag in [1, 4, 96]:
        out[f"ID_31_lag{lag}"] = out["ID_31"].shift(lag)
    for window in [4, 16]:
        out[f"ID_31_roll{window}"] = out["ID_31"].rolling(window).mean()
    for lag in [1, 2, 4, 8, 48, 96]:
        out[f"ID_32_lag{lag}"] = out["ID_32"].shift(lag)
    for window in [4, 16]:
        out[f"ID_32_roll{window}"] = out["ID_32"].rolling(window).mean()

    features = [
        "ID_31", "ID_31_lag1", "ID_31_lag4", "ID_31_lag96", "ID_31_roll4", "ID_31_roll16",
        "ID_32_lag1", "ID_32_lag2", "ID_32_lag4", "ID_32_lag8", "ID_32_lag48", "ID_32_lag96",
        "ID_32_roll4", "ID_32_roll16", "temp_C", "temp_delta", "temp_lag4", "humidity",
        "heat_index", "ora_sin", "ora_cos", "luna_sin", "luna_cos", "zi_lucratoare",
    ]
    labels = [
        "Main building consumption", "ID_31 lag 15 min", "ID_31 lag 1 h", "ID_31 lag 24 h",
        "ID_31 rolling mean 1 h", "ID_31 rolling mean 4 h", "Chiller lag 15 min",
        "Chiller lag 30 min", "Chiller lag 1 h", "Chiller lag 2 h", "Chiller lag 12 h",
        "Chiller lag 24 h", "Chiller rolling mean 1 h", "Chiller rolling mean 4 h",
        "Temperature", "Temperature delta", "Temperature lag 1 h", "Humidity", "Heat Index",
        "Hour sin", "Hour cos", "Month sin", "Month cos", "Working day",
    ]
    return out.dropna(subset=features).copy(), features, labels
