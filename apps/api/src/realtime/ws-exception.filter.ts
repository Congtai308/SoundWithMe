import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { SOCKET_EVENTS, ERROR_CODES, type ErrorCode } from "@soundwithme/constants";
import type { ErrorPayload } from "@soundwithme/realtime-contracts";
import type { AppSocket } from "./realtime.types";

const KNOWN_CODES = new Set<string>(Object.values(ERROR_CODES));

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value);
}

/**
 * Socket counterpart of AllExceptionsFilter: every failure becomes an
 * `ERROR { code, message }` sent to the offending socket only. Service
 * exceptions already carry `{ error: { code, message } }`; anything
 * unexpected is logged and reported as INTERNAL_ERROR.
 */
@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("WsExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<AppSocket>();
    client.emit(SOCKET_EVENTS.ERROR, this.toPayload(exception));
  }

  private toPayload(exception: unknown): ErrorPayload {
    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof WsException
          ? exception.getError()
          : null;

    if (typeof body === "object" && body !== null && "error" in body) {
      const error: unknown = body.error;
      if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
        const { code, message } = error;
        if (isErrorCode(code) && typeof message === "string") {
          return { code, message };
        }
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : JSON.stringify(exception));
    return { code: ERROR_CODES.INTERNAL_ERROR, message: "Something went wrong. Please try again." };
  }
}
