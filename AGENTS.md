# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `doc/`: operational and product docs

## 4. Fork Operating Model

This local repository is a fork used as a correction, backport, and adaptation
workspace for our Paperclip reality. Do not confuse it with the runtime the
user actually executed.

### Installed runtime vs local fork

- Treat the installed/runtime environment under `~/.paperclip/` and related
  packaged code under `.npm/_npx/.../@paperclipai/*` as the primary case-of-use
  surface when investigating incidents, regressions, or surprising behavior.
- Treat this repository checkout as the remediation and adaptation workspace
  where fixes are analyzed, backported, or extended. The local path may vary by
  machine; `/path/to/your-fork/paperclip` is an example only.
- When reporting a bug, always distinguish three states explicitly:
  - what happened in the installed runtime
  - what exists in this local fork source
  - what exists in the official upstream source

### Upstream review rule

- Before concluding that a bug is still open in this fork, inspect the official
  `paperclipai/paperclip` repository and the merged PR/commit history for the
  affected files or workflow.
- Do not assume this fork is the newest truth for Paperclip behavior.
- When an upstream fix exists, record all three answers explicitly:
  - whether the official upstream already fixed it
  - whether this fork already contains that fix
  - whether the installed runtime the user actually ran already contains that
    fix
- If a fix exists upstream but not in the installed runtime, treat that as a
  release/backport gap first, not as proof that upstream still lacks a fix.
- If a fix exists upstream but not in this fork, prefer aligning or backporting
  from upstream rather than re-diagnosing the same bug from zero.

## 5. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 6. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep repo plan docs dated and centralized.
When you are creating a plan file in the repository itself, new plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames. This does not replace Paperclip issue planning: if a Paperclip issue asks for a plan, update the issue `plan` document per the `paperclip` skill instead of creating a repo markdown file.

## 7. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 8. Verification Before Hand-off

Run this full check before claiming done:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 9. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 10. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 11. Pull Request Requirements

When creating a pull request (via `gh pr create` or any other method), you **must** read and fill in every section of [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Do not craft ad-hoc PR bodies — use the template as the structure for your PR description. Required sections:

- **Thinking Path** — trace reasoning from project context to this change (see `CONTRIBUTING.md` for examples)
- **What Changed** — bullet list of concrete changes
- **Verification** — how a reviewer can confirm it works
- **Risks** — what could go wrong
- **Model Used** — the AI model that produced or assisted with the change (provider, exact model ID, context window, capabilities). Write "None — human-authored" if no AI was used.
- **Checklist** — all items checked

## 12. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
5. PR description follows the [PR template](.github/PULL_REQUEST_TEMPLATE.md) with all sections filled in (including Model Used)

## 13. Repository Lineage and Hermes Integration

Do not treat historical fork notes as authoritative unless they match the
current checkout, branch, and dependency graph.

### Repository lineage

- This repository may be operated as a fork of `paperclipai/paperclip`, but
  contributor guidance must describe the checkout that is actually on disk.
- If local remotes, branches, or package dependencies differ from older fork
  documentation, update this file instead of following stale instructions.
- Historical branches or forks can be useful references, but they are not the
  source of truth for current behavior.

### Hermes status

- Hermes is a supported and functional Paperclip integration in the current
  product surface.
- Support is provided through the dedicated `hermes-paperclip-adapter` package.
- The adapter may live outside this monorepo while still being a first-class
  supported runtime in the UI and server.
- Do not infer "unsupported" from the adapter living in a separate repository or
  package.

### Hermes source-of-truth rule

- Treat the current codebase, active runtime registrations, and active adapter
  plugin configuration as the source of truth for Hermes support.
- Treat historical forks of the adapter as historical context unless they are
  the package source currently configured in this checkout.
- When documenting Hermes, state both facts together: Paperclip supports Hermes
  today, and Hermes support is implemented via a dedicated adapter package
  rather than requiring all adapter code to live in this monorepo.
