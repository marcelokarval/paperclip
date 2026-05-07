# Fast Agent Execution Kernel

## Purpose

Define the technical target for fast agent execution in this fork.

The current heartbeat path is correct for governed work, but too heavy for
simple actions. The fast kernel should execute low-risk actions with a compact
runtime packet while preserving agent identity, peer awareness, project context,
tool policy, and telemetry.

## Current Baseline

The fork already has several required foundations:

- managed agent instruction bundles
- filesystem-native agent/company package direction
- adapter execution and session resume
- Codex local fast mode support
- plugin worker and tool registry infrastructure
- MCP surface for Paperclip operations
- issue/workspace/runtime telemetry

The missing product boundary is an explicit hot path that does not route every
action through full heartbeat governance.

## Conceptual Architecture

```text
Cold path
  CEO / org learning / agent creation / skill creation / tool discovery
  -> updates rich agent packages and policies

Hot path
  task intake
  -> route reflex | task | project | deep
  -> compile runtime packet
  -> execute worker
  -> validate output
  -> record telemetry
```

## Runtime Packet

A compiled runtime packet is the smallest safe input that lets a worker act
correctly.

```yaml
agent:
  id: string
  role: string
  compact_identity: string
mode: reflex | task | project | deep
task:
  objective: string
  payload: object
context:
  project_packet: object | null
  peer_routing_hints: object[]
  memory_excerpt: string | null
tools:
  allowlist: string[]
  denied: string[]
limits:
  timeout_sec: number
  max_tool_calls: number
  max_context_chars: number
output_contract:
  schema: object | null
  required_sections: string[]
escalation:
  when_to_handoff: string[]
  allowed_peers: string[]
```

## Routing Rules

Use the smallest valid mode:

- `reflex`: current payload is enough; no durable project context required
- `task`: bounded tools are needed; no broader project context required
- `project`: project packet or domain context is needed
- `deep`: ambiguity, risk, governance, self-improvement, skill/tool discovery,
  staffing, code changes, production changes, or sensitive data requires the
  full governed path

If uncertain, route upward only as far as needed. Do not default routine work to
`deep`.

## Agent Awareness

Fast execution must not isolate agents.

Each compact packet should include peer routing hints:

- peer role
- when to hand off
- what evidence to include
- whether the peer is allowed to execute or only review

This preserves the organization without forcing every run to load the whole org
chart and governance bundle.

## Project Context

Project is the primary expansion boundary.

Company context explains why the organization exists. Project context explains
what this task needs. Fast execution should prefer project packets over company
wide context whenever possible.

## Tool Policy

Fast runs should use explicit tool allowlists.

Tool discovery, MCP evaluation, and tool installation are deep/cold-path work.
They should not happen during a routine email, support, or property operation
unless the task explicitly requests tool evaluation.

## Telemetry

Every fast run should record:

- mode
- latency
- context size
- tool count
- selected tools
- escalation reason, if any
- output validation result
- whether a human or deep agent was needed

This telemetry feeds later CEO/organization improvement cycles.

## Implementation Boundary

This spec does not require deleting the existing heartbeat flow.

The first implementation should add a separate route/service boundary for
compiled execution packets and keep deep/governed work on the existing
heartbeat path.

