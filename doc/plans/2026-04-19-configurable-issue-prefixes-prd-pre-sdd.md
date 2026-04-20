# 2026-04-19 Configurable Issue Prefixes PRD / Pre-SDD

Status: Proposed for discussion
Date: 2026-04-19
Audience: Product, backend, frontend, data model
Requested scope: User stories -> PRD -> pre-SDD only. No implementation in this pass.

Related files inspected:

- `packages/db/src/schema/companies.ts`
- `packages/db/src/schema/issues.ts`
- `packages/db/src/migrations/0004_issue_identifiers.sql`
- `packages/db/src/migrations/0017_tiresome_gabe_jones.sql`
- `packages/shared/src/validators/company.ts`
- `packages/shared/src/types/company.ts`
- `server/src/services/companies.ts`
- `server/src/services/issues.ts`
- `server/src/routes/companies.ts`
- `server/src/routes/issues.ts`
- `server/src/services/company-portability.ts`
- `server/src/services/feedback.ts`
- `ui/src/api/companies.ts`
- `ui/src/context/CompanyContext.tsx`
- `ui/src/App.tsx`
- `ui/src/components/Layout.tsx`
- `ui/src/components/OnboardingWizard.tsx`
- `ui/src/pages/CompanySettings.tsx`
- `ui/src/lib/company-routes.ts`
- `ui/src/lib/company-page-memory.ts`
- `ui/src/lib/issue-reference.ts`

## 1. Executive Summary

Paperclip currently treats the company issue prefix as an automatically allocated implementation detail. On company creation, the backend derives a prefix from the company name, for example `Paperclip` -> `PAP`, and retries duplicate prefixes by appending `A` characters. That behavior is encoded in `server/src/services/companies.ts`.

This is useful as a fallback, but it is not a good product model. The prefix is a human-facing company configuration. It appears in issue identifiers, links, agent prompts, worktree branch names, exports, feedback paths, and the browser route namespace. It should therefore be selected deliberately during company setup and managed as company metadata, not silently inferred from the organization name.

The broad architectural issue is that one field, `companies.issue_prefix`, currently serves at least two meanings:

- Issue identity prefix: `PAP-123`
- Company URL route namespace: `/PAP/dashboard`, `/PAP/issues/PAP-123`

Those concepts are related but not identical. The safest product direction is to make the issue prefix configurable now, while explicitly deciding whether Paperclip should keep route namespace and issue prefix coupled or split them into separate fields.

Recommended direction for discussion:

- Add an explicit, user-configurable issue prefix field to company setup.
- Normalize and validate the prefix in shared validators and on the server.
- Keep issue identifiers immutable after creation.
- Treat prefix edits as affecting new issues only unless a future explicit "rewrite historical identifiers" tool is designed.
- Strongly consider splitting `companyRouteKey` from `issueKeyPrefix` before exposing prefix edits after company creation.

## 2. Current State

### 2.1 Data model

`companies` has:

- `issuePrefix: text("issue_prefix").notNull().default("PAP")`
- `issueCounter: integer("issue_counter").notNull().default(0)`
- a unique index on `issuePrefix`

`issues` has:

- `issueNumber: integer("issue_number")`
- `identifier: text("identifier")`
- a unique index on `identifier`

Current practical invariant:

- each company has a globally unique prefix
- each issue gets a monotonically increasing per-company number
- `issues.identifier` is persisted as `${company.issuePrefix}-${issueNumber}`
- the identifier itself is globally unique, not only company-scoped

### 2.2 Migration history

Migration `0004_issue_identifiers.sql` added `companies.issue_prefix`, `companies.issue_counter`, `issues.issue_number`, and `issues.identifier`.

Migration `0017_tiresome_gabe_jones.sql` rebuilt prefixes from company names:

- base prefix = first three A-Z letters of company name
- fallback = `CMP`
- duplicates receive suffixes like `PAP`, `PAPA`, `PAPAA`
- existing identifiers were rewritten from normalized prefix plus issue number
- `companies_issue_prefix_idx` and `issues_identifier_idx` were made globally unique

This confirms that the current behavior was intentionally normalized around company-name-derived prefixes, but also confirms that the prefix is now a durable identity surface.

### 2.3 Company creation backend

`server/src/services/companies.ts` derives the prefix from the company name:

