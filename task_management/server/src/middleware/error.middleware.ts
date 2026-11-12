import { Request, Response, NextFunction } from "express";
import { BaseError, STATUS_CODE } from "@utils/errors";
import { logger } from "@utils/logger";

/**
 * Central error handler: every thrown error ends up here and is sent as
 * { success: false, message, data: null }. Register it after all routes.
 */
export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let status: number = STATUS_CODE.INTERNAL_ERROR;
  let message = "Internal Server Error";

  if (error instanceof BaseError) {
    status = error.status;
    message = error.message;
  } else if (error.name === "CastError") {
    // Mongoose invalid ObjectId etc.
    status = STATUS_CODE.BAD_REQUEST;
    message = "Invalid id";
  } else if ((error as { type?: string }).type === "entity.parse.failed") {
    status = STATUS_CODE.BAD_REQUEST;
    message = "Malformed JSON body";
  }

  if (status >= 500) {
    logger.error({
      message: error.message,
      stack: error.stack,
      route: req.originalUrl,
      method: req.method,
      ip: req.ip,
      status,
    });
  } else {
    logger.warn({ message, route: req.originalUrl, method: req.method, status });
  }

  res.status(status).json({ success: false, message, data: null });
};

export const notFoundMiddleware = (req: Request, res: Response): void => {
  res.status(STATUS_CODE.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    data: null,
  });
};
