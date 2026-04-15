# Paperclip Technical Map

Status: Internal engineering map
Date: 2026-04-14
Scope: Repository snapshot analysis of the current checkout

## 1. What Paperclip Is

Paperclip is a control plane for autonomous AI companies.

It is not "the agent" and it is not primarily "a chat app". The product is the
operating layer around teams of agents:

- companies
- org structure
- goals
- projects
- issues and comments
- approvals
- heartbeats and runtime sessions
- budgets and cost tracking
- auditability

The core mental model is:

- agents are employees
- companies are first-order objects
- work is tracked as issues/comments
- the board supervises the company through one dashboard
- execution happens in external runtimes through adapters

The clearest source documents for this identity are:

- `doc/GOAL.md`
- `doc/PRODUCT.md`
- `doc/SPEC-implementation.md`

## 2. High-Level Layer Map

```text
                                   PAPERCLIP

┌──────────────────────────────────────────────────────────────────────────────┐
│ [1] Board UI                                                                │
│                                                                              │
│  React 19 + Vite + TanStack Query                                            │
│  Pages: dashboard, companies, agents, org, projects, issues, inbox,        │
│         approvals, costs, activity, plugins, adapter manager                │
│                                                                              │
│  Main files:                                                                 │
│  - ui/src/main.tsx                                                           │
│  - ui/src/App.tsx                                                            │
│  - ui/src/context/LiveUpdatesProvider.tsx                                    │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTP /api + WS /events/ws
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [2] API / Control Plane                                                      │
│                                                                              │
│  Express 5 + Node.js + TypeScript                                            │
│  Middleware, auth, routing, plugin runtime wiring, UI serving                │
│                                                                              │
│  Main files:                                                                 │
│  - server/src/index.ts                                                       │
│  - server/src/app.ts                                                         │
│  - server/src/routes/*.ts                                                    │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ service calls
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ [3] Domain / Orchestration                                                   │
│                                                                              │
│  Core services:                                                              │
│  - companies.ts                                                              │
│  - agents.ts                                                                 │
│  - issues.ts                                                                 │
│  - heartbeat.ts                                                              │
│  - budgets.ts                                                                │
│  - costs.ts                                                                  │
│  - workspace-runtime.ts                                                      │
│  - plugin-loader.ts                                                          │
│  - live-events.ts                                                            │
└──────────────┬───────────────────────────────┬───────────────────────────────┘
               │                               │
               │                               │
               ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────────────────┐
│ [4] Persistence              │   │ [5] External Execution Boundary          │
│                              │   │                                          │
│ PostgreSQL + Drizzle         │   │ Adapters to agent runtimes              │
│ packages/db/src/schema/*     │   │                                          │
│                              │   │ Current built-in/runtime-known adapters: │
│ Key families:                │   │ - claude_local                          │
│ - companies                  │   │ - codex_local                           │
│ - agents                     │   │ - cursor                                │
│ - issues / comments          │   │ - gemini_local                          │
│ - approvals                  │   │ - opencode_local                        │
│ - heartbeat_runs             │   │ - pi_local                              │
│ - cost_events                │   │ - openclaw_gateway                      │
│ - execution_workspaces       │   │ - hermes_local                          │
│ - plugin_*                   │   │ - process                               │
│                              │   │ - http                                  │
└──────────────────────────────┘   └──────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ [6] Extensibility                                                            │
│                                                                              │
│  Plugin SDK                                                                  │
│  - packages/plugins/sdk                                                      │
│  - worker lifecycle, UI slots, launchers, jobs, tools, events               │
│                                                                              │
│  MCP Server                                                                  │
│  - packages/mcp-server                                                       │
│  - exposes Paperclip operations as MCP tools over stdio                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3. Repository Structure and Role of Each Area

### `server/`

The Node/Express control plane.

Responsibilities:

- mount and secure REST APIs
- resolve actor identity and company access
- orchestrate heartbeat execution
- maintain activity and approval trails
- enforce budget blocking
- manage plugin worker runtime
- expose live events to the board UI
- serve the UI in dev and packaged modes

Key entrypoints:

- `server/src/index.ts`
- `server/src/app.ts`

Important subareas:

- `server/src/routes/` -> HTTP API surfaces
- `server/src/services/` -> domain logic
- `server/src/adapters/` -> execution runtime boundary
- `server/src/realtime/` -> WebSocket live updates
- `server/src/storage/` -> local disk / object storage abstraction

### `ui/`

The board operator frontend.

Responsibilities:

- company-level visibility
- operational dashboards
- agent and org management
- issue execution supervision
- approvals and budget oversight
- plugin and adapter management

Key entrypoints:

- `ui/src/main.tsx`
- `ui/src/App.tsx`

Important page groups:

- `Dashboard.tsx`
- `Companies.tsx`
- `Agents.tsx`
- `AgentDetail.tsx`
- `Projects.tsx`
- `Issues.tsx`
- `IssueDetail.tsx`
- `Approvals.tsx`
- `Costs.tsx`
- `PluginManager.tsx`
- `AdapterManager.tsx`

### `packages/db/`

The canonical persistence contract.

Responsibilities:

- Drizzle schema
- migrations
- database client helpers
- embedded Postgres bootstrap support

The schema is broader than a minimal V1 CRUD app. It already models:

- org and permissions
- approvals
- runtime state
- task sessions
- wakeup requests
- workspaces
- work products
- routines
- plugin runtime state
- secrets and secret versions

### `packages/shared/`

The cross-layer contract package.

Responsibilities:

- types used by server, UI, CLI, and MCP
- zod validators for API payloads
- constants and API helpers
- adapter config surface contracts
- live event shapes

This package is the anti-drift spine between backend and frontend.

### `packages/adapters/`

Adapter packages that bridge Paperclip and agent runtimes.

Each adapter package typically provides:

- server execution module
- UI parsing/config module
- optional CLI helpers

This lets the control plane stay runtime-agnostic while still supporting
provider-specific behavior.

### `packages/plugins/`

The plugin platform layer.

Responsibilities:

- plugin SDK
- plugin examples
- plugin authoring support

This is evidence that Paperclip is not just an app; it is increasingly a host
platform for extension workers and extension UI.

### `packages/mcp-server/`

An MCP server package that exposes Paperclip as a tool surface for other
agents/systems.

This package turns Paperclip itself into an interoperable automation endpoint.

### `cli/`

The operational CLI around the control plane.

Responsibilities:

- onboarding
- doctor and repair flows
- env/config generation
- auth bootstrap
- worktree utilities
- runtime control-plane commands

The CLI is part of the product experience, not only an internal tool.

## 4. Technology Stack

### Frontend

- React 19
- Vite 6
- React Router 7 style routing wrapper
- TanStack Query
- Tailwind CSS 4
- Radix primitives and UI utilities

### Backend

- Node.js 20+
- Express 5
- TypeScript
- `ws` for live WebSocket transport
- Better Auth for authenticated mode

### Persistence

- PostgreSQL via Drizzle
- embedded Postgres for zero-config local usage when `DATABASE_URL` is unset

### Operational/Runtime Layer

- local process adapters
- HTTP gateway adapters
- plugin worker processes
- MCP stdio server

## 5. End-to-End Product Flow

## 5.1 Company Creation

Company creation starts at:

- `POST /api/companies`

Implementation path:

- `server/src/routes/companies.ts`
- `server/src/services/companies.ts`

What happens:

- board or instance admin creates company
- company gets a generated `issuePrefix`
- owner membership is established
- activity is logged
- if a monthly budget is defined, a budget policy may be seeded

Important detail:

- issue identifiers are company-branded and increment from a company-local
  counter rather than using opaque IDs in the operator UX

## 5.2 Agent Hiring / Creation

Two relevant paths exist:

- `POST /api/companies/:companyId/agents`
- `POST /api/companies/:companyId/agent-hires`

Implementation path:

- `server/src/routes/agents.ts`
- `server/src/services/agents.ts`

What happens:

- adapter type is validated
- adapter config is normalized
- company secret bindings may be resolved/validated
- instructions bundle defaults may be materialized
- assignment permissions may be granted
- if the company requires board approval for new agents, a hire approval object
  is created and the agent starts in `pending_approval`

This is a key sign of Paperclip's product identity:

- agent creation is modeled as governance, not just CRUD

## 5.3 Issue Creation

Primary path:

- `POST /api/companies/:companyId/issues`

Implementation path:

- `server/src/routes/issues.ts`
- `server/src/services/issues.ts`

What happens:

- issue is created with company scoping
- assignee is validated
- goal linkage is resolved
- project/workspace defaults may be inherited
- identifier like `CMP-123` is minted
- activity is logged
- if the issue is assigned, the assignee may be woken immediately

## 5.4 Checkout and Exclusive Ownership

Primary path:

- `POST /api/issues/:id/checkout`

Implementation path:

- `server/src/routes/issues.ts`
- `server/src/services/issues.ts`

What happens:

- project pause/budget pause is checked
- the requesting actor is validated
- stale execution locks are cleared if the referenced run is dead
- atomic update attempts to transition the issue into `in_progress`
- checkout and execution lock bind to the run ID when relevant
- the assignee can be woken after successful checkout

This is one of the strongest correctness boundaries in the whole system.

## 5.5 Heartbeat Execution

Primary paths:

- `POST /api/agents/:id/wakeup`
- `POST /api/agents/:id/heartbeat/invoke`

Implementation path:

- `server/src/routes/agents.ts`
- `server/src/services/heartbeat.ts`

What heartbeat does:

- creates or claims a wakeup/run
- resolves context and task/session state
- checks whether the agent is invokable
- checks budget blocking at company, project, and agent scope
- realizes or reuses execution workspace
- selects the adapter
- executes the runtime
- captures result, logs, usage, and session state
- may synthesize comments and follow-up wakes
- records live events for the UI

This service is the runtime heart of Paperclip.

## 5.5.1 Detailed Wake / Heartbeat / Adapter Flow

This is the most important execution pipeline for understanding how a company
issue becomes a concrete agent run.

```text
Issue assignment / issue comment / mention
        |
        v
