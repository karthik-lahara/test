import axios, { type InternalAxiosRequestConfig } from "axios";

import { env } from "@/shared/config/env";
import type { ApiResponse } from "@/shared/types/api";

import { authToken } from "./authToken";

export const axiosInstance = axios.create({
  baseURL: env.API_URL,
  headers: { "Content-Type": "application/json" },
  // Sends the httpOnly refresh-token cookie to /auth/refresh-token and /auth/logout
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const token = authToken.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** What /auth/login and /auth/refresh-token answer with. */
export interface SessionPayload<TUser = unknown> {
  accessToken: string;
  user: TUser;
}

let refreshing: Promise<SessionPayload> | null = null;

const REFRESH_LOCK = "tm.refresh-session";

/**
 * Runs `task` while holding a lock shared by every tab of this app, so tabs refresh one
 * after another. A tab that waited then sends the cookie the previous tab just received.
 * Browsers without Web Locks run the task directly.
 */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}

/**
 * Swaps the refresh-token cookie for a new access token (and a new refresh-token cookie).
 * Only one refresh runs at a time, in this tab and across tabs: the server rotates the
 * refresh token on every call and treats a second use of the old one as theft, ending
 * every session of the user.
 */
export function refreshSession(): Promise<SessionPayload> {
  refreshing ??= withRefreshLock(async () => {
    const { data } = await axiosInstance.post<ApiResponse<SessionPayload>>("/auth/refresh-token");
    authToken.set(data.data.accessToken);
    return data.data;
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

let handleUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  handleUnauthorized = handler;
}

// A 401 from these means "wrong credentials" or "no session", never "access token expired".
const AUTH_PATHS = ["/auth/login", "/auth/signup", "/auth/refresh-token", "/auth/logout"];

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      throw error;
    }
    const config = error.config as RetriableConfig;
    if (AUTH_PATHS.some((path) => config.url?.includes(path))) throw error;

    // The access token has probably expired: refresh once, then repeat the request.
    if (!config._retried) {
      config._retried = true;
      try {
        await refreshSession();
        return await axiosInstance(config);
      } catch (retryError) {
        if (!axios.isAxiosError(retryError) || retryError.response?.status !== 401) {
          throw retryError;
        }
      }
    }

    authToken.clear();
    handleUnauthorized?.();
    throw error;
  },
);
