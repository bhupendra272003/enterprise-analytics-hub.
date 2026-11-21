'use client';

const industries = [
  { name: 'Banking & Finance', detail: 'Customers, accounts, transactions, cards, loans, repayments and fraud alerts.', outcome: 'Risk, repayment and transaction insights', icon: '◈' },
  { name: 'Hospital & Healthcare', detail: 'Synthetic patients, appointments, admissions, lab, pharmacy, billing and claims.', outcome: 'Capacity, wait-time and service insights', icon: '✚' },
  { name: 'Logistics & Supply Chain', detail: 'Orders, shipments, vehicles, warehouses, inventory, routes and delivery events.', outcome: 'On-time delivery and operational efficiency', icon: '⌁' },
  { name: 'Retail & E-commerce', detail: 'Customers, products, orders, payments, returns, promotions and stock movements.', outcome: 'Sales, retention and inventory insights', icon: '▤' }
];

const lifecycle = ['Requirements', 'Data discovery', 'Ingestion', 'Profiling', 'Cleaning', 'Validation', 'SQL / Python', 'Dashboarding', 'QA & reconciliation', 'Insights & delivery'];

export default function BlueprintPage() {
  return <main className="vyron-blueprint">
    <style>{`
      .vyron-blueprint{min-height:100vh;background:#080d17;color:#edf2fb;padding:0 0 56px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
      .vb-shell{max-width:1180px;margin:auto;padding:0 28px}
      .vb-top{height:76px;border-bottom:1px solid #1d293a;display:flex;align-items:center;justify-content:space-between}
      .vb-brand{display:flex;align-items:center;gap:12px;color:#f7f9ff;text-decoration:none;font-size:12px;letter-spacing:.16em;font-weight:800}
      .vb-mark{width:34px;height:34px;border:1px solid #536987;border-radius:11px;display:grid;place-items:center;background:linear-gradient(145deg,#1d3452,#111b2a);font-size:18px}
      .vb-back{color:#a9bad1;text-decoration:none;font-size:13px}
      .vb-hero{padding:66px 0 40px;display:grid;grid-template-columns:1.35fr .65fr;gap:36px;align-items:center}
      .vb-kicker{color:#8ba9d0;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}
      .vb-hero h1{font-size:clamp(38px,6vw,66px);line-height:1.02;letter-spacing:-.055em;margin:18px 0 16px}
      .vb-hero h1 em{font-style:normal;color:#8db8ec}
      .vb-lead{color:#a8b7cb;line-height:1.8;max-width:680px;font-size:15px}
      .vb-status{border:1px solid #31445d;background:linear-gradient(145deg,#121e30,#0c1421);border-radius:18px;padding:24px}
      .vb-status small,.vb-label{color:#8ca5c4;font-size:10px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}
      .vb-status strong{display:block;font-size:24px;margin:10px 0}
      .vb-status p{color:#a8b7cb;font-size:13px;line-height:1.7;margin:0}
      .vb-section{margin-top:34px}
      .vb-section h2{font-size:22px;letter-spacing:-.025em;margin:8px 0}
      .vb-sub{color:#91a1b7;font-size:13px;line-height:1.7;margin:0 0 18px}
      .vb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
      .vb-card{background:#101927;border:1px solid #233247;border-radius:16px;padding:19px;min-height:190px}
      .vb-icon{width:36px;height:36px;border-radius:11px;background:#1a2b40;color:#9dc5f4;display:grid;place-items:center;font-size:18px}
      .vb-card h3{font-size:15px;margin:15px 0 8px}
      .vb-card p{font-size:12px;line-height:1.65;color:#9eafc4;margin:0}
      .vb-card small{display:block;margin-top:13px;color:#82a9d6;font-size:11px;line-height:1.5}
      .vb-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}
      .vb-step{background:#101927;border:1px solid #233247;border-radius:12px;padding:13px;font-size:12px;color:#d6e2f1}
      .vb-step span{display:block;color:#7696bd;font-size:10px;margin-bottom:7px;letter-spacing:.1em}
      .vb-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .vb-panel{border:1px solid #233247;background:#101927;border-radius:16px;padding:21px}
      .vb-panel h3{font-size:15px;margin:0 0 12px}
      .vb-panel ul{margin:0;padding-left:18px;color:#a9b8cb;font-size:12px;line-height:1.9}
      .vb-note{border-left:3px solid #7198c5;background:#111d2c;padding:16px 18px;border-radius:0 12px 12px 0;color:#b7c6d9;font-size:12px;line-height:1.75}
      .vb-footer{border-top:1px solid #1d293a;margin-top:48px;padding-top:20px;display:flex;justify-content:space-between;color:#647890;font-size:10px;letter-spacing:.12em}
      @media(max-width:850px){.vb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vb-hero{grid-template-columns:1fr}.vb-flow{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){.vb-shell{padding:0 17px}.vb-top{height:64px}.vb-brand{font-size:10px}.vb-grid,.vb-cols{grid-template-columns:1fr}.vb-hero{padding:46px 0 24px}.vb-card{min-height:0}.vb-footer{gap:12px;flex-direction:column}}
    `}</style>
    <div className="vb-shell">
      <header className="vb-top"><a className="vb-brand" href="/workspace"><span className="vb-mark">V</span> BHUPENDRA'S VYRON</a><a className="vb-back" href="/workspace">← Back to workspace</a></header>
      <section className="vb-hero">
        <div><div className="vb-kicker">Platform briefing · Project blueprint</div><h1>Analytics work,<br/><em>with a system.</em></h1><p className="vb-lead">Vyron is designed as a multi-industry analytics and collaboration workspace. It connects data preparation, analysis, dashboarding, review and delivery in one governed workflow — while keeping participant onboarding and team creation approval-gated.</p></div>
        <aside className="vb-status"><small>PROJECT STATUS</small><strong>Foundation & proposal</strong><p>Core workspace modules exist in the codebase. Four-role enforcement, team-scoped assignments, Owner-only generator execution, performance reporting, durable storage and background generation remain planned engineering work.</p></aside>
      </section>
      <section className="vb-section"><div className="vb-label">01 / Industry templates</div><h2>One platform. Multiple business domains.</h2><p className="vb-sub">These are proposed templates, not pre-created teams or live company datasets.</p><div className="vb-grid">{industries.map(item=><article className="vb-card" key={item.name}><div className="vb-icon">{item.icon}</div><h3>{item.name}</h3><p>{item.detail}</p><small>{item.outcome}</small></article>)}</div></section>
      <section className="vb-section"><div className="vb-label">02 / Analytics lifecycle</div><h2>From raw data to reviewed insights.</h2><p className="vb-sub">Each handoff should preserve the source, version, responsible person and quality evidence.</p><div className="vb-flow">{lifecycle.map((step,i)=><div className="vb-step" key={step}><span>STEP {String(i+1).padStart(2,'0')}</span>{step}</div>)}</div></section>
      <section className="vb-section"><div className="vb-label">03 / Governance</div><h2>Permission first. Participation second.</h2><div className="vb-cols"><article className="vb-panel"><h3>Approval gates</h3><ul><li>Project proposal and scope prepared.</li><li>Trainer/institution approves industries, data and workload.</li><li>Participant count and consent are confirmed.</li><li>Invitations and memberships are issued.</li><li>Teams, responsibilities and deadlines are assigned.</li></ul></article><article className="vb-panel"><h3>Role separation</h3><ul><li>Owner — accountable workspace owner.</li><li>Admin — trusted organization settings and member administration.</li><li>Manager — project delivery and workload coordination.</li><li>Analyst — authorized data and analysis work.</li><li>Viewer / Reviewer — limited read access to approved material.</li></ul></article></div></section>
      <section className="vb-section"><div className="vb-label">04 / Safe data operations</div><h2>Designed for realistic, responsible practice.</h2><div className="vb-note">Use synthetic or formally approved de-identified datasets. No real patient records, bank-customer details or payment-card data should be introduced without authorization and safeguards. Large-volume generation is disabled until its volume scope, storage, cost and performance are confirmed.</div></section>
      <section className="vb-section"><div className="vb-label">05 / Four-role operating model</div><h2>Clear ownership. Accountable delivery.</h2><p className="vb-sub">The target organization model has exactly four roles. Permissions are enforced by the API, not just by the interface.</p><div className="vb-grid"><article className="vb-card"><div className="vb-icon">♛</div><h3>OWNER</h3><p>Controls workspace settings, approvals, member roles, approved industries and generation limits. Only the Owner can start or stop a data-generation job.</p></article><article className="vb-card"><div className="vb-icon">◫</div><h3>MANAGER</h3><p>Views organization reports, team workload, delivery progress and performance. Restricted actions require Owner approval.</p></article><article className="vb-card"><div className="vb-icon">⌁</div><h3>LEADER</h3><p>Leads a team, assigns work to Analysts in that team, reviews submissions and reports progress.</p></article><article className="vb-card"><div className="vb-icon">▤</div><h3>ANALYST</h3><p>Completes assigned tasks, prepares data, validates results, analyzes business questions and submits deliverables.</p></article></div></section>
      <section className="vb-section"><div className="vb-label">06 / Owner-triggered data generator</div><h2>Generate only what the project needs.</h2><p className="vb-sub">No cron, no automatic daily generation. Unused industries remain idle. The Owner chooses approved industries, sets row limits and explicitly confirms each run.</p><div className="vb-cols"><article className="vb-panel"><h3>Owner controls</h3><ul><li>Select approved active industries and datasets.</li><li>Set a hard maximum per dataset and per job.</li><li>Review estimated rows, storage and batch size.</li><li>Click Generate and confirm before a job is queued.</li><li>Pause or cancel a job; inspect progress and run history.</li></ul></article><article className="vb-panel"><h3>Safe execution</h3><ul><li>Background worker with bounded batches.</li><li>Idempotent retries and immutable snapshots.</li><li>Validation before publishing a generated version.</li><li>Audit every setting change and generation run.</li><li>Never generate for an industry without an approved active team/project.</li></ul></article></div><div className="vb-note">Implementation status: migration and design requirements are being prepared. The production generator worker, API authorization, UI controls, durable storage and load tests are not yet complete. Do not treat this panel as an active generator.</div></section>
      <section className="vb-section"><div className="vb-label">07 / Performance & contribution</div><h2>Measure work fairly, not just activity.</h2><p className="vb-sub">Track assigned and completed tasks, due dates, blocked work, review acceptance, revision cycles, data-quality improvements, accepted dashboards and peer-review handoffs.</p><div className="vb-note">Managers see reports and team performance; Leaders see their own team; Analysts see their own contribution history; Owner sees the full organization. Metrics must show supporting evidence and must not score people by login time, keystrokes or online presence.</div></section>
      <section className="vb-section"><div className="vb-label">08 / Honest delivery scope</div><div className="vb-cols"><article className="vb-panel"><h3>Existing foundation</h3><ul><li>Registration, email verification and sessions.</li><li>Organizations, invitations and access requests.</li><li>Projects, tasks and notifications.</li><li>CSV upload, cleaning, profiling and validation.</li><li>Dataset versions, audit history and report links.</li></ul></article><article className="vb-panel"><h3>Next engineering phases</h3><ul><li>Project and dataset-level permission controls.</li><li>Durable object storage and large-data processing.</li><li>Approved database/API connectors.</li><li>Shared SQL/Python workspace and safe handoffs.</li><li>Secure Power BI embedding, backups and monitoring.</li></ul></article></div></section>
      <footer className="vb-footer"><span>© 2026 BHUPENDRA'S VYRON</span><span>DATA · GOVERNANCE · COLLABORATION</span></footer>
    </div>
  </main>;
}
