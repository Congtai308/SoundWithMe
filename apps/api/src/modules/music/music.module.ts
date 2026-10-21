import { Module } from "@nestjs/common";
import { RedisModule } from "../../database/redis/redis.module";
import { MusicController } from "./music.controller";
import { TracksController } from "./tracks.controller";
import { MusicService } from "./music.service";
import { LyricsService } from "./lyrics/lyrics.service";
import { MockMusicProvider } from "./providers/mock-music.provider";
import { YouTubeMusicProvider } from "./providers/youtube-music.provider";
import { MUSIC_PROVIDER } from "./music.constants";

@Module({
  imports: [RedisModule],
  controllers: [MusicController, TracksController],
  providers: [
    MusicService,
    LyricsService,
    YouTubeMusicProvider,
    { provide: MUSIC_PROVIDER, useClass: MockMusicProvider },
  ],
  exports: [MusicService],
})
export class MusicModule {}
