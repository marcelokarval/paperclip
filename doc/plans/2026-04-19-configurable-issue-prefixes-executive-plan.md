# 2026-04-19 Configurable Issue Prefixes Executive Plan

Status: Proposed for execution
Date: 2026-04-19
Parent study: `doc/plans/2026-04-19-configurable-issue-prefixes-prd-pre-sdd.md`
Decision captured: keep `issuePrefix`, make it optional during setup, and keep the current automatic fallback when omitted.

## 1. Executive Decision

We will not rename `issuePrefix` in this implementation.

The product contract becomes:

- company setup may submit `issuePrefix`
- if `issuePrefix` is provided, backend normalizes and persists it in `companies.issue_prefix`
- if `issuePrefix` is omitted or blank, backend uses the existing standard derivation from company name
- explicit user-provided prefix conflicts return a clear conflict error
- automatic fallback may keep the current conflict-retry behavior
- existing issue identifiers are not rewritten
- post-creation prefix editing is out of scope for this slice
- company routes keep using `company.issuePrefix` as they do today

This is the smallest safe change that removes the hard-coded-only behavior without introducing route-key split complexity.

## 2. Product Requirements

### 2.1 User story

As an instance admin creating a company, I want to choose the issue prefix during setup, while still being able to skip that field and let Paperclip choose the default, so that company issue identifiers can match my internal convention without increasing setup friction.

### 2.2 Acceptance criteria

- Onboarding shows an issue prefix field on the company setup step.
- The field is optional.
- The field is prefilled or suggested from company name, but the user can override it.
- If the user clears/leaves it blank, backend applies the existing default derivation.
- If the user enters `P4Y`, the first created issue under that company becomes `P4Y-1`.
- If the user enters a duplicate explicit prefix, company creation fails with a clear message and does not silently create `P4YA`.
- If the user omits the prefix and the derived fallback conflicts, current auto-suffix behavior remains acceptable.
- Existing companies keep their current `issuePrefix`.
- Existing issues keep their current `identifier`.
- Company rename does not change `issuePrefix`.
- Company settings may display the prefix read-only, but does not edit it in this slice.

### 2.3 Non-goals

- No `issuePrefix` -> `issueKeyPrefix` rename.
- No `companyRouteKey` split.
- No post-creation prefix editing.
- No historical issue identifier rewrite.
- No project/team prefix support.
- No change to issue counter semantics.
- No database column rename.

## 3. Current Code Findings

### 3.1 Shared TS contract

`packages/shared/src/validators/company.ts` currently defines `createCompanySchema` with only:

- `name`
- `description`
- `budgetMonthlyCents`

It must accept optional `issuePrefix`.

`packages/shared/src/types/company.ts` already exposes `Company.issuePrefix`, so response typing already contains the field.

### 3.2 Backend TS behavior

`server/src/services/companies.ts` currently:

- derives base prefix from name via `deriveIssuePrefixBase`
- always inserts with `{ ...data, issuePrefix: candidate }`
- auto-suffixes conflicts with repeated `A`

This must change from "always generate" to "use explicit prefix when present, fallback generate when absent".

`server/src/services/issues.ts` already:

- increments `companies.issueCounter`
- reads `companies.issuePrefix`
- persists `issues.identifier = ${company.issuePrefix}-${issueNumber}`

No issue-generation change is required if company creation stores the desired prefix correctly.

### 3.3 Frontend TS API typing

`ui/src/api/companies.ts` currently types `companiesApi.create` without `issuePrefix`.

`ui/src/context/CompanyContext.tsx` currently types `createCompany` without `issuePrefix`.

Both must accept optional `issuePrefix`.

### 3.4 Frontend TSX setup flow

`ui/src/components/OnboardingWizard.tsx` currently calls:

```ts
companiesApi.create({ name: companyName.trim() })
```

It needs:

- local prefix state
- suggestion/fallback display
- optional submit behavior
- explicit submit only when user entered a non-empty prefix

### 3.5 Frontend TSX settings flow

`ui/src/pages/CompanySettings.tsx` currently syncs and edits company name, description, logo, and brand color.

For this slice, settings should add a read-only issue prefix display. This avoids implying that prefix mutation is safe after creation.

## 4. Implementation Shape

## 4.1 Shared TS

Files:

- `packages/shared/src/validators/company.ts`
- optionally a new shared helper location if the repo already has a suitable utility module

Changes:

