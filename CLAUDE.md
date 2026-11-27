# StarryHook

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (github.com/jzechen/StarryHook) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Subagent workflow

Multi-agent implementation pipeline (implementer → merger; the main checkout belongs to mergers). See `docs/agents/subagent-workflow.md`.

### Coding standards

Review-agent checklist (e.g. generated-asset pipelines must assert output difference). See `CODING_STANDARDS.md`.
