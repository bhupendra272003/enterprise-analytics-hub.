import type { CSSProperties } from 'react';

const panel: CSSProperties = {
  background: 'linear-gradient(145deg, rgba(20,29,39,.98), rgba(13,19,27,.98))',
  border: '1px solid #293643',
  borderRadius: 16,
  padding: 28
};
const link: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '13px 17px',
  borderRadius: 8, background: '#b7f36b', color: '#11190a',
  fontSize: 12, fontWeight: 700, textDecoration: 'none'
};
const muted: CSSProperties = { color: '#9ba8b5', lineHeight: 1.8, fontSize: 14 };

export default function ShowcasePage() {
  return <main style={{ maxWidth: 1180, margin: '0 auto', padding: '0 6vw 50px', color: '#edf3f8' }}>
    <header style={{ minHeight: 82, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #202b37', gap: 18 }}>
      <a href="/" style={{ color: 'inherit', textDecoration: 'none', fontFamily: 'Manrope,sans-serif', fontWeight: 800, letterSpacing: 1.2 }}>BHUPENDRA'S VYRON</a>
      <a href="/" style={{ color: '#b7f36b', textDecoration: 'none', fontSize: 12 }}>← Back to sign in</a>
    </header>

    <section style={{ padding: '76px 0 54px', maxWidth: 850 }}>
      <div style={{ color: '#b7f36b', font: '11px DM Mono,monospace', letterSpacing: 1.5, marginBottom: 22 }}>LIVE PROJECT · CLOUD DEPLOYED · DATA ANALYTICS</div>
      <h1 style={{ font: '800 clamp(38px,6vw,68px)/1.08 Manrope,sans-serif', letterSpacing: -2.5, margin: '0 0 22px' }}>Analytics you can trace.<br/><span style={{ color: '#b7f36b' }}>Decisions you can explain.</span></h1>
      <p style={{ ...muted, maxWidth: 720, fontSize: 16 }}>Bhupendra's Vyron is a cloud-deployed analytics workspace built to bring data preparation, quality checks, collaborative delivery and reporting into one governed workflow.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
        <a style={link} href="/workspace/financial-analytics">Explore Financial Analytics ↗</a>
        <a href="https://github.com/bhupendra272003/enterprise-analytics-hub." target="_blank" rel="noreferrer" style={{ ...link, background: 'transparent', color: '#edf3f8', border: '1px solid #3a4857' }}>View source on GitHub ↗</a>
      </div>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginBottom: 48 }}>
      {[
        ['01','Governed workspaces','Organization-scoped projects, members and role-aware access.'],
        ['02','Data preparation','CSV ingestion, profiling, Python-assisted cleaning and version history.'],
        ['03','Quality observability','Configurable validation, quality trends and anomaly comparisons.'],
        ['04','Business reporting','Power BI report catalog and export-ready analytical summaries.']
      ].map(([n,title,description]) => <article key={n} style={panel}>
        <div style={{ color: '#b7f36b', font: '12px DM Mono,monospace', marginBottom: 18 }}>{n}</div>
        <h2 style={{ font: '700 18px Manrope,sans-serif', margin: '0 0 10px' }}>{title}</h2>
        <p style={{ ...muted, fontSize: 13, margin: 0 }}>{description}</p>
      </article>)}
    </section>

    <section style={{ ...panel, marginBottom: 18 }}>
      <div style={{ color: '#b7f36b', font: '11px DM Mono,monospace', letterSpacing: 1.3 }}>FEATURED CASE STUDY · FINANCIAL ANALYTICS</div>
      <h2 style={{ font: '700 30px Manrope,sans-serif', margin: '13px 0' }}>CTU PKDD'99 Financial dataset</h2>
      <p style={muted}>A reproducible loan analytics workflow using a public relational banking dataset. The source database is treated as read-only; analysis is performed through SELECT-only SQL and local Python extracts.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, margin: '24px 0' }}>
        {[
          ['8 relational tables','Source inventory'],
          ['SQL','Loan outcomes and as-of features'],
          ['Python + pandas','Profiling and data-quality checks'],
          ['Power BI','Model and report preparation']
        ].map(([value,label]) => <div key={label} style={{ background: '#0b1118', border: '1px solid #293643', borderRadius: 10, padding: 16 }}>
          <b style={{ display: 'block', color: '#edf3f8', font: '700 18px Manrope,sans-serif' }}>{value}</b>
          <small style={{ color: '#8794a3', fontSize: 11 }}>{label}</small>
        </div>)}
      </div>
      <h3 style={{ font: '700 15px Manrope,sans-serif' }}>Workflow</h3>
      <ol style={{ ...muted, paddingLeft: 20 }}>
        <li>Inventory the source schema and inspect key integrity.</li>
        <li>Profile loan records and export reproducible CSV/JSON outputs with Python.</li>
        <li>Review loan status, duration, amount and data-quality exceptions with SQL.</li>
        <li>Prepare a Power BI model and export a summary CSV from the live Vyron page.</li>
      </ol>
      <a href="https://relational.fel.cvut.cz/dataset/Financial" target="_blank" rel="noreferrer" style={{ color: '#b7f36b', fontSize: 12 }}>Open dataset documentation ↗</a>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 18 }}>
        <a href="https://github.com/bhupendra272003/enterprise-analytics-hub./blob/main/projects/demo-data/logistics_orders_demo.csv" target="_blank" rel="noreferrer" style={{ color: '#b7f36b', fontSize: 12 }}>Try synthetic logistics CSV ↗</a>
        <a href="https://github.com/bhupendra272003/enterprise-analytics-hub./blob/main/projects/demo-data/README.md" target="_blank" rel="noreferrer" style={{ color: '#b7f36b', fontSize: 12 }}>5-minute live demo guide ↗</a>
      </div>
    </section>

    <section style={{ ...panel, marginBottom: 18 }}>
      <h2 style={{ font: '700 22px Manrope,sans-serif', margin: '0 0 16px' }}>Technology & engineering</h2>
      <p style={muted}>Next.js · React · TypeScript · Cloudflare Workers · D1 · R2/KV · Python · pandas · SQL · Power BI</p>
      <p style={muted}>The application includes role-aware organization workflows, dataset versioning, validation rules, quality reporting and change-based anomaly scans. Production use still requires end-to-end account and tenant testing with the intended organization configuration.</p>
    </section>

    <section style={{ border: '1px solid #66542e', background: 'rgba(102,84,46,.12)', borderRadius: 12, padding: 22, marginBottom: 44 }}>
      <h2 style={{ font: '700 17px Manrope,sans-serif', margin: '0 0 10px', color: '#e9c77b' }}>Current integration boundaries</h2>
      <p style={{ ...muted, margin: 0, fontSize: 13 }}>The Financial Analytics page processes selected extracts locally in the browser. A direct server-side MariaDB connector, automated Power BI refresh and secure embedded Power BI sessions are not currently enabled. The reports area stores governed report links; Microsoft Power BI continues to enforce viewer permissions.</p>
    </section>

    <footer style={{ borderTop: '1px solid #202b37', paddingTop: 22, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, color: '#8794a3', font: '10px DM Mono,monospace', letterSpacing: 1.1 }}>
      <span>© 2026 BHUPENDRA'S VYRON</span><span>BUILT BY BHUPENDRA SINGH DEORA</span><span>DATA · QUALITY · DECISIONS</span>
    </footer>
  </main>;
}
