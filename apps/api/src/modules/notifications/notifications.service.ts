import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, isValidObjectId } from "mongoose";
import type { AppNotification, NotificationType, NotificationsPage, PublicUser } from "@soundwithme/types";
import { NotificationDocument } from "../../database/mongodb/models/notification.schema";
import { AppEventsService } from "../../common/events/app-events.service";
import { UsersService } from "../users/users.service";

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  actorId?: string | null;
}

/** Unread notifications counted per user — beyond this the bell just shows "99+". */
const MAX_UNREAD_COUNTED = 99;

/**
 * The bell. Every notification is stored (so it survives a reload) and
 * pushed live to the user's open tabs through `user.notification`.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(NotificationDocument.name) private readonly model: Model<NotificationDocument>,
    private readonly usersService: UsersService,
    private readonly events: AppEventsService,
  ) {}

  async notify(userId: string, input: NewNotification): Promise<AppNotification> {
    const doc = await this.model.create({
      userId,
      type: input.type,
      title: input.title.slice(0, 120),
      body: input.body.slice(0, 300),
      link: input.link ?? null,
      actorId: input.actorId ?? null,
    });
    const [notification] = await this.toNotifications([doc]);
    this.events.emit("user.notification", { userId, notification: notification! });
    return notification!;
  }

  /** The same notification for many users (e.g. a host's friends). One insert, one push each. */
  async notifyMany(userIds: string[], input: NewNotification): Promise<void> {
    if (userIds.length === 0) return;
    const docs = await this.model.insertMany(
      userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title.slice(0, 120),
        body: input.body.slice(0, 300),
        link: input.link ?? null,
        actorId: input.actorId ?? null,
      })),
    );
    const notifications = await this.toNotifications(docs);
    notifications.forEach((notification, index) => {
      this.events.emit("user.notification", { userId: docs[index]!.userId, notification });
    });
  }

  async list(userId: string, limit: number): Promise<NotificationsPage> {
    const [docs, unread] = await Promise.all([
      this.model.find({ userId }).sort({ createdAt: -1 }).limit(limit).exec(),
      this.model.countDocuments({ userId, readAt: null }).limit(MAX_UNREAD_COUNTED + 1).exec(),
    ]);
    return { items: await this.toNotifications(docs), unread };
  }

  async markAllRead(userId: string): Promise<void> {
    await this.model.updateMany({ userId, readAt: null }, { readAt: new Date() }).exec();
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    if (!isValidObjectId(notificationId)) return;
    await this.model.updateOne({ _id: notificationId, userId, readAt: null }, { readAt: new Date() }).exec();
  }

  private async toNotifications(docs: NotificationDocument[]): Promise<AppNotification[]> {
    const actorIds = [...new Set(docs.map((d) => d.actorId).filter((id): id is string => Boolean(id)))];
    const actors = new Map<string, PublicUser>();
    for (const user of await this.usersService.findManyByIds(actorIds)) {
      actors.set(user.id, this.usersService.toPublicUser(user));
    }
    return docs.map((doc) => ({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      body: doc.body,
      link: doc.link ?? null,
      actor: doc.actorId ? (actors.get(doc.actorId) ?? null) : null,
      readAt: doc.readAt ? doc.readAt.toISOString() : null,
      createdAt: doc.createdAt.toISOString(),
    }));
  }
}
