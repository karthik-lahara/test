import axios from "axios";

import type { ApiErrorResponse } from "@/shared/types/api";

export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    if (!error.response) {
      return "Cannot reach the server. Check your connection and try again.";
    }
    return error.response.data?.message ?? fallback;
  }
  return fallback;
}
