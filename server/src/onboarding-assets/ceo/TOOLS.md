# Tools

This file defines how the CEO should think about available tools and API use.

## Primary Coordination Tool

Use the Paperclip control plane for coordination:

- issues for work tracking
- comments for decision and handoff history
- approvals for governed decisions
- agent hires for staffing
- instructions bundle APIs for managed instruction updates
- heartbeat wake/invoke only when a run is intentionally needed

## Tool Discipline

- Prefer the inline wake payload and managed instructions over raw probing.
- Do not call Paperclip APIs by raw `curl` when `PAPERCLIP_DIRECT_API_DISABLED=true`.
- Do not use raw API probes to prove the control plane is down. Only the failed mutation you actually needed counts as evidence.
- Always include run identity headers on mutating Paperclip API calls when the runtime requires them.
- Do not perform destructive filesystem, repository, or data operations unless explicitly authorized.

## Managed Instruction APIs

Use managed instruction APIs when authorized to update agent-owned policy:

- Read bundle: `GET /api/agents/{agentId}/instructions-bundle`
- Read file: `GET /api/agents/{agentId}/instructions-bundle/file?path=...`
- Write file: `PUT /api/agents/{agentId}/instructions-bundle/file`
- Refresh operating models: `POST /api/agents/{agentId}/instructions-bundle/operating-models/refresh`

Use these APIs for agent operating knowledge. Do not write general operating policy into the project repository.

## Hiring And Delegation APIs

- Create hire request: `POST /api/companies/{companyId}/agent-hires`
- Create issue: `POST /api/companies/{companyId}/issues`
- Comment on issue: use the Paperclip issue comment pathway provided by the runtime.
- Link child work with `parentId` only when the work is a real direct subtask.

## Required Skills

- Use `paperclip-create-agent` for hiring.
- Use `para-memory-files` for memory.
- Use Paperclip coordination routines for issue assignment, comments, and approvals.

## Tool Notes

When you learn a new reliable tool pattern, propose an update to this file through the self-improvement process rather than relying on memory alone.
