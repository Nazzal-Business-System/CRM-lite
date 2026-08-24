export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function unauthorized(message = "Authentication required."): AppError {
  return new AppError(401, "UNAUTHENTICATED", message);
}

export function forbidden(
  message = "You do not have permission to perform this action.",
): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found."): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "CONFLICT", message);
}

export function badRequest(
  message: string,
  fields?: Record<string, string[]>,
): AppError {
  return new AppError(400, "BAD_REQUEST", message, fields);
}
