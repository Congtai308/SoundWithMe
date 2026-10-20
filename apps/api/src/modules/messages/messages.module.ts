import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  DirectMessageDocument,
  DirectMessageSchema,
} from "../../database/mongodb/models/direct-message.schema";
import { FriendsModule } from "../friends/friends.module";
import { MusicModule } from "../music/music.module";
import { RoomsModule } from "../rooms/rooms.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DirectMessageDocument.name, schema: DirectMessageSchema }]),
    FriendsModule,
    MusicModule,
    RoomsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
