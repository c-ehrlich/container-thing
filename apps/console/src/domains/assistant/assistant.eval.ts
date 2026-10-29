import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createMockRailway } from "@repo/railway-mock";
import { generateText } from "ai";
import { describe, it } from "vitest";
import type { TestContext } from "vitest";
import type { z } from "zod";

import schema from "../../lib/graphql/railway-schema.graphql?raw";
import { env } from "../../server/env";
import { createMockRailwayClient } from "../../server/railway/mock-railway";
import type { RailwayClient } from "../../server/railway/railway-api";
import { deploymentState } from "../project/deployment-state";
import type { DeploymentState } from "../project/deployment-state";
import { pickEnvironment } from "../project/environments";
import { fetchProject } from "../project/project";
import { fetchViewer } from "../project/viewer";
import { assistantSettings } from "./assistant";
import type { ChatContext } from "./prompt";

/**
 * The questions the chat suggests, and ones like them, asked with the real model against a fresh mock.
 * Each checks what the user would see: the right widget with exactly the right rows, a short reply.
 * `EVAL_REPEATS=3 pnpm eval` asks each one three times, since the model doesn't answer the same way
 * every time, and `EVAL_VERBOSE=1` prints what it did and said.
 */

const model = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY }).chat(env.OPENROUTER_MODEL);
const repeats = Number(process.env.EVAL_REPEATS ?? 1) - 1;

const real: RailwayClient = () => Promise.reject(new Error("Not available in evals"));

/** A fresh mock, and every project's default environment in it. */
async function setup() {
  const railway = createMockRailwayClient(createMockRailway({ schema }), real);
  const { workspaces } = await fetchViewer(railway);
  const projects = await Promise.all(
    workspaces.flatMap((w) => w.projects).map((p) => fetchProject(railway, p.id)),
  );
  const services = projects.flatMap((project) => {
    const environment = pickEnvironment(project, undefined);
    return (environment?.services ?? []).map((service) => ({
      project,
      environmentId: environment?.id ?? "",
      service,
      kind: deploymentState(service.deployment).kind,
    }));
  });
  return { railway, projects, services };
}

async function ask(
  test: TestContext,
  railway: RailwayClient,
  prompt: string,
  context?: z.infer<typeof ChatContext>,
) {
  const result = await generateText({ ...assistantSettings(railway, context), model, prompt });
  const calls = result.steps.flatMap((step) => step.toolCalls);
  // A failure is only useful with what the model actually did. EVAL_VERBOSE=1 prints every answer.
  const transcript = () =>
    [
      `> ${prompt}`,
      ...calls.map((call) => `  ${call.toolName}(${JSON.stringify(call.input)})`),
      `  "${result.text}"`,
    ].join("\n");
  test.onTestFailed(() => console.log(transcript()));
  if (process.env.EVAL_VERBOSE) console.log(transcript());
  const results = result.steps.flatMap((step) => step.toolResults);
  const shownServices = results.flatMap((r) =>
    r.toolName === "showServices" && !r.dynamic ? r.output.services : [],
  );
  const shownProjects = results.flatMap((r) =>
    r.toolName === "showProjects" && !r.dynamic ? r.output.projects : [],
  );
  const started = calls.flatMap((call) =>
    call.toolName === "startService" && !call.dynamic ? [call.input.serviceId] : [],
  );
  return {
    calls: calls.map((call) => call.toolName),
    shownServices: shownServices.map((s) => s.serviceId).toSorted(),
    // The widget lists them, so the reply shouldn't.
    namedInReply: [...new Set(shownServices.map((s) => s.name))].filter((name) =>
      result.text
        .toLowerCase()
        .match(/[\w-]+/g)
        ?.includes(name.toLowerCase()),
    ),
    shownProjects: shownProjects.map((p) => p.id).toSorted(),
    started,
    approvals: result.steps
      .flatMap((step) => step.content)
      .flatMap((part) => (part.type === "tool-approval-request" ? [part.toolCall] : [])),
    text: result.text,
  };
}