- `deriveIssuePrefixBase(name)` uppercases the name, removes non-letters, takes the first 3 letters, or falls back to `CMP`
- `createCompanyWithUniquePrefix(data)` always overwrites the insert with the generated candidate
- conflict retry appends repeated `A` characters

This means API callers cannot currently set their desired issue prefix, even if they already know what prefix should represent the organization.

### 2.4 Issue creation backend

`server/src/services/issues.ts` increments `companies.issueCounter` transactionally and builds:

```ts
const identifier = `${company.issuePrefix}-${issueNumber}`;
```

The counter logic is self-correcting against `max(issues.issueNumber)` and is a good base to keep. The weak point is not numbering; it is the source and lifecycle of `company.issuePrefix`.

### 2.5 Company routes and permissions

`server/src/routes/companies.ts`:

- `POST /api/companies` validates `createCompanySchema`, then calls `svc.create(req.body)`
- `PATCH /api/companies/:companyId` validates `updateCompanySchema` for board actors
- creation requires board plus instance admin
- update requires company access plus board, unless agent is only allowed through the branding-only schema

This is mostly the right permission posture for prefix management:

- company creation prefix should be instance-admin controlled
- company settings prefix updates should be board-only, not agent-branding
- agents should not mutate issue identity configuration via branding routes

### 2.6 Shared validators and types

`packages/shared/src/validators/company.ts` currently accepts on create:

- `name`
- `description`
- `budgetMonthlyCents`

It does not accept `issuePrefix`.

`packages/shared/src/types/company.ts` exposes `issuePrefix`, so frontend consumers can read it, but current create/update contracts do not model it as user-controlled.

### 2.7 Frontend company setup

`ui/src/components/OnboardingWizard.tsx` currently creates a company with:

```ts
companiesApi.create({ name: companyName.trim() })
```

There is no prefix field, no preview, and no validation feedback for prefix conflicts.

The returned `company.issuePrefix` is stored and used for next-step routing/context.

### 2.8 Frontend company settings

`ui/src/pages/CompanySettings.tsx` lets users edit:

- name
- description
- logo
- brand color
- approval settings
- feedback sharing
- invites/import/export flows

It does not expose `issuePrefix`.

### 2.9 Frontend routing

The UI uses `company.issuePrefix` as the company route prefix:

- `ui/src/App.tsx` matches `/:companyPrefix/*` to companies by `issuePrefix`
- `ui/src/components/Layout.tsx` redirects casing to `matchedCompany.issuePrefix`
- `ui/src/lib/company-routes.ts` applies the prefix to board paths
- `ui/src/context/CompanyContext.tsx` selects companies by ID, but route sync uses the prefix

Therefore, changing a company's issue prefix also changes the URL namespace for the entire company.

This is the strongest reason not to treat post-creation prefix editing as a small form-field change.

### 2.10 Identifier references and link parsing

Issue references are used broadly:

- `/api/issues/:id` and `/api/issues/:issueId` resolve identifiers like `PAP-39` to UUIDs
- `ui/src/lib/issue-reference.ts` linkifies identifiers in markdown
- `ui/src/lib/company-page-memory.ts` checks whether remembered issue routes belong to a company by comparing the identifier prefix to route prefix
- `server/src/services/feedback.ts` derives issue paths by splitting the identifier on `-`
- workspace runtime templates use `issue.identifier` in branches/worktrees

Current frontend linkification already allows alphanumeric prefixes beginning with a letter (`[A-Z][A-Z0-9]+-\d+`), but some other paths still assume letters-only prefixes, for example `company-page-memory`.

## 3. Problem Statement

The issue prefix is currently generated as a hard-coded derivation of organization/company name. This creates product and operational problems:

- Companies cannot choose a meaningful internal key during setup.
- Imported companies cannot preserve their preferred issue namespace.
- Renaming a company does not affect the prefix, which is correct for stability, but makes the original auto-derivation feel arbitrary and stale.
- Prefix conflicts are resolved through opaque suffixes (`PAPA`, `PAPAA`) instead of an explicit operator decision.
- The UI gives no chance to preview the first issue key before the company is created.
- The same field powers both issue identity and company URL routing, so future prefix editing has hidden blast radius.

The product goal is not merely "let the user type a prefix". The goal is to make issue identity explicit, stable, validated, and visible at organization setup time.

