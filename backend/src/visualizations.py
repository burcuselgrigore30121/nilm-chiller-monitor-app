from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go


# ── Refined color palette ────────────────────────────────
NAVY = "#0F172A"
BLUE = "#3B82F6"
LIGHT_BLUE = "#DBEAFE"
TEAL = "#0D9488"
ORANGE = "#F59E0B"
RED = "#EF4444"
GREEN = "#22C55E"
SLATE = "#64748B"
GRAY = "#94A3B8"
GRID = "#F1F5F9"
BG = "rgba(255,255,255,0)"


def apply_layout(fig: go.Figure, height: int = 420) -> go.Figure:
    fig.update_layout(
        height=height,
        margin=dict(l=24, r=24, t=56, b=28),
        paper_bgcolor=BG,
        plot_bgcolor=BG,
        font=dict(family="Inter, Segoe UI, system-ui, sans-serif", color=NAVY, size=13),
        title_font=dict(size=16, color=NAVY),
        hovermode="x unified",
        legend=dict(
            orientation="h",
            yanchor="bottom", y=1.02,
            xanchor="right", x=1,
            bgcolor=BG,
            font=dict(size=12),
        ),
    )
    fig.update_xaxes(showgrid=True, gridcolor=GRID, gridwidth=1, zeroline=False, tickfont=dict(size=11))
    fig.update_yaxes(showgrid=True, gridcolor=GRID, gridwidth=1, zeroline=False, tickfont=dict(size=11))
    return fig


