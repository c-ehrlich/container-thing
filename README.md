# container-thing

A console for [Railway](https://railway.com) projects, with a chat assistant that can look things up and start or stop services. A pnpm + Turborepo monorepo.

## Running it locally

You need Node 26 or newer (`.nvmrc` has it, for nvm and fnm), a Railway account and an [OpenRouter](https://openrouter.ai) API key.

**1. Install.** pnpm 10 or newer works: inside the repo it switches to the version pinned in `package.json` by itself. `--allow-scripts` lets npm swap in pnpm's native binary, which starts faster.

```sh
npm i -g --allow-scripts=pnpm pnpm
pnpm install
```

**2. Create a Railway OAuth app.** In your Railway workspace settings, go to Developer → OAuth Apps and create one of type Web, with the redirect URI `http://localhost:3000/auth/callback`.

**3. Fill in `.env`.** Copy the example to the repo root (not `apps/console`) and fill it in:

```sh
cp .env.example .env
```

| Variable                                                 | Required | What it is                                                                                           |
| -------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET` | yes      | From the OAuth app in step 2.                                                                        |
| `SESSION_SECRET`                                         | yes      | Encrypts the session cookie. At least 32 characters: `openssl rand -base64 32`.                      |
| `OPENROUTER_API_KEY`                                     | yes      | For the chat assistant: [openrouter.ai/keys](https://openrouter.ai/keys).                            |
| `OPENROUTER_MODEL`                                       | no       | The assistant's model, any tool-capable one on OpenRouter. Defaults to `anthropic/claude-haiku-5.5`. |
| `APP_URL`                                                | no       | The app's public origin. Defaults to `http://localhost:3000`, which the redirect URI must match.     |

**4. Start it.**

```sh
pnpm dev
```

The console is at http://localhost:3000 and Storybook at http://localhost:6006. Sign in with Railway. If a variable is missing or invalid, the server's error names it.

To try it without touching your real projects, switch the sidebar's **Railway data** menu to **Mock data**: a fake Railway (`packages/railway-mock`) with far more data than a real account, where deploys take a few seconds and nothing is deployed for real. It still needs the Railway sign-in, since templates come from the real API.

## Repo layout

```
apps/console           The console: TanStack Start app, including the chat assistant
packages/ui            UI library (shadcn/ui on Base UI)
packages/form          TanStack Form wired to the field components in packages/ui
packages/railway-mock  A fake Railway that runs in the console's server, behind "Mock data"
docs/                  Design notes, e.g. how live updates work (realtime.md)
```

The packages are consumed as TypeScript source, with no build step. Where code goes inside `apps/console` is described in `AGENTS.md`.

## Commands

```sh
pnpm dev          # the console on :3000 + Storybook on :6006
pnpm test         # vitest
pnpm check        # format:check + lint + typecheck + test
pnpm format       # oxfmt
pnpm lint         # oxlint (type-aware)
pnpm --filter @repo/console eval   # the chat assistant against a real model (uses OPENROUTER_API_KEY)
```

`EVAL_REPEATS=3` asks each eval question three times, and `EVAL_VERBOSE=1` prints what the assistant did and said.

## Deploying

The console runs on [Railway](https://railway.com), built by Railpack from the repo root. The service is described in `.railway/railway.ts` ([docs](https://docs.railway.com/infrastructure-as-code)); Railway doesn't read it during deploys, it's applied with the Railway CLI:

```sh
railway config plan    # preview changes to the linked environment
railway config apply   # apply them
```

Secrets (`RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET`, `SESSION_SECRET`, `OPENROUTER_API_KEY`) are set in Railway as sealed variables. `APP_URL` defaults to the service's generated domain; register `<APP_URL>/auth/callback` on the Railway OAuth app. `OPENROUTER_MODEL` is optional, as locally.

## Tooling

- **TypeScript** (v7): shared strict config in `tsconfig.base.json`. Each package extends it and runs `tsc` through Turbo.
- **oxlint**: `.oxlintrc.json` at the root. Type-aware lint via `oxlint-tsgolint`. Warnings fail the run.
- **oxfmt**: `.oxfmtrc.json` at the root. Also sorts imports and package.json.
- Shared dependency versions live in the `catalog:` in `pnpm-workspace.yaml`.

Lint and format run once from the root because they're fast enough not to need Turbo. Typecheck and build run per package through Turbo so results are cached.

## UI package

shadcn/ui components built on [Base UI](https://base-ui.com) (not Radix), `base-nova` preset. Each primitive lives in `packages/ui/src/primitives/<name>/` next to its story.

```ts
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/primitives/button";

import "@repo/ui/styles.css"; // once, in the app's root stylesheet/entry
```

The components are copied from shadcn unchanged apart from import paths and formatting. Lint rules that flag upstream patterns are relaxed for `src/primitives` and `src/hooks` (see `.oxlintrc.json`), so updates from upstream stay easy to diff.

To add a component, generate it in a scratch project and copy it in:

```sh
pnpm dlx shadcn@latest init -t vite -b base -p nova -n scratch
cd scratch && pnpm dlx shadcn@latest add <name>
# copy src/components/ui/<name>.tsx -> packages/ui/src/primitives/<name>/<name>.tsx
# and rewrite `@/components/ui/x` imports to `../x/x`
```