## 4. User Stories

### Story 1: Configure issue prefix during company setup

As an instance admin creating a company, I want to choose the internal issue prefix during setup so that generated issue keys match my organization's language and conventions from the first task.

Acceptance criteria:

- setup shows an editable issue prefix field
- the field is prefilled with a suggested prefix derived from company name
- the user can override the suggestion before creating the company
- the first issue preview is visible, for example `PROP-1`
- backend persists the chosen normalized prefix
- duplicate or invalid prefixes are rejected with clear UI feedback

### Story 2: Use stable human identifiers everywhere

As a board user or agent, I want issue keys to remain stable after creation so that comments, branch names, run logs, external notes, and exported references do not silently break.

Acceptance criteria:

- existing issue identifiers are not recomputed when company name changes
- existing issue identifiers are not recomputed when the prefix setting changes, unless an explicit future migration tool is invoked
- direct links by issue identifier continue resolving
- UUID-based routes and API calls continue working

### Story 3: Manage prefix in company settings with guardrails

As a company owner, I want to inspect and possibly update the prefix for future issues, but only with clear warnings about what changes and what does not.

Acceptance criteria:

- settings display the current issue prefix
- if editing is allowed, the UI states that the change affects future issues only
- if the implementation keeps prefix and route key coupled, the UI states that the company URL prefix will change too
- editing requires board/company-owner level permissions, not agent branding permissions
- every change is logged in activity history

### Story 4: Preserve references in imports and exports

As an operator importing or exporting a company package, I want issue prefixes and identifiers to be handled intentionally so that imported companies do not accidentally inherit arbitrary keys.

Acceptance criteria:

- exports include company issue prefix metadata
- import preview shows the planned prefix for new-company imports
- import into existing company keeps the target company's prefix for newly created issues unless the user explicitly opts into source prefix preservation
- conflicts are detected before apply

### Story 5: Avoid route ambiguity in multi-company instances

As a user of a multi-company instance, I want company navigation to stay deterministic, even when issue prefix configuration changes.

Acceptance criteria:

- company route lookup never becomes ambiguous
- route prefixes remain unique
- unknown old routes redirect or fail predictably
- issue identifiers can still be resolved without depending on the current route prefix

### Story 6: Support future project/team prefixes without blocking V1

As a product owner, I want company-level issue prefixes to work now without preventing future project/team-specific issue keys.

Acceptance criteria:

- design acknowledges `doc/spec/ui.md` and `doc/TASKS.md` long-horizon references to project/team prefixes
- V1 keeps company-level prefix as the source of issue keys
- schema and APIs avoid naming that makes team/project prefixes impossible later

## 5. PRD

### 5.1 Goals

- Make issue prefix an explicit company setup field.
- Remove silent hard-coding as the only path for prefix creation.
- Keep generated issue identifiers stable, readable, and globally resolvable.
- Preserve current self-correcting issue counter behavior.
- Make prefix conflicts a user-visible validation problem, not an opaque suffix algorithm.
- Define a safe migration path for existing companies.
- Clarify whether route prefix and issue prefix remain coupled.

### 5.2 Non-goals

- Do not implement project-level or team-level issue keys in this slice.
- Do not rewrite all historical issue identifiers automatically.
- Do not change issue numbers to global counters.
- Do not change agent execution branch templates except where they consume the persisted issue identifier.
- Do not introduce free-form lowercase or punctuation-heavy issue keys.
- Do not let agents mutate company issue identity settings.

### 5.3 Product model

Recommended product model:

- `issueKeyPrefix`: the prefix used to generate issue identifiers.
- `companyRouteKey`: the prefix used in browser routes.

Current implementation only has `issuePrefix`, which acts as both. The PRD decision is whether to:

- Option A: expose current `issuePrefix` as configurable and keep coupling
- Option B: split route key and issue key now
- Option C: expose setup-time prefix only, defer route split and post-creation edits

Recommended path:

- Choose Option C for minimal safe product value if we want a fast implementation.
- Choose Option B if we want the model to be correct before exposing post-creation editing.

Option A is not recommended beyond a small internal-only patch because it hides route behavior inside an "issue prefix" setting.

### 5.4 Prefix constraints

Recommended initial constraints:

