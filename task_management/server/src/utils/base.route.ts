import { Router, RequestHandler } from "express";

/**
 * One router mounted at one path under /api.
 * Every module exports a list of these from its index.ts; src/modules/index.ts collects them.
 */
export interface ApiRoute {
  /** Path under /api, e.g. "/tasks" */
  path: string;
  router: Router;
}

/**
 * Wraps async controller methods so rejected promises reach the error handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const asyncHandler = (fn: (...args: any[]) => unknown): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Base Route class shared by every module router.
 *
 * @example
 * export class TaskRouter extends BaseRoute {
 *   private controller = new TaskController();
 *   constructor() {
 *     super();
 *     this.router.get("/", this.handle(this.controller.list));
 *   }
 * }
 */
export abstract class BaseRoute {
  public router: Router;

  constructor() {
    this.router = Router();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected handle(fn: (...args: any[]) => unknown): RequestHandler {
    return asyncHandler(fn);
  }
}
