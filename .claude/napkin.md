# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".

## Execution & Validation (Highest Priority)
1. **[2026-04-14] Claim only what was actually verified**
   Do instead: distinguish clearly between repo/document analysis and commands/tests actually run.
2. **[2026-04-15] Separate installed runtime from the remediation fork**
   Do instead: when analyzing incidents, treat `~/.paperclip/` and packaged `.npm/_npx/.../@paperclipai/*` code as the case the user actually ran, and treat this fork checkout (for example `/path/to/your-fork/paperclip`) as the patch/backport workspace.
3. **[2026-04-15] Check upstream merged fixes before re-diagnosing a bug locally**
   Do instead: inspect official `paperclipai/paperclip` merged PRs/commits for the affected workflow first, then state explicitly whether the fix exists upstream, in this fork, and in the installed runtime.

## Repo Workflow Guardrails
1. **[2026-04-14] Read Paperclip core docs before architectural conclusions**
   Do instead: start with `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `doc/DEVELOPING.md`, and `doc/DATABASE.md`.
2. **[2026-04-14] Keep internal and public docs separate**
   Do instead: write engineering analysis and repo-operational material under `doc/`; treat `docs/` as the public documentation site surface.
3. **[2026-04-15] Review Sourcery before merging any PR**
   Do instead: read Sourcery feedback, classify each item, save deferred high-ROI items in `doc/SOURCERY-REVIEW-POOL.md`, then mention that record in the closing PR comment before merge.
4. **[2026-04-15] Use body files for GitHub markdown comments**
   Do instead: write multi-line issue/PR comments to a temp file and send them with `gh ... --body-file`; reserve inline `--body` only for genuinely short plain-text comments.

## Shell & Command Reliability
1. **[2026-04-14] Prefer parallel read-only inspection for repo discovery**
   Do instead: use `rg`, `sed -n`, and grouped read commands to map structure before summarizing behavior.
