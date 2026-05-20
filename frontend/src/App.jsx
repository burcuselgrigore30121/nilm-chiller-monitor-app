import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronRight, CircleOff,
  Database, Download, FileUp, Gauge, Home, LineChart, Loader2, Radar, Search,
  Server, Snowflake, Upload, Zap
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart as RLineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'dataset', label: 'Dataset', icon: Database },
  { id: 'cleaning', label: 'Data Cleaning', icon: Snowflake },
  { id: 'analysis', label: 'Signal Analysis', icon: Activity },
  { id: 'virtual', label: 'Virtual Sensor', icon: Radar },
  { id: 'onoff', label: 'ON/OFF Detection', icon: Zap },
  { id: 'comparison', label: 'Sensor Comparison', icon: LineChart },
  { id: 'alerts', label: 'Diagnostic Alerts', icon: AlertTriangle },
  { id: 'reports', label: 'Reports / Export', icon: Download },
];

function cx(...items) { return items.filter(Boolean).join(' '); }
function num(value, fallback = '-') {
  if (value === undefined || value === null || Number.isNaN(value)) return fallback;
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value;
}
function shortDate(value) { return value ? String(value).slice(0, 10) : '-'; }

function Card({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.42, ease: 'easeOut', delay }}
      className={cx('card', className)}
    >
      {children}
    </motion.div>
  );
}

function EmptyChart({ title, subtitle }) {
  return (
    <div className="empty-chart">
      <div className="empty-grid" />
      <div className="empty-chart-content">
        <BarChart3 size={28} />
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon"><Zap size={24} /></div>
        <div><b>NILM<span>Monitor</span></b><small>Chiller diagnostics</small></div>
      </div>
      <nav className="side-nav">
        {pages.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)} className={cx('nav-item', active === id && 'active')}>
            <Icon size={18} /><span>{label}</span>{active === id && <i />}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <div className="note-label">Core diagnostic page</div>
        <strong>Physical vs Virtual Sensor</strong>
        <p>Use XGBoost prediction divergence to detect silent physical sensor faults.</p>
        <button onClick={() => setActive('comparison')}>Open comparison</button>
      </div>
    </aside>
  );
}

function StatusHeader({ active, data }) {
  const current = pages.find((p) => p.id === active)?.label || 'Dashboard';
  return (
    <header className="status-header">
      <div>
        <h1>{current}</h1>
        <p>{active === 'dashboard'
          ? 'Whole-pipeline overview for NILM chiller monitoring, virtual sensing, and fault diagnostics.'
          : 'Focused diagnostic page using the loaded building energy dataset.'}</p>
      </div>
      <div className="status-pills">
        <span className="pill green">Dataset: {data ? data.source : 'Not loaded'}</span>
        <span className="pill blue">{data?.model?.name || 'XGBoost'}</span>
        <span className="pill orange">{num(data?.kpis?.activeAlerts, 0)} active alerts</span>
        <span className="pill gray">{num(data?.kpis?.records, '-')} records</span>
        <span className="pill gray">{shortDate(data?.dataset?.start)} to {shortDate(data?.dataset?.end)}</span>
      </div>
    </header>
  );
}

function Hero({ loadDemo, fileRef, loading, data }) {
  return (
    <Card className="hero-card">
      <div className="hero-glow one" /><div className="hero-glow two" />
      <div className="hero-content">
        <span className="eyebrow">NILM platform | Virtual sensing | Fault diagnostics</span>
        <h2>Understand chiller operation from building energy data.</h2>
        <p>Load a demo dataset or upload your CSV/XLSX, then run the complete pipeline: cleaning, signal analysis, virtual sensor prediction, ON/OFF detection, comparison, and alerts.</p>
        <div className="hero-actions">
          <button className="primary" onClick={loadDemo} disabled={loading}>{loading ? <Loader2 className="spin" size={18} /> : <Zap size={18} />} Load Demo Dataset</button>
          <button className="secondary" onClick={() => fileRef.current?.click()} disabled={loading}><Upload size={18} /> Upload CSV/XLSX</button>
        </div>
        <div className="hero-source"><small>CURRENT SOURCE</small><strong>{data?.source || 'No dataset loaded yet'}</strong></div>
      </div>
    </Card>
  );
}