const ids = (services: { service: { id: string } }[]) =>
  services.map((s) => s.service.id).toSorted();
const ofKind =
  (...kinds: DeploymentState["kind"][]) =>
  (s: { kind: DeploymentState["kind"] }) =>
    kinds.includes(s.kind);

describe.concurrent("assistant", () => {
  it.for([
    { prompt: "what paused services do i have", kinds: ["stopped"] as const },
    { prompt: "Which services are running?", kinds: ["running", "sleeping"] as const },
    { prompt: "is anything broken?", kinds: ["failed"] as const },
  ])("$prompt", { repeats }, async ({ prompt, kinds }, test) => {
    const { expect } = test;
    const { railway, services } = await setup();
    const answer = await ask(test, railway, prompt);

    expect(answer.calls.filter((name) => name === "showServices")).toHaveLength(1);
    expect(answer.shownServices).toEqual(ids(services.filter(ofKind(...kinds))));
    expect(answer.calls.length).toBeLessThanOrEqual(3);
    expect(answer.namedInReply).toEqual([]);
    expect(answer.text.length).toBeLessThan(200);
  });

  it("What projects do I have?", { repeats }, async (test) => {
    const { expect } = test;
    const { railway, projects } = await setup();
    const answer = await ask(test, railway, "What projects do I have?");

    expect(answer.calls.filter((name) => name === "showProjects")).toHaveLength(1);
    expect(answer.shownProjects).toEqual(projects.map((p) => p.id).toSorted());
    expect(answer.text.length).toBeLessThan(200);
  });

  it("scopes 'here' to the project on screen", { repeats }, async (test) => {
    const { expect } = test;
    const { railway, services } = await setup();
    const storefront = services.find((s) => s.project.name === "storefront")?.project;
    if (!storefront) throw new Error("The mock has no storefront project");
    const answer = await ask(test, railway, "what's running here?", { projectId: storefront.id });

    expect(answer.shownServices).toEqual(
      ids(
        services.filter((s) => s.project.id === storefront.id && ofKind("running", "sleeping")(s)),
      ),
    );
    expect(answer.namedInReply).toEqual([]);
    expect(answer.text.length).toBeLessThan(200);
  });

  it("finds a project by name", { repeats }, async (test) => {
    const { expect } = test;
    const { railway, services } = await setup();
    const answer = await ask(test, railway, "what services does umami have?");

    expect(answer.shownServices).toEqual(ids(services.filter((s) => s.project.name === "umami")));
    expect(answer.text.length).toBeLessThan(200);
  });

  it("says so when nothing matches", { repeats }, async (test) => {
    const { expect } = test;
    const { railway } = await setup();
    const answer = await ask(test, railway, "is anything broken in umami?");

    expect(answer.calls).toContain("showServices");
    expect(answer.shownServices).toEqual([]);
    expect(answer.text.length).toBeLessThan(200);
  });

  it("starts a service by name", { repeats }, async (test) => {
    const { expect } = test;
    const { railway, services } = await setup();
    const target = services.find((s) => s.service.name === "legacy-sync");
    if (!target) throw new Error("The mock has no legacy-sync service");
    const answer = await ask(test, railway, "start legacy-sync");

    expect(answer.started).toEqual([target.service.id]);
    expect(answer.calls).not.toContain("showServices");
    expect(answer.text.length).toBeLessThan(200);
  });

  it("asks before stopping", { repeats }, async (test) => {
    const { expect } = test;
    const { railway, services } = await setup();
    const answer = await ask(test, railway, "stop umami");
    const umami = services.find((s) => s.service.name === "umami");
    if (!umami) throw new Error("The mock has no umami service");

    expect(answer.approvals).toHaveLength(1);
    expect(answer.approvals[0]?.toolName).toBe("stopService");
    expect(answer.approvals[0]?.input).toMatchObject({ serviceId: umami.service.id });
  });
});
