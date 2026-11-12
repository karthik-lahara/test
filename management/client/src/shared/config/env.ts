export const env = {
  /** Backend base URL: the server's port + /api. Set VITE_API_URL for other environments. */
  API_URL: (import.meta.env.VITE_API_URL as string | undefined) || "http://localhost:8080/api",
  /** Serve every API call from the in-browser demo data instead of the backend. */
  USE_MOCKS: import.meta.env.VITE_USE_MOCKS === "true",
  /**
   * With the real API: answer endpoints the backend has not built yet from demo data
   * instead of failing with 404. On unless set to "false".
   */
  MOCK_MISSING_ENDPOINTS: import.meta.env.VITE_MOCK_MISSING_ENDPOINTS !== "false",
} as const;
