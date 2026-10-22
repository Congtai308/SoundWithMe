import { Module } from "@nestjs/common";
import { RedisModule } from "../../database/redis/redis.module";
import { MusicModule } from "../music/music.module";
import { QueueModule } from "../queue/queue.module";
import { RoomsModule } from "../rooms/rooms.module";
import { UsersModule } from "../users/users.module";
import { LobbyService } from "./lobby.service";

@Module({
  imports: [RoomsModule, QueueModule, MusicModule, UsersModule, RedisModule],
  providers: [LobbyService],
  exports: [LobbyService],
})
export class LobbyModule {}
