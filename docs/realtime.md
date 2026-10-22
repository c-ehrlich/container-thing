# Real-time container state

How the console keeps deployment state live, and why. Findings marked _measured_ were observed against
Railway's API on 2026-10-18/19 with a `project:member` OAuth token.

## What Railway offers

Public API (`wss://backboard.railway.com/graphql/v2`, `graphql-transport-ws` protocol):

| Subscription                     | Scope          | Notes                                                                                                                         |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `deployment(id)`                 | one deployment | _Measured:_ pushes `SUCCESS`, `REMOVING`, `REMOVED`; **not** `QUEUED`/`INITIALIZING`/`DEPLOYING`. Sends nothing on subscribe. |
| `deploymentEvents(id)`           | one deployment | _Measured:_ steps `CREATE_CONTAINER` → `CONFIGURE_NETWORK` → `DRAIN_INSTANCES`, arriving in a burst ~14 s after deploy.       |
| `deploymentInstanceExecutions`   | one deployment | _Measured:_ nothing during a full deploy and remove. Don't rely on it.                                                        |
| `httpLogs(deploymentId)`         | one deployment | Data-plane health (5xx counts). Later.                                                                                        |
| `environmentLogs(environmentId)` | environment    | Every line tagged with `deploymentId`; empty heartbeat every ~5 s.                                                            |

Nothing in the public API pushes "a deployment was created in this environment".

Auth: a server can authenticate the socket by sending `{ Authorization: "Bearer <token>" }` as the
`connection_init` payload (_measured_; without it: "Problem processing request").

Rate limits: 1000 requests/hour on Hobby. Responses to OAuth tokens only carry `RateLimit-Policy`, not
`X-RateLimit-Remaining`, so whether subscriptions count could not be measured. Docs don't say.

## How Railway's dashboard does it

_Measured_ by recording the dashboard while deploying from outside it:

- The browser speaks `graphql-ws` directly to `backboard.railway.com/graphql/internal`, authenticated by
  its session cookie. A second, custom socket (`/lww/<projectId>`) syncs canvas positions and presence.
- 🐉🐉🐉 It subscribes to **`canvasInvalidation(environmentId) { id }`** (internal API only). The `id` is
  a hash of the environment's state, re-sent every 2 → 4 → 8 s. ~1 s after an outside deploy the hash
  changed and the dashboard refetched `project` and `environmentConfig` over HTTP.
- Every push is a _signal_; data always comes from a refetch.

## Decisions

**Transport: our server relays `graphql-ws`.** The browser can't talk to Railway directly without
holding the token. A thin WebSocket relay that injects the token into `connection_init` and only lets
`subscribe` through keeps one protocol end to end, lets the client subscribe and unsubscribe on one
socket, and keeps queries and mutations in server functions. The relay closes the socket before the
access token expires; the client reconnects and the new upgrade request reads the refreshed cookie.
Fallback if Nitro WebSockets don't work under TanStack Start: an SSE route.

**Discovering deployments started elsewhere: `canvasInvalidation`** 🐉🐉🐉. Undocumented and on the
internal endpoint, so: typed by hand and validated with Zod, and if the subscription errors, fall back to
polling `deployments` every 30 s. Product feedback for Railway: a public `environmentChanged`
subscription would let third-party apps match the dashboard.

_Measured:_ Railway **completes `canvasInvalidation` after exactly 95 s** (14 pushes), even on a direct
connection. Public subscriptions don't (`environmentLogs` ran 240 s; `deployment(id)` well past 95 s).
Before we handled this, tabs silently stopped noticing outside changes after 95 s while still showing
"Live": stops kept syncing via `deployment(id)`, starts (only visible through the hash) didn't. So:

- `keepSubscribed` (`domains/live/transport.ts`) resubscribes when the server completes a subscription (with a back-off if one keeps
  completing within 10 s).
- A watchdog treats 30 s without a hash (normally re-sent every ≤ 8 s) as "🐉 down" and polls until
  pushes resume.

**State: one writer per piece of data.** Pushes are signals; the server stays the source of truth.

## Phases

1. **Refetch only.** Relay + `canvasInvalidation` (polling fallback). Per-deployment events trigger a
   debounced (~250 ms) refetch. TanStack Query holds all state.
2. **Reducer.** A pure `reduce(state, event)` returning `{ kind: "applied", state }` or
   `{ kind: "resync", reason }`. Applied to the Query cache; `resync` falls back to phase 1's refetch.
   Ordering via `Deployment.statusUpdatedAt` (newer wins). Unit-tested against fixtures recorded from
   real traffic. Only events with payloads go through it:

   | Event                             | Handling                     |
   | --------------------------------- | ---------------------------- |
   | `canvasInvalidation` hash changed | always refetch (no payload)  |
   | `deployment(id)` status           | reducer                      |
   | `deploymentEvents(id)` step       | reducer (append to timeline) |
   | `httpLogs` 5xx                    | reducer (health)             |
   | anything unexpected               | `resync`                     |

3. **TanStack DB (optional).** Same reducer, output written to collections; adds optimistic
   spin up / spin down with rollback. TanStack DB is pre-1.0 (0.5.x as of 2026-10).
