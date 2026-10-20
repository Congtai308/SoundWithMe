import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserDocument, UserSchema } from "../../database/mongodb/models/user.schema";
import { RedisModule } from "../../database/redis/redis.module";
import { MusicModule } from "../music/music.module";
import { ListeningController } from "./listening.controller";
import { ListeningService } from "./listening.service";

/** Learns each user's taste from what they actually play. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserDocument.name, schema: UserSchema }]),
    RedisModule,
    MusicModule,
  ],
  controllers: [ListeningController],
  providers: [ListeningService],
})
export class ListeningModule {}
