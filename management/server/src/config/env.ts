import dotenv from "dotenv";
import path from "path";
import { existsSync } from "fs";

// Load base .env, then an environment-specific one (e.g. .env.production) if present
dotenv.config({ quiet: true });
const NODE_ENV = process.env.NODE_ENV || "development";
const envFile = path.resolve(process.cwd(), `.env.${NODE_ENV}`);
if (existsSync(envFile)) dotenv.config({ path: envFile, override: true, quiet: true });

/** Accepts `a,b,c` or a JSON array `["a","b"]` */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return (JSON.parse(trimmed) as unknown[]).map(String);
    } catch {
      /* fall through to comma parsing */
    }
  }
  return trimmed.split(",").map((v) => v.trim()).filter(Boolean);
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

/**
 * Every environment variable is read and validated here, once, at startup.
 * Elsewhere read config only through `env`, never `process.env`.
 */
export const env = {
  NODE_ENV,
  isProduction: NODE_ENV === "production",
  PORT: Number(process.env.PORT) || 8080,
  MONGO_URI: required("MONGO_URI"),

  CORS_WHITELIST: parseList(process.env.CORS_WHITELIST),

  USER_ACCESS_TOKEN_SECRET: required("USER_ACCESS_TOKEN_SECRET"),
  USER_REFRESH_TOKEN_SECRET: required("USER_REFRESH_TOKEN_SECRET"),
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
} as const;
