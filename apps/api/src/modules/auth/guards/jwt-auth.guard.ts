import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Apply to any route that requires an authenticated user (any auth method, including guest). */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
