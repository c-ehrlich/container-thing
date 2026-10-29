/**
 * Changes to Railway: everything the console does besides reading.
 *
 * - `RailwayAction` lists what buttons and insights can do to a service or deployment.
 *   `describeAction` says what it's called while it runs and whether to ask first.
 * - In the browser, `useRailwayAction` runs one and then refetches the project everywhere it's
 *   shown, so every screen agrees. `useProjectMutation` does the same for other writes.
 * - On the server, the chat's tools call `deployService` and `stopService` directly. The browser
 *   doesn't see those happen, so the chat calls `useRefreshProjectWhen` once a tool call finishes.
 *
 * Changes made outside the console reach the screen through live pushes (`domains/live`). All of
 * these refresh by invalidating `projectScope`, which is where to start reading.
 */
export {
  RailwayAction,
  createServiceFn,
  deployService,
  describeAction,
  stopService,
} from "./actions";
export { useProjectMutation, useRailwayAction, useRefreshProjectWhen } from "./use-railway-action";
