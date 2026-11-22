export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "PDF_GENERATION_FAILED"
  | "TEMPLATE_NOT_FOUND"
  | "INVALID_TEMPLATE";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = "Invalid or missing API key"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "This API key has been deactivated"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function quotaExceeded(
  used: number,
  limit: number,
  resetsAt: string,
): AppError {
  return new AppError(
    429,
    "QUOTA_EXCEEDED",
    `Monthly PDF quota exceeded (${used}/${limit}). Quota resets on ${resetsAt}.`,
    { used, limit, resetsAt },
  );
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError(400, "VALIDATION_ERROR", message, details);
}

export function pdfGenerationFailed(message: string, details?: unknown): AppError {
  return new AppError(500, "PDF_GENERATION_FAILED", message, details);
}
