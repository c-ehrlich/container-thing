import { describe, expect, it } from "vitest";

import { IMAGE_REF, imageBaseName, parseImageRef } from "./image-ref";

describe("parseImageRef", () => {
  it.each([
    ["postgres", { registry: null, repository: "postgres", tag: null }],
    ["postgres:18", { registry: null, repository: "postgres", tag: "18" }],
    ["traefik/whoami", { registry: null, repository: "traefik/whoami", tag: null }],
    ["traefik/whoami:v1.10", { registry: null, repository: "traefik/whoami", tag: "v1.10" }],
    ["ghcr.io/owner/repo:tag", { registry: "ghcr.io", repository: "owner/repo", tag: "tag" }],
    [
      "registry.gitlab.com/group/sub/repo",
      { registry: "registry.gitlab.com", repository: "group/sub/repo", tag: null },
    ],
  ])("splits %s", (ref, expected) => {
    expect(parseImageRef(ref)).toEqual(expected);
  });

  it("treats a first segment as a registry only if it looks like a host", () => {
    expect(parseImageRef("localhost/app").registry).toBe("localhost");
    expect(parseImageRef("localhost:5000/app:dev")).toEqual({
      registry: "localhost:5000",
      repository: "app",
      tag: "dev",
    });
    // No dot, port or `localhost`, so it's a Docker Hub namespace.
    expect(parseImageRef("myorg/app").registry).toBeNull();
  });

  it("reads the tag from the last colon, not a registry port", () => {
    expect(parseImageRef("registry.local:5000/app")).toEqual({
      registry: "registry.local:5000",
      repository: "app",
      tag: null,
    });
  });

  it.each(["docker.io/postgres", "docker.io/library/postgres", "library/postgres"])(
    "normalizes the Docker Hub spelling %s to postgres",
    (ref) => {
      expect(parseImageRef(ref)).toEqual({ registry: null, repository: "postgres", tag: null });
    },
  );

  it("ignores a digest", () => {
    expect(parseImageRef(`redis:8@sha256:${"a".repeat(64)}`)).toEqual({
      registry: null,
      repository: "redis",
      tag: "8",
    });
  });

  // The image field calls this on every keystroke, so half-typed input matters.
  it.each([
    ["", { registry: null, repository: "", tag: null }],
    ["  redis  ", { registry: null, repository: "redis", tag: null }],
    ["redis:", { registry: null, repository: "redis", tag: "" }],
    ["traefik/", { registry: null, repository: "traefik/", tag: null }],
    ["ghcr.io/", { registry: "ghcr.io", repository: "", tag: null }],
  ])("handles partial input %j", (ref, expected) => {
    expect(parseImageRef(ref)).toEqual(expected);
  });
});

describe("imageBaseName", () => {
  it.each([
    ["postgres:18", "postgres"],
    ["traefik/whoami", "whoami"],
    ["ghcr.io/owner/repo:tag", "repo"],
    ["", ""],
  ])("%j → %j", (ref, expected) => {
    expect(imageBaseName(ref)).toBe(expected);
  });
});

describe("IMAGE_REF", () => {
  it.each([
    "postgres",
    "postgres:18-alpine",
    "traefik/whoami:v1.10",
    "ghcr.io/owner/repo:latest",
    "localhost:5000/app",
    `redis@sha256:${"0".repeat(64)}`,
  ])("accepts %s", (ref) => {
    expect(ref).toMatch(IMAGE_REF);
  });

  it.each(["", "Postgres", "postgres:", "post gres", "-postgres", "redis:-bad", "a//b"])(
    "rejects %j",
    (ref) => {
      expect(ref).not.toMatch(IMAGE_REF);
    },
  );
});
