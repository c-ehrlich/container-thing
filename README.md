# container-thing

pnpm + Turborepo monorepo.

```
apps/console   TanStack Start app (soon)
packages/ui    UI library, consumed as TS source (no build step)
```

## Commands

```sh
pnpm install
pnpm dev          # all apps
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
