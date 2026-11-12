import { RequestHandler } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { STATUS_CODE } from "@utils/status-code";
import { logger } from "@utils/logger";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

// Counts FAILED logins per IP+email; 5 failures within 15 minutes blocks for 15 minutes
const limiter = new RateLimiterMemory({
  points: MAX_FAILED_ATTEMPTS,
  duration: WINDOW_SECONDS,
  blockDuration: WINDOW_SECONDS,
});

export const bruteForceProtection: RequestHandler = async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const email = String(req.body?.email ?? "no-email").trim().toLowerCase();
  const key = `${ip}_${email}`;

  const state = await limiter.get(key);
  if (state && state.consumedPoints >= MAX_FAILED_ATTEMPTS) {
    const retrySecs = Math.ceil(state.msBeforeNext / 1000);
    res.status(STATUS_CODE.TOO_MANY_REQUESTS).json({
      success: false,
      message: `Too many login attempts. Try again in ${retrySecs} seconds.`,
      data: null,
    });
    return;
  }

  res.on("finish", () => {
    if (res.statusCode === STATUS_CODE.UN_AUTHORIZED) {
      // Wrong email/password: count it
      limiter.consume(key).catch(() => undefined);
    } else if (res.statusCode < 400) {
      // Successful login: clear earlier failures
      limiter.delete(key).catch((err: unknown) => logger.warn({ err }, "Could not reset login attempts"));
    }
  });

  next();
};
