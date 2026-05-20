from __future__ import annotations

from collections import Counter

import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


def isolation_forest_id31(df: pd.DataFrame, contamination: float = 0.01) -> pd.DataFrame:
    out = df.copy()
    out["ID_31_delta"] = out["ID_31"].diff().fillna(0)
    x = StandardScaler().fit_transform(out[["ID_31", "ID_31_delta"]].to_numpy())
    model = IsolationForest(contamination=contamination, random_state=42, n_estimators=200)
    out["if_anomaly"] = (model.fit_predict(x) == -1)
    return out


def iqr_flags(df: pd.DataFrame) -> pd.Series:
    s = df["ID_31"]
    q1, q3 = s.quantile(0.25), s.quantile(0.75)
    iqr = q3 - q1
    return (s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)


def pelt_changepoints(df: pd.DataFrame, penalty: float = 10.0, max_points: int = 5000) -> list[pd.Timestamp]:
    signal = df["ID_32"].to_numpy(float)
    if len(signal) < 20:
        return []
    step = max(1, len(signal) // max_points)
    sample = signal[::step]
    dates = df["Date"].iloc[::step].reset_index(drop=True)
    try:
        import ruptures as rpt

        breakpoints = rpt.Pelt(model="rbf").fit(sample).predict(pen=penalty)
        return [dates.iloc[min(bp, len(dates) - 1)] for bp in breakpoints[:-1]]
    except Exception:
        deltas = np.abs(np.diff(sample))
        if len(deltas) == 0:
            return []
        idx = np.where(deltas > np.quantile(deltas, 0.995))[0]
        return [dates.iloc[int(i)] for i in idx[:60]]


def sax_transform(series, word_size: int = 8, alphabet_size: int = 5) -> list[str]:
    s = np.array(series, dtype=float)
    if len(s) == 0 or s.std() == 0:
        return ["a"] * word_size
    s_norm = (s - s.mean()) / s.std()
    bp_sax = norm.ppf(np.linspace(0, 1, alphabet_size + 1)[1:-1])
    alphabet = [chr(ord("a") + i) for i in range(alphabet_size)]
    frame_size = max(1, len(s_norm) // word_size)
    paa = [s_norm[i * frame_size : (i + 1) * frame_size].mean() for i in range(word_size)]
    return [alphabet[np.searchsorted(bp_sax, v)] for v in paa]


def pattern_energy(word: str) -> float:
    scores = {"a": 0.0, "b": 0.25, "c": 0.5, "d": 0.75, "e": 1.0}
    return float(np.mean([scores.get(c, 0.5) for c in word]))


def sax_patterns(df: pd.DataFrame, word_size: int = 8, alphabet_size: int = 5, on_threshold: float = 0.4) -> pd.DataFrame:
    diffs = df["Date"].diff().dropna()
    resolution_min = diffs.mode()[0].total_seconds() / 60 if not diffs.empty else 15
    points_per_window = max(10, int(24 * 60 / resolution_min))
    step = max(1, points_per_window // 2)
    rows = []
    for i in range(0, max(len(df) - points_per_window, 1), step):
        window = df["ID_32"].iloc[i : i + points_per_window].to_numpy()
        word = "".join(sax_transform(window, word_size, alphabet_size))
        rows.append({"Date": df["Date"].iloc[min(i + points_per_window // 2, len(df) - 1)], "pattern": word, "energy": pattern_energy(word), "sax_on": pattern_energy(word) > on_threshold})
    return pd.DataFrame(rows)


def sax_top_counts(sax_df: pd.DataFrame, limit: int = 20) -> pd.DataFrame:
    counts = Counter(sax_df["pattern"])
    return pd.DataFrame(counts.most_common(limit), columns=["pattern", "count"])
