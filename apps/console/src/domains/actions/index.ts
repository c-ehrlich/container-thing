/**
 * Changes to Railway: everything the console does besides reading.
 *
 * - `RailwayAction` lists what buttons and insights can do to a service or deployment.
 *   `describeAction` says what it's called while it runs and whether to ask first.
 * - In the browser, `useRailwayAction` runs one and then refetches the project everywhere it's
 *   shown, so every screen agrees. `useProjectMutation` does the same for other writes.
 * - On the server, the chat's tools call `deployService` and `stopService` directly.
 */
export {
  RailwayAction,
  createServiceFn,
  deployService,
  describeAction,
  stopService,
} from "./actions";
export { useProjectMutation, useRailwayAction } from "./use-railway-action";
