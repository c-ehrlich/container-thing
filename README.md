# container-thing

pnpm + Turborepo monorepo.

```
apps/console   TanStack Start app
packages/ui    UI library (shadcn/ui on Base UI), consumed as TS source (no build step)
```

## Commands

Uses pnpm 12 via Corepack. Node 24 bundles an older Corepack that can't run pnpm 12, so upgrade it once with `npm i -g corepack@latest`.

```sh
pnpm install
pnpm dev          # all apps + Storybook on :6006
pnpm check        # format:check + lint + typecheck
pnpm format       # oxfmt
pnpm lint         # oxlint (type-aware)
```

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
