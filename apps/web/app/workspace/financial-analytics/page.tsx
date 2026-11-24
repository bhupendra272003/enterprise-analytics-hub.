'use client';

import { ChangeEvent, useMemo, useState } from 'react';

type LoanRow = Record<string, string>;
type SourceManifest = {
  dataset: string;
  host?: string;
  generated_at_utc: string;
  batch_size: number;
  read_only: boolean;
  tables: Record<string, { file: string; row_count: number; column_count: number; columns: string[] }>;
};
const EXPECTED_SOURCE_TABLES = ['account', 'client', 'disp', 'card', 'loan', 'orders', 'trans', 'district'];
type Profile = {
  source?: string;
  generated_at_utc?: string;
  inventory?: { table: string; rows: number; columns: number }[];
  key_integrity?: { table: string; key: string; rows: number; missing_key: number; duplicate_key_groups: number }[];
  loan_checks?: Record<string, number>;
  loan_rows_exported?: number;
  status_distribution?: Record<string, number>;
  missing_by_table_column?: Record<string, number>;
  relationship_integrity?: { child_table: string; child_column: string; parent_table: string; parent_column: string; orphan_rows: number }[];
  loan_grain_audit?: Record<string, number>;
  temporal_audit?: Record<string, number>;
  feature_rows_exported?: number;
};

function parseCsv(source: string): LoanRow[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = (rows.shift() || []).map(value => value.trim());
  return rows.filter(values => values.some(value => value.trim() !== '')).map(values =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()]))
  );
}

