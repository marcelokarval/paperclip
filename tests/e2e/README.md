# E2E and Browser Proof

Run the local dev server on the browser-proof port first:

```sh
PORT=3101 PAPERCLIP_LISTEN_PORT=3101 PAPERCLIP_HOME=/tmp/paperclip-browser-proof pnpm dev
```

Org Intelligence page proof:

```sh
PAPERCLIP_E2E_BASE_URL=http://127.0.0.1:3101 \
PAPERCLIP_BROWSER_PROOF_PATH=/<company-prefix>/org-intelligence \
PAPERCLIP_BROWSER_PROOF_STEPS=tests/e2e/fixtures/org-intelligence-page.steps.json \
pnpm proof:browser:local
```

Instruction patch proposal proof for a known `org_learning_apply` issue:

```sh
PAPERCLIP_E2E_BASE_URL=http://127.0.0.1:3101 \
PAPERCLIP_BROWSER_PROOF_PATH=/issues/<apply-issue-id-or-identifier> \
PAPERCLIP_BROWSER_PROOF_STEPS=tests/e2e/fixtures/org-learning-apply-proposal.steps.json \
pnpm proof:browser:local
```

The proposal flow records a reviewable instruction patch proposal only. It must
not be treated as a mutation of `AGENTS.md`, routing tables, lessons ledgers, or
other managed instruction files. The HITL controls must show the target agent,
instruction surface, patch text, and `Request HITL patch approval`; applying is
only available after the linked approval is approved.
