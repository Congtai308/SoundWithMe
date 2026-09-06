import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>("app.mongodbUri"),
        // Fail fast (default is 30s) rather than silently blocking the
        // entire app's boot — including unrelated HTTP routes like
        // /health — on an unreachable database.
        serverSelectionTimeoutMS: 5000,
        // Note: @nestjs/mongoose still retries the *whole app's* bootstrap
        // on top of this (default 9 attempts) before the process exits and
        // no HTTP route — including /health — is reachable until either a
        // connection succeeds or retries are exhausted. This matches
        // standard NestJS/Mongoose behavior: don't serve traffic if the
        // primary database was never reachable at boot. The /health vs
        // /ready split (Architecture Review §15) is for a *post-boot*
        // Mongo outage, where the process is already up and can report
        // itself unready without going fully unresponsive.
        retryAttempts: 3,
        retryDelay: 2000,
        connectionFactory: (connection) => connection,
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class MongodbModule {}
