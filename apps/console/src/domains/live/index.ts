/**
 * Live data: keeps what's on screen in sync with Railway without refreshing. See docs/realtime.md for
 * what Railway offers and why it's built this way.
 *
 *   browser                                    server                     Railway
 *   use-live.ts      → query cache
 *     environment.ts → "something changed"
 *     logs.ts        → new log lines
 *       relay-client.ts ⇄ WebSocket ⇄ relay.ts (adds the token) ⇄ graphql-ws ⇄ public + internal API
 *
 * - `environment.ts` is the sync engine: it turns pushes into "refetch now", and says when pushes
 *   can't be trusted so the data polls instead. It knows nothing about React or TanStack Query.
 * - `transport.ts` is the interface between the engine and the wire, so tests can drive the engine
 *   with a fake connection.
 * - `use-live.ts` is the only part that knows about React and the query cache.
 *
 * Pushes are one of three ways a project gets refreshed; the other two are in `domains/actions`. See
 * `projectScope` in `domains/project/project.ts` for all three.
 */
export { useDeploymentLogStream, useWatchEnvironments } from "./use-live";
