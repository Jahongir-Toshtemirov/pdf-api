export interface ApiSuccessMeta {
  requestId: string;
  [key: string]: unknown;
}

export function successBody<T>(
  data: T,
  requestId: string,
  meta?: Record<string, unknown>,
) {
  return {
    success: true as const,
    data,
    meta: {
      requestId,
      ...meta,
    },
  };
}

export function errorBody(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
) {
  return {
    success: false as const,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: {
      requestId,
    },
  };
}

export function currentYearMonth(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function nextMonthResetIso(date = new Date()): string {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0),
  );
  return next.toISOString();
}
