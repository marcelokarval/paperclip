# 2026-05-07 Fast Agent Operating Context PRD

## Objective

Define the local fork direction for fast agent execution without losing the
agent-company model that makes Paperclip valuable.

Paperclip should remain the place where agents are born, governed, routed, and
improved. Simple actions, however, must not pay the full cost of a heavyweight
company heartbeat.

## Problem

The current runtime path is too expensive for simple work.

Examples:

- "reply to this email"
- "classify this inbound message"
- "answer this student's routine question"
- "check this property detail"
- "draft a short follow-up"

These tasks should start in seconds. In practice they can take minutes because
they enter the same mental and runtime path as deep organizational work:

- company context
- project context
- agent identity
- heartbeat protocol
- issue lifecycle
- governance and review language
- instruction bundle loading
- workspace/runtime setup
- comment and result enforcement

That richness is useful for strategic work, staffing, project execution, and
high-risk decisions. It is the wrong default for low-risk daily actions.

## Product Direction

Paperclip should become an agent operating-context compiler.

The system should keep rich, persistent agent definitions, but compile the
smallest safe runtime packet for each action.

```text
company / org / policies / projects / agents / skills
  -> compiled runtime packet
  -> fast worker execution
  -> telemetry and learning back into the organization
```

## Principles

1. Agents should know their role and peers.
2. Agents should route work to the right peer without loading the whole company.
3. Project context is the main expansion layer for domain work.
4. Company context is cold-path governance by default, not hot-path execution.
5. Simple actions use compiled packets with tight tool and time limits.
6. Deep work can still use the full Paperclip heartbeat and governance path.
7. Agent self-improvement, skill creation, tool discovery, and MCP evaluation
   happen off the hot path unless the task explicitly asks for them.
8. The fork should not trade correctness for speed on sensitive work involving
   secrets, PII, payments, compliance, outreach, or production changes.

## Execution Modes

### Reflex

For direct low-risk actions.

- expected duration: seconds
- context: current payload plus compact agent identity
- tools: none or a small allowlist
- examples: short reply, classification, summarization, simple status check

### Task

For bounded work that needs one or more tools.

- expected duration: under a few minutes
- context: task payload, compact agent identity, peer routing hints
- tools: explicit allowlist
- examples: draft email from thread, look up one property record, update one CRM
  field, produce a short answer from known material

### Project

For work that needs project-specific context.

- expected duration: minutes
- context: task payload, compact agent identity, project packet, relevant skills
- tools: project-specific allowlist
- examples: property research, comps prep, operational queue work, support
  process execution

### Deep

For strategic, ambiguous, high-risk, or self-improving work.

- expected duration: open-ended
- context: full agent instructions, project context, governance, review path
- tools: broad but governed
- examples: create or refine agents, create skills, evaluate MCP/tools, plan a
  workflow, execute a software change, investigate an unknown failure

## Non-Goals

- Do not remove Paperclip governance.
- Do not replace the current heartbeat path.
- Do not block upstream bugfix/backport work.
- Do not make every action autonomous or self-modifying.
- Do not load all company context for routine work just because it is available.
- Do not require every simple action to become a Paperclip issue.

## Success Criteria

- Simple email/support actions start in seconds, not minutes.
- Fast actions receive a compact runtime packet instead of the full company
  operating context.
- Agents can still identify the right peer for escalation or handoff.
- Project-scoped actions include only the relevant project context.
- Deep work remains available for governance, planning, skill/tool evolution,
  and high-risk execution.
- Telemetry records latency, tool count, context size, outcome, and escalation
  reason so the CEO/organization can improve agents off the hot path.

## Relationship To Current Backports

This is a new strategic track for the local fork.

It should not be mixed into selective upstream backports focused on liveness,
recovery, auth, data integrity, or operator safety. Those fixes can continue in
parallel. This track defines where the fork is intentionally beginning to move
beyond upstream parity.

