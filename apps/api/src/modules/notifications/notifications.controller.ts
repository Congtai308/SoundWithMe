import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { listNotificationsQuerySchema, type ListNotificationsQuery } from "@soundwithme/validation";
import type { AuthenticatedUser } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema)) query: ListNotificationsQuery,
  ) {
    return { success: true, data: await this.notificationsService.list(user.id, query.limit) };
  }

  @Post("read-all")
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.markAllRead(user.id);
    return { success: true, data: { status: "ok" } };
  }

  @Post(":id/read")
  @HttpCode(200)
  async read(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    await this.notificationsService.markRead(user.id, id);
    return { success: true, data: { status: "ok" } };
  }
}
