import rateLimit from "express-rate-limit";

/**
 * Global limiter: max 1000 requests per IP every 10 minutes
 */
export const rateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later.", data: null },
});

