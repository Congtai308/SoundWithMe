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
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // If a service already threw a structured { code, message } error,
      // pass it through as-is instead of double-wrapping it.
      if (typeof body === "object" && body !== null && "error" in body) {
        response.status(status).json(body);
        return;
      }

      response.status(status).json({
        success: false,
        error: {
          code: this.codeForStatus(status),
          message: typeof body === "string" ? body : exception.message,
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
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }
}
