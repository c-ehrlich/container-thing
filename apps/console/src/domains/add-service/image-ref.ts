/**
 * A Docker image reference like `postgres:18`, `traefik/whoami` or `ghcr.io/owner/repo:tag`, roughly
 * following the grammar Docker itself accepts.
 */
export const IMAGE_REF =
  /^(?:[a-z0-9.-]+(?::\d+)?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::\w[\w.-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/;

export interface ImageRef {
  /** `null` for Docker Hub. */
  registry: string | null;
  /** The repository without registry or tag, e.g. `postgres` or `traefik/whoami`. */
  repository: string;
  tag: string | null;
}

const DOCKER_HUB_HOSTS = new Set(["docker.io", "index.docker.io", "registry-1.docker.io"]);

/** Splits a (possibly partial, as typed) image reference into its parts. */
export function parseImageRef(ref: string): ImageRef {
  const withoutDigest = ref.trim().split("@")[0] ?? "";
  const segments = withoutDigest.split("/");
  // Docker treats the first segment as a registry host only if it looks like one.
  const first = segments[0] ?? "";
  const hasRegistry =
    segments.length > 1 && (first.includes(".") || first.includes(":") || first === "localhost");
  const registry = hasRegistry ? first : null;
  const path = (hasRegistry ? segments.slice(1) : segments).join("/");

  const colon = path.lastIndexOf(":");
  const repository = colon === -1 ? path : path.slice(0, colon);
  const tag = colon === -1 ? null : path.slice(colon + 1);
  if (registry !== null && !DOCKER_HUB_HOSTS.has(registry)) return { registry, repository, tag };
  // Official images are `library/<name>` on Docker Hub, but everyone writes just the name.
  return { registry: null, repository: repository.replace(/^library\//, ""), tag };
}

/** The last path segment, which makes a good default service name: `traefik/whoami` → `whoami`. */
export function imageBaseName(ref: string) {
  return parseImageRef(ref).repository.split("/").at(-1) ?? "";
}