- 2 to 10 characters
- uppercase letters and digits
- must start with a letter
- no hyphen in the prefix because hyphen separates prefix from number
- normalized by trimming and uppercasing
- reserved route roots are rejected if the same value is used as company route key
- globally unique if it remains route key
- globally unique for issue identifiers if `issues.identifier` remains globally unique and prefix counters are per company

Rationale:

- `P4Y-1` should be valid.
- `PROP-1`, `OPS-7`, `AI2-12` should be valid.
- `123-1` should not be valid because it is harder to parse and weaker as a human namespace.
- `A-1` is too short and easy to collide with casual text.
- `MY-ORG-1` should be rejected because it breaks the single separator model.

### 5.5 Setup UX

The onboarding/company creation step should contain:

- Company name
- Issue prefix
- Preview: "Your first issue will look like `P4Y-1`"
- Helper text: "Used in issue IDs, links, branches, and agent context. You can change it later for future issues only." if future editing is implemented
- Validation:
  - required
  - uppercase normalization on blur or as-you-type
  - length/character rules
  - conflict error from backend

Suggested behavior:

- as the company name changes, auto-suggest a prefix only while the user has not manually edited the prefix
- after manual edit, do not overwrite the user's prefix
- show "Suggested" rather than silently forcing

### 5.6 Settings UX

Settings should show a "Issue identifiers" section.

Minimum safe version:

- display current prefix read-only
- explain that it was configured at setup and affects issue IDs

Editable version:

- allow editing `issueKeyPrefix`
- warn that existing issues retain their identifiers
- show next issue preview using the current counter plus one
- require confirmation if route key is coupled and would change URLs
- invalidate company and issue queries after save

### 5.7 Backend requirements

Create company:

- `createCompanySchema` accepts optional or required `issuePrefix`
- server normalizes prefix before insert
- if omitted, server still derives a suggested fallback for backwards compatibility
- conflict returns a validation/conflict response with a clear message
- server must not silently mutate a user-provided prefix into a different suffix

Update company:

- `updateCompanySchema` may accept `issuePrefix` or future `issueKeyPrefix`
- `updateCompanyBrandingSchema` must not accept prefix fields
- board/owner route may update prefix
- agent branding route cannot update prefix
- activity log records old prefix and new prefix

Create issue:

- keep transaction and self-correcting counter
- use normalized persisted prefix from company row
- persist full identifier at creation time
- do not derive display identifier dynamically from current company prefix

Identifier lookup:

- continue supporting `GET /api/issues/:identifier`
- regex should use shared issue identifier validation rules, not scattered local patterns
- if route key and issue prefix split, issue lookup must not assume identifier prefix equals company route prefix

### 5.8 Frontend requirements

Contracts:

- `companiesApi.create` accepts `issuePrefix`
- `companiesApi.update` accepts prefix only if settings editing is supported
- `Company` type continues exposing current prefix fields

Setup:

- add local prefix state
- derive suggestion from company name with same normalization rules as backend
- preserve user override
- submit explicit prefix
- render backend validation errors

Settings:

- add issue identifier section
- display current prefix and next issue preview
- if editable, submit normalized value and show warnings

Routing:

- if route key remains coupled, update route replacement logic after prefix changes
- if route key is split, change route matching from `company.issuePrefix` to `company.routeKey`
- audit all `company.issuePrefix` route usages

Issue references:

- centralize issue identifier regex in shared code
- update `company-page-memory` letters-only regex if digits are allowed
- ensure markdown linkification and issue route parsing use the same prefix rules

### 5.9 Portability requirements

Export:

- include company issue prefix metadata in manifest/company fields
- keep each issue's persisted identifier

Import preview:

- for new company, show source prefix and proposed target prefix
- detect conflicts with existing companies if prefix must be unique
- allow user override in the import form

Import apply:

- when creating a company, pass chosen prefix to `companies.create`
- created issues should get new target identifiers unless preserving historical identifiers is explicitly designed
- imported issue documents/comments should preserve original identifier text as content, but internal relations should use target issue IDs

### 5.10 Compatibility and migration

Existing companies:

- keep current `issue_prefix` values
- no identifier rewrite in this feature
- no counter reset

Existing URLs:

- if route key remains coupled and prefix changes are allowed, old company routes break unless aliases are introduced
- if route key is split, existing `issuePrefix` can seed both new fields during migration