function KPIGrid({ data }) {
  const k = data?.kpis || {};
  const items = [
    ['Total Records', num(k.records), 'Building energy samples', Database, 'blue'],
    ['Cleaned Samples', data ? `${num(k.cleanedPercent)}%` : '-', data ? `${num(k.cleanedSamples)} valid samples` : 'Run analysis first', CheckCircle2, 'green'],
    ['Detected Anomalies', num(k.detectedAnomalies), data ? 'Cleaning + signal flags' : 'Waiting for data', AlertTriangle, 'orange'],
    ['Virtual Sensor Metric', data?.model?.regression?.R2 !== undefined ? `R2 ${num(data.model.regression.R2)}` : '-', data ? data.model.name : 'Not available', Radar, 'blue'],
    ['Active Alerts', num(k.activeAlerts), data ? 'Diagnostic alert count' : 'Not available', Gauge, 'red'],
    ['ON/OFF Threshold', data ? `${num(k.threshold)} kW` : '2.0 kW', 'Predicted power state rule', Zap, 'green'],
  ];
  return (
    <section className="kpi-grid">
      {items.map(([label, value, note, Icon, tone], i) => (
        <Card key={label} delay={i * 0.03} className="kpi-card">
          <div><span>{label}</span><strong>{value}</strong><p>{note}</p></div>
          <div className={cx('kpi-icon', tone)}><Icon size={22} /></div>
        </Card>
      ))}
    </section>
  );
}

function SystemStatus({ data }) {
  return (
    <Card className="system-card">
      <div className="card-title-row"><div><h3>System Status</h3><p>Current diagnostic context</p></div><span className="ok-dot">OK</span></div>
      {[
        ['Dataset', data?.source || 'Not loaded', data ? 'green' : 'gray'],
        ['Model', data?.model?.name || 'XGBoost', data ? 'blue' : 'gray'],
        ['Threshold', `${data?.kpis?.threshold || 2.0} kW ON/OFF`, 'purple'],
        ['Analysis', data ? 'Completed' : 'Pending', data ? 'green' : 'orange'],
        ['Date range', data ? `${shortDate(data.dataset.start)} to ${shortDate(data.dataset.end)}` : '-', 'gray'],
      ].map(([label, value, tone]) => <div className="status-row" key={label}><span>{label}</span><b className={cx('mini-pill', tone)}>{value}</b></div>)}
    </Card>
  );
}