Route/service wake trigger
- issue update routes
- issue assignment helper
- routine / automation wake sources
        |
        v
heartbeat.wakeup()
- normalize reason / source / triggerDetail
- enrichWakeContextSnapshot()
  - wakeReason
  - issueId
  - taskId
  - commentId / wakeCommentId
  - wakeCommentIds
  - taskKey
- resolve explicit resume override if a prior failed run/session is targeted
        |
        +-- issue-scoped execution lock path
        |   (default for issue wakes except mention bypass)
        |   |
        |   +-- lock issue row
        |   +-- inspect active execution run
        |   +-- same-agent active run?
        |   |   - coalesce context into the existing run
        |   |   - or defer follow-up execution if a comment wake should not
        |   |     interrupt the current run
        |   +-- otherwise queue a new heartbeat run
        |
        +-- generic same-scope path
            |
            +-- find queued/running run by derived taskKey
            +-- coalesce or queue depending on same-scope state
        |
        v
startNextQueuedRunForAgent()
        |
        v
claimQueuedRun()
- transition queued -> running
- stamp lazy execution lock on the issue
- publish run status / wakeup claim live events
        |
        v
executeRun()
- load agent/runtime state
- maybe auto-checkout issue for wake
- resolve project / issue / workspace policy
- decide whether to reset or resume task session
- buildPaperclipWakePayload()
- store structured wake payload in run context
- realize or reuse execution workspace
- attach workspace/runtime metadata to context
        |
        v
