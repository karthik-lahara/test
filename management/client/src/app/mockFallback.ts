// Registers every demo handler (side effect of the mocks entry point).
import "@/mocks";

import axios, { type AxiosInstance } from "axios";

import { MOCK_TOKEN_PREFIX, mockAdapter } from "@/mocks/router";

/**
 * Paths the backend has built (server/src/modules/index.ts). Every other call is answered by
 * the demo API in src/mocks, which already speaks the API contract (same paths, same shapes).
 * When a backend module is merged, add its prefix here and its calls switch to the server.
 */
export const BACKEND_PATHS = [
  "/auth/",
  "/organization/create",
  "/organization/list",
  "/organization/update/",
  "/organization/delete/",
  "/projects/list/",
  "/projects/details/",
  "/projects/update/",
  "/projects/delete/",
  "/work-item-statuses/",
];

/** Backend paths without a shared prefix. */
const BACKEND_PATTERNS = [
  // POST /projects/:organizationId creates a project
  /^\/projects\/[0-9a-f]{24}$/i,
  // GET /organization/members/:organizationId (members update and status are not built yet)
  /^\/organization\/members\/[0-9a-f]{24}$/i,
  // GET /projects/members/:projectId
  /^\/projects\/members\/[0-9a-f]{24}$/i,
];

const isBackendPath = (path: string) =>
  BACKEND_PATHS.some((prefix) => path.startsWith(prefix)) ||
  BACKEND_PATTERNS.some((pattern) => pattern.test(path));

/** The demo user the stand-in data answers as (an org admin, so every screen works). */
const STAND_IN_USER = "u_amal";

const pathOf = (url = "") => new URL(url, "http://x").pathname.replace(/^\/api/, "");

/**
 * Real backend for the paths in BACKEND_PATHS; demo data for everything the backend does
 * not have yet (dashboard, projects, work items...), instead of 404s.
 * The demo data in src/mocks is used as is.
 */
export function installMockFallback(client: AxiosInstance) {
  const realAdapter = axios.getAdapter(client.defaults.adapter);
  client.defaults.adapter = (config) => {
    const path = pathOf(config.url);
    if (isBackendPath(path)) return realAdapter(config);

    // Signed in on the real backend: answer as a demo user. Signed out: no token, so the
    // demo API answers 401 like the real one would.
    if (config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${MOCK_TOKEN_PREFIX}${STAND_IN_USER}`;
    }
    return mockAdapter(config);
  };
  console.info(
    `%cReal API%c for /auth, /organization and /projects. Everything else is demo data until the backend has it.`,
    "font-weight:bold;color:#7c6cff",
    "",
  );
}
