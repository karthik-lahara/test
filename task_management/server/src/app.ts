import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { env } from "@config/env";
import { swaggerSpec } from "@config/swagger";
import { rateLimiter } from "@middleware/rate-limit.middleware";
import { responseMiddleware } from "@middleware/response.middleware";
import { errorMiddleware, notFoundMiddleware } from "@middleware/error.middleware";
import { BadRequestError } from "@utils/errors";
import modulesRouter from "@modules/index";

/**
 * Builds the Express app. No route list here: modules are registered in modules/index.ts.
 * Order: security -> parsers -> health/docs -> /api -> not found -> errors.
 */
const app = express();

app.set("trust proxy", 1);

// ---- Security ----

// Swagger UI (/api-docs, non-production only) is served by this server, so its requests come from here
const swaggerOrigins = env.isProduction ? [] : [`http://localhost:${env.PORT}`, `http://127.0.0.1:${env.PORT}`];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Non-browser clients (no origin), whitelisted origins and Swagger UI are allowed.
    // An empty whitelist outside production allows every origin.
    const allowAll = env.CORS_WHITELIST.length === 0 && !env.isProduction;
    const isWhitelisted = origin !== undefined && env.CORS_WHITELIST.includes(origin);
    const isSwagger = origin !== undefined && swaggerOrigins.includes(origin);

    if (!origin || allowAll || isWhitelisted || isSwagger) {
      callback(null, true);
    } else {
      callback(new BadRequestError("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  exposedHeaders: ["Set-Cookie"],
  maxAge: 86400,
};
app.use(cors(corsOptions));
app.use(helmet());
app.use(rateLimiter);

// ---- Parsers & logging ----
app.use(morgan(env.isProduction ? "combined" : "dev"));
if (env.isProduction) {
  // Production also keeps an access log file in logs/requests.log
  const logDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  const stream = fs.createWriteStream(path.join(logDir, "requests.log"), { flags: "a" });
  app.use(morgan("combined", { stream }));
}
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(responseMiddleware);

// ---- Health & docs ----
app.get("/ping", (_req: Request, res: Response) => {
  res.send("TASK MANAGEMENT SERVER IS ONLINE!!!");
});
if (!env.isProduction) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// ---- API ----
app.use("/api", modulesRouter);

// ---- Errors (must be last) ----
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
