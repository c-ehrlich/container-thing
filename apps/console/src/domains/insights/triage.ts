import type { Project } from "../project/project";
import type { ProjectUsage } from "../project/usage";
import { healthOf } from "./health";
import type { ServiceWithState } from "./health";
import { FAILURE_RULES, insightsFor } from "./insights";
import type { Insight } from "./insights";

const isFailure = (i: Insight) => FAILURE_RULES.has(i.rule);

/** A failure insight, which is always about one service. */
export type FailureInsight = Insight & { service: ServiceWithState };

export type Triage = {
  /** Broken services, worst first, each shown as a card with its fix. */
  needsYou: FailureInsight[];
  /** Deploys still going. */
  inFlight: { project: Project; service: ServiceWithState }[];
  /** Everything else worth doing, for the side rail. */
  suggestions: Insight[];
  /** What the user dismissed, by where it would show, so it can be brought back. */
  dismissed: { needsYou: Insight[]; suggestions: Insight[] };
  /** Projects with a card under "Needs you", which aren't repeated as a project card. */
  brokenProjects: Set<string>;
};

/**
 * What the projects overview shows, and where: outages first with the fix on the card, then deploys
 * in flight, then the rest. A dismissed outage stops counting until something new happens to it.
 */
export function triage(
  projects: { project: Project; usage?: ProjectUsage }[],
  options: { isDismissed: (key: string) => boolean; now?: number },
): Triage {
  const insights = insightsFor(projects, options.now);
  const visible = insights.filter((i) => !options.isDismissed(i.key));
  const hidden = insights.filter((i) => options.isDismissed(i.key));

  const needsYou = visible.filter(
    (i): i is FailureInsight => isFailure(i) && i.service !== undefined,
  );
  const inFlight = projects.flatMap(({ project }) =>
    healthOf(project)
      .attention.filter((s) => s.state.kind === "pending")
      .map((service) => ({ project, service })),
  );

  return {
    needsYou,
    inFlight,
    suggestions: visible.filter((i) => !isFailure(i)),
    dismissed: {
      needsYou: hidden.filter(isFailure),
      suggestions: hidden.filter((i) => !isFailure(i)),
    },
    brokenProjects: new Set(needsYou.map((i) => i.project.id)),
  };
}