function numeric(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function FinancialAnalyticsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [features, setFeatures] = useState<LoanRow[]>([]);
  const [durationSummary, setDurationSummary] = useState<LoanRow[]>([]);
  const [vintageSummary, setVintageSummary] = useState<LoanRow[]>([]);
  const [durationFileName, setDurationFileName] = useState("");
  const [vintageFileName, setVintageFileName] = useState("");
  const [validationReport, setValidationReport] = useState<any>(null);
  const [sourceManifest, setSourceManifest] = useState<SourceManifest | null>(null);
  const [manifestFileName, setManifestFileName] = useState('');
  const [fileName, setFileName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [featureFileName, setFeatureFileName] = useState('');
  const [validationFileName, setValidationFileName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('Files are processed locally in this browser. Nothing is uploaded to Vyron.');

  async function loadLoans(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length || !('loan_id' in rows[0]) || !('status' in rows[0])) {
        throw new Error('This does not look like loan_analysis_extract.csv. Expected loan_id and status columns.');
      }
      setLoans(rows);
      setFileName(file.name);
      setNotice(`Loaded ${rows.length.toLocaleString()} loan rows locally. Review the grain and status distribution before analysis.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the loan extract.'); }
    finally { event.target.value = ''; }
  }

  async function loadFeatures(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const rows = parseCsv(await file.text());
      const required = ['loan_id', 'account_id', 'loan_date', 'transaction_type', 'prior_transaction_count', 'latest_prior_transaction_date'];
      if (!rows.length || !required.every(column => column in rows[0])) {
        throw new Error('Expected loan_prior_features.csv with the required loan and prior-transaction columns.');
      }
      if ('loan_status' in rows[0] || 'status' in rows[0]) {
        throw new Error('The feature extract contains the target status. Use the updated leakage-safe SQL/Python export.');
      }
      const violations = rows.filter(row => row.latest_prior_transaction_date && row.loan_date &&
        row.latest_prior_transaction_date.slice(0, 10) >= row.loan_date.slice(0, 10)).length;
      if (violations) throw new Error(violations + ' feature rows contain same-day or post-loan transactions. The file was not loaded.');
      setFeatures(rows);
      setFeatureFileName(file.name);
      setNotice('Loaded ' + rows.length.toLocaleString() + ' pre-loan feature rows locally. Target status is excluded and the date boundary passed.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the prior-loan feature extract.'); }
    finally { event.target.value = ''; }
  }

  async function loadGroupedSummary(
    event: ChangeEvent<HTMLInputElement>,
    dimension: 'duration_months' | 'loan_month',
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const rows = parseCsv(await file.text());
      const required = [dimension, 'status', 'loan_count', 'distinct_accounts', 'average_loan_amount', 'share_pct'];
      if (!rows.length || !required.every(column => column in rows[0])) {
        throw new Error('The grouped summary is missing its expected Power BI columns.');
      }
      if (rows.some(row => !row[dimension] || !Number.isInteger(Number(row.loan_count)) || Number(row.loan_count) < 0)) {
        throw new Error('The grouped summary contains a blank group or invalid loan count.');
      }
      if (dimension === 'duration_months') {
        setDurationSummary(rows);
        setDurationFileName(file.name);
      } else {
        setVintageSummary(rows);
        setVintageFileName(file.name);
      }
      setNotice('Loaded ' + rows.length.toLocaleString() + ' descriptive groups locally. These summaries are for reporting, not model predictors.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the grouped analysis summary.'); }
    finally { event.target.value = ''; }
  }

  async function loadValidationReport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const parsed = JSON.parse(await file.text());
      if (typeof parsed.passed !== 'boolean' || !Array.isArray(parsed.checks)) {
        throw new Error('Expected validation_report.json from the Financial Analytics export validator.');
      }
      setValidationReport(parsed);
      setValidationFileName(file.name);
      setNotice(parsed.passed ? 'Offline export validation passed.' : 'Offline export validation needs review. See failed checks below.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the validation report.'); }
    finally { event.target.value = ''; }
  }

  async function loadSourceManifest(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as SourceManifest;
      const tables = parsed?.tables;
      if (!parsed || parsed.dataset !== 'financial' || parsed.read_only !== true ||
          !tables || typeof tables !== 'object' || Array.isArray(tables)) {
        throw new Error('Expected a read-only Financial source_tables/manifest.json export manifest.');
      }
      if (!Number.isInteger(parsed.batch_size) || parsed.batch_size < 1 ||
          typeof parsed.generated_at_utc !== 'string' ||
          Number.isNaN(Date.parse(parsed.generated_at_utc))) {
        throw new Error('Manifest generation timestamp or batch size is invalid.');
      }
      const names = Object.keys(tables).sort();
      if (names.join('|') !== [...EXPECTED_SOURCE_TABLES].sort().join('|')) {
        throw new Error('Manifest must describe exactly the eight expected source tables.');
      }
      for (const table of EXPECTED_SOURCE_TABLES) {
        const item = tables[table];
        if (!item || typeof item !== 'object' || item.file !== table + '.csv' ||
            !Array.isArray(item.columns) || item.columns.length < 1 ||
            item.columns.some(column => typeof column !== 'string' || !column.trim()) ||
            new Set(item.columns).size !== item.columns.length ||
            item.column_count !== item.columns.length ||
            !Number.isInteger(item.row_count) || item.row_count < 0) {
          throw new Error('Manifest metadata is invalid for source table: ' + table + '.');
        }
      }
      setSourceManifest(parsed);
      setManifestFileName(file.name);
      const totalRows = Object.values(tables).reduce((sum, item) => sum + item.row_count, 0);
      setNotice('Loaded read-only manifest for 8 source tables (' + totalRows.toLocaleString() + ' declared rows). CSV contents are verified separately by the offline validator.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the source export manifest.'); }
    finally { event.target.value = ''; }
  }

  async function loadProfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as Profile;
      if (!Array.isArray(parsed.inventory) || !parsed.loan_checks) throw new Error('Expected source_profile.json from the Financial Analytics Python profiler.');
      setProfile(parsed);
      setProfileName(file.name);
      setNotice('Source profile loaded locally. These are values recorded by the last successful profiler run.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not read the source profile.'); }
    finally { event.target.value = ''; }
  }

  function exportPowerBiSummary() {
    const rows: string[][] = [
      ['section', 'metric', 'value', 'unit'],
      ['overview', 'loan_records', String(loans.length), 'rows'],
      ['overview', 'distinct_accounts', String(summary.distinctAccounts), 'accounts'],
      ['overview', 'average_loan_amount', summary.averageAmount === null ? '' : String(summary.averageAmount), 'source_currency'],
      ['overview', 'average_duration_months', summary.averageDuration === null ? '' : String(summary.averageDuration), 'months'],
      ['data_quality', 'missing_loan_ids', String(summary.missingIds), 'rows'],
      ['data_quality', 'missing_source_cells', String(Object.values(profile?.missing_by_table_column || {}).reduce((sum, value) => sum + value, 0)), 'cells'],
      ['data_quality', 'orphan_foreign_key_rows', String((profile?.relationship_integrity || []).reduce((sum, item) => sum + item.orphan_rows, 0)), 'rows'],
      ['data_quality', 'duplicate_loan_id_groups', String(summary.duplicateLoanIdGroups), 'groups'],
      ['data_quality', 'non_positive_amounts', String(summary.invalidAmounts), 'rows'],
      ['data_quality', 'non_positive_durations', String(summary.invalidDurations), 'rows'],
      ...summary.statuses.map(([status, count]) => ['loan_status', status, String(count), 'rows']),
    ];
    const csv = rows.map(row => row.map(value => {
      const escaped = value.replace(/"/g, '""');
      return /[",\\r\\n]/.test(escaped) ? `"${escaped}"` : escaped;
    }).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vyron_financial_power_bi_summary.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const summary = useMemo(() => {
    const statuses = new Map<string, number>();
    let amountTotal = 0, amountCount = 0, durationTotal = 0, durationCount = 0, missingIds = 0, invalidAmounts = 0, invalidDurations = 0;
    const accounts = new Set<string>();
    const loanIdCounts = new Map<string, number>();
    for (const loan of loans) {
      const status = loan.status || '<BLANK>';
      if (loan.loan_id) loanIdCounts.set(loan.loan_id, (loanIdCounts.get(loan.loan_id) || 0) + 1);
      statuses.set(status, (statuses.get(status) || 0) + 1);
      const amount = numeric(loan.amount), duration = numeric(loan.duration);
      if (amount !== null) { amountTotal += amount; amountCount += 1; if (amount <= 0) invalidAmounts += 1; }
      if (duration !== null) { durationTotal += duration; durationCount += 1; if (duration <= 0) invalidDurations += 1; }
      if (loan.account_id) accounts.add(loan.account_id);
      if (!loan.loan_id) missingIds += 1;
    }
    return {
      statuses: [...statuses.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      averageAmount: amountCount ? amountTotal / amountCount : null,
      averageDuration: durationCount ? durationTotal / durationCount : null,
      distinctAccounts: accounts.size,
      missingIds,
      duplicateLoanIdGroups: [...loanIdCounts.values()].filter(count => count > 1).length,
      invalidAmounts,
      invalidDurations,
    };
  }, [loans]);

  const featureSummary = useMemo(() => {
    const types = [...new Set(features.map(row => row.transaction_type).filter(Boolean))].sort();
    const priorTransactions = features.reduce((sum, row) => sum + (numeric(row.prior_transaction_count) || 0), 0);
    return { types, priorTransactions };
  }, [features]);

  return <main className="financial-shell">
    <aside className="projects-sidebar">
      <a className="brand" href="/workspace"><span className="brand-mark">B</span><span>BHUPENDRA'S VYRON</span></a>
      <div className="side-label">WORKSPACE</div>
      <a className="side-link" href="/workspace">▦ Overview</a>
      <a className="side-link" href="/workspace/team">♧ Team & access</a>
      <a className="side-link" href="/workspace/teams">♙ Teams</a>
      <a className="side-link" href="/workspace/my-work">✓ My work</a>
      <a className="side-link" href="/workspace/performance">◫ Performance</a>
      <a className="side-link" href="/workspace/projects">◫ Projects & tasks</a>
      <a className="side-link" href="/workspace/data">◈ Data workspace</a>
      <a className="side-link selected" href="/workspace/financial-analytics">▤ Financial Analytics</a>
      <a className="side-link" href="/workspace/generator">✧ Data generator</a>
      <a className="side-link" href="/workspace/reports">▧ Reports</a>
      <a className="side-link" href="/workspace/audit">⌑ Audit activity</a>
      <div className="sidebar-footer"><span className="online-dot"/> SYSTEM ONLINE<br/><small>PKDD'99 · FINANCIAL</small></div>
    </aside>
    <section className="financial-main">
      <header className="projects-header"><b>BHUPENDRA'S VYRON / WORKSPACE / FINANCIAL ANALYTICS</b><a href="/workspace" className="back-link">← Overview</a></header>
      <div className="financial-content">
        <div className="eyebrow"><span/> REAL-DATA ANALYTICS · CTU PKDD'99</div>
        <h1>Financial <em>intelligence.</em></h1>
        <p className="financial-intro">A reproducible loan analytics workspace for source profiling, data-quality review and Power BI preparation.</p>
        <div className="financial-source"><div><small>PUBLIC SOURCE</small><b>CTU Relational Financial Database</b><span>8 relational tables · read-only source workflow</span></div><a href="https://relational.fel.cvut.cz/dataset/Financial" target="_blank" rel="noreferrer">Dataset documentation ↗</a></div>
        <div className="financial-grid">
          <section className="financial-panel"><div className="financial-panel-head"><div><small>STEP 01 · SOURCE PROFILE</small><h2>Load profiler output</h2></div><span className="financial-icon">01</span></div><p>Run <code>python python/profile_financial.py</code> from the project directory, then select its <code>output/source_profile.json</code>.</p><label className="financial-upload">Choose source_profile.json<input type="file" accept=".json,application/json" onChange={loadProfile}/></label>{profileName&&<small className="financial-file">Loaded: {profileName}</small>}</section>
          <section className="financial-panel"><div className="financial-panel-head"><div><small>STEP 02 · LOAN EXTRACT</small><h2>Load loan records</h2></div><span className="financial-icon">02</span></div><p>Use <code>output/loan_analysis_extract.csv</code>. The file stays in your browser and is not sent to the server.</p><label className="financial-upload">Choose loan_analysis_extract.csv<input type="file" accept=".csv,text/csv" onChange={loadLoans}/></label>{fileName&&<small className="financial-file">Loaded: {fileName}</small>}</section>
          <section className="financial-panel"><div className="financial-panel-head"><div><small>STEP 03 · PRE-LOAN FEATURES</small><h2>Load safe feature table</h2></div><span className="financial-icon">03</span></div><p>Use <code>output/loan_prior_features.csv</code>. Vyron checks that the target status is absent and prior transactions precede the loan date.</p><label className="financial-upload">Choose loan_prior_features.csv<input type="file" accept=".csv,text/csv" onChange={loadFeatures}/></label>{featureFileName&&<small className="financial-file">Loaded: {featureFileName}</small>}</section>
          <section className="financial-panel"><div className="financial-panel-head"><div><small>STEP 04 · POWER BI SUMMARIES</small><h2>Load grouped analysis</h2></div><span className="financial-icon">04</span></div><p>Run <code>python python/build_analytics.py</code> after profiling. Load the descriptive duration and monthly-vintage outputs.</p><label className="financial-upload">Choose loan_duration_outcome_summary.csv<input type="file" accept=".csv,text/csv" onChange={event => loadGroupedSummary(event, 'duration_months')}/></label>{durationFileName&&<small className="financial-file">Loaded: {durationFileName}</small>}<label className="financial-upload">Choose loan_vintage_outcome_summary.csv<input type="file" accept=".csv,text/csv" onChange={event => loadGroupedSummary(event, 'loan_month')}/></label>{vintageFileName&&<small className="financial-file">Loaded: {vintageFileName}</small>}</section>
          <section className="financial-panel"><div className="financial-panel-head"><div><small>STEP 05 · OFFLINE VALIDATION</small><h2>Load validation report</h2></div><span className="financial-icon">05</span></div><p>Run <code>python python/validate_exports.py</code> after building the grouped summaries, then select <code>output/validation_report.json</code>.</p><label className="financial-upload">Choose validation_report.json<input type="file" accept=".json,application/json" onChange={loadValidationReport}/></label>{validationFileName&&<small className="financial-file">Loaded: {validationFileName}</small>}</section>
          <section className="financial-panel"><div className="financial-panel-head"><div><small>STEP 06 · RAW SOURCE INVENTORY</small><h2>Load eight-table manifest</h2></div><span className="financial-icon">06</span></div><p>Choose <code>output/source_tables/manifest.json</code> to inspect the full source export inventory, declared row counts and schema.</p><label className="financial-upload">Choose manifest.json<input type="file" accept=".json,application/json" onChange={loadSourceManifest}/></label>{manifestFileName&&<small className="financial-file">Loaded: {manifestFileName}</small>}</section>
        </div>
        {error&&<div className="financial-alert" role="alert">{error}</div>}
        <div className="financial-notice" role="status">✳ {notice}</div>
        {profile&&<section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>PROFILE SNAPSHOT · {profileName}</small><h2>Source inventory</h2></div><span className="financial-chip">Profiler output</span></div><div className="financial-kpis"><article><small>TABLES PROFILED</small><b>{profile.inventory?.length ?? 0}</b></article><article><small>LOAN ROWS</small><b>{(profile.loan_rows_exported ?? 0).toLocaleString()}</b></article><article><small>GENERATED UTC</small><b className="financial-date">{profile.generated_at_utc ? new Date(profile.generated_at_utc).toLocaleString() : 'Not recorded'}</b></article></div><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Source table</th><th>Rows</th><th>Columns</th></tr></thead><tbody>{profile.inventory?.map(item=><tr key={item.table}><td>{item.table}</td><td>{item.rows.toLocaleString()}</td><td>{item.columns}</td></tr>)}</tbody></table></div><h3>Loan data-quality checks</h3><div className="financial-quality">{Object.entries(profile.loan_checks || {}).map(([key,value])=><div key={key}><span>{key.replaceAll('_',' ')}</span><b>{value.toLocaleString()}</b></div>)}</div><h3>Key integrity exceptions</h3><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Table / key</th><th>Missing keys</th><th>Duplicate groups</th></tr></thead><tbody>{profile.key_integrity?.map(item=><tr key={item.table}><td>{item.table}.{item.key}</td><td>{item.missing_key.toLocaleString()}</td><td>{item.duplicate_key_groups.toLocaleString()}</td></tr>)}</tbody></table></div><h3>Missing values across source columns</h3><div className="financial-quality">{Object.entries(profile.missing_by_table_column || {}).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([column, value]) => <div key={column}><span>{column}</span><b>{value.toLocaleString()}</b></div>)}</div><h3>Foreign-key relationship checks</h3><div className="financial-quality">{(profile.relationship_integrity || []).map(item => <div key={item.child_table + item.child_column}><span>{item.child_table}.{item.child_column} → {item.parent_table}.{item.parent_column}</span><b>{item.orphan_rows.toLocaleString()} orphan rows</b></div>)}</div><h3>Loan grain and temporal audit</h3><div className="financial-quality">{Object.entries(profile.loan_grain_audit || {}).map(([key, value]) => <div key={key}><span>{key.replaceAll('_',' ')}</span><b>{value.toLocaleString()}</b></div>)}{Object.entries(profile.temporal_audit || {}).map(([key, value]) => <div key={key}><span>{key.replaceAll('_',' ')}</span><b>{value.toLocaleString()}</b></div>)}</div></section>}
        {loans.length>0&&<section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>LOCAL CSV ANALYSIS · {fileName}</small><h2>Loan extract overview</h2></div><span className="financial-chip">Browser-only</span></div><div className="financial-kpis"><article><small>LOAN RECORDS</small><b>{loans.length.toLocaleString()}</b></article><article><small>DISTINCT ACCOUNTS</small><b>{summary.distinctAccounts.toLocaleString()}</b></article><article><small>AVERAGE AMOUNT</small><b>{summary.averageAmount===null?'—':summary.averageAmount.toLocaleString(undefined,{maximumFractionDigits:2})}</b></article><article><small>AVG. DURATION · MONTHS</small><b>{summary.averageDuration===null?'—':summary.averageDuration.toFixed(2)}</b></article></div><h3>Observed loan status distribution</h3><div className="financial-quality">{summary.statuses.map(([status,count])=><div key={status}><span>{status}</span><b>{count.toLocaleString()} · {(count/loans.length*100).toFixed(1)}%</b></div>)}</div><h3>Extract integrity checks</h3><div className="financial-quality"><div><span>Missing loan IDs</span><b>{summary.missingIds.toLocaleString()}</b></div><div><span>Duplicate loan ID groups</span><b>{summary.duplicateLoanIdGroups.toLocaleString()}</b></div><div><span>Non-positive amounts</span><b>{summary.invalidAmounts.toLocaleString()}</b></div><div><span>Non-positive durations</span><b>{summary.invalidDurations.toLocaleString()}</b></div></div><button type="button" className="financial-upload financial-export" onClick={exportPowerBiSummary}>Export summary CSV for Power BI</button><p className="financial-footnote">These checks describe the uploaded extract only. Status labels are shown as observed; C/D are not automatically classified as bad loans. Duplicate groups are counted by distinct loan_id values appearing more than once.</p></section>}
        {durationSummary.length > 0 && <section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>LOCAL DESCRIPTIVE ANALYSIS · {durationFileName}</small><h2>Loan outcomes by duration</h2></div><span className="financial-chip">Power BI ready</span></div><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Duration · months</th><th>Observed status</th><th>Loans</th><th>Distinct accounts</th><th>Average amount</th><th>Share of all loans</th></tr></thead><tbody>{durationSummary.map((row, index) => <tr key={row.duration_months + row.status + index}><td>{row.duration_months}</td><td>{row.status}</td><td>{Number(row.loan_count).toLocaleString()}</td><td>{Number(row.distinct_accounts).toLocaleString()}</td><td>{row.average_loan_amount ? Number(row.average_loan_amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td><td>{Number(row.share_pct).toFixed(2)}%</td></tr>)}</tbody></table></div><p className="financial-footnote">Shares use all loan rows as the denominator. Missing duration and status values remain visible as explicit groups. This is descriptive analysis, not a predictive feature table.</p></section>}
        {vintageSummary.length > 0 && <section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>LOCAL DESCRIPTIVE ANALYSIS · {vintageFileName}</small><h2>Monthly loan vintage</h2></div><span className="financial-chip">Power BI ready</span></div><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Loan month</th><th>Observed status</th><th>Loans</th><th>Distinct accounts</th><th>Average amount</th><th>Share of all loans</th></tr></thead><tbody>{vintageSummary.map((row, index) => <tr key={row.loan_month + row.status + index}><td>{row.loan_month}</td><td>{row.status}</td><td>{Number(row.loan_count).toLocaleString()}</td><td>{Number(row.distinct_accounts).toLocaleString()}</td><td>{row.average_loan_amount ? Number(row.average_loan_amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td><td>{Number(row.share_pct).toFixed(2)}%</td></tr>)}</tbody></table></div><p className="financial-footnote">Monthly cohorts are grouped by loan start month. These historical descriptive summaries do not imply current bank performance or causal effects.</p></section>}
        {features.length > 0 && <section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>LOCAL CSV ANALYSIS · {featureFileName}</small><h2>Pre-loan activity features</h2></div><span className="financial-chip">Target-free extract</span></div><div className="financial-kpis"><article><small>FEATURE ROWS</small><b>{features.length.toLocaleString()}</b></article><article><small>OBSERVED TRANSACTION TYPES</small><b>{featureSummary.types.length}</b></article><article><small>PRIOR TRANSACTION MATCHES</small><b>{featureSummary.priorTransactions.toLocaleString()}</b></article></div><h3>Observed transaction categories</h3><div className="financial-quality">{featureSummary.types.map(type => <div key={type}><span>{type}</span><b>{features.filter(row => row.transaction_type === type).length.toLocaleString()} feature groups</b></div>)}</div><p className="financial-footnote">The feature extract excludes loan.status and only includes transactions strictly earlier than loan_date. Loan identifiers and dates are retained for traceability, not automatically treated as predictors.</p></section>}
        {sourceManifest && <section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>RAW SOURCE EXPORT · {manifestFileName}</small><h2>Eight-table source inventory</h2></div><span className="financial-chip">Read-only manifest</span></div><div className="financial-kpis"><article><small>TABLES</small><b>{Object.keys(sourceManifest.tables).length}</b></article><article><small>DECLARED ROWS</small><b>{Object.values(sourceManifest.tables).reduce((sum, item) => sum + item.row_count, 0).toLocaleString()}</b></article><article><small>BATCH SIZE</small><b>{sourceManifest.batch_size.toLocaleString()}</b></article><article><small>GENERATED UTC</small><b className="financial-date">{sourceManifest.generated_at_utc ? new Date(sourceManifest.generated_at_utc).toLocaleString() : 'Not recorded'}</b></article></div><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Source table</th><th>Rows</th><th>Columns</th><th>CSV file</th></tr></thead><tbody>{EXPECTED_SOURCE_TABLES.map(table => { const item = sourceManifest.tables[table]; return <tr key={table}><td>{table}</td><td>{item.row_count.toLocaleString()}</td><td>{item.column_count}</td><td>{item.file}</td></tr>; })}</tbody></table></div><p className="financial-footnote">Manifest metadata is structurally valid and marks this export as read-only. This page does not inspect the CSV bytes; use the offline validator to compare actual CSV headers and row counts with this manifest.</p></section>}
        {validationReport && <section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>OFFLINE EXPORT VALIDATION · {validationFileName}</small><h2>Reconciliation checks</h2></div><span className="financial-chip">{validationReport.passed ? 'Passed' : 'Needs review'}</span></div><div className="financial-kpis"><article><small>CHECKS RUN</small><b>{validationReport.checks.length}</b></article><article><small>FAILED CHECKS</small><b>{validationReport.errors?.length || 0}</b></article><article><small>WARNINGS</small><b>{validationReport.warnings?.length || 0}</b></article></div><div className="financial-quality">{validationReport.checks.map((item: any) => <div key={item.check}><span>{item.passed ? '✓ ' : '✕ '}{item.check.replaceAll('_',' ')}</span><b>{item.detail}</b></div>)}</div>{validationReport.passed && <p className="financial-footnote">All blocking export checks passed. Review any source warnings before building the final report.</p>}</section>}
        <section className="financial-panel financial-next"><small>REPRODUCIBLE PROJECT ASSETS</small><h2>SQL → Python → Power BI</h2><div className="financial-links"><a href="https://github.com/bhupendra272003/enterprise-analytics-hub./tree/main/projects/financial-analytics/sql" target="_blank" rel="noreferrer">Read-only SQL scripts ↗</a><a href="https://github.com/bhupendra272003/enterprise-analytics-hub./tree/main/projects/financial-analytics/python" target="_blank" rel="noreferrer">Python profiler, validator & tests ↗</a><a href="https://github.com/bhupendra272003/enterprise-analytics-hub./blob/main/projects/financial-analytics/POWER_BI_MODEL.md" target="_blank" rel="noreferrer">Power BI model guide ↗</a></div><p>Keep the source database read-only. CTU defines account_id as the prediction unit; loan_id is retained for row traceability. The as-of feature extract excludes loan.status and same-day or post-loan transactions. This page processes selected files locally; it does not run live MariaDB queries or Power BI refreshes.</p></section>
      </div>
      <footer className="team-footer">© 2026 BHUPENDRA'S VYRON <span>TRUST THE DATA · VERIFY THE GRAIN</span></footer>
    </section>
  </main>;
}
