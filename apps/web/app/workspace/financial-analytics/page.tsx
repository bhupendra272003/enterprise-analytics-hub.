'use client';

import { ChangeEvent, useMemo, useState } from 'react';

type LoanRow = Record<string, string>;
type Profile = {
  source?: string;
  generated_at_utc?: string;
  inventory?: { table: string; rows: number; columns: number }[];
  key_integrity?: { table: string; key: string; rows: number; missing_key: number; duplicate_key_groups: number }[];
  loan_checks?: Record<string, number>;
  loan_rows_exported?: number;
  status_distribution?: Record<string, number>;
  missing_by_column?: Record<string, number>;
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
  const [fileName, setFileName] = useState('');
  const [profileName, setProfileName] = useState('');
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
        </div>
        {error&&<div className="financial-alert" role="alert">{error}</div>}
        <div className="financial-notice" role="status">✳ {notice}</div>
        {profile&&<section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>PROFILE SNAPSHOT · {profileName}</small><h2>Source inventory</h2></div><span className="financial-chip">Profiler output</span></div><div className="financial-kpis"><article><small>TABLES PROFILED</small><b>{profile.inventory?.length ?? 0}</b></article><article><small>LOAN ROWS</small><b>{(profile.loan_rows_exported ?? 0).toLocaleString()}</b></article><article><small>GENERATED UTC</small><b className="financial-date">{profile.generated_at_utc ? new Date(profile.generated_at_utc).toLocaleString() : 'Not recorded'}</b></article></div><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Source table</th><th>Rows</th><th>Columns</th></tr></thead><tbody>{profile.inventory?.map(item=><tr key={item.table}><td>{item.table}</td><td>{item.rows.toLocaleString()}</td><td>{item.columns}</td></tr>)}</tbody></table></div><h3>Loan data-quality checks</h3><div className="financial-quality">{Object.entries(profile.loan_checks || {}).map(([key,value])=><div key={key}><span>{key.replaceAll('_',' ')}</span><b>{value.toLocaleString()}</b></div>)}</div><h3>Key integrity exceptions</h3><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Table / key</th><th>Missing keys</th><th>Duplicate groups</th></tr></thead><tbody>{profile.key_integrity?.map(item=><tr key={item.table}><td>{item.table}.{item.key}</td><td>{item.missing_key.toLocaleString()}</td><td>{item.duplicate_key_groups.toLocaleString()}</td></tr>)}</tbody></table></div></section>}
        {loans.length>0&&<section className="financial-panel financial-results"><div className="financial-panel-head"><div><small>LOCAL CSV ANALYSIS · {fileName}</small><h2>Loan extract overview</h2></div><span className="financial-chip">Browser-only</span></div><div className="financial-kpis"><article><small>LOAN RECORDS</small><b>{loans.length.toLocaleString()}</b></article><article><small>DISTINCT ACCOUNTS</small><b>{summary.distinctAccounts.toLocaleString()}</b></article><article><small>AVERAGE AMOUNT</small><b>{summary.averageAmount===null?'—':summary.averageAmount.toLocaleString(undefined,{maximumFractionDigits:2})}</b></article><article><small>AVG. DURATION · MONTHS</small><b>{summary.averageDuration===null?'—':summary.averageDuration.toFixed(2)}</b></article></div><h3>Observed loan status distribution</h3><div className="financial-quality">{summary.statuses.map(([status,count])=><div key={status}><span>{status}</span><b>{count.toLocaleString()} · {(count/loans.length*100).toFixed(1)}%</b></div>)}</div><h3>Extract integrity checks</h3><div className="financial-quality"><div><span>Missing loan IDs</span><b>{summary.missingIds.toLocaleString()}</b></div><div><span>Duplicate loan ID groups</span><b>{summary.duplicateLoanIdGroups.toLocaleString()}</b></div><div><span>Non-positive amounts</span><b>{summary.invalidAmounts.toLocaleString()}</b></div><div><span>Non-positive durations</span><b>{summary.invalidDurations.toLocaleString()}</b></div></div><p className="financial-footnote">These checks describe the uploaded extract only. Status labels are shown as observed; C/D are not automatically classified as bad loans. Duplicate groups are counted by distinct loan_id values appearing more than once.</p></section>}
        <section className="financial-panel financial-next"><small>REPRODUCIBLE PROJECT ASSETS</small><h2>SQL → Python → Power BI</h2><div className="financial-links"><a href="https://github.com/bhupendra272003/enterprise-analytics-hub./tree/main/projects/financial-analytics/sql" target="_blank" rel="noreferrer">Read-only SQL scripts ↗</a><a href="https://github.com/bhupendra272003/enterprise-analytics-hub./tree/main/projects/financial-analytics/python" target="_blank" rel="noreferrer">Python profiler & tests ↗</a><a href="https://github.com/bhupendra272003/enterprise-analytics-hub./blob/main/projects/financial-analytics/POWER_BI_MODEL.md" target="_blank" rel="noreferrer">Power BI model guide ↗</a></div><p>Keep the source database read-only. Use loan_id as the loan grain and exclude same-day or post-loan transactions from as-of predictors. Live MariaDB queries and Power BI refresh are not run by this page.</p></section>
      </div>
      <footer className="team-footer">© 2026 BHUPENDRA'S VYRON <span>TRUST THE DATA · VERIFY THE GRAIN</span></footer>
    </section>
  </main>;
}
