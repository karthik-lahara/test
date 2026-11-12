import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { AxiosError } from "axios";

import type { ApiFieldError } from "@/shared/types/api";

export const MOCK_TOKEN_PREFIX = "mock-token:";

/** Throw from a handler to answer with an error status, like the real API would. */
export class MockHttpError extends Error {
  status: number;
  errors?: ApiFieldError[];

  constructor(status: number, message: string, errors?: ApiFieldError[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export interface MockContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  /** Signed-in user id; empty on public routes. */
  userId: string;
}

type Handler = (context: MockContext) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  isPublic: boolean;
}

const routes: Route[] = [];

/** Registers a handler. `:name` segments become `context.params.name`. */
export function route(
  method: string,
  path: string,
  handler: Handler,
  options: { isPublic?: boolean } = {},
) {
  const keys: string[] = [];
  const source = path.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  routes.push({
    method,
    pattern: new RegExp(`^${source}$`),
    keys,
    handler,
    isPublic: options.isPublic ?? false,
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config };
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? "get").toUpperCase();
  const url = new URL(config.url ?? "", "http://mock.local");
  const path = url.pathname.replace(/^\/api/, "");
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => (query[key] = value));
  for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") query[key] = String(value);
  }

  await wait(path.startsWith("/ai/") ? 900 : 120 + Math.random() * 160);

  const match = routes.find((r) => r.method === method && r.pattern.test(path));
  if (!match) {
    return Promise.reject(
      new AxiosError(
        `No mock for ${method} ${path}`,
        "ERR_BAD_REQUEST",
        config,
        null,
        respond(config, 404, { success: false, message: `No mock for ${method} ${path}` }),
      ),
    );
  }

  const auth = String(config.headers?.Authorization ?? "");
  const userId = auth.startsWith(`Bearer ${MOCK_TOKEN_PREFIX}`)
    ? auth.slice(`Bearer ${MOCK_TOKEN_PREFIX}`.length)
    : "";
  if (!match.isPublic && !userId) {
    return Promise.reject(
      new AxiosError(
        "Unauthorized",
        "ERR_BAD_REQUEST",
        config,
        null,
        respond(config, 401, { success: false, message: "Please sign in." }),
      ),
    );
  }

  const values = match.pattern.exec(path)!.slice(1);
  const params = Object.fromEntries(
    match.keys.map((key, index) => [key, decodeURIComponent(values[index])]),
  );
  let body: Record<string, unknown> = {};
  if (typeof config.data === "string" && config.data)
    body = JSON.parse(config.data) as Record<string, unknown>;
  // multipart/form-data (attachments): files arrive as { name, size, type }, nothing is stored.
  if (config.data instanceof FormData) {
    config.data.forEach((value, key) => {
      body[key] =
        value instanceof File ? { name: value.name, size: value.size, type: value.type } : value;
    });
  }

  try {
    const data = match.handler({ params, query, body, userId });
    return respond(config, method === "POST" ? 201 : 200, {
      success: true,
      message: "OK",
      data: data ?? null,
    });
  } catch (error) {
    if (error instanceof MockHttpError) {
      return Promise.reject(
        new AxiosError(
          error.message,
          "ERR_BAD_REQUEST",
          config,
          null,
          respond(config, error.status, {
            success: false,
            message: error.message,
            errors: error.errors,
          }),
        ),
      );
    }
    throw error;
  }
};