- Add an issue prefix schema:

```ts
const issuePrefixSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/));
```

- Add `issuePrefix` to `createCompanySchema` as optional/nullish.
- Do not add it to `updateCompanyBrandingSchema`.
- Prefer not adding it to `updateCompanySchema` in this slice unless settings editing is explicitly included later.

Important nuance:

- If using `optional().nullable()`, blank strings need either frontend omission or server normalization because `""` should mean "use fallback", not "invalid explicit prefix", unless the UI sent it intentionally.

Recommended helper semantics:

```ts
normalizeIssuePrefixInput(value):
  null when value is null/undefined/blank
  uppercase string when valid non-blank
  validation error when malformed non-blank
```

## 4.2 Backend TS

Files:

- `server/src/services/companies.ts`
- `server/src/routes/companies.ts`
- tests under `server/src/__tests__/`

Service behavior:

```ts
async function createCompanyWithIssuePrefix(data) {
  const explicit = normalizeOptionalIssuePrefix(data.issuePrefix);
  if (explicit) {
    try insert with explicit issuePrefix;
    catch companies_issue_prefix_idx -> throw conflict/processable domain error;
  }

  fallback:
    derive prefix from name;
    retry suffixes as today;
}
```

Conflict behavior:

- explicit `P4Y` already exists -> return conflict
- omitted prefix derives `P4Y`, conflict -> fallback to `P4YA` using current algorithm

Route behavior:

- `POST /api/companies` already validates with `createCompanySchema`; after schema update it can pass `req.body` to `svc.create`.
- Make sure conflict error maps to a useful HTTP response. If current service only throws raw DB conflict, add explicit handling.

Activity log:

- `company.created` can keep details `{ name }`.
- Optional improvement: include `{ name, issuePrefix }` because this is now a user-facing setup choice.

No change required:

- `server/src/services/issues.ts` should continue using persisted `company.issuePrefix`.
- `packages/db/src/schema/companies.ts` does not need a column change.
- `packages/db/src/schema/issues.ts` does not need a column change.
- no migration is required for the minimal implementation.

## 4.3 Frontend TS

Files:

- `ui/src/api/companies.ts`
- `ui/src/context/CompanyContext.tsx`

Changes:

- Extend create payload type:

```ts
{
  name: string;
  description?: string | null;
  budgetMonthlyCents?: number;
  issuePrefix?: string | null;
}
```

- Use the same shape in `CompanyContextValue.createCompany`, mutation input, and callback input.

No route typing change is required because `Company.issuePrefix` remains unchanged.

## 4.4 Frontend TSX Setup

File:

- `ui/src/components/OnboardingWizard.tsx`

Add state:

```ts
const [issuePrefix, setIssuePrefix] = useState("");
const [issuePrefixTouched, setIssuePrefixTouched] = useState(false);
```

Add suggestion:

```ts
deriveSuggestedIssuePrefix(companyName)
```

Behavior:

- while `issuePrefixTouched === false`, display/update the suggested value from company name
- once user edits the prefix, stop overwriting it
- allow clearing the field to mean "use Paperclip default"
- submit `issuePrefix` only if the trimmed value is non-empty

Submit shape:

```ts
const normalizedPrefix = issuePrefix.trim().toUpperCase();
const payload = {
  name: companyName.trim(),
  ...(normalizedPrefix ? { issuePrefix: normalizedPrefix } : {}),
};
const company = await companiesApi.create(payload);
```

UI copy:

- Label: `Issue prefix`
- Hint: `Optional. Used for issue IDs like P4Y-1. Leave blank to let Paperclip choose.`
- Preview: `First issue: ${previewPrefix || "auto"}-1`
- Validation message for invalid input before submit, if implemented client-side.

Backend remains authoritative, so frontend validation is convenience only.

## 4.5 Frontend TSX Settings

File:

- `ui/src/pages/CompanySettings.tsx`

Add read-only section in General/Appearance area or a new "Issue identifiers" block:

- label: `Issue prefix`
- value: `selectedCompany.issuePrefix`
- helper: `Set during company creation. Used in issue IDs and company routes.`

Do not include this field in `generalDirty`.
Do not submit it through `generalMutation`.

Rationale:

- This makes the setting visible.
- It avoids the route/history side effects of post-creation editing.
- It creates a clean future insertion point if we later split route key and issue key.

## 5. Test Plan

### 5.1 Backend tests

Likely file:

