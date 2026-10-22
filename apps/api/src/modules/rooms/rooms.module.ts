import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { RoomDocument, RoomSchema } from "../../database/mongodb/models/room.schema";
import {
  RoomMemberDocument,
  RoomMemberSchema,
} from "../../database/mongodb/models/room-member.schema";
import { QueueItemDocument, QueueItemSchema } from "../../database/mongodb/models/queue-item.schema";
import { FriendsModule } from "../friends/friends.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RedisModule } from "../../database/redis/redis.module";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoomDocument.name, schema: RoomSchema },
      { name: RoomMemberDocument.name, schema: RoomMemberSchema },
      // Read-only here: how many songs wait in each listed room.
      { name: QueueItemDocument.name, schema: QueueItemSchema },
    ]),
    FriendsModule,
    NotificationsModule,
    RedisModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
