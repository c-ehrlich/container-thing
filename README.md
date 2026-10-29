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

The console is at http://localhost:3000 and Storybook at http://localhost:6006.

To try it without touching your real projects, switch the sidebar's **Railway data** menu to **Mock data**: a fake Railway (`packages/railway-mock`).

## Repo layout

```
apps/console           The console: TanStack Start app
packages/ui            UI library (shadcn/ui on Base UI)
packages/form          TanStack Form wired to the field components in packages/ui
packages/railway-mock  A fake Railway that runs in the console's server (much smaller functionality than real railway, only has the stuff that this console uses)
docs/                  Design notes, e.g. how live updates work (realtime.md)
```

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

The console runs on [Railway](https://railway.com), built by Railpack from the repo root. Keep `.nvmrc`: with it, Railpack uses the pinned pnpm from `package.json`; without it, Railpack falls back to its default pnpm 9 (check with `railpack info .`). The service is described in `.railway/railway.ts` ([docs](https://docs.railway.com/infrastructure-as-code)); Railway doesn't read it during deploys, it's applied with the Railway CLI:

```sh
railway config plan    # preview changes to the linked environment
railway config apply   # apply them
```

Secrets (`RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET`, `SESSION_SECRET`, `OPENROUTER_API_KEY`) are set in Railway as sealed variables. `APP_URL` defaults to the service's generated domain; register `<APP_URL>/auth/callback` on the Railway OAuth app. `OPENROUTER_MODEL` is optional, as locally.
