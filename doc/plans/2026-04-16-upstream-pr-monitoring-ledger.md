# 2026-04-16 Upstream PR Monitoring Ledger

Status: Active
Owner: upstream-monitoring lane
Fork repo: `marcelokarval/paperclip`
Upstream repo: `paperclipai/paperclip`
Monitoring window: `2026-04-14` through `2026-04-16`
Last refresh date: `2026-04-16`
Last PR analyzed: `#3561 - fix(heartbeat): add hermes_local to SESSIONED_LOCAL_ADAPTERS`
Last PR analyzed at: `2026-04-16`
Next PR to inspect: `#3782 - release: v2026.416.0 notes`
Local tracking issue: [#12](https://github.com/marcelokarval/paperclip/issues/12)

## Purpose

This is the live decision ledger for merged upstream PR monitoring.

It exists to prevent upstream drift from becoming memory-based. Every merged
upstream PR in the active monitoring window must appear here even before it is
fully analyzed.

## Ordering Rule

This ledger is ordered newest-first by upstream merge date.

## PR Ledger

| Upstream PR | Merged at | Area | Summary of upstream change | Fork comparison | Decision status | Incorporated into fork? | Local tracking | Reason / rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#3561` | `2026-04-16` | heartbeat / adapters | Add `hermes_local` to `SESSIONED_LOCAL_ADAPTERS`. | absent in fork heartbeat set; fork already supports `hermes_local` in built-in adapter types and session compaction | `adapt locally` | `no, not yet` | `#42` | direct behavioral gap for Hermes process-loss recovery in this fork; local intake should mirror upstream fix with regression coverage |
| `#3782` | `2026-04-15` | release | Publish `v2026.416.0` release notes. | absent in fork snapshot | `pending` | `no` | `#12` | likely low ROI, but still needs explicit review record |
| `#3779` | `2026-04-15` | sync / mixed | Sync/master follow-up bundle after pap1497 work. | absent in fork snapshot | `pending` | `no` | `#12` | bundled sync commit needs decomposition before intake decision |
| `#3744` | `2026-04-15` | ui / issues / routines | Improve issue and routine UI responsiveness. | absent in fork snapshot | `pending` | `no` | `#12` | active product surface in this fork; likely useful |
| `#3742` | `2026-04-15` | heartbeat / recovery | Harden heartbeat run summaries and recovery context. | absent in fork snapshot | `pending` | `no` | `#12` | directly adjacent to ongoing fork hardening work |
| `#3743` | `2026-04-15` | worktrees / dev ergonomics | Fix worktree dev dependency ergonomics. | absent in fork snapshot | `pending` | `no` | `#12` | high ROI for this fork workflow; still needs file-level review |
| `#3728` | `2026-04-15` | ui build hygiene | Drop `console.*` and legal comments in production builds. | absent in fork snapshot | `pending` | `no` | `#12` | likely optional, but keep explicit |
| `#3734` | `2026-04-15` | server / caching | Set proper cache headers for static assets and SPA fallback. | absent in fork snapshot | `pending` | `no` | `#12` | bounded server hardening candidate |
| `#3726` | `2026-04-15` | accessibility / ui shell | Remove `maximum-scale` and `user-scalable=no` from viewport. | absent in fork snapshot | `pending` | `no` | `#12` | small accessibility fix; likely cheap intake |
| `#3731` | `2026-04-15` | server / deployment config | Trust `PAPERCLIP_PUBLIC_URL` in board mutation guard. | absent in fork snapshot | `pending` | `no` | `#12` | deployment-sensitive guard logic; needs careful review |
| `#3741` | `2026-04-15` | auth routes / issue editor | Harden authenticated routes and issue editor reliability. | absent in fork snapshot | `pending` | `no` | `#12` | broad surface area; likely needs split intake decision |
| `#3540` | `2026-04-15` | adapters / contracts | Add capability flags to `ServerAdapterModule`. | absent in fork snapshot | `pending` | `no` | `#12` | contract expansion for adapters; relevant but not blind-merge safe |
| `#3589` | `2026-04-15` | provider quota / Anthropic | Fix quota UI always showing 100% used. | absent in fork snapshot | `pending` | `no` | `#12` | narrow but still deserves explicit decision |
| `#3472` | `2026-04-15` | server config | Respect externally set `PAPERCLIP_API_URL`. | absent in fork snapshot | `pending` | `no` | `#12` | deployment/runtime config correctness candidate |
| `#3209` | `2026-04-15` | routines API | Include `cronExpression` and timezone in list trigger response. | absent in fork snapshot | `pending` | `no` | `#12` | compact contract fix in active routines surface |
| `#3329` | `2026-04-15` | inbox-lite / routines | Include routine-execution issues in agent inbox-lite. | absent in fork snapshot | `pending` | `no` | `#12` | small correctness fix for active workflow surface |
| `#3679` | `2026-04-14` | execution / heartbeat | Harden execution reliability and heartbeat tooling. | commit-equivalent present in fork history | `pending` | `yes, likely already` | `#12` | needs explicit 1:1 confirmation under new process even though git shows equivalent commit |
| `#3680` | `2026-04-14` | runtime / workspace UX | Improve workspace runtime and navigation ergonomics. | commit-equivalent present in fork history | `pending` | `yes, likely already` | `#12` | likely already present; still needs structured review note |
| `#3678` | `2026-04-14` | issue detail / list UX | Improve issue detail and issue-list UX. | commit-equivalent present in fork history | `pending` | `yes, likely already` | `#12` | likely already present; still needs structured review note |

## Intake Follow-up Ledger

| Upstream PR | Local issue | Local PR | Outcome | Notes |
| --- | --- | --- | --- | --- |
| none yet | n/a | n/a | n/a | no upstream PR in this ledger has completed 1:1 intake review yet |

## Update Protocol

After each upstream PR review:

1. Update the row for that PR.
2. Update `Last PR analyzed`.
3. Update `Last PR analyzed at`.
4. Update `Next PR to inspect`.
5. If local work is needed, open the local issue and PR and link them
   immediately.

Do not leave the header stale after analyzing a PR.
