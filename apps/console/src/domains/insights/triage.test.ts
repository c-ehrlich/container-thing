import { describe, expect, it } from "vitest";

import type { Project } from "../project/project";
import { NOW, project } from "./fixtures";
import { triage } from "./triage";

const crashed = () => project({ api: [["CRASHED", 10, "Add caching"]] });
const deploying = () => project({ api: [["DEPLOYING", 2, "Add caching"]] });
/** Off for a week: worth a suggestion, not an outage. */
const longStopped = () => project({ postgres: [["REMOVED", 8 * 24 * 60]] });
const renamed = (p: Project, id: string): Project => ({ ...p, id, name: id });

function run(projects: Project[], dismissed: string[] = [], projectCount = projects.length) {
  return triage(
    projects.map((p) => ({ project: p })),
    { isDismissed: (key) => dismissed.includes(key), projectCount, now: NOW },
  );
}

describe("triage", () => {
  it("says everything is fine when it is", () => {
    expect(run([project({})]).summary).toBe("Your project is fine.");
    expect(run([project({}), renamed(project({}), "blog")]).summary).toBe(
      "All 2 projects are fine.",
    );
  });

  it("puts a broken service under Needs you and leaves its project out of the cards", () => {
    const result = run([crashed(), renamed(project({}), "blog")]);
    expect(result.needsYou.map((i) => i.service.name)).toEqual(["api"]);
    expect(result.brokenProjects).toEqual(new Set(["storefront"]));
    expect(result.summary).toBe("1 thing needs you, everything else is fine.");
  });

  it("lists deploys in flight", () => {
    const result = run([deploying()]);
    expect(result.inFlight.map(({ service }) => service.name)).toEqual(["api"]);
    expect(result.needsYou).toEqual([]);
    expect(result.summary).toBe("1 deploy in flight, everything else is fine.");
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
    expect(result.summary).toBe("All 2 projects are fine.");
  });

  it("counts projects that didn't load in the summary", () => {
    expect(run([project({})], [], 3).summary).toBe("All 3 projects are fine.");
  });
});
