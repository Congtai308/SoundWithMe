/**
 * Standard response envelope for every REST endpoint (Master Prompt §32).
 * Errors NEVER leak stack traces or internal driver errors to the client —
 * only a stable `code` the frontend can branch on.
 */
export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
