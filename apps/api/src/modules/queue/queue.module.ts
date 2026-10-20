import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { QueueItemDocument, QueueItemSchema } from "../../database/mongodb/models/queue-item.schema";
import { RoomsModule } from "../rooms/rooms.module";
import { MusicModule } from "../music/music.module";
import { PlaybackModule } from "../playback/playback.module";
import { RedisModule } from "../../database/redis/redis.module";
import { QueueService } from "./queue.service";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: QueueItemDocument.name, schema: QueueItemSchema }]),
    RoomsModule,
    MusicModule,
    PlaybackModule,
    RedisModule,
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