function ComparisonChart({ data, large = false }) {
  const comparison = data?.charts?.comparison || [];
  if (!data || comparison.length === 0) return <EmptyChart title="Physical vs Virtual Sensor Comparison" subtitle="Load a dataset to render the real comparison chart." />;
  return (
    <div className={cx('chart-wrap', large && 'large')}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={comparison} margin={{ top: 12, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5edf5" />
          <XAxis dataKey="Date" tickFormatter={(v) => String(v).slice(5, 10)} tickLine={false} axisLine={false} minTickGap={34} tick={{ fontSize: 11, fill: '#75839a' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#75839a' }} />
          <Tooltip />
          <Line type="monotone" dataKey="ID_32" name="Physical ID_32" stroke="#64748b" strokeWidth={2.6} dot={false} />
          <Line type="monotone" dataKey="ID_32_pred" name="Virtual Sensor Prediction" stroke="#0f9f8a" strokeWidth={2.8} dot={false} />
          <Line type="monotone" dataKey="error_kw" name="Divergence error" stroke="#ef4444" strokeWidth={1.7} dot={false} />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RawChart({ data = [] }) {
  if (!data.length) return <EmptyChart title="Signal chart" subtitle="Load a dataset first." />;
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5edf5" />
          <XAxis dataKey="Date" tickFormatter={(v) => String(v).slice(5, 10)} tickLine={false} axisLine={false} minTickGap={34} tick={{ fontSize: 11, fill: '#75839a' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#75839a' }} />
          <Tooltip />
          <Line dataKey="ID_32" stroke="#0f9f8a" dot={false} strokeWidth={2.5} name="ID_32" />
          <Line dataKey="ID_31" stroke="#3b82f6" dot={false} strokeWidth={2} name="ID_31" />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MainChartCard({ data, setActive }) {
  return (
    <Card className="main-chart-card">
      <div className="card-title-row"><div><h3>Physical vs Virtual Sensor</h3><p>Chiller power - physical sensor vs XGBoost prediction</p></div><button className="link-button" onClick={() => setActive('comparison')}>View full <ChevronRight size={14} /></button></div>
      <ComparisonChart data={data} />
    </Card>
  );
}

function Pipeline({ data }) {
  const steps = ['Raw Data', 'Cleaning', 'Signal Analysis', 'XGBoost', 'ON/OFF', 'Comparison', 'Alerts'];
  return (
    <Card className="pipeline-card">
      <div className="card-title-row"><div><h3>Analysis Pipeline</h3><p>From raw energy data to automatic fault alerts</p></div><span>{data ? '7/7 complete' : '0/7 complete'}</span></div>
      <div className="pipeline-steps">{steps.map((step, index) => <div key={step} className={cx('pipe-step', data && 'done')}><div>{data ? <CheckCircle2 size={18} /> : index + 1}</div><strong>{step}</strong>{index < steps.length - 1 && <ChevronRight size={18} />}</div>)}</div>
    </Card>
  );
}

function AlertsSummary({ data }) {
  const chart = data?.alerts?.reduce((acc, alert) => { acc[alert.severity] = (acc[alert.severity] || 0) + 1; return acc; }, {}) || {};
  const rows = [
    { name: 'Normal', value: chart.normal || 0, color: '#22c55e' },
    { name: 'Warning', value: chart.warning || 0, color: '#f59e0b' },
    { name: 'Critical', value: chart.critical || 0, color: '#ef4444' },
  ];
  return (
    <Card className="mini-chart-card">
      <div className="card-title-row"><div><h3>Diagnostic Alerts</h3><p>Severity distribution</p></div><AlertTriangle size={18} /></div>
      {!data ? <div className="empty-small">Load dataset to run analysis.</div> : (
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={rows}><CartesianGrid vertical={false} stroke="#e5edf5" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#75839a' }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#75839a' }} /><Tooltip /><Bar dataKey="value" radius={[10, 10, 0, 0]}>{rows.map((row) => <Cell key={row.name} fill={row.color} />)}</Bar></BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function AlertsPanel({ data, setActive }) {
  const alerts = data?.alerts || [];
  return (
    <Card className="alerts-panel">
      <div className="card-title-row"><div><h3>Recent Alerts</h3><p>Diagnostic events from sensor comparison and cleaning</p></div><button className="link-button" onClick={() => setActive('alerts')}>View all</button></div>
      {!data ? <div className="empty-small"><AlertTriangle /> Load a dataset to generate alerts.</div> : alerts.slice(0, 4).map((alert, i) => <div key={i} className={cx('alert-row', alert.severity)}><span>{alert.severity}</span><strong>{alert.type}</strong><p>{alert.reason}</p></div>)}
    </Card>
  );
}

function UploadBox({ fileRef, uploadFile, loadDemo, loading, selectedFile, success }) {
  return (
    <Card className="upload-card">
      <div className="upload-icon"><FileUp size={30} /></div>
      <h3>Load building energy data</h3>
      <p>Upload CSV/XLSX with Date, ID_31, ID_32 and optional weather columns, or start with the demo dataset.</p>
      <div className="upload-drop" onClick={() => fileRef.current?.click()}>
        <Upload size={22} /><strong>Drag-and-drop style upload area</strong><span>Click here to choose a CSV, XLSX, or XLS file from your laptop.</span>
      </div>
      <div className="upload-actions"><button className="primary" onClick={() => fileRef.current?.click()} disabled={loading}><Upload size={18} /> Upload Dataset</button><button className="secondary" onClick={loadDemo} disabled={loading}><Zap size={18} /> Load Demo</button></div>
      {selectedFile && <div className="file-state"><b>Selected file</b><span>{selectedFile}</span></div>}
      {success && <div className="success-state"><CheckCircle2 size={16} />{success}</div>}
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
    </Card>
  );
}

function DataTable({ rows = [] }) {
  if (!rows.length) return <div className="empty-small">Load a dataset to preview rows.</div>;
  const columns = Object.keys(rows[0] || {});
  return <div className="data-table-wrap"><table><thead><tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map((col) => <td key={col}>{String(row[col] ?? '')}</td>)}</tr>)}</tbody></table></div>;
}

function MissingValues({ data }) {
  const rows = Object.entries(data?.dataset?.missing || {});
  return <Card className="table-card"><h3>Missing values</h3><p>Column-level missing values after parsing.</p>{!rows.length ? <div className="empty-small">No dataset loaded.</div> : <div className="pattern-list">{rows.map(([key, value]) => <div key={key}><b>{key}</b><span>{num(value, 0)}</span></div>)}</div>}</Card>;
}

function Dashboard({ data, loadDemo, uploadFile, loading, selectedFile, success, setActive }) {
  const fileRef = useRef(null);
  return (
    <div className="page-grid">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
      <section className="top-grid"><Hero loadDemo={loadDemo} fileRef={fileRef} loading={loading} data={data} /><SystemStatus data={data} /></section>
      {!data && <UploadBox fileRef={fileRef} uploadFile={uploadFile} loadDemo={loadDemo} loading={loading} selectedFile={selectedFile} success={success} />}
      <KPIGrid data={data} />
      <section className="content-grid"><div><MainChartCard data={data} setActive={setActive} /><Pipeline data={data} /></div><div><AlertsSummary data={data} /><AlertsPanel data={data} setActive={setActive} /></div></section>
    </div>
  );
}

function DatasetPage({ data, loadDemo, uploadFile, loading, selectedFile, success }) {
  const fileRef = useRef(null);
  return (
    <div className="page-grid">
      <div className="two-col">
        <div><UploadBox fileRef={fileRef} uploadFile={uploadFile} loadDemo={loadDemo} loading={loading} selectedFile={selectedFile} success={success} /><Card className="table-card"><h3>Detected columns</h3><p>Columns recognized after canonical mapping.</p><div className="chips">{(data?.dataset?.columns || ['Date', 'ID_31', 'ID_32', 'temp_C', 'humidity']).map((col) => <span key={col}>{col}</span>)}</div><div className="weather-status"><span>Temperature: {data?.dataset?.weatherColumns?.temperature ? 'available' : 'fallback/absent'}</span><span>Humidity: {data?.dataset?.weatherColumns?.humidity ? 'available' : 'fallback/absent'}</span></div></Card></div>
        <SystemStatus data={data} />
      </div>
      <div className="two-col"><MissingValues data={data} /><Card className="table-card"><h3>Dataset preview</h3><p>First parsed rows from the active dataset.</p><DataTable rows={data?.dataset?.preview || []} /></Card></div>
    </div>
  );
}

function CleaningPage({ data }) {
  const s = data?.cleaning || {};
  const rules = [
    ['Physical limit', 'ID_32 > 50 kW is treated as physically impossible.', s.physical_limit_removed, 'critical'],
    ['Frozen sensor', 'Repeated constant ID_32 values indicate sensor freeze.', s.frozen_sensor_removed, 'warning'],
    ['Cold-weather ON', 'Chiller ON below 15 C is suspicious.', s.weather_validation_removed, 'warning'],
    ['Missing/invalid samples', 'Samples dropped or corrected during parsing and cleaning.', s.total_removed, 'normal'],
  ];
  return <div><KPIGrid data={data} /><div className="rule-grid">{rules.map(([title, body, value, tone]) => <Card key={title} className={cx('rule-card', tone)}><span>{title}</span><strong>{data ? num(value, 0) : '-'}</strong><p>{body}</p></Card>)}</div><Card className="main-chart-card"><div className="card-title-row"><div><h3>Before/After Cleaning Summary</h3><p>Cleaned ID_32 after removing unreliable samples.</p></div></div><RawChart data={data?.charts?.cleaned || []} /></Card></div>;
}

function AnalysisPage({ data }) {
  const signal = data?.signal || {};
  const methods = [
    ['Isolation Forest', num(signal.isolationForestFlags), 'Flags unusual ID_31 behavior using energy level and delta.', Activity],
    ['PELT', num(signal.peltChangePoints?.length), 'Detects structural changes in the chiller power signal.', BarChart3],
    ['SAX', num(signal.saxWindows), 'Converts time windows into symbolic activity patterns.', Search],
  ];
  return <div><div className="method-grid">{methods.map(([title, value, body, Icon]) => <Card key={title} className="method-card"><Icon /><span>{title}</span><strong>{value}</strong><p>{body}</p></Card>)}</div><Card className="table-card"><h3>Top SAX patterns</h3><p>Most frequent symbolic chiller activity patterns.</p>{!data ? <div className="empty-small">Load dataset to compute SAX patterns.</div> : <div className="pattern-list">{(signal.saxPatterns || []).map((item) => <div key={item.pattern}><b>{item.pattern}</b><span>{item.count}</span></div>)}</div>}</Card></div>;
}

function FeatureGroups() {
  const groups = ['Building consumption', 'Weather features', 'Time features', 'Lag features', 'Rolling means', 'Previous chiller behavior'];
  return <Card className="table-card"><h3>Input feature groups</h3><p>Feature families used by the virtual sensor model.</p><div className="chips">{groups.map((group) => <span key={group}>{group}</span>)}</div></Card>;
}

function FeatureList({ data }) {
  return <Card className="table-card"><h3>Top model features</h3><p>Most important inputs used by the virtual sensor.</p>{!data ? <div className="empty-small">Run model to show feature importance.</div> : <div className="feature-list">{(data.model.features || []).map((feature) => <div key={feature.feature}><span>{feature.feature}</span><b>{num(feature.importance)}</b></div>)}</div>}</Card>;
}

function VirtualSensorPage({ data }) {
  const reg = data?.model?.regression || {};
  return <div><section className="kpi-grid model-kpis">{[['R2', reg.R2], ['MAE', reg.MAE], ['RMSE', reg.RMSE], ['Mean Error', reg['Mean Error']]].map(([label, value]) => <Card key={label} className="kpi-card"><div><span>{label}</span><strong>{num(value)}</strong><p>XGBoost virtual sensor metric</p></div></Card>)}</section><Card className="main-chart-card"><div className="card-title-row"><div><h3>XGBoost Prediction</h3><p>Virtual sensor estimated chiller power compared to physical ID_32.</p></div></div><ComparisonChart data={data} large /></Card><FeatureGroups /><FeatureList data={data} /></div>;
}

function OnOffPage({ data }) {
  const metrics = data?.model?.onoff || {};
  return <div className="two-col"><Card className="threshold-card"><Zap /><h3>ON/OFF Detection Rule</h3><strong>2.0 kW</strong><p>Predicted power &gt; 2.0 kW = ON<br />Predicted power &lt;= 2.0 kW = OFF</p></Card><Card className="system-card"><h3>ON/OFF Metrics</h3>{[['Precision', metrics.Precision], ['Recall', metrics.Recall], ['F1', metrics.F1], ['AUC', metrics.AUC], ['Missed ON', metrics['Missed ON']], ['False ON', metrics['False ON']]].map(([label, value]) => <div className="status-row" key={label}><span>{label}</span><b>{num(value)}</b></div>)}</Card></div>;
}

function ComparisonPage({ data }) {
  const summary = data?.comparison || {};
  return <div><Card className="diagnostic-message"><h2>Physical sensors can fail silently.</h2><p>Physical sensors can fail silently. The virtual sensor creates measurable divergence that can trigger automatic fault alerts.</p></Card><Card className="main-chart-card focus-chart"><div className="card-title-row"><div><h3>Physical Sensor ID_32 vs XGBoost Virtual Sensor</h3><p>Main diagnostic comparison for fault detection.</p></div></div><ComparisonChart data={data} large /></Card><div className="rule-grid">{[['Mean physical kW', summary.meanPhysicalKw], ['Mean virtual kW', summary.meanVirtualKw], ['Mean divergence kW', summary.meanAbsDivergenceKw], ['ON/OFF mismatch', summary.onOffMismatches]].map(([label, value]) => <Card key={label} className="rule-card"><span>{label}</span><strong>{num(value)}</strong><p>Computed from the model test interval.</p></Card>)}</div></div>;
}

function AlertsPage({ data }) {
  const alerts = data?.alerts || [];
  return <div className="alerts-grid">{alerts.map((alert, i) => <Card key={i} className={cx('alert-card', alert.severity)}><span>{alert.severity}</span><h3>{alert.type}</h3><p>{alert.reason}</p><div><b>Affected interval</b><small>{alert.affectedInterval}</small></div><div><b>Recommended action</b><small>{alert.recommendedAction}</small></div></Card>)}{!data && <Card className="upload-card"><AlertTriangle /><h3>No diagnostic alerts yet</h3><p>Load a dataset to run cleaning, virtual sensing, comparison, and alert generation.</p></Card>}</div>;
}

function ReportsPage({ data }) {
  const reports = [
    ['cleaned', 'Cleaned Dataset', 'Export contextually validated time series as CSV.'],
    ['alerts', 'Alert Report', 'Export diagnostic alerts and recommended actions as CSV.'],
    ['model-comparison', 'Model Comparison Results', 'Export physical vs virtual prediction results as CSV.'],
    ['summary', 'Diagnostic Summary', 'Generate a compact HTML diagnostic summary.'],
  ];
  const download = (kind) => data && window.open(`${API}/report/export?kind=${kind}`, '_blank', 'noopener,noreferrer');
  return <div className="reports-grid">{reports.map(([kind, title, desc]) => <Card key={kind} className="report-card"><Download /><h3>{title}</h3><p>{desc}</p><button className="primary" disabled={!data} onClick={() => download(kind)}>Export</button></Card>)}</div>;
}

function App() {
  const [active, setActive] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [backendOk, setBackendOk] = useState(null);

  useEffect(() => {
    fetch(`${API}/health`).then((res) => setBackendOk(res.ok)).catch(() => setBackendOk(false));
  }, []);

  async function callApi(path, options) {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API}${path}`, options);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.detail || 'Request failed');
      setData(json);
      setSuccess(json.source ? `Dataset loaded: ${json.source}` : 'Analysis completed successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const loadDemo = () => { setSelectedFile('Demo dataset'); callApi('/dataset/demo', { method: 'POST' }); };
  const uploadFile = (file) => {
    setSelectedFile(file.name);
    const fd = new FormData();
    fd.append('file', file);
    callApi('/dataset/upload', { method: 'POST', body: fd });
  };

  const page = useMemo(() => {
    const props = { data, loadDemo, uploadFile, loading, selectedFile, success, setActive };
    if (active === 'dataset') return <DatasetPage {...props} />;
    if (active === 'cleaning') return <CleaningPage data={data} />;
    if (active === 'analysis') return <AnalysisPage data={data} />;
    if (active === 'virtual') return <VirtualSensorPage data={data} />;
    if (active === 'onoff') return <OnOffPage data={data} />;
    if (active === 'comparison') return <ComparisonPage data={data} />;
    if (active === 'alerts') return <AlertsPage data={data} />;
    if (active === 'reports') return <ReportsPage data={data} />;
    return <Dashboard {...props} />;
  }, [active, data, loading, selectedFile, success]);

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} />
      <main className="main">
        <StatusHeader active={active} data={data} />
        {backendOk === false && <div className="error-banner"><Server size={18} /> Backend unavailable at {API}. Start FastAPI on port 8000.</div>}
        {error && <div className="error-banner"><CircleOff size={18} />{error}</div>}
        {success && !loading && <div className="success-banner"><CheckCircle2 size={18} />{success}</div>}
        {loading && <div className="loading-strip"><Loader2 className="spin" size={16} /> Running diagnostic pipeline...</div>}
        <div className="content">{page}</div>
      </main>
    </div>
  );
}

export default App;
