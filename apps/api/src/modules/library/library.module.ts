import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  FavoriteTrackDocument,
  FavoriteTrackSchema,
  PlaylistDocument,
  PlaylistItemDocument,
  PlaylistItemSchema,
  PlaylistSchema,
} from "../../database/mongodb/models/library.schema";
import { MusicModule } from "../music/music.module";
import { LibraryController } from "./library.controller";
import { LibraryService } from "./library.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FavoriteTrackDocument.name, schema: FavoriteTrackSchema },
      { name: PlaylistDocument.name, schema: PlaylistSchema },
      { name: PlaylistItemDocument.name, schema: PlaylistItemSchema },
    ]),
    MusicModule,
  ],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
