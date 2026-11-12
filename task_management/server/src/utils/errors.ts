import { STATUS_CODE } from "./status-code";
export { STATUS_CODE } from "./status-code";

export class BaseError extends Error {
  public readonly status: number;
  constructor(name: string, status: number, description: string) {
    super(description);
    this.name = name;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

// 500
export class APIError extends BaseError {
  constructor(description = "Internal server error") {
    super("APIError", STATUS_CODE.INTERNAL_ERROR, description);
  }
}

// 400
export class BadRequestError extends BaseError {
  constructor(description = "Bad request") {
    super("BadRequestError", STATUS_CODE.BAD_REQUEST, description);
  }
}

// 401
export class AuthorizeError extends BaseError {
  constructor(description = "Access denied") {
    super("AuthorizeError", STATUS_CODE.UN_AUTHORIZED, description);
  }
}

// 403
export class ForbiddenError extends BaseError {
  constructor(description = "Forbidden") {
    super("ForbiddenError", STATUS_CODE.FORBIDDEN, description);
  }
}

// 404
export class NotFoundError extends BaseError {
  constructor(description = "Not found") {
    super("NotFoundError", STATUS_CODE.NOT_FOUND, description);
  }
}

// 409
export class ConflictError extends BaseError {
  constructor(description = "Conflict") {
    super("ConflictError", STATUS_CODE.CONFLICT, description);
  }
}
