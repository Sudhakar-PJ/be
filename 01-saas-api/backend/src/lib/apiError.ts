import { Response } from "express";

// 1. Validation Field Error Structure
export interface FieldError {
  field: string;
  message: string;
}

// 2. RFC 9457 Standard Problem Details Schema
export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  correlationId?: string;
  errors?: FieldError[];
  stack?: string;
}

// 3. One-Time Reusable Helper to Send RFC 9457 Responses
export function sendProblemDetails(res: Response, problem: ProblemDetails): void {
  res
    .status(problem.status)
    .setHeader("Content-Type", "application/problem+json")
    .json({
      type: problem.type ?? "about:blank",
      title: problem.title,
      status: problem.status,
      detail: problem.detail,
      instance: problem.instance,
      code: problem.code,
      ...(problem.correlationId && { correlationId: problem.correlationId }),
      ...(problem.errors && { errors: problem.errors }),
      ...(problem.stack && { stack: problem.stack }),
    });
}

// 4. Base ApiError Class
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly detail: string;
  public readonly isOperational: boolean;
  public readonly errors?: FieldError[] | undefined;

  constructor(
    statusCode: number,
    title: string,
    detail: string,
    code: string,
    isOperational = true,
    errors?: FieldError[],
  ) {
    super(detail);

    // Restore prototype chain for 'instanceof' checks
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.message = title; // 'title' in RFC 9457
    this.detail = detail;
    this.code = code;
    this.isOperational = isOperational;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 Bad Request
export class BadRequestError extends ApiError {
  constructor(detail = "Bad request", code = "BAD_REQUEST", errors?: FieldError[]) {
    super(400, "Bad Request", detail, code, true, errors);
  }
}

// 401 Unauthorized
export class UnauthorizedError extends ApiError {
  constructor(detail = "Authentication required", code = "UNAUTHORIZED") {
    super(401, "Unauthorized", detail, code, true);
  }
}

// 403 Forbidden
export class ForbiddenError extends ApiError {
  constructor(detail = "You do not have permission to perform this action", code = "FORBIDDEN") {
    super(403, "Forbidden", detail, code, true);
  }
}

// 404 Not Found
export class NotFoundError extends ApiError {
  constructor(detail = "The requested resource was not found", code = "NOT_FOUND") {
    super(404, "Not Found", detail, code, true);
  }
}

// 409 Conflict (e.g. duplicate email, unique constraint clash)
export class ConflictError extends ApiError {
  constructor(detail = "Resource conflict occurred", code = "CONFLICT") {
    super(409, "Conflict", detail, code, true);
  }
}

// 422 Unprocessable Entity (Validation Errors)
export class ValidationError extends ApiError {
  constructor(detail = "Validation failed", errors: FieldError[]) {
    super(422, "Unprocessable Entity", detail, "VALIDATION_ERROR", true, errors);
  }
}

// 429 Too Many Requests
export class TooManyRequestsError extends ApiError {
  constructor(detail = "Too many requests, please try again later", code = "RATE_LIMIT_EXCEEDED") {
    super(429, "Too Many Requests", detail, code, true);
  }
}

// 500 Internal Server Error
export class InternalServerError extends ApiError {
  constructor(
    detail = "An unexpected error occurred on the server",
    code = "INTERNAL_SERVER_ERROR",
  ) {
    super(500, "Internal Server Error", detail, code, false);
  }
}
