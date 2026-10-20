import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { imageBaseName, parseImageRef } from "../docker/image-ref";
import { MemoryCache, createCachedLoader } from "../server/cache";
import { graphql } from "./graphql/graphql";
import type { RailwayClient } from "./railway-api";
import { requireRailway } from "./require-railway";

/**
 * Images don't declare which environment variables they need; that's only in their READMEs. Railway's
 * templates do, with descriptions and defaults (including generated secrets), so for a picked image we
 * borrow the variables of the template that deploys it.
 */

const SuggestedVariable = z.object({
  key: z.string(),
  value: z.string(),
  description: z.string().nullable(),
  required: z.boolean(),
});
export type SuggestedVariable = z.infer<typeof SuggestedVariable>;

const TemplateSuggestion = z.object({
  templateName: z.string(),
  variables: z.array(SuggestedVariable),
  /**
   * Template settings we don't apply, but which the variables may rely on: Railway's Redis template
   * only enforces `REDIS_PASSWORD` through its start command, for example.
   */
  volumeMountPath: z.string().nullable(),
  startCommand: z.string().nullable(),
});
export type TemplateSuggestion = z.infer<typeof TemplateSuggestion>;

// Railway's API allows as little as 100 requests an hour (Free plan), and templates rarely change,
// so suggestions are shared between users and refreshed daily. Per server process, like Docker Hub's.
const DAY = 24 * 60 * 60_000;
const cached = createCachedLoader(new MemoryCache({ maxEntries: 1_000 }), { keepMs: 7 * DAY });

const TemplateSearchQuery = graphql(`
  query TemplateSearch($query: String!) {
    templateSearch(query: $query, first: 6) {
      edges {
        node {
          code
          name
          isVerified
          deploymentCount
        }
      }
    }
  }
`);

const TemplateConfigQuery = graphql(`
  query TemplateConfig($code: String!) {
    template(code: $code) {
      code
      name
      isVerified
      serializedConfig
    }
  }
`);

/** The parts of `serializedConfig` we use. It's untyped JSON in the schema. */
const SerializedConfig = z.object({
  services: z.record(
    z.string(),
    z.object({
      source: z.object({ image: z.string().nullish() }).nullish(),
      variables: z
        .record(
          z.string(),
          z.object({
            defaultValue: z.string().nullish(),
            description: z.string().nullish(),
            isOptional: z.boolean().nullish(),
          }),
        )
        .nullish(),
      volumeMounts: z.record(z.string(), z.object({ mountPath: z.string() })).nullish(),
      deploy: z.object({ startCommand: z.string().nullish() }).nullish(),
    }),
  ),
});
type TemplateService = z.infer<typeof SerializedConfig>["services"][string];

/** The suggestion for an image's repository; the tag doesn't change which variables it wants. */
export function findTemplateSuggestion(railway: RailwayClient, image: string) {
  const { registry, repository } = parseImageRef(image);
  return cached(
    `railway-template:${registry ?? "docker.io"}/${repository}`,
    { schema: TemplateSuggestion.nullable(), refreshAfterMs: DAY },
    () => lookUpTemplate(railway, image),
  );
}

async function lookUpTemplate(
  railway: RailwayClient,
  image: string,
): Promise<TemplateSuggestion | null> {
  const name = imageBaseName(image);
  if (!name) return null;

  // Popular images usually have a template named after them, like `postgres` or `redis`, which
  // saves searching and then fetching every result.
  const direct = await fetchTemplate(railway, name);
  if (direct) return toSuggestion(direct.name, direct.service);

  // Otherwise, a search result counts if it deploys the same image.
  const { templateSearch } = await railway(TemplateSearchQuery, { query: name });
  const target = parseImageRef(image).repository;
  const candidates = await Promise.all(
    templateSearch.edges
      .filter(({ node }) => node.code !== name)
      .map(async ({ node }) => ({ node, template: await fetchTemplate(railway, node.code) })),
  );
  const best = candidates
    .filter(
      (c): c is typeof c & { template: NonNullable<typeof c.template> } =>
        c.template?.service.source?.image != null &&
        parseImageRef(c.template.service.source.image).repository === target,
    )
    .toSorted(
      (a, b) =>
        Number(b.node.isVerified) - Number(a.node.isVerified) ||
        b.node.deploymentCount - a.node.deploymentCount,
    )[0];
  return best ? toSuggestion(best.node.name, best.template.service) : null;
}

/**
 * The template's only service, or `null` if there's no such template or it deploys several services.
 * Only single-service templates count, so the variables are about this image and not a whole stack.
 */
async function fetchTemplate(railway: RailwayClient, code: string) {
  // Railway answers an unknown code with an error.
  const result = await railway(TemplateConfigQuery, { code }).catch(() => null);
  const config = SerializedConfig.safeParse(result?.template.serializedConfig);
  const services = config.success ? Object.values(config.data.services) : [];
  const [service] = services;
  return result && service && services.length === 1
    ? { name: result.template.name, service }
    : null;
}

function toSuggestion(templateName: string, service: TemplateService): TemplateSuggestion {
  const variables = Object.entries(service.variables ?? {}).map(([key, v]) => ({
    key,
    value: v.defaultValue ?? "",
    description: v.description || null,
    required: !v.isOptional,
  }));
  return {
    templateName,
    // Required first; otherwise keep the template's order.
    variables: variables.toSorted((a, b) => Number(b.required) - Number(a.required)),
    volumeMountPath: Object.values(service.volumeMounts ?? {})[0]?.mountPath ?? null,
    startCommand: service.deploy?.startCommand || null,
  };
}

const findTemplateSuggestionFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ image: z.string().min(1) }))
  .handler(({ data, context }) => findTemplateSuggestion(context.railway, data.image));

export const templateSuggestionQuery = (image: string) =>
  queryOptions({
    // Tags don't change which variables an image wants.
    queryKey: [
      "template-suggestion",
      parseImageRef(image).registry,
      parseImageRef(image).repository,
    ],
    queryFn: () => findTemplateSuggestionFn({ data: { image } }),
    staleTime: 60 * 60_000,
  });
