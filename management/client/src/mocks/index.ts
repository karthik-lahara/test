import "./handlers/core";
import "./handlers/projects";
import "./handlers/workItems";
import "./handlers/ai";
import "./handlers/assistant";

import type { AxiosInstance } from "axios";

import { mockAdapter } from "./router";

/** Serves every API call from in-browser demo data. Mock and real responses share one shape. */
export function installMockApi(client: AxiosInstance) {
  client.defaults.adapter = mockAdapter;
  console.info(
    "%cDemo mode%c API calls are answered by mock data. Sign in with amal@lahara.dev / demo123.",
    "font-weight:bold;color:#7c6cff",
    "",
  );
}
