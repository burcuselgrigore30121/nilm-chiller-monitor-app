from __future__ import annotations

import html
from datetime import datetime

import pandas as pd


def html_report(dataset_summary: dict, cleaning_summary: dict, model_metrics: dict | None, onoff_metrics: dict | None, alerts: pd.DataFrame) -> str:
    model_metrics = model_metrics or {}
    onoff_metrics = onoff_metrics or {}
    alert_rows = ""
    for _, row in alerts.iterrows():
        start = row.get("Date", row.get("affectedInterval", "Current analysis"))
        alert = row.get("alert_type", row.get("type", "Diagnostic alert"))
        duration = row.get("duration_hours", row.get("severity", ""))
        deviation = row.get("max_deviation_kw", row.get("recommendedAction", ""))
        alert_rows += (
            f"<tr><td>{html.escape(str(start))}</td>"
            f"<td>{html.escape(str(alert))}</td>"
            f"<td>{html.escape(str(duration))}</td>"
            f"<td>{html.escape(str(deviation))}</td></tr>"
        )
    alert_rows = alert_rows or "<tr><td colspan='4'>No active alerts for the selected thresholds.</td></tr>"
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>NILM Chiller Monitoring Report</title>
<style>
body{{font-family:Segoe UI,Arial,sans-serif;color:#17213F;background:#F6F9FC;margin:32px}}
section{{background:white;border:1px solid #E3EAF3;border-radius:10px;padding:20px;margin:18px 0}}
h1,h2{{color:#12355B}} table{{border-collapse:collapse;width:100%}} td,th{{border-bottom:1px solid #E8EEF5;padding:8px;text-align:left}}
.metric{{display:inline-block;margin:8px 20px 8px 0}} .v{{font-size:24px;font-weight:700;color:#1F77B4}}
</style>
</head>
<body>
<h1>NILM Chiller Monitoring Report</h1>
<p>Generated {datetime.now():%Y-%m-%d %H:%M}. The analysis follows the project workflow from unreliable physical sensor data to contextual cleaning, signal analysis, XGBoost virtual sensing, and automatic fault detection.</p>
<section><h2>Dataset Summary</h2>
<div class="metric"><div>Records</div><div class="v">{dataset_summary.get('records', 0):,}</div></div>
<div class="metric"><div>Date range</div><div class="v">{dataset_summary.get('start')} to {dataset_summary.get('end')}</div></div>
</section>
<section><h2>Cleaning Summary</h2>
<table><tr><th>Rule</th><th>Removed records</th></tr>
<tr><td>Physical limit</td><td>{cleaning_summary.get('physical_limit_removed', 0):,}</td></tr>
<tr><td>Frozen sensor</td><td>{cleaning_summary.get('frozen_sensor_removed', 0):,}</td></tr>
<tr><td>Weather validation</td><td>{cleaning_summary.get('weather_validation_removed', 0):,}</td></tr>
<tr><td>Total</td><td>{cleaning_summary.get('total_removed', 0):,} ({cleaning_summary.get('percent_removed', 0):.2f}%)</td></tr>
</table></section>
<section><h2>Virtual Sensor Metrics</h2>
<table><tr><th>Metric</th><th>Value</th></tr>
{''.join(f'<tr><td>{html.escape(str(k))}</td><td>{v:.4f}</td></tr>' for k,v in model_metrics.items())}
</table></section>
<section><h2>ON/OFF Metrics</h2>
<table><tr><th>Metric</th><th>Value</th></tr>
{''.join(f'<tr><td>{html.escape(str(k))}</td><td>{v:.4f}</td></tr>' for k,v in onoff_metrics.items() if isinstance(v, (int,float)))}
</table></section>
<section><h2>Fault Alerts</h2>
<table><tr><th>Start</th><th>Alert</th><th>Duration [h]</th><th>Max deviation [kW]</th></tr>{alert_rows}</table>
</section>
</body></html>"""
