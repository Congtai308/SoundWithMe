import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** Sets `req.user` when a valid session is present, and lets anonymous requests through with `req.user = null`. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser>(_error: unknown, user: TUser | false): TUser | null {
    return user || null;
  }
}
