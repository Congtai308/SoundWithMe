import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserDocument, UserSchema } from "../../database/mongodb/models/user.schema";
import { UsersService } from "./users.service";

@Module({
  imports: [MongooseModule.forFeature([{ name: UserDocument.name, schema: UserSchema }])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
