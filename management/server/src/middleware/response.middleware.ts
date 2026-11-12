import { Request, Response, NextFunction } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T | null;
}

export interface CustomResponse extends Response {
  success: <T = unknown>(message: string, data?: T | null, statusCode?: number) => Response;
  error: <T = unknown>(message: string, data?: T | null, statusCode?: number) => Response;
}


export const responseMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  const customRes = res as CustomResponse;

  customRes.success = function <T>(message: string, data: T | null = null, statusCode = 200) {
    const payload: ApiResponse<T> = { success: true, message, data };
    return this.status(statusCode).json(payload);
  };

  customRes.error = function <T>(message: string, data: T | null = null, statusCode = 400) {
    const payload: ApiResponse<T> = { success: false, message, data };
    return this.status(statusCode).json(payload);
  };

  next();
};