Recommended migration if splitting:

- add `companies.route_key`, default/backfill from `issue_prefix`
- keep `companies.issue_prefix` as issue key prefix, or rename in code to `issueKeyPrefix` while preserving DB column initially
- add unique index on `route_key`
- keep unique index on `issue_prefix` only if issue identifiers remain globally unique by prefix+number

### 5.11 Security and abuse considerations

Prefix input is small but appears in paths, markdown links, branch names, worktree names, logs, and agent prompts. It should be treated as untrusted configuration.

Controls:

- strict character whitelist
- uppercase normalization
- no slashes, dots, spaces, quotes, shell metacharacters, or hyphens
- server-side validation is authoritative
- activity logging for changes
- board-only mutation
- no agent-side mutation through branding schemas

Important consequence:

- allowing only `[A-Z][A-Z0-9]{1,9}` makes path, markdown, branch, and shell contexts much safer because the prefix is inert text.

### 5.12 Success metrics

- Company setup explicitly shows and persists chosen issue prefix.
- First issue created under a custom prefix receives the expected identifier.
- Existing companies continue working after migration.
- Company routes remain deterministic.
- Direct issue links by identifier still resolve.
- Import preview shows prefix behavior before apply.
- No test fixtures need to rely on company-name-derived hidden behavior.

## 6. Product Decision Matrix

| Option | Description | Pros | Cons | Recommendation |
|---|---|---|---|---|
| A | Expose existing `issuePrefix` as editable setup/settings field | Smallest change; immediate value | Keeps route and issue identity coupled; prefix edits can break URLs | Only acceptable if edits after creation are disabled |
| B | Split `companyRouteKey` and `issueKeyPrefix` now | Correct domain model; safer future settings UX | Larger migration and UI audit | Best architecture |
| C | Expose setup-time `issuePrefix`, keep read-only after creation | Fast, safe, solves hard-coded creation problem | Defers route split and post-creation edits | Best first implementation if scope must stay bounded |

Recommended first implementation for discussion: Option C.

Recommended long-term model: Option B.

## 7. Pre-SDD

### 7.1 Data model plan

Minimal Option C:

- Keep `companies.issue_prefix`.
- Keep `companies.issue_counter`.
- Keep `issues.issue_number`.
- Keep `issues.identifier`.
- Keep `companies_issue_prefix_idx`.
- Keep `issues_identifier_idx`.
- Add no migration except possibly strengthening constraints if desired.

Option B route split:

- Add `companies.route_key text`.
- Backfill `route_key = issue_prefix`.
- Add unique index `companies_route_key_idx`.
- Keep `issue_prefix` for issue identifiers.
- Gradually rename application-level type fields:
  - `issuePrefix` -> `issueKeyPrefix`
  - `routeKey` -> route namespace
- Avoid DB column rename in the first migration unless the team wants a breaking cleanup.

### 7.2 Shared contract plan

Add shared utility/validator:

- `companyIssuePrefixSchema`
- `normalizeCompanyIssuePrefix(value: string): string`
- `deriveSuggestedIssuePrefix(companyName: string): string`
- `isIssueIdentifier(value: string): boolean`
- `parseIssueIdentifier(value: string): { prefix: string; number: number } | null`

Update:

- `createCompanySchema`
- `updateCompanySchema` only if editable settings are in scope
- `Company` type if splitting route key
- frontend and backend imports to avoid regex drift

### 7.3 Backend service plan

Company service:

- Replace `createCompanyWithUniquePrefix` with `createCompanyWithIssuePrefix`.
- If `data.issuePrefix` exists, normalize and insert exactly that value.
- If absent, derive fallback candidate for backwards-compatible API callers.
- Preserve auto-suffix only for fallback-generated prefixes, not user-provided prefixes.
- Return conflict if user-provided prefix is already taken.

Issue service:

- Keep existing counter transaction.
- Use the stored prefix returned from `companies`.
- Persist immutable identifier.
- Add tests for custom prefix company -> issue identifier.

Routes:

- `POST /api/companies` accepts prefix.
- `PATCH /api/companies/:companyId` accepts prefix only if settings editing is in scope.
- Activity details for prefix changes should include `{ previousIssuePrefix, issuePrefix }`.

Error handling:

