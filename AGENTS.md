- before starting dev and/or storybook servers, check if we already have ones running on 3000 and 6006
- use ui components from packages/ui where possible, we have all of shadcn in there
- run `pnpm format` before handing control back to the user, so everything is formatted

## Where code goes in apps/console/src

Each capability lives in one place, so it can be read (and demoed) from one folder.

- `domains/<capability>/`: the logic, data fetching (queries, server functions) and hooks of one capability, including its server-only parts (the live relay is `domains/live/relay.ts`). Domains export functions and hooks; JSX goes in `components/`. Where a domain has an `index.ts`, import through it and keep its overview comment current.
- `server/`: infrastructure only — env, auth and sessions, cache, the Railway client and its real/mock switch.
- `lib/`: infrastructure shared by browser and server (the gql.tada setup).
- `components/`: rendering. Changes to Railway go through `domains/actions` (`ActionButton`, `useRailwayAction`, `useProjectMutation`), which also refreshes the project afterwards.
- `routes/`: load data and compose components. Decisions about what to show are pure functions in a domain, with tests (like `domains/insights/triage.ts`).
- Key every query about a project under `projectScope(projectId)`: live pushes and actions refresh a project by invalidating that key, so a query outside it goes stale.
