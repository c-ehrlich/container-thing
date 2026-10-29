import { describe, expect, it } from "vitest";

import type { Project } from "../project/project";
import { NOW, project } from "./fixtures";
import { triage } from "./triage";

const crashed = () => project({ api: [["CRASHED", 10, "Add caching"]] });
const deploying = () => project({ api: [["DEPLOYING", 2, "Add caching"]] });
/** Off for a week: worth a suggestion, not an outage. */
const longStopped = () => project({ postgres: [["REMOVED", 8 * 24 * 60]] });
const renamed = (p: Project, id: string): Project => ({ ...p, id, name: id });

function run(projects: Project[], dismissed: string[] = []) {
  return triage(
    projects.map((p) => ({ project: p })),
    { isDismissed: (key) => dismissed.includes(key), now: NOW },
  );
}

describe("triage", () => {
  it("puts a broken service under Needs you and leaves its project out of the cards", () => {
    const result = run([crashed(), renamed(project({}), "blog")]);
    expect(result.needsYou.map((i) => i.service.name)).toEqual(["api"]);
    expect(result.brokenProjects).toEqual(new Set(["storefront"]));
  });

  it("lists deploys in flight", () => {
    const result = run([deploying()]);
    expect(result.inFlight.map(({ service }) => service.name)).toEqual(["api"]);
    expect(result.needsYou).toEqual([]);
  });

  it("keeps insights that aren't outages for the side rail", () => {
    const result = run([longStopped()]);
    expect(result.suggestions.map((i) => i.rule)).toEqual(["long-stopped"]);
    expect(result.needsYou).toEqual([]);
  });

  it("moves dismissed insights aside, and a dismissed outage stops counting", () => {
    const failure = run([crashed()]).needsYou[0]?.key ?? "";
    const suggestion = run([longStopped()]).suggestions[0]?.key ?? "";

    const result = run([crashed(), renamed(longStopped(), "blog")], [failure, suggestion]);

    expect(result.needsYou).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.dismissed.needsYou.map((i) => i.key)).toEqual([failure]);
    expect(result.dismissed.suggestions.map((i) => i.key)).toEqual([suggestion]);
    // Its project shows as a card again.
    expect(result.brokenProjects.size).toBe(0);
  });
});