- invalid prefix -> 422
- duplicate prefix -> 409
- no silent suffix for explicit user input

### 7.4 Frontend plan

Onboarding:

- Add `issuePrefix` state.
- Add `issuePrefixTouched` state.
- Suggest from company name while untouched.
- Submit `{ name, issuePrefix }`.
- Show `PREFIX-1` preview.

Company settings:

- Option C: read-only "Issue prefix" row.
- Option B/editable: form input with validation, next issue preview, and warning.

API:

- `companiesApi.create` payload includes `issuePrefix?: string`.
- `companiesApi.update` includes prefix only when supported.

Routing audit:

- `ui/src/App.tsx`
- `ui/src/components/Layout.tsx`
- `ui/src/lib/company-routes.ts`
- `ui/src/lib/onboarding-route.ts`
- `ui/src/lib/company-page-memory.ts`
- `ui/src/components/CompanyRail.tsx`
- `ui/src/components/Sidebar.tsx`
- pages that resolve company by prefix

### 7.5 Import/export plan

Company portability:

- Extend manifest company metadata with `issuePrefix` if not already present.
- Export reads current company prefix.
- Import preview computes target prefix:
  - explicit override first
  - source manifest prefix second
  - derived fallback from target company name last
- New-company import passes prefix to `companies.create`.
- Existing-company import does not mutate target prefix by default.

### 7.6 Test plan

Backend unit/integration:

- create company with explicit valid prefix
- create company without prefix still gets fallback
- explicit duplicate prefix returns conflict and does not auto-suffix
- invalid prefixes rejected
- issue creation uses custom prefix
- changing company name does not alter prefix or issue identifiers
- agent branding update cannot mutate prefix
- company update prefix behavior, if editable
- import new company with custom/source prefix

Frontend unit:

- onboarding suggests prefix from name
- manual prefix override is not overwritten by later name edits
- prefix preview updates
- invalid prefix disables submit or shows error
- duplicate prefix server error is visible
- route sync continues to use the expected route field

Regression:

- markdown issue linkification works for digit-containing prefixes like `P4Y-1`
- company page memory does not reject valid digit-containing prefixes
- existing `PAP-*` routes continue working

### 7.7 Rollout plan

Phase 1:

- Add shared validators.
- Allow explicit prefix at company creation.
- Add onboarding field.
- Keep settings read-only.
- Keep route and issue prefix coupled.

Phase 2:

- Add read-only settings section and next issue preview.
- Add import/export prefix preview.
- Centralize issue identifier parsing across backend/frontend.

Phase 3:

- Decide route split.
- Add `routeKey` if accepted.
- Expose safe prefix editing for future issues only.

Phase 4:

- Consider advanced historical identifier management:
  - aliases
  - redirects
  - explicit rewrite tool
  - audit trail

## 8. Open Questions For Discussion

1. Should the first implementation allow prefix edits after company creation, or only setup-time choice?

Recommendation: setup-time choice first, settings read-only. Editing later is safe only after route coupling is resolved or warnings/aliases exist.

2. Should company URL namespace remain identical to issue prefix?

Recommendation: split eventually. URL namespace and issue identity have different lifecycle needs.

3. Should issue prefix be globally unique?

Recommendation: yes while `issues.identifier` lookup remains global and route key remains coupled. If route key splits, global uniqueness is still convenient but could become a product decision.

4. Should imported companies preserve source prefixes automatically?

Recommendation: preserve as the default suggestion, but require conflict-free preview and allow operator override.

5. Should existing issue identifiers ever be rewritten after prefix changes?

Recommendation: no for this feature. Historical rewrite requires aliasing and audit semantics and should be a separate explicit tool.

6. Should future project/team prefixes supersede company prefixes?

Recommendation: not in this slice. Keep V1 company-level issue prefix but name utilities so project/team prefixes remain possible.

## 9. Recommended Next Slice

Implement Option C:

- setup-time configurable `issuePrefix`
- read-only post-creation display
- explicit backend validation
- no historical identifier rewrite
- no route split yet

This directly removes the current hard-coded company-name derivation as the only behavior, while avoiding the highest-risk route/identifier lifecycle problem.

Before implementation, decide:

- exact prefix length limit
- whether digits are allowed after the first character
- whether import flow is included in the first implementation or immediately after