def timeline(df: pd.DataFrame, y_cols: list[str], title: str, removed: pd.DataFrame | None = None) -> go.Figure:
    fig = go.Figure()
    colors = [BLUE, TEAL, ORANGE, RED]
    step = max(1, len(df) // 8000)
    for col, color in zip(y_cols, colors):
        if col in df.columns:
            fig.add_trace(go.Scatter(x=df["Date"].iloc[::step], y=df[col].iloc[::step], mode="lines", name=col, line=dict(color=color, width=2.2)))
    if removed is not None and not removed.empty:
        fig.add_trace(go.Scatter(x=removed["Date"], y=removed["ID_32"], mode="markers", name="Removed/fault points", marker=dict(color=RED, size=7, symbol="x")))
    fig.update_layout(title=title, yaxis_title="Power [kW]")
    return apply_layout(fig)


def before_after(raw: pd.DataFrame, clean: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    step_raw = max(1, len(raw) // 6000)
    step_clean = max(1, len(clean) // 6000)
    fig.add_trace(go.Scatter(x=raw["Date"].iloc[::step_raw], y=raw["ID_32"].iloc[::step_raw], mode="lines", name="Raw ID_32", line=dict(color=GRAY, width=1.4), opacity=0.55))
    fig.add_trace(go.Scatter(x=clean["Date"].iloc[::step_clean], y=clean["ID_32"].iloc[::step_clean], mode="lines", name="Cleaned ID_32", line=dict(color=GREEN, width=2.2)))
    fig.update_layout(title="Before/After Cleaning Comparison", yaxis_title="Chiller power [kW]")
    return apply_layout(fig)


def seasonal_box(df: pd.DataFrame) -> go.Figure:
    fig = px.box(df, x="Season", y="ID_32", color="Season", category_orders={"Season": ["Winter", "Spring", "Summer", "Autumn"]}, color_discrete_sequence=[BLUE, TEAL, ORANGE, SLATE])
    fig.update_layout(title="Seasonal Chiller Behavior", showlegend=False, yaxis_title="ID_32 [kW]")
    return apply_layout(fig)


def monthly_heatmap(df: pd.DataFrame) -> go.Figure:
    pivot = df.groupby([df["Date"].dt.year, df["Date"].dt.month])["ID_32"].mean().unstack()
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    pivot = pivot.reindex(columns=range(1, 13))
    fig = go.Figure(data=go.Heatmap(z=pivot.values, x=months, y=pivot.index.astype(str), colorscale=[[0, "#F0F9FF"], [0.5, BLUE], [1, ORANGE]], colorbar_title="kW"))
    fig.update_layout(title="Monthly Chiller Power Heatmap", xaxis_title="Month", yaxis_title="Year")
    return apply_layout(fig)


def temp_relationship(df: pd.DataFrame) -> go.Figure:
    step = max(1, len(df) // 8000)
    fig = px.scatter(df.iloc[::step], x="temp_C", y="ID_32", color="heat_index", color_continuous_scale=[BLUE, TEAL, ORANGE], labels={"temp_C": "Outdoor temperature [°C]", "ID_32": "Chiller power [kW]"})
    fig.update_layout(title="Temperature and Heat Index Relationship with Chiller Activity")
    return apply_layout(fig)


def prediction_timeline(pred: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    step = max(1, len(pred) // 8000)
    fig.add_trace(go.Scatter(x=pred["Date"].iloc[::step], y=pred["ID_32"].iloc[::step], mode="lines", name="Physical Chiller Sensor ID_32", line=dict(color=SLATE, width=1.8)))
    fig.add_trace(go.Scatter(x=pred["Date"].iloc[::step], y=pred["ID_32_pred"].iloc[::step], mode="lines", name="XGBoost Prediction", line=dict(color=TEAL, width=2.4)))
    fig.update_layout(title="Actual vs XGBoost Virtual Sensor Timeline", yaxis_title="Power [kW]")
    return apply_layout(fig)


def predicted_vs_actual(pred: pd.DataFrame) -> go.Figure:
    sample = pred.sample(min(6000, len(pred)), random_state=42) if len(pred) else pred
    fig = px.scatter(sample, x="ID_32", y="ID_32_pred", opacity=0.35, color_discrete_sequence=[BLUE], labels={"ID_32": "Actual [kW]", "ID_32_pred": "Predicted [kW]"})
    max_val = float(max(sample["ID_32"].max(), sample["ID_32_pred"].max(), 1))
    fig.add_trace(go.Scatter(x=[0, max_val], y=[0, max_val], mode="lines", name="Perfect prediction", line=dict(color=RED, dash="dash", width=2)))
    fig.update_layout(title="Predicted vs Actual Chiller Power")
    return apply_layout(fig)


def feature_importance(importances: pd.DataFrame) -> go.Figure:
    top = importances.head(12).iloc[::-1]
    fig = px.bar(top, x="importance", y="feature", orientation="h", color_discrete_sequence=[TEAL], labels={"importance": "Importance", "feature": ""})
    fig.update_layout(title="Top Feature Importances")
    return apply_layout(fig, height=460)


def confusion_matrix(cm: np.ndarray, title: str = "ON/OFF Confusion Matrix") -> go.Figure:
    fig = go.Figure(data=go.Heatmap(z=cm, x=["Pred OFF", "Pred ON"], y=["Actual OFF", "Actual ON"], colorscale=[[0, "#F0F9FF"], [0.5, "#93C5FD"], [1, BLUE]], text=cm, texttemplate="%{text:,}", textfont=dict(size=16), showscale=False))
    fig.update_layout(title=title)
    return apply_layout(fig, height=360)


def roc_curve_plot(fpr, tpr, auc: float | None) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=fpr, y=tpr, mode="lines", name=f"Virtual sensor AUC {auc:.3f}" if auc else "Virtual sensor", line=dict(color=TEAL, width=3), fill="tozeroy", fillcolor="rgba(13,148,136,0.08)"))
    fig.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", name="Random classifier", line=dict(color=GRAY, dash="dash", width=1.5)))
    fig.update_layout(title="ROC Curve", xaxis_title="False Positive Rate", yaxis_title="True Positive Rate")
    return apply_layout(fig, height=360)


def method_comparison_chart(metrics: dict) -> go.Figure:
    rows = []
    for method, vals in metrics.items():
        for metric in ["Precision", "Recall", "F1", "AUC"]:
            if vals.get(metric) is not None:
                rows.append({"Method": method, "Metric": metric, "Score": vals[metric]})
    df = pd.DataFrame(rows)
    fig = px.bar(df, x="Method", y="Score", color="Metric", barmode="group", color_discrete_map={"Precision": BLUE, "Recall": ORANGE, "F1": TEAL, "AUC": GREEN})
    fig.update_layout(title="Method Comparison for Chiller ON/OFF Detection", yaxis_range=[0, 1.05])
    return apply_layout(fig)


def pelt_plot(df: pd.DataFrame, changepoints: list[pd.Timestamp]) -> go.Figure:
    fig = timeline(df, ["ID_32"], "PELT Change-Point Detection on ID_32")
    for date in changepoints[:80]:
        fig.add_vline(x=date, line_width=1.2, line_color=RED, opacity=0.4)
    return fig


def sax_bar(sax_counts: pd.DataFrame) -> go.Figure:
    fig = px.bar(sax_counts, x="pattern", y="count", color="count", color_continuous_scale=[[0, "#DBEAFE"], [0.5, BLUE], [1, ORANGE]])
    fig.update_layout(title="Most Frequent SAX Activity Patterns")
    return apply_layout(fig, height=360)
