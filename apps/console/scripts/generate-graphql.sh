#!/bin/sh
# Regenerates Railway's GraphQL schema and gql.tada's typed introspection (src/graphql/).
# gql.tada requires TypeScript 5.9's compiler API, so we use pnpm dlx with that version to run the generation.
set -eu
cd "$(dirname "$0")/.."

pnpm exec gql-tada generate-schema https://backboard.railway.com/graphql/v2 \
  --output src/graphql/railway-schema.graphql
pnpm dlx --package=gql.tada@1.11.4 --package=typescript@5.9 gql-tada generate output
