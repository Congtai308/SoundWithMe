import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ERROR_CODES } from "@soundwithme/constants";

/**
 * Validates and transforms a request body against a Zod schema. Used
 * per-route instead of a global class-validator ValidationPipe — see the
 * note in main.ts for why the two don't mix safely.
 *
 * Usage: @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: result.error.issues
            .map(
              (i: { path: (string | number)[]; message: string }) =>
                `${i.path.join(".")}: ${i.message}`,
            )
            .join("; "),
        },
      });
    }

    return result.data;
  }
}
