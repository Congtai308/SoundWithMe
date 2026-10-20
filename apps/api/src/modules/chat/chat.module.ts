import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ChatMessageDocument, ChatMessageSchema } from "../../database/mongodb/models/chat-message.schema";
import { RoomsModule } from "../rooms/rooms.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatMessageDocument.name, schema: ChatMessageSchema }]),
    RoomsModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
