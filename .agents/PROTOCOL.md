# Agent Protocol

## Handoff Files
All inter-agent communication happens through files in `.handoffs/`. No agent communicates directly with another. Only the Phase Manager routes work.

## File Ownership
Each agent has strict read/write permissions:

| Agent | Reads | Writes |
|---|---|---|
| Phase Manager | all files | `.state/PROJECT_STATE.md` |
| PRD | `.state/PRD.md`, `.state/BLUEPRINT.md`, `.state/PHASE_PLAN.md`, `.state/archive/phase_*/SPEC.md`, `.handoffs/ARCH_CONFLICTS.md` (mode 2 only) | `.handoffs/PRD_REPORT.md`, `.handoffs/PRD_BLOCKED.md` (if blocked), `.handoffs/PRD_RULING.md` (mode 2 only) |
| Architect | `.state/PRD.md`, `.state/BLUEPRINT.md`, `.handoffs/PRD_REPORT.md`, `.handoffs/PRD_RULING.md` (if exists) | `.handoffs/SPEC.md`, `.handoffs/TASKS.md`, `.handoffs/ARCH_CONFLICTS.md`, `.handoffs/ARCHITECT_BLOCKED.md` (if blocked) |
| Backend | `.handoffs/SPEC.md`, `.handoffs/TASKS.md` | `.handoffs/BACKEND_DONE.md` or `.handoffs/BACKEND_FAILED.md` |
| Frontend | `.handoffs/SPEC.md`, `.handoffs/TASKS.md`, `.handoffs/BACKEND_DONE.md` | `.handoffs/FRONTEND_DONE.md` or `.handoffs/FRONTEND_FAILED.md` |
| QA | `.handoffs/PRD_REPORT.md`, `.handoffs/SPEC.md`, `.handoffs/BACKEND_DONE.md`, `.handoffs/FRONTEND_DONE.md` | `.handoffs/QA_REPORT.md` |
| Docs | `.handoffs/SPEC.md`, `.handoffs/BACKEND_DONE.md`, `.handoffs/FRONTEND_DONE.md`, `.handoffs/QA_REPORT.md` | `.handoffs/DOCS_DONE.md` or `.handoffs/DOCS_FAILED.md` |
| DevOps | `.handoffs/QA_REPORT.md`, `.handoffs/DOCS_DONE.md` | `.handoffs/DEPLOY_DONE.md` or `.handoffs/DEPLOY_FAILED.md` |

## Completion Signals
Every agent must end its run by writing its designated output file. A missing output file means the agent has not completed. The Phase Manager checks `.handoffs/` to determine pipeline state.

## Failure Contract
On failure, an agent must write a FAILED file (e.g., `BACKEND_FAILED.md`) containing:
1. The exact step that failed
2. The exact error output
3. Files modified before failure
4. Suggested fix (optional)

## Retry Limit
Each agent may be retried up to 3 times by the Phase Manager before the pipeline halts and a human escalation notice is written to `.state/ESCALATION.md`.

## Gate Logic
- Never proceed to Architect if `PRD_REPORT.md` does not exist
- Never proceed to Architect if `PRD_REPORT.md` status is BLOCK (surface to developer first)
- Never proceed past Architect if `ARCH_CONFLICTS.md` is non-empty — re-spawn PRD agent for ruling first
- Never proceed past Architect if `ARCH_CONFLICTS.md` is missing — treat as pipeline error
- Never proceed to a downstream agent if its prerequisite handoff files do not exist
- Never proceed to DevOps if `QA_REPORT.md` contains FAIL
- Never proceed to DevOps if `DOCS_DONE.md` does not exist (SKIPPED is acceptable)
- QA FAIL triggers re-spawn of the responsible agent (BACKEND or FRONTEND), not QA itself
- PRD/Architect conflict unresolvable after 1 ruling round → write `ESCALATION.md`, surface to developer

## PRD–Architect Conflict Resolution
The conflict resolution cycle runs at most once per phase:
1. Architect writes `ARCH_CONFLICTS.md` (always — `Status: NONE` if clean)
2. If non-empty: Phase Manager re-spawns PRD agent in Conflict Ruling mode
3. PRD agent writes `PRD_RULING.md`
4. Phase Manager re-spawns Architect to read ruling and finalize `SPEC.md`
5. If still unresolvable: Phase Manager writes `ESCALATION.md` and surfaces to developer
