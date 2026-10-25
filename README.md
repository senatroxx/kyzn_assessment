# KYZN Fitness CRM

Implementation of the KYZN assessment's **Case Study A: CRM Dashboard** and **Case Study B: Lead Management**. Two independent React apps share an Express API and a persistent SQLite database.

The brief permits mock data/local persistence. A shared Express backend gives both apps one SQLite data source and one place to enforce validation, workflow transitions, and metric calculations. The trade-off is an additional API process plus environment, migration, and seed setup compared with a browser-only mock.

## Quick start

Prerequisites: **Bun** (verified with **1.4.3**) and a modern browser. No separate database server is needed.

From the repository root of a fresh checkout:

```bash
bun install --frozen-lockfile
cp .env.example .env
bun run db:setup
bun run dev
```

Keep an existing `.env` and compare it with `.env.example` instead of overwriting it. `db:setup` runs migrations then seeds synthetic records. The default database is `apps/api/data/kyzn.sqlite`.

| Application     | Default URL                      | Independent root command |
| --------------- | -------------------------------- | ------------------------ |
| Dashboard       | http://localhost:3000/           | `bun run dev:dashboard`  |
| Lead Management | http://localhost:3001/leads      | `bun run dev:leads`      |
| API health      | http://localhost:4000/api/health | `bun run dev:api`        |

Both frontends need the API. Stop processes with Ctrl+C. API startup opens the database but **never migrates, seeds, or resets it automatically**. Use root database scripts or `bun run --cwd apps/api ...` so environment and migration paths resolve correctly.

## Features

### Case Study A: Dashboard

Seven KPIs calculated from persisted data, with loading, error, zero-data, retry, and dashboard-wide refresh states. Additional sections show a 7/30-day acquisition trend, historical lifecycle milestones, and up to five follow-ups requiring attention with links into Lead Management.

These analytics extend the PDF's seven-KPI requirement. The period selector affects the acquisition chart only.

### Case Study B: Lead Management

- Create, view, and edit leads with shared Zod validation and API-side enforcement.
- Server-side pagination; name/phone/email search; combined source/consultant/status filters; creation-date and follow-up sorting in both directions, with null follow-up dates last. List state stays in the URL.
- Separate Name and Contact columns: names open details; phone/email use `tel:`/`mailto:`. Wider tables scroll; mobile rows stack with labels.
- Duplicate warnings based on phone **or** email, matching-record links, and valid duplicate submissions allowed.
- Lead workspace with activity history, follow-up scheduling, trial history/actions, paid conversion, and contextual expandable forms.

All eleven assessment fields are represented: ID, full name, phone, email, source, interested venue, assigned consultant, status, creation date, last contact date, and next follow-up date. Phone/email are required by this implementation. The API generates IDs/creation timestamps; workflow actions maintain status/contact history.

## Stack and architecture

| Workspace                                        | Implementation                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `apps/dashboard` (`@kyzn/dashboard`)             | React 19, Vite, TanStack Router/Query, Recharts                         |
| `apps/lead-management` (`@kyzn/lead-management`) | React 19, Vite, TanStack Router/Query/Table, React Hook Form            |
| `apps/api` (`@kyzn/api`)                         | Express 5 on Bun, Drizzle ORM, `bun:sqlite`                             |
| `packages/shared` (`@kyzn/shared`)               | Framework-independent Zod schemas and inferred TypeScript contracts     |
| `packages/ui` (`@kyzn/ui`)                       | Tailwind CSS v4 styles and shadcn/ui-compatible presentation primitives |

Bun Workspaces manages dependencies. TypeScript uses strict shared configuration; ESLint and Prettier provide checks. API modules separate routes/validation, business services, and repositories. Transactions protect workflow writes; SQLite enables foreign keys and enforces one conversion per lead.

TanStack Query owns server state. The apps use separate caches and communicate through the API. Select **Refresh dashboard** after Lead Management changes; there is no cross-tab live synchronization.

```text
apps/api/               # Source, versioned drizzle/ migrations, tests/
apps/dashboard/         # Dashboard routes, analytics, tests
apps/lead-management/   # Lead routes, forms, table, workflows, tests
packages/shared/        # Public TypeScript/Zod contracts and tests
packages/ui/            # Shared components, styles, tests
.env.example            # Local configuration template
bun.lock                # Locked dependency versions
package.json            # Workspace and root commands
```

The database contains leads, venues, consultants, activities, trials, and conversions.

## Environment

Both Vite apps read the root `.env`; the API validates its configuration with Zod.

| Variable                  | Default                                       | Purpose                                                |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `API_PORT`                | `4000`                                        | API port                                               |
| `API_HOST`                | `0.0.0.0`                                     | API bind address                                       |
| `API_CORS_ORIGINS`        | `http://localhost:3000,http://localhost:3001` | Allowed frontend origins                               |
| `DATABASE_PATH`           | `./data/kyzn.sqlite`                          | Path relative to `apps/api` for documented commands    |
| `BUSINESS_TIME_ZONE`      | `Asia/Jakarta`                                | API follow-up dates and trend boundaries               |
| `VITE_BUSINESS_TIME_ZONE` | `Asia/Jakarta`                                | Timestamp display; match the API timezone              |
| `VITE_DASHBOARD_PORT`     | `3000`                                        | Dashboard development port                             |
| `VITE_LEADS_PORT`         | `3001`                                        | Lead Management development port                       |
| `VITE_API_BASE_URL`       | `http://localhost:4000/api`                   | API base without trailing slash; requests append `/v1` |
| `VITE_DASHBOARD_URL`      | `http://localhost:3000`                       | Dashboard navigation destination                       |
| `VITE_LEADS_URL`          | `http://localhost:3001`                       | Lead Management navigation destination                 |

