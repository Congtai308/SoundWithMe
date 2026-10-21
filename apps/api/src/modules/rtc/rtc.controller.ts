import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RtcService } from "./rtc.service";

@Controller("rtc")
export class RtcController {
  constructor(private readonly rtcService: RtcService) {}

  /** STUN/TURN servers for karaoke voice. Signed-in only: TURN relays cost bandwidth. */
  @UseGuards(JwtAuthGuard)
  @Get("ice-servers")
  async getIceServers() {
    return { success: true, data: await this.rtcService.getIceServers() };
  }
}
