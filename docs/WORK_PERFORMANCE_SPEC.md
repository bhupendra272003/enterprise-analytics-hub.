# Vyron — Work Performance & Contribution Specification

## Purpose
Give Owners, Managers and Leaders a reliable view of delivery health while allowing every Analyst to understand and verify their own contribution. Performance data must be evidence-based, explainable and correctable.

## Events to capture
- Assignment, reassignment, previous/new assignee, assigning Leader/Owner, assignment reason, acceptance, start, blocked state, submission, review acceptance, revision request and reopening.
- Data cleaning and validation runs, with dataset/version references and quality outcomes.
- Analysis and dashboard submissions, linked to project deliverables.
- Peer review and completed handoffs.

Every event records actor, organization, optional team/project/task, event type, timestamp and safe evidence metadata. Do not store raw dataset values in event metadata.

## Metrics
- Completion: completed / assigned tasks, with exclusions explained.
- On-time rate: tasks accepted by due date / tasks with due dates.
- Cycle time: median time from accepted assignment to accepted completion.
- Reliability: overdue, blocked, reopened and revision-required counts.
- Quality: validation pass rate and documented issue reduction on approved datasets.
- Delivery: accepted analysis/dashboard deliverables against a project checklist.
- Collaboration: peer reviews and documented handoffs.
- Workload: open tasks, current assigned tasks, historical assignment events, distinct tasks, assignment concentration and estimated hours only when transparently entered by the member.
- Leader accountability: tasks assigned by the Leader, distinct recipients, tasks personally owned by the Leader, and the Leader's own completion/on-time outcomes. A Leader is expected to contribute work as well as coordinate it.

## Visibility
- OWNER: organization-wide and team-level reports, all members, assignment history, Leader accountability, generator audit and approvals.
- MANAGER: read-only organization reports, every team's workload, team performance, Leader accountability and individual contribution evidence. No access to change roles or generation settings.
- LEADER: own team's delivery and Analyst-level contribution evidence.
- ANALYST: own tasks, own performance and own contribution timeline.

## Fairness and safeguards
- Never score people by login duration, online status, keystrokes, mouse activity or raw task count alone.
- Compare only similar task types and agreed expectations.
- Flag possible workload imbalance, repeated concentration of assignments, members receiving no assignments, and Leaders who assign work but have no personally owned tasks. These are review signals only, never automated findings of favoritism or misconduct.
- Consider task complexity, skills, availability, leave, estimated effort and member-approved workload before judging equality.
- Show the underlying events behind each metric.
- Let members add context and request corrections.
- Separate work quantity from quality and complexity.
- Avoid public leaderboards and punitive automated rankings.
- Managers and Leaders may add review notes, but only the Owner can change role permissions.
- Performance reports are internal project evidence, not a definitive measure of a person's ability.

## Implementation status
Migrations 010–011 add team, assignment-history and correction-request foundations. The current branch adds role-scoped team/performance API routes and Owner/Manager dashboard foundations. Full work-event capture for data cleaning, validation, dashboards and peer review, correction review UI, exhaustive API/UI tests and deployment remain required before production readiness.
