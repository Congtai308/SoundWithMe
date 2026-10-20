import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { FriendshipDocument, FriendshipSchema } from "../../database/mongodb/models/friendship.schema";
import { RoomDocument, RoomSchema } from "../../database/mongodb/models/room.schema";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PresenceModule } from "../presence/presence.module";
import { MusicModule } from "../music/music.module";
import { FriendsController } from "./friends.controller";
import { FriendsService } from "./friends.service";
import { FriendshipsService } from "./friendships.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FriendshipDocument.name, schema: FriendshipSchema },
      { name: RoomDocument.name, schema: RoomSchema },
    ]),
    UsersModule,
    NotificationsModule,
    PresenceModule,
    MusicModule,
  ],
  controllers: [FriendsController],
  providers: [FriendshipsService, FriendsService],
  exports: [FriendshipsService],
})
export class FriendsModule {}