adapter.execute()

codex_local fresh run:
- stdin prompt includes:
  - instructionsPrefix
  - bootstrap prompt
  - wake prompt
  - session handoff note
  - heartbeat prompt
- env includes:
  - PAPERCLIP_TASK_ID
  - PAPERCLIP_WAKE_REASON
  - PAPERCLIP_WAKE_COMMENT_ID (when present)
  - PAPERCLIP_WAKE_PAYLOAD_JSON

codex_local resumed run:
- if wake prompt exists, use compact "resume delta" mode
- skip reinjecting full instructions and full heartbeat prompt
- continue current session with the new wake payload as the highest-priority
  delta

Other adapters:
- Claude and gateway adapters also receive the normalized Paperclip wake payload
- adapter-specific transport differs, but the same structured wake intent is
  preserved
        |
        v
Run result finalization
- persist runtime session state
- persist cost/usage
- enforce issue-comment policy for wake types that require a durable comment
- queue one retry when a required issue comment was omitted
- release execution and promote deferred wakes when appropriate
- publish live events to the UI
```

### Execution Notes

- `issue_assigned` wakes intentionally force a fresh task session rather than
  resuming stale execution context from a previous run.
- `issue_comment_mentioned` bypasses the issue execution lock path so mentions
  can wake the assignee without being treated as normal execution-lane
  continuation.
- The wake payload is designed to reduce prompt ambiguity before the agent
  performs generic repo exploration.
- The "resume delta" path is intentionally narrower than a fresh heartbeat so a
  resumed session focuses on the new wake instead of replaying the whole
  heartbeat contract.
- Harness checkout state is carried into the prompt so the agent does not
  redundantly call checkout when the control plane already claimed the issue for
  the run.

## 5.6 Cost Recording and Budget Enforcement

Implementation path:

- `server/src/services/costs.ts`
- `server/src/services/budgets.ts`

What happens:

- cost events are written per company/agent/run
- monthly spend rollups on agent/company are updated
- budget policies are re-evaluated
- soft threshold incidents can be created
- hard threshold can pause company, project, or agent
- running work can be cancelled due to budget pause

Budget is not cosmetic telemetry here.

It is an execution gate with hard-stop semantics.

## 6. Core Runtime Boundaries

## 6.1 UI -> API

The UI is a board shell over the API.

Patterns:

- TanStack Query for fetch/cache
- HTTP-first state reads
- WebSocket live events for freshness
- route-driven operator workflows

The board does not own domain truth. The server does.

## 6.2 API -> Services

Routes are mostly thin.

They:

- validate
- authorize
- call services
- log activity
- shape responses

The real business logic sits in `server/src/services/`.

## 6.3 Services -> DB

The DB layer is not a passive store. It encodes many invariants:

- company scoping
- issue/goal/project relations
- execution/workspace persistence
- plugin runtime state
- approval and activity audit history

## 6.4 Services -> Adapters

The adapter registry is the execution seam.

Paperclip delegates execution to adapters rather than embedding provider logic
directly into heartbeat orchestration.

This is the key mechanism behind the "control plane, not execution plane"
product claim.

## 6.5 Services -> Plugins

The plugin loader and worker manager are an additional extension seam.

Plugins can:

- register worker lifecycle hooks
- subscribe to events
- expose tools
- schedule jobs
- mount UI slots/launchers

That means Paperclip is evolving toward a host platform, not just a monolithic
board app.

## 6.6 Services -> MCP

The MCP package exposes Paperclip operations as tools over stdio.

This enables other agents or hosts to use Paperclip as structured infrastructure
rather than just a human dashboard.

## 7. Important Invariants and Why They Matter

## 7.1 Company Scope Is the Primary Isolation Boundary

Nearly every meaningful entity belongs to a company.

This is not optional product flavor. It is the core tenancy invariant.

Why it matters:

- multi-company operation is a first-class feature
- agent keys must not cross company boundaries
- board visibility is company-aware
- costs, approvals, and runtime state all rely on correct company attribution

## 7.2 Agent Org Tree Cannot Become Invalid

Agent management enforces:

- same-company manager relationship
- no self-reporting
- no reporting cycles

Why it matters:

- the org chart is product truth, not decorative metadata
- delegation and reporting semantics assume the tree is valid

## 7.3 Issues Have Single Assignee Semantics

Issue creation/update logic enforces:

- at most one assignee at a time
- `in_progress` requires an assignee

Why it matters:

- the runtime assumes clear task ownership
- checkout and wakeup behavior depend on non-ambiguous ownership

## 7.4 Checkout Is Atomic and Lock-Aware

Issue checkout logic handles:

- stale execution locks
- run ownership
- adoption of stale checkout runs
- conflict responses with useful diagnostics

Why it matters:

- this is the guard against double work and ambiguous execution

## 7.5 Budget Blocking Is an Execution Gate

The heartbeat path checks invocation blocks before work starts.

Why it matters:

- Paperclip's budget promise is operationally enforceable
- cost control is not post-hoc reporting only

## 7.6 Activity Logging Is First-Class

Mutating routes consistently log activity.

Why it matters:

- board governance needs auditability
- approvals, hiring, and task execution become inspectable after the fact

## 8. Files Most Likely To Matter in Future Maintenance

### `server/src/services/heartbeat.ts`

Most critical orchestration file.

Why:

- wakeup lifecycle
- execution context
- run state
- adapter invocation
- session persistence
- workspace realization
- budget gating
- result processing

Risk:

- very high blast radius for regressions

### `server/src/services/issues.ts`

Core task system correctness boundary.

Why:

- issue creation
- relation and inheritance logic
- checkout/release ownership
- execution lock semantics
- issue status side effects

Risk:

- correctness bugs here create duplicate work or broken governance

### `server/src/adapters/registry.ts`

Execution platform boundary.

Why:

- defines what runtimes Paperclip can orchestrate
- resolves built-in vs external adapter precedence

Risk:

- drift here breaks runtime support or confuses product promises

### `server/src/services/plugin-loader.ts`

Platform-extensibility boundary.

Why:

- plugin install/discovery/activation
- worker runtime boot
- capability-gated integration

Risk:

- runtime stability and security posture depend heavily on this boundary

### `packages/db/src/schema/*.ts`

Persistence truth.

Why:

- the schema reflects actual product surface more faithfully than older docs in
  some areas

Risk:

- documentation or architectural claims that ignore the real schema will drift
  quickly

## 9. Documentation Drift Observed in This Snapshot

This repository snapshot has real doc/code drift that should be understood
before architectural decisions are made.

## 9.1 Local `AGENTS.md` Fork Narrative vs Git Reality

The local `AGENTS.md` contains a fork-specific section describing:

- a `HenkDz/paperclip` fork
- branch `feat/externalize-hermes-adapter`
- Hermes as plugin-only

But this checkout currently reports:

- `origin = https://github.com/paperclipai/paperclip.git`
- current branch = `master`

That means the fork-specific section is not authoritative for the current git
state of this directory.

## 9.2 Hermes Externalization Narrative vs Current Code

The current code still includes `hermes_local` in runtime-known/built-in
surfaces:

- backend adapter registry
- built-in adapter types
- UI adapter display/config paths

So any statement claiming Hermes is already fully externalized in this checkout
would be inaccurate.

## 9.3 V1 Spec vs Product Surface Growth

`doc/SPEC-implementation.md` remains useful as a product intent contract, but
the current codebase already includes more surface than a strict minimal V1:

- plugin runtime
- plugin SDK
- MCP server package
- workspaces and runtime services
- routines
- inbox/read-state UX
- portability/import/export machinery
- multiple local adapters beyond the most minimal set

The schema and runtime are already more platform-like than the narrowest
interpretation of the V1 text.

## 10. Practical Reading Order for Future Engineers

For someone trying to understand the system quickly, this is the most useful
order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `server/src/app.ts`
5. `server/src/index.ts`
6. `server/src/services/heartbeat.ts`
7. `server/src/services/issues.ts`
8. `server/src/services/agents.ts`
9. `server/src/services/budgets.ts`
10. `packages/db/src/schema/index.ts`
11. `ui/src/App.tsx`
12. `packages/plugins/sdk/README.md`
13. `packages/mcp-server/src/index.ts`

This order moves from product intent to execution truth.

## 11. Bottom-Line Interpretation

Paperclip, as implemented here, should be understood as:

- a board-facing control plane
- an execution orchestrator across multiple agent runtimes
- a company-scoped governance system
- a budget-aware runtime supervisor
- a persistence-heavy operational system
- an increasingly extensible host platform through plugins and MCP

It is not just:

- a task manager
- a chat shell
- a single-agent launcher
- a thin UI over provider SDKs

The product's true center of gravity is the coordination of agents as an
organization under supervision, not the direct generation behavior of any
single model/runtime.
