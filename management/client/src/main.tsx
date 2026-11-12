import "@/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/app/App";
import AppProviders from "@/app/providers";
import { env } from "@/shared/config/env";
import { axiosInstance } from "@/shared/lib/apiClient";

async function bootstrap() {
  if (env.USE_MOCKS) {
    // Loaded on demand so the demo data never ships in a normal build.
    const { installMockApi } = await import("@/mocks");
    installMockApi(axiosInstance);
    console.warn("[demo mode] API calls are answered in the browser; nothing reaches the server.");
  } else if (env.MOCK_MISSING_ENDPOINTS) {
    const { installMockFallback } = await import("@/app/mockFallback");
    installMockFallback(axiosInstance);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();
