import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { MongooseModule } from "@nestjs/mongoose";
import { PassportModule } from "@nestjs/passport";
import {
  RefreshTokenDocument,
  RefreshTokenSchema,
} from "../../database/mongodb/models/refresh-token.schema";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokensService } from "./tokens.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";

@Module({
  imports: [
    UsersModule,
    PassportModule,
    MongooseModule.forFeature([
      { name: RefreshTokenDocument.name, schema: RefreshTokenSchema },
    ]),
    // Registered here (not via forRootAsync) because access-token signing
    // options differ per call site (sign vs verify secret is the same, but
    // keeping it explicit in TokensService is clearer than a global default).
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("app.jwtAccessSecret"),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}
