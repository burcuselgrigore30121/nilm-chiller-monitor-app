import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, CircleOff, Database,
  Download, FileText, FileUp, Home, LineChart, Loader2, Radar, Server,
  Snowflake, Upload, Zap
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart as RLineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const THRESHOLD_KW = 2.0;

const pages = [
  { id: 'overview', label: 'Overview', icon: Home, subtitle: 'Load data and review the current NILM chiller project status.' },
  { id: 'cleaning', label: 'Data & Cleaning', icon: Snowflake, subtitle: 'Cleaning rules, removed samples, and before/after signal quality.' },
  { id: 'analysis', label: 'Signal Analysis', icon: Activity, subtitle: 'Point anomalies, change points, and repeated activity patterns.' },
  { id: 'virtual', label: 'Virtual Sensor', icon: Radar, subtitle: 'XGBoost chiller power estimation from building and context features.' },
  { id: 'diagnostics', label: 'ON/OFF & Comparison', icon: LineChart, subtitle: 'Physical sensor behavior compared with the virtual sensor threshold state.' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, subtitle: 'Diagnostic alerts and recommended maintenance actions.' },
  { id: 'reports', label: 'Reports', icon: Download, subtitle: 'Export available datasets, alerts, comparisons, and summaries.' },
];

function cx(...items) { return items.filter(Boolean).join(' '); }
function num(value, fallback = '-') {
  if (value === undefined || value === null || Number.isNaN(value)) return fallback;
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value;
}
function pct(value) {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${num(value)}%`;
}
function shortDate(value) { return value ? String(value).slice(0, 10) : '-'; }
function missingTotal(data) {
  return Object.values(data?.dataset?.missing || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function Card({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.32, ease: 'easeOut', delay }}
      className={cx('card', className)}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon = BarChart3, title, subtitle }) {
  return (
    <div className="empty-state">
      <Icon size={24} />
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}

function Sidebar({ active, setActive }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon"><Zap size={22} /></div>
        <div><b>NILM<span>Monitor</span></b><small>Chiller diagnostics</small></div>
      </div>
      <nav className="side-nav">
        {pages.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActive(id)} className={cx('nav-item', active === id && 'active')}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function StatusHeader({ active }) {
  const current = pages.find((p) => p.id === active) || pages[0];
  return (
    <header className="status-header">
      <h1>{current.label}</h1>
      <p>{current.subtitle}</p>
    </header>
  );
}

function DatasetSummary({ data }) {
  const weather = data?.dataset?.weatherColumns;
  const rows = [
    ['Total rows', num(data?.dataset?.records || data?.kpis?.records)],
    ['Date range', data ? `${shortDate(data.dataset.start)} to ${shortDate(data.dataset.end)}` : '-'],
    ['Detected columns', data?.dataset?.columns?.join(', ') || '-'],
    ['Missing values', data ? num(missingTotal(data), 0) : '-'],
    ['Weather columns available', data ? `Temperature: ${weather?.temperature ? 'yes' : 'no'}; Humidity: ${weather?.humidity ? 'yes' : 'no'}` : '-'],
    ['Current dataset source', data?.source || 'No dataset loaded'],
  ];
  return (
    <Card className="table-card">
      <SectionTitle title="Dataset Summary" subtitle="Compact status for the loaded building energy file." />
      <div className="kv-table">
        {rows.map(([label, value]) => (
          <div key={label}><span>{label}</span><b>{value}</b></div>
        ))}
      </div>
    </Card>
  );
}

function UploadHero({ loadDemo, uploadFile, loading, selectedFile, success, data }) {
  const fileRef = useRef(null);
  return (
    <Card className="overview-hero">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
      <div className="hero-copy">
        <h2>NILM Chiller Monitor</h2>
        <p>NILM-based chiller monitoring using a virtual XGBoost sensor and physical sensor fault diagnostics.</p>
      </div>
      <div className="load-panel">
        <button className="primary big" onClick={loadDemo} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <Zap size={18} />} Load Demo Dataset
        </button>
        <button className="upload-drop" onClick={() => fileRef.current?.click()} disabled={loading}>
          <Upload size={20} />
          <strong>Upload CSV</strong>
          <span>{selectedFile && selectedFile !== 'Demo dataset' ? selectedFile : 'Choose a CSV, XLSX, or XLS file'}</span>
        </button>
        <div className={cx('load-state', data && 'ok')}>
          {loading ? 'Running diagnostic pipeline...' : success || data?.source || 'No dataset loaded yet'}
        </div>
      </div>
    </Card>
  );
}

function KPIGrid({ data }) {
  const items = [
    ['Records', num(data?.kpis?.records), data ? 'Rows parsed from source data' : 'Load data to populate', Database, 'blue'],
    ['Cleaned samples', num(data?.kpis?.cleanedSamples), data ? `${pct(data.kpis.cleanedPercent)} retained after cleaning` : 'Cleaning runs after load', CheckCircle2, 'green'],
    ['Active alerts', num(data?.kpis?.activeAlerts, 0), data ? 'Warnings and critical diagnostics' : 'Generated from real results', AlertTriangle, 'orange'],
  ];
  return (
    <section className="kpi-grid compact-kpis">
      {items.map(([label, value, note, Icon, tone], index) => (
        <Card key={label} delay={index * 0.03} className="kpi-card">
          <div><span>{label}</span><strong>{value}</strong><p>{note}</p></div>
          <div className={cx('kpi-icon', tone)}><Icon size={20} /></div>
        </Card>
      ))}
    </section>
  );
}

function Pipeline({ data }) {
  const steps = ['Raw Data', 'Cleaning', 'Analysis', 'Virtual Sensor', 'ON/OFF', 'Alerts'];
  return (
    <Card className="pipeline-card">
      <div className="pipeline-steps">
        {steps.map((step, index) => (
          <div key={step} className={cx('pipe-step', data && 'done')}>
            <span>{data ? <CheckCircle2 size={15} /> : index + 1}</span>
            <b>{step}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChartShell({ title, subtitle, children }) {
  return (
    <Card className="chart-card">
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}

function TimeSeriesChart({ data = [], lines, threshold = false, large = false }) {
  if (!data.length) return <EmptyState title="No chart data yet" subtitle="Load the demo dataset or upload a file to render this chart." />;
  return (
    <div className={cx('chart-wrap', large && 'large')}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5edf5" />
          <XAxis dataKey="Date" tickFormatter={(v) => String(v).slice(5, 10)} tickLine={false} axisLine={false} minTickGap={34} tick={{ fontSize: 11, fill: '#66758a' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#66758a' }} />
          <Tooltip />
          {threshold && <ReferenceLine y={THRESHOLD_KW} label="2.0 kW ON/OFF threshold" stroke="#f59e0b" strokeDasharray="6 4" />}
          {lines.map((line) => <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={line.width || 2.5} dot={false} />)}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OverviewPage(props) {
  const { data, loadDemo, uploadFile, loading, selectedFile, success } = props;
  return (
    <div className="page-grid">
      <UploadHero loadDemo={loadDemo} uploadFile={uploadFile} loading={loading} selectedFile={selectedFile} success={success} data={data} />
      <DatasetSummary data={data} />
      <KPIGrid data={data} />
      <Pipeline data={data} />
    </div>
  );
}

function CleaningPage({ data }) {
  const s = data?.cleaning || {};
  const rules = [
    ['ID_32 > 50 kW', 'Physically impossible chiller power values.', s.physical_limit_removed, 'Remove from cleaned set'],
    ['Frozen repeated values', 'Repeated constant ID_32 readings that suggest a stuck sensor.', s.frozen_sensor_removed, 'Remove unreliable intervals'],
    ['Missing or invalid samples', 'Rows dropped or corrected during parsing and validation.', s.total_removed, 'Exclude from analysis'],
    ['Chiller ON during cold weather', 'ON behavior below the weather validation threshold.', s.weather_validation_removed, 'Flag as contextual anomaly'],
  ];
  return (
    <div className="page-grid">
      <Card className="explain-card">
        Cleaning removes physically impossible, frozen, missing, or contextually suspicious chiller sensor readings.
      </Card>
      <Card className="table-card">
        <SectionTitle title="Cleaning Rules & Results" />
        <div className="data-table-wrap">
          <table>
            <thead><tr><th>Rule</th><th>Meaning</th><th>Detected samples</th><th>Action</th></tr></thead>
            <tbody>{rules.map(([rule, meaning, count, action]) => <tr key={rule}><td>{rule}</td><td>{meaning}</td><td>{data ? num(count, 0) : '-'}</td><td>{action}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <div className="two-col even">
        <ChartShell title="Before cleaning: raw physical sensor ID_32" subtitle="Raw chiller readings before validation and removal rules.">
          <TimeSeriesChart data={data?.charts?.raw || []} lines={[{ key: 'ID_32', name: 'Raw physical sensor ID_32', color: '#64748b' }]} />
        </ChartShell>
        <ChartShell title="After cleaning: filtered physical sensor ID_32" subtitle="Cleaned chiller readings used by the downstream pipeline.">
          <TimeSeriesChart data={data?.charts?.cleaned || []} lines={[{ key: 'ID_32', name: 'Cleaned physical sensor ID_32', color: '#0f9f8a' }]} />
        </ChartShell>
      </div>
    </div>
  );
}

function AnalysisPage({ data }) {
  const [method, setMethod] = useState('iforest');
  const signal = data?.signal || {};
  const methods = {
    iforest: { label: 'Isolation Forest', meaning: 'Point anomalies', value: num(signal.isolationForestFlags), body: 'Flags unusual individual energy readings and local behavior.' },
    pelt: { label: 'PELT', meaning: 'Structural change points', value: num(signal.peltChangePoints?.length), body: 'Finds larger transitions in the chiller power signal.' },
    sax: { label: 'SAX', meaning: 'Repeated activity patterns', value: num(signal.saxWindows), body: 'Turns time windows into symbolic activity patterns.' },
  };
  const current = methods[method];
  return (
    <div className="page-grid">
      <div className="method-selector">
        {Object.entries(methods).map(([id, item]) => (
          <button key={id} className={cx(method === id && 'active')} onClick={() => setMethod(id)}>
            <b>{item.label}</b><span>{item.meaning}</span>
          </button>
        ))}
      </div>
      <ChartShell title={current.label} subtitle={current.body}>
        <TimeSeriesChart data={data?.charts?.cleaned || []} lines={[
          { key: 'ID_32', name: 'Cleaned physical sensor ID_32', color: '#0f9f8a' },
          { key: 'ID_31', name: 'Building consumption ID_31', color: '#3b82f6', width: 2 },
        ]} large />
      </ChartShell>
      <Card className="summary-card">
        <div><span>Method</span><b>{current.label}</b></div>
        <div><span>Diagnostic focus</span><b>{current.meaning}</b></div>
        <div><span>Computed result</span><b>{current.value}</b></div>
      </Card>
      {method === 'sax' && (
        <Card className="table-card">
          <SectionTitle title="Top SAX Patterns" subtitle="Most frequent symbolic chiller activity windows." />
          {!data ? <EmptyState title="No SAX patterns yet" subtitle="Load a dataset to compute repeated activity patterns." /> : (
            <div className="pattern-list">{(signal.saxPatterns || []).map((item) => <div key={item.pattern}><b>{item.pattern}</b><span>{item.count}</span></div>)}</div>
          )}
        </Card>
      )}
    </div>
  );
}

function VirtualSensorPage({ data }) {
  const reg = data?.model?.regression || {};
  const featureRows = [
    ['Building consumption', 'ID_31, total load', 'Captures whole-building demand context'],
    ['Weather', 'temp_C, humidity', 'Explains weather-driven cooling demand'],
    ['Time', 'hour, weekday, season', 'Represents operating schedules'],
    ['Lag features', 'previous load values', 'Uses recent history'],
    ['Rolling means', 'moving averages', 'Smooths noisy short-term variation'],
    ['Previous chiller behavior', 'prior ID_32 state', 'Preserves operational continuity'],
  ];
  const metrics = [['MAE', reg.MAE], ['RMSE', reg.RMSE], ['R2', reg.R2], ['Match rate', data?.model?.onoff?.Accuracy]];
  return (
    <div className="page-grid">
      <Card className="explain-card">The virtual sensor estimates chiller power from building consumption, weather, time, lag, and rolling features.</Card>
      <Card className="table-card">
        <SectionTitle title="Feature Groups" />
        <div className="data-table-wrap">
          <table>
            <thead><tr><th>Feature group</th><th>Examples</th><th>Purpose</th></tr></thead>
            <tbody>{featureRows.map((row) => <tr key={row[0]}><td>{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <ChartShell title="XGBoost predicted chiller power vs physical sensor ID_32" subtitle="Comparison of measured physical sensor output and the virtual sensor prediction.">
        <TimeSeriesChart data={data?.charts?.comparison || []} lines={[
          { key: 'ID_32', name: 'Physical sensor ID_32', color: '#64748b' },
          { key: 'ID_32_pred', name: 'Virtual sensor prediction', color: '#0f9f8a' },
          { key: 'error_kw', name: 'Error / divergence', color: '#ef4444', width: 1.7 },
        ]} large />
      </ChartShell>
      <Card className="summary-card metric-row">
        {metrics.filter(([, value]) => value !== undefined && value !== null).map(([label, value]) => (
          <div key={label}><span>{label}</span><b>{label === 'Match rate' ? pct(value) : num(value)}</b></div>
        ))}
      </Card>
    </div>
  );
}

function DiagnosticsPage({ data }) {
  const onoff = data?.model?.onoff || {};
  const comparison = data?.comparison || {};
  const matchRate = onoff.Accuracy !== undefined ? onoff.Accuracy : undefined;
  const summary = [
    ['ON periods', num(onoff['Actual ON'] ?? onoff['Predicted ON'])],
    ['OFF periods', num(onoff['Actual OFF'] ?? onoff['Predicted OFF'])],
    ['Mismatches', num(comparison.onOffMismatches)],
    ['Match rate', matchRate !== undefined ? pct(matchRate) : '-'],
  ];
  return (
    <div className="page-grid">
      <div className="two-col diagnostic-top">
        <Card className="threshold-card">
          <h2>ON/OFF Threshold</h2>
          <p>Predicted power &gt; 2.0 kW = ON</p>
          <p>Predicted power &lt;= 2.0 kW = OFF</p>
        </Card>
        <Card className="summary-card">
          {summary.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
        </Card>
      </div>
      <ChartShell title="Physical Sensor vs Virtual Sensor with ON/OFF Threshold" subtitle="Shows ID_32, virtual prediction, divergence, and the 2.0 kW threshold used for ON/OFF detection.">
        <TimeSeriesChart data={data?.charts?.comparison || []} threshold lines={[
          { key: 'ID_32', name: 'Physical sensor ID_32', color: '#64748b' },
          { key: 'ID_32_pred', name: 'Virtual sensor prediction', color: '#0f9f8a' },
          { key: 'error_kw', name: 'Error / divergence', color: '#ef4444', width: 1.7 },
        ]} large />
      </ChartShell>
      <Card className="interpretation-card">
        Physical sensors can fail silently. Large divergence between ID_32 and the virtual sensor can indicate frozen readings, false consumption, or sensor fault.
      </Card>
    </div>
  );
}

function AlertsPage({ data }) {
  const alerts = data?.alerts || [];
  const counts = ['normal', 'warning', 'critical'].map((severity) => ({
    severity,
    value: alerts.filter((alert) => alert.severity === severity).length,
  }));
  const realAlerts = alerts.filter((alert) => !(alert.severity === 'normal' && alert.affectedInterval === '0 samples'));
  return (
    <div className="page-grid">
      <Card className="alert-summary">
        {counts.map((item) => <div key={item.severity} className={item.severity}><span>{item.severity}</span><b>{data ? item.value : '-'}</b></div>)}
      </Card>
      <Card className="table-card">
        <SectionTitle title="Diagnostic Alerts" />
        {!data ? <EmptyState icon={AlertTriangle} title="No diagnostic alerts yet" subtitle="Load a dataset to run cleaning, virtual sensing, comparison, and alert generation." /> : realAlerts.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No diagnostic alerts detected for the current dataset." subtitle="The loaded data did not trigger warning or critical alert rules." />
        ) : (
          <div className="alert-list">
            {realAlerts.map((alert, index) => (
              <div key={`${alert.type}-${index}`} className={cx('alert-row', alert.severity)}>
                <span>{alert.severity}</span>
                <b>{alert.type}</b>
                <p>{alert.reason}</p>
                <small><strong>Affected interval:</strong> {alert.affectedInterval}</small>
                <small><strong>Recommended action:</strong> {alert.recommendedAction}</small>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ReportsPage({ data }) {
  const reports = [
    ['cleaned', 'Export cleaned dataset', 'Download the validated time series produced by the cleaning pipeline.', true],
    ['alerts', 'Export alert report', 'Download diagnostic alerts with affected intervals and recommended actions.', true],
    ['model-comparison', 'Export model comparison results', 'Download physical versus virtual sensor comparison rows.', true],
    ['summary', 'Generate diagnostic summary', 'Open a compact HTML summary for the current diagnostic run.', true],
  ];
  const download = (kind) => data && window.open(`${API}/report/export?kind=${kind}`, '_blank', 'noopener,noreferrer');
  return (
    <div className="reports-grid">
      {reports.map(([kind, title, desc, implemented]) => (
        <Card key={kind} className="report-card">
          <FileText size={22} />
          <h3>{title}</h3>
          <p>{desc}</p>
          <button className="primary" disabled={!data || !implemented} onClick={() => download(kind)}>
            {implemented ? 'Export' : 'Coming soon'}
          </button>
        </Card>
      ))}
    </div>
  );
}

function App() {
  const [active, setActive] = useState('overview');
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

  const loadDemo = () => {
    setSelectedFile('Demo dataset');
    callApi('/dataset/demo', { method: 'POST' });
  };
  const uploadFile = (file) => {
    setSelectedFile(file.name);
    const fd = new FormData();
    fd.append('file', file);
    callApi('/dataset/upload', { method: 'POST', body: fd });
  };

  const page = useMemo(() => {
    const props = { data, loadDemo, uploadFile, loading, selectedFile, success };
    if (active === 'cleaning') return <CleaningPage data={data} />;
    if (active === 'analysis') return <AnalysisPage data={data} />;
    if (active === 'virtual') return <VirtualSensorPage data={data} />;
    if (active === 'diagnostics') return <DiagnosticsPage data={data} />;
    if (active === 'alerts') return <AlertsPage data={data} />;
    if (active === 'reports') return <ReportsPage data={data} />;
    return <OverviewPage {...props} />;
  }, [active, data, loading, selectedFile, success]);

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} />
      <main className="main">
        <StatusHeader active={active} />
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
