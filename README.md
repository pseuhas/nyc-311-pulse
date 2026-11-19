# NYC 311 Pulse

A borough-by-borough view of what New Yorkers reported to 311 over the latest eligible seven-day window, compared with the previous seven days. Explore category changes, see the exact daily counts beneath the chart, and download the aggregate snapshot.

## Run locally

Requires Node.js 22+; no dependencies or API keys.

```sh
npm test
npm run build       # fetch official NYC Open Data; fails on bad/missing source data
npm run serve       # http://127.0.0.1:4173
```

If offline, run `npm run build:sample` instead. This emits deterministic **synthetic** data with a visible demo banner. The production job never falls back to synthetic counts.

## Try the dashboard

Select Brooklyn, expand **View exact daily counts**, and search for parking under **Reported problems**. Compare request volume against the same weekdays one week earlier. A change is a change in reported requests, not a measured change in underlying incidents.

## Data and architecture

[NYC Open Data: 311 Service Requests from 2020 to Present](https://data.cityofnewyork.us/d/erm2-nwe9) · [Socrata API](https://dev.socrata.com/foundry/data.cityofnewyork.us/erm2-nwe9)

```text
NYC Open Data / Socrata
  └─ SoQL: grouped count by New York date, borough, problem
      └─ Node: dates, three bounded attempts, schema and coverage validation
          └─ Static pulse.json
              └─ Browser: borough filtering, period comparison, chart, tables
```

- **Calendar logic:** two adjacent half-open seven-day windows in America/New_York, ending at the start of yesterday. This excludes today and yesterday to limit reporting lag and aligns weekdays across both windows. Comparisons are computed from requests' creation dates, not closing dates.
- **Privacy:** source query returns day, borough, problem, and count only. No person-level requests, addresses, coordinates, or tracking. Unrecognized boroughs become “Unspecified” and remain in the citywide totals.
- **Validation:** fail on empty or capped results, invalid dates/counts, or any date with no citywide records. On refresh failure an existing deployment is left intact. A successful prior snapshot becomes visibly stale after 36 hours. The UI marks actual fetch time separately from the reporting interval; neither implies completeness.
- **Interpretation:** requests are reports, not unique incidents. Counts reflect willingness and opportunity to report, not overall prevalence, and are not population-adjusted. Recent totals may change. Weekly changes are descriptive, not causal.
- **Tradeoffs:** Querying aggregates at the source is lighter and avoids collecting raw records; it gives up address-level drilldowns and independent reprocessing. Scheduled snapshots keep the app responsive and within free hosting constraints even when the upstream feed is slow, at the cost of not being real-time. A live proxy or database would add availability/credential duties without helping this daily use case.

Dataset use is subject to the [NYC Open Data terms](https://data.cityofnewyork.us/stories/s/Terms-of-Use/k9k7-3cje).

## Deploy

1. Push to a repository you own on `main` and enable **Settings → Pages → Build and deployment → GitHub Actions**. [GitHub's Pages guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. Open **Actions → Refresh and deploy NYC 311 Pulse → Run workflow**. The build runs tests and fetches only public data. It deploys the artifact directly; it does not commit generated data back to Git.
3. The site refreshes at about 17:37 UTC daily, subject to scheduler latency; use manual dispatch to refresh or diagnose a failed run. Public GitHub Free repositories support Pages. Scheduled public workflows may be disabled after prolonged repository inactivity; re-enable in Actions if needed.

## Maintenance and checks

- `npm test`: window boundaries and DST, source query contract, normalization, retry and hard failures, contiguous coverage, filter reconciliation, freshness and invalid data.
- `npm run build`: live-source integration test; investigate 429/5xx errors in Actions or retry later. Check the canonical dataset for schema changes if 400s recur.
- The static interface uses no map provider, analytics, remote scripts, or JS dependencies. You can host `dist/` on another static host unchanged.
