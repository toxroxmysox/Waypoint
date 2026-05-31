# Issue Labels

Three axes for tracking issues through the workflow.

## Type (determines ceremony level)

| Label | Ceremony | Description |
|-------|----------|-------------|
| `bug` | Fix → PR → review | Something broken |
| `enhancement` | Plan optional → PR → review | Small improvement, single-session |
| `feature` | Grill → plan → subagent execution → PR → review | Multi-session, architectural |
| `research` | Output = decision or ADR, no PR | Investigation, no code expected |
| `refactor` | Plan → PR → review | Structural improvement, no new behavior |

## Workflow stage (determines what's next)

| Label | Meaning |
|-------|---------|
| `needs-triage` | Unprocessed, needs evaluation |
| `needs-info` | Blocked on clarification |
| `planned` | Has an approved implementation plan |
| `in-progress` | Actively being worked |
| `in-review` | PR open, awaiting review |
| `wontfix` | Will not be actioned |

## Execution mode (determines supervision)

| Label | Meaning |
|-------|---------|
| `afk` | Agent can run unsupervised |
| `hitl` | Needs human checkpoints |

## Skill compatibility

When a skill mentions a triage role, map it:
- "AFK-ready" / "ready-for-agent" → `afk` + `planned`
- "ready-for-human" → `hitl`
- "needs-triage" → `needs-triage`
- "needs-info" → `needs-info`
- "wontfix" → `wontfix`
