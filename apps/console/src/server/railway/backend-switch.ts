import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Backend, writeBackend } from "./backend";
import { mockRailway } from "./mock-railway";
import { requireRailway } from "./require-railway";

/** Picks the backend for this browser. The page has to reload after, see `BackendMenu`. */
export const setBackendFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(z.object({ backend: Backend }))
  .handler(({ data }) => writeBackend(data.backend));

/** Puts the mock back to its starting data, for everyone using it. */
export const resetMockFn = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .handler(() => mockRailway().reset());

const getMockStatsFn = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .handler(() => mockRailway().stats());

export const mockStatsQuery = () =>
  queryOptions({ queryKey: ["mock-stats"], queryFn: () => getMockStatsFn() });
