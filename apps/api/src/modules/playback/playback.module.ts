import { Module } from "@nestjs/common";
import { RedisModule } from "../../database/redis/redis.module";
import { RoomsModule } from "../rooms/rooms.module";
import { MusicModule } from "../music/music.module";
import { PlaybackService } from "./playback.service";

@Module({
  imports: [RedisModule, RoomsModule, MusicModule],
  providers: [PlaybackService],
  exports: [PlaybackService],
})
export class PlaybackModule {}
