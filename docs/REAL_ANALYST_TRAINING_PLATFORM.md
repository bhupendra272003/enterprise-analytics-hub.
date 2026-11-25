# VYRON — Real Data Analyst Training Platform

## Training goal
Simulate real analyst work: receive a business brief, validate data, transform it, query it, analyze it, visualize findings, peer-review work, and present a reproducible result.

## Learner workflow
1. **Business brief** — objectives, stakeholder, KPI definitions, acceptance criteria and deliverables.
2. **Data intake / Spreadsheet Studio** — inspect, document assumptions, edit and validate, retain versions.
3. **SQL / MySQL Studio** — schema context, query editor, results, history, joins, aggregation and QA.
4. **Python / VS Code Studio** — notebook-like analysis, cleaning, profiling, outputs and version tracking.
5. **BI Studio** — KPIs, interactive visuals, filters, calculated measures, report pages and drill-through.
6. **Peer collaboration** — immutable dataset/version references, team-scoped sharing, peer review and feedback.
7. **Presentation** — insights, recommendations, reproducible artifacts and limitations.
8. **Assessment** — SQL accuracy, data quality, insight quality, dashboard usability, reproducibility and communication.

## Collaboration rules
- Handoffs reference immutable dataset versions; recipients do not silently overwrite sources.
- Analyst-to-Analyst delegation is allowed only when org/team policy permits.
- Handoff transitions and reviews are audited.
- Access checks apply on every API request, including JOIN targets and result/version references.
- Transfers preserve lineage (source version, transformations, output, responsible user and review status).
- Do not claim execution or transfer if only a navigation shortcut exists.
- Owner manages org settings; Leaders manage their team scope; Analysts work assigned data; read-only roles stay read-only.

## Product completion checklist
- [ ] Cross-studio lineage and artifact registry
- [ ] Secure analyst-to-analyst transfer and delegation
- [ ] Handoff opens receiving studio on referenced dataset/version
- [ ] Structured peer-review checklist and feedback
- [ ] Dataset/version permission checks across all endpoints and JOIN targets
- [ ] Document SQL engine limits versus MySQL
- [ ] Python execution sandbox, quotas and cancellation
- [ ] BI model, measures and drill-through QA
- [ ] Formula calculation and restore safeguards in Spreadsheet Studio
- [ ] Training briefs, starter datasets, rubric and learner scorecard
- [ ] Automated and end-to-end role workflow tests
- [ ] Responsive UI, error, loading and empty states
- [ ] CI and deployment verification before release claims

## Training cases
- Logistics: late deliveries, carrier performance, route cost and inventory exceptions.
- Retail: sales trends, returns, margin, stockouts and promotion analysis.
- Banking: transaction patterns, complaints, loan quality and branch KPIs.
- Hospitality: occupancy, revenue, bookings, service and seasonal demand.
