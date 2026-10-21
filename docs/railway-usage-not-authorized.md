# Project usage: "Not Authorized" when metrics and estimate share a query

The project page asks Railway for two things about a project: CPU and memory per service over the
last day (`metrics`), and this month's estimated usage (`estimatedUsage`). Asked in one query with
the console's OAuth token, Railway answered `Not Authorized`, so the page showed no usage at all.
Asked as two queries, both succeed. `apps/console/src/railway/overview.ts` now sends two.

Seen on 2026-10-21 for project `bug-repros` (`adbd8ae2-27e2-4a4d-879a-2007c158a444`), through the
console. The curls below send the same queries; we haven't yet run these exact curls.

## Setup

`TOKEN` has to be an OAuth access token issued to the console, since that's where we saw it. A
personal or workspace API token may well behave differently. The console keeps its tokens in an
encrypted session cookie, so the easiest way to get one is to log it from the server temporarily.

```sh
export TOKEN=...   # OAuth access token (Bearer)
export PROJECT_ID=adbd8ae2-27e2-4a4d-879a-2007c158a444
# A day ago, in UTC. macOS date; on Linux use: date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ
export SINCE=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)
```

## 1. Both in one query: `Not Authorized`

```sh
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<EOF
{
  "query": "query ProjectUsage(\$id: String!, \$since: DateTime!) { metrics(projectId: \$id, startDate: \$since, sampleRateSeconds: 900, measurements: [CPU_USAGE, MEMORY_USAGE_GB], groupBy: [SERVICE_ID, ENVIRONMENT_ID]) { measurement tags { serviceId environmentId } values { ts value } } estimatedUsage(projectId: \$id, measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB]) { measurement estimatedValue } }",
  "variables": { "id": "$PROJECT_ID", "since": "$SINCE" }
}
EOF
```

What the console got back:

```json
{ "errors": [{ "message": "Not Authorized" }] }
```

## 2. Metrics alone: works

```sh
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<EOF
{
  "query": "query ProjectMetrics(\$id: String!, \$since: DateTime!) { metrics(projectId: \$id, startDate: \$since, sampleRateSeconds: 900, measurements: [CPU_USAGE, MEMORY_USAGE_GB], groupBy: [SERVICE_ID, ENVIRONMENT_ID]) { measurement tags { serviceId environmentId } values { ts value } } }",
  "variables": { "id": "$PROJECT_ID", "since": "$SINCE" }
}
EOF
```

Returns one series per service, environment and measurement, for example `httpbin`'s memory at
about 0.037 GB.

## 3. Estimate alone: works

```sh
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<EOF
{
  "query": "query ProjectEstimate(\$id: String!) { estimatedUsage(projectId: \$id, measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB]) { measurement estimatedValue } }",
  "variables": { "id": "$PROJECT_ID" }
}
EOF
```

Returns one estimate per measurement; at list prices that came to about $0.03 for the month.

## Open questions

- Does query 1 fail every time, or was it a transient error? It failed on both requests before the
  split and the halves have succeeded on every request since, but that's only a handful.
- Does it fail with a personal or workspace API token too, or only with OAuth tokens?
