import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ERROR_CODES } from "@soundwithme/constants";

/**
 * Enforces Master Prompt §60: clients only ever see a stable `code` +
 * safe `message`. Raw driver errors (Mongo E11000, etc.) or stack traces
 * never reach the response body — they're logged server-side only.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    // Socket errors are reported by realtime/ws-exception.filter.ts; this
    // filter only knows how to write HTTP responses.
    if (host.getType() !== "http") {
      this.logger.error(exception instanceof Error ? exception.stack : JSON.stringify(exception));
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // If a service already threw a structured { code, message } error,
      // pass it through as-is instead of double-wrapping it. Nest's own
      // errors ({ message, error: "Not Found", statusCode }) are not that.
      if (isStructuredError(body)) {
        response.status(status).json(body);
        return;
      }

      response.status(status).json({
        success: false,
        error: {
          code: this.codeForStatus(status),
          // Only the framework throws unstructured errors (unknown routes, bad
          // JSON, "ThrottlerException: …"), and their text names internals:
          // send the generic text for the status instead.
          message: genericMessage(status),
        },
      });
      return;
    }

    // Unknown/unexpected error: log full detail server-side, return a
    // generic code to the client. This is where Sentry capture is wired
    // in once observability is set up (Architecture Review §15).
    this.logger.error(
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Something went wrong. Please try again.",
      },
    });
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMITED;
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}

/** A body our own code threw: `{ success: false, error: { code, message } }`. */
function isStructuredError(body: unknown): boolean {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error;
}

function genericMessage(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "The request couldn't be read.";
    case HttpStatus.UNAUTHORIZED:
      return "Sign in to continue.";
    case HttpStatus.FORBIDDEN:
      return "You can't do that.";
    case HttpStatus.NOT_FOUND:
      return "Not found.";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "Too many requests. Slow down a little.";
    default:
      return "Something went wrong. Please try again.";
  }
}
