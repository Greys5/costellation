# Costellation — Cloud Cost Intelligence

Copyright (c) 2026 Greysa Santander Ferreira. All rights reserved.
Proprietary software; see [LICENSE](LICENSE). Third-party components retain their respective licenses.

Connect the dots in your cloud spend. A local, read-only AWS billing dashboard for Platform and Finance. Account inventory, 12 completed months plus the current month, account/service/region exploration, CSV exports, and cost allocation tag assessment.

## Run

Requires Python 3.11+ with venv, Node.js 24.22+ LTS (24.x), npm, AWS CLI, and an existing AWS SSO profile with management-account billing access.

```bash
cd costellation
nvm install
nvm use
export AWS_PROFILE=your-management-profile
aws sso login --profile "$AWS_PROFILE"
./run.sh
```

Open **http://127.0.0.1:8000**. The script synchronizes dependencies from the lockfiles and builds the frontend on every run, including upgrades from an earlier checkout. Stop with Ctrl+C. Set `PORT` to use another local port. No AWS resources are deployed.

For development, run the API and frontend in separate terminals:

```bash
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
npm run dev
```

Vite proxies `/api` to the local backend. The production build is served by FastAPI on one origin. API reference: `/api/docs`.

## Backstage foundation and dependencies

The frontend boots through Backstage's `createApp` from `@backstage/frontend-defaults`. Costellation is registered as a frontend plugin using `createFrontendPlugin` and `PageBlueprint`. A layout extension preserves its navigation and visual identity. The local read-only billing service remains FastAPI/Boto3; this pilot does not install a Backstage catalog, scaffolder, or Node backend. Local AWS SSO remains the access boundary, with no additional portal login.

Direct dependencies were checked against the official [npm registry](https://registry.npmjs.org/) and [PyPI](https://pypi.org/) on October 16, 2026, and pinned. `package-lock.json` and the hash-verified `requirements.lock` capture resolved dependencies. Recheck with `python3 scripts/check-dependency-versions.py`.

React 18, its matching type packages, and React Router 6 use the newest releases accepted by the stable Backstage packages' peer requirements. Forcing newer unsupported majors would break that compatibility contract. Targeted Material UI 4 peer overrides reflect Backstage's React 18 baseline; they do not upgrade its legacy UI dependencies to incompatible majors. PrismJS is overridden to its patched 1.30.0 release.

Backstage's dependency tree still includes upstream moderate security advisories affecting legacy Octokit and Router packages. No GitHub integration or server-side rendering is configured here. These limitations must be reassessed before shared deployment; `npm audit` reports them rather than suppressing them. Do not use `npm audit fix --force` to downgrade Backstage or force unsupported framework majors.

Framework references: [Backstage app instances](https://backstage.io/docs/frontend-system/architecture/app/), [frontend plugins](https://backstage.io/docs/frontend-system/building-plugins/index/), and [release compatibility](https://backstage.io/docs/overview/versioning-policy/).

## Using the dashboard

- **Overview:** organization totals, month-to-date comparison, monthly history, and top accounts/services. Export the account report.
- **Accounts:** all current organization accounts, including zero-cost accounts; preserve historical billed accounts. Search by account name or ID. Select an account to explore its services. CSV follows the account search.
- **Cost Explorer:** visible tabs separate all spending from first seen resources. All spending opens with a six-calendar-month overview (current month included). Choose **Custom range** for explicit dates and monthly/daily granularity, **Month** for daily bars across a month selected from a dropdown (optionally limit to an inclusive range of days), or **Week** to compare all weeks of a dropdown-selected month. Weeks are days 1–7, 8–14, 15–21, 22–28, and 29–month end; current periods stop at the latest completed day. Charts combine spending bars with a line joining their values to show changes between periods. Account, service, region, and active cost-allocation-tag filters apply in every period. Values within a dimension use OR; different dimensions use AND. Export follows the selected query window.
- **First seen EC2 resources:** in Explore Spending, switch the spending view to first seen resources, filter accounts, and group arrivals weekly or monthly. The paired bar chart shows resource count and subsequent spend; the table maps each resource ID to its account. This uses the latest 14 completed days of opted-in Cost Explorer resource-level data for **EC2 Compute only**. “First seen” means first positive spend in that window, not resource creation. IDs already present on the first day are excluded; missing resource IDs and other AWS services are not classified. A monthly bucket therefore covers only the portion inside the 14-day window.
- **Tags:** active/inactive billing tag inventory, per-tag net-cost allocation coverage, existing naming variants, and proposed business dimensions. Assessment only; no tag changes or activation.

## Cost definitions

- Default **UnblendedCost** preserves costs as AWS books them to accounts, including Savings Plans commitments, credits, refunds, and other charge types. Costs booked to the management account remain there.
- **AmortizedCost** provides AWS's amortized view for commitment-based spending. Both views are USD and labeled throughout.
- All date ends are **exclusive**. Current-day data is excluded using UTC, matching AWS billing periods. Current-month daily views run from the first day to today, exclusive.
- Current-month change compares the same elapsed number of days in the previous month, capped at that month's length. A zero or negative comparison base has no displayed percentage.
- AWS `Estimated` flags are preserved. A completed month may still be revised by AWS; this is Cost Explorer data, not an invoice reconciliation.
- Grouped explorer results are checked against an independent ungrouped query. Backend sums use `Decimal`; charts and formatted display use numbers rounded for presentation. CSV preserves AWS precision.
- Tag coverage means **spend attribution**, not the percentage of resources tagged. Tags do not apply to every charge type. Negative credits/refunds can make a net-cost percentage unsuitable; the dashboard then displays amounts only.

## AWS access and data handling

The backend uses the SSO profile selected by `AWS_PROFILE`, falling back to `default`. No credentials are sent to the browser or saved in the project. Required AWS read actions:

```text
sts:GetCallerIdentity
organizations:DescribeOrganization
organizations:ListAccounts
ce:GetCostAndUsage
ce:GetDimensionValues
ce:GetTags
ce:ListCostAllocationTags
```

Organization-wide billing access must be available through the management account. Renew expired access with `aws sso login --profile "$AWS_PROFILE"`, then retry. Cost Explorer API calls can incur AWS charges.

Responses are stored in `.cache/billing.sqlite3` for 24 hours, keyed by profile and query. Refresh fetches current data for the visible page; normal navigation uses the cache. Retrieval timestamps show when data was fetched, not when AWS last updated billing. Cache misses are serialized to avoid duplicate paid calls. Failed refreshes return an error, never zero costs; previous successful cache entries are preserved until expiry or successful refresh. To remove local billing data, stop the app and delete `.cache/` and `exports/`.

The application binds to localhost, rejects nonlocal hosts/origins, and has no AWS write routes. Caches, exports, dependencies, builds, environment files, and `.local/` notes are ignored by Git. Keep billing screenshots and reports in `exports/`. This pilot uses the local operator's SSO session; shared hosting and company login require a separate deployment design.

## Verification

```bash
.venv/bin/python -m pytest -q
npm test
npm run build
```

Tests cover pagination, precise and negative costs, zero-cost/historical accounts, date validation, cache expiry/failures, unavailable billing data, expired SSO, grouping reconciliation, CSV filtering/formula protection, local-origin enforcement, UI refresh caching, stale-response races, and active-tag selection.

Tests use synthetic account identifiers and costs. Live billing data and screenshots are local artifacts and are not included in this repository.
