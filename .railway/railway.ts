import { defineRailway, github, preserve, project, service } from "railway/iac";

/**
 * The Railway project this repo deploys to. `railway config plan` previews changes against the linked
 * environment, `railway config apply` makes them. Anything not listed here is deleted on apply.
 *
 * Generated `*.up.railway.app` domains aren't managed here: create one with `railway domain`.
 */
export default defineRailway(() => {
  const app = service("console", {
    source: github("c-ehrlich/container-thing", { branch: "main" }),
    build: {
      builder: "RAILPACK",
      // Railpack installs the whole workspace from the root, so turbo builds the packages it needs.
      buildCommand: "pnpm turbo run build --filter=@repo/console",
      // Only redeploy for changes that can affect the console.
      watchPatterns: [
        "/apps/console/**",
        "/packages/**",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
        "/turbo.json",
      ],
    },
    start: "node apps/console/.output/server/index.mjs",
    healthcheck: "/api/health",
    deploy: {
      // Start the new deployment before stopping the old one, and give open WebSockets a moment to
      // close. Browsers reconnect to the new deployment on their own.
      overlapSeconds: 10,
      drainingSeconds: 10,
    },
    env: {
      NODE_ENV: "production",
      // Secrets are set in Railway (sealed) and kept as they are. APP_URL defaults to the
      // generated domain; set it here once there's a custom domain.
      RAILWAY_OAUTH_CLIENT_ID: preserve(),
      RAILWAY_OAUTH_CLIENT_SECRET: preserve(),
      SESSION_SECRET: preserve(),
      OPENROUTER_API_KEY: preserve(),
    },
  });

  return project("container-thing", { resources: [app] });
});
