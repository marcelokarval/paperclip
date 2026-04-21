# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-04-14] Claim only what was actually verified**
   Do instead: distinguish clearly between repo/document analysis and commands/tests actually run.
2. **[2026-04-20] Run this working clone on port 3101 for browser proof**
   Do instead: start from the repo checkout with `PORT=3101 PAPERCLIP_LISTEN_PORT=3101 PAPERCLIP_HOME=/tmp/... pnpm dev`; treat `PAPERCLIP_HOME` as data/DB only, not source code.
3. **[2026-04-15] Separate installed runtime from the remediation fork**
   Do instead: when analyzing incidents, treat `~/.paperclip/` and packaged `.npm/_npx/.../@paperclipai/*` code as the case the user actually ran, and treat this fork checkout (for example `/path/to/your-fork/paperclip`) as the patch/backport workspace.
4. **[2026-04-20] Isolate runtime proof with `PAPERCLIP_HOME`**
   Do instead: when running this clone for UI/runtime validation, set `PAPERCLIP_HOME=/tmp/...` unless intentionally testing the user's installed `~/.paperclip` instance.
5. **[2026-04-15] Check upstream merged fixes before re-diagnosing a bug locally**
   Do instead: inspect official `paperclipai/paperclip` merged PRs/commits for the affected workflow first, then state explicitly whether the fix exists upstream, in this fork, and in the installed runtime.

## Repo Workflow Guardrails
1. **[2026-04-14] Read Paperclip core docs before architectural conclusions**
   Do instead: start with `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `doc/DEVELOPING.md`, and `doc/DATABASE.md`.
2. **[2026-04-20] Respect Paperclip config ownership routes**
   Do instead: route post-setup guidance to existing owners: `/instance/settings/*` for instance-wide config, `/:prefix/company/*` for company config, `/:prefix/projects/:projectRef/configuration` for project config, and project workspace detail routes for concrete workspace runtime config.
3. **[2026-04-14] Keep internal and public docs separate**
   Do instead: write engineering analysis and repo-operational material under `doc/`; treat `docs/` as the public documentation site surface.
4. **[2026-04-15] Review Sourcery before merging any PR**
   Do instead: read Sourcery feedback, classify each item, save deferred high-ROI items in `doc/SOURCERY-REVIEW-POOL.md`, then mention that record in the closing PR comment before merge.
5. **[2026-04-16] Turn substantive Sourcery follow-ups into new issue + PR cycles**
   Do instead: keep only bounded local fixes in the same PR; if review feedback becomes a separate slice, open a new GitHub issue and a new PR linked back to the original one.
6. **[2026-04-15] Use body files for GitHub markdown comments**
   Do instead: write multi-line issue/PR comments to a temp file and send them with `gh ... --body-file`; reserve inline `--body` only for genuinely short plain-text comments.

## Domain Behavior Guardrails
1. **[2026-04-20] Repository baseline is documentation, not backlog**
   Do instead: when designing repo/project intake, keep repository analysis read-only and Paperclip-owned; do not create split issues, child issues, repo writes, imports, PRs, or agent wakeups unless explicitly added as a separate operator action.
2. **[2026-04-21] Issue identifiers follow configured prefixes, including digits**
   Do instead: centralize identifier parsing and accept alphanumeric prefixes like `P4Y-1`; do not reintroduce route-local `[A-Z]+-\d+` regexes.

## Shell & Command Reliability
1. **[2026-04-14] Prefer parallel read-only inspection for repo discovery**
   Do instead: use `rg`, `sed -n`, and grouped read commands to map structure before summarizing behavior.
2. **[2026-04-17] `pnpm patch-commit` may need escalated permissions**
   Do instead: if a dependency patch write fails with pnpm store `EROFS`, rerun `pnpm patch-commit` with escalation instead of hand-assembling a loose hotfix.