When changing ports, update URLs and CORS origins together. Vite uses strict ports. Restart after configuration changes; rebuild frontends for changed environment values.

Stored instants use UTC ISO-8601. Follow-ups are `YYYY-MM-DD` business dates with no display-date shift. Activity/trial time inputs use the device timezone, convert to UTC, and display persisted timestamps in the configured business timezone.

## Dashboard calculations and assumptions

The PDF requires documented inclusion policies but leaves their details open. The API implements these choices:

| Record state                   | Metric policy                                                               |
| ------------------------------ | --------------------------------------------------------------------------- |
| Soft-deleted (`deletedAt` set) | Excluded from every KPI, including related trial/conversion counts          |
| Status `invalid`               | Excluded from every KPI, including related trial/conversion counts          |
| Potential duplicate            | Included when otherwise eligible; warnings do not suppress or merge records |

**Eligible** means non-deleted and not invalid. Lost and converted leads remain eligible for totals and applicable record-based metrics. The default list hides deleted rows but retains invalid rows, so its total can differ from the dashboard.

| KPI                  | Calculation                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Total leads          | Eligible lead count                                                                                     |
| New leads            | Eligible leads currently `new`, regardless of creation date                                             |
| Follow-ups due today | Eligible open leads with a follow-up date **on or before** business-local today; includes overdue leads |
| Trials scheduled     | `scheduled` trial records belonging to eligible leads                                                   |
| Trials completed     | `completed` trial records belonging to eligible leads                                                   |
| Converted leads      | Distinct eligible leads with a conversion record                                                        |
| Conversion rate      | `convertedLeads / totalLeads * 100`; `0%` when total is zero                                            |

Open follow-up statuses are `new`, `contacted`, `trial_scheduled`, and `trial_completed`. Lost/converted/invalid/deleted leads are excluded from active follow-ups. Trial KPIs count **records**, not unique leads; cancelled/no-show records count in neither trial KPI. Profile status alone cannot fabricate attendance or conversion counts.

Additional analytics use the same eligibility policy. Acquisition includes zero-count days over the last 7/30 business-local dates, including today. Milestones count distinct leads with recorded contact, completed trials, or conversions; notes are not contacts. Each percentage uses total eligible leads. Stages are independent historical milestones, and conversion can skip trials. Attention lists show overdue/today follow-ups, oldest date first, with creation-time/ID tie-breaks.

## Workflows and demo data

Phone comparison removes formatting and maps Indonesian local numbers to `+62`; international `+` numbers are supported. Email comparison trims and lowercases. Matching either normalized value identifies duplicates; contact indexes are deliberately non-unique.

Profile editing changes name, phone, email, source, venue, consultant, and follow-up date. Status is workflow-owned:

- Calls/WhatsApp/email update the latest contact timestamp; notes do not. Activity time must be within the lead's lifetime and not future. A note can schedule/clear follow-up without recording a contact.
- New trials require `new`, `contacted`, or `trial_scheduled`. Only scheduled trials can change; attendance/no-show requires the scheduled time to have arrived. All trial history remains available.
- Conversion requires `contacted`, `trial_scheduled`, or `trial_completed`, permits one record per lead, and preserves trial history. Payment is a manual assertion with optional note/reference; no payment is processed or verified.

A fresh seed creates 11 synthetic leads: 10 visible in the list and 9 metric-eligible. It covers statuses, phone/email duplicates, overdue/today/future follow-ups, and scheduled/completed/cancelled/no-show trials. IDs are fixed; dates are relative to first seeding in Asia/Jakarta. Re-seeding preserves existing rows and dates.

Suggested review:

1. Search for Maya and inspect duplicate warnings/matching records.
2. Create/edit a lead, then log activity or schedule follow-up from its workspace.
3. Inspect trial history or schedule a future trial; premature attendance should fail.
4. Record a permitted conversion and refresh Dashboard to see persisted changes.

To recreate demo data, **check `DATABASE_PATH` and back up needed data first**. Reset deletes all CRM records, including non-seed rows, while keeping migration history:

```bash
bun run --cwd apps/api db:reset -- --confirm-reset
bun run db:seed
```

## Tests and builds

From the repository root:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
bun run format:check
```

API tests use Bun Test/Supertest and disposable SQLite databases. Frontend/shared tests use Vitest, with React Testing Library for components. Tests need neither running servers nor the demo database.

Focused examples:

```bash
bun run --cwd apps/api test tests/health.test.ts
bun run --cwd apps/lead-management test src/features/lead-form/LeadForm.test.tsx
```

Builds produce frontend `dist` assets and `apps/api/dist/index.js`; shared builds typecheck source exports. The API `start` script runs TypeScript. After building/database setup, `bun dist/index.js` runs the bundle from `apps/api`.

Quick API checks with default ports:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/v1/dashboard/metrics
```

Health returns `{"data":{"status":"ok"}}`. Business endpoints use `/api/v1`; health uses `/api/health`.

## Limitations and trade-offs

- Assessment/demo scope: no authentication, authorization, payment processing, external messaging, or deployment automation.
- No archive/delete, duplicate merge, or manual lost/invalid status actions. Seed data supplies those sample states.
- SQLite persists locally; frontend refreshes are independent. The small seed puts creation dates on one day, so the initial acquisition chart is sparse. Use the default timezone for intended seed scenarios.
- Separate frontends/shared backend and detailed metric semantics are implementation choices, beyond the brief's minimum requirements.