- `server/src/__tests__/companies-service.test.ts` if present, or create a focused company service/route test
- `server/src/__tests__/issues-service.test.ts`

Required cases:

- create company with explicit prefix persists that exact normalized prefix
- explicit lowercase prefix normalizes to uppercase
- create company with omitted prefix still derives from name
- omitted prefix conflict still auto-suffixes
- explicit duplicate prefix returns conflict and does not suffix
- invalid explicit prefix returns validation error
- issue created after explicit prefix uses `${prefix}-${number}`

### 5.2 Frontend tests

Likely files:

- `ui/src/components/OnboardingWizard.test.tsx` if present or create one
- `ui/src/pages/CompanySettings.test.tsx` if existing patterns support it

Required cases:

- setup renders optional issue prefix field
- company name suggests prefix
- manual prefix edit is preserved when company name changes
- blank prefix submits no `issuePrefix`
- non-blank prefix submits normalized `issuePrefix`
- settings displays `selectedCompany.issuePrefix` read-only

### 5.3 Regression tests

Relevant existing areas:

- `server/src/__tests__/issues-service.test.ts`
- `ui/src/lib/issue-reference.test.ts`
- `ui/src/lib/company-page-memory.test.ts`

Only add if needed:

- digit-containing prefix such as `P4Y-1` should linkify and route correctly
- avoid changing broad route behavior in this slice unless failures expose hidden assumptions

## 6. Verification Commands

Minimum targeted verification:

```sh
pnpm vitest run server/src/__tests__/issues-service.test.ts
pnpm --dir ui vitest run src/components/OnboardingWizard.test.tsx
```

The exact frontend command may need adjustment based on test layout. If no onboarding test exists, create one or run the nearest component test file touched by the implementation.

Before PR closure:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If full verification is too expensive during development, run targeted tests first, then full checks before merge.

## 7. Execution Phases

### Phase 1: Contract and backend

1. Add optional `issuePrefix` to create-company validator.
2. Implement normalization semantics.
3. Refactor company creation into explicit-prefix path plus fallback path.
4. Add backend tests for explicit, omitted, duplicate, and invalid prefixes.
5. Confirm issue creation uses persisted prefix without changing issue service behavior.

Exit proof:

- backend targeted tests pass
- no schema migration needed

### Phase 2: Setup UI

1. Extend `companiesApi.create` and `CompanyContext.createCompany` payload types.
2. Add issue prefix state to onboarding.
3. Add UI field, hint, and preview.
4. Submit prefix only when non-blank.
5. Surface backend validation/conflict errors through existing onboarding error path.

Exit proof:

- frontend targeted tests pass
- manual setup path can create company with custom prefix

### Phase 3: Settings visibility

1. Add read-only issue prefix section to company settings.
2. Keep it outside dirty/save logic.
3. Add or update test coverage if settings tests exist.

Exit proof:

- selected company shows current prefix
- no update payload includes prefix from settings

### Phase 4: Final quality gate

1. Run typecheck.
2. Run targeted backend/frontend tests.
3. Run full repo test/build before PR closure.
4. Review for route side effects and no accidental prefix edit path.

## 8. Risk Register

Risk: blank prefix could fail validation instead of falling back.
Mitigation: normalize blank to omitted before strict validation or omit blank on frontend and handle omitted on backend.

Risk: explicit duplicate prefix silently auto-suffixes.
Mitigation: branch explicit input separately from fallback generation and test this behavior.

Risk: frontend preview promises a prefix that backend changes.
Mitigation: preview is exact only for explicit valid prefixes; for blank fallback, label as automatic.

Risk: route and issue prefix remain coupled.
Mitigation: no post-creation editing in this slice; document read-only settings copy.

Risk: digit-containing prefixes expose regex drift.
Mitigation: either constrain to letters-only for this first slice or add tests for `P4Y-1` in issue reference parsing and company memory.

Recommendation on this risk:

- allow digits after the first character because `P4Y` is a real expected use case
- add focused tests where regex assumptions already exist

## 9. Ready-To-Implement Checklist

- Product accepts create-time optional prefix with fallback.
- Product accepts no post-creation editing in this slice.
- Product accepts explicit duplicate prefix as an error, not auto-suffix.
- Product accepts `[A-Z][A-Z0-9]{1,9}` as the initial format.
- Engineering accepts no DB migration for the minimal path.
- Engineering accepts settings display as read-only.

