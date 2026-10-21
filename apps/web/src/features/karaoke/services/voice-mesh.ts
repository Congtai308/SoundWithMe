import type { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@soundwithme/constants";
import type {
  ClientToServerEvents,
  MicSinger,
  RtcSignal,
  RtcSignalEvent,
  ServerToClientEvents,
  VoiceChunkEvent,
} from "@soundwithme/realtime-contracts";
import { setListenDelay } from "@/features/player/services/listen-delay";
import { usePlayerStore } from "@/features/player/stores/player-store";
import { isSinging, useKaraokeStore } from "../stores/karaoke-store";
import { iceServers } from "./ice-servers";
import { RelaySender, RelayVoice, canDecodeOpus, canEncodeOpus, singerLatencyMs } from "./voice-relay";
import { VoiceFx } from "./voice-fx";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
/** This tab's side of a peer connection. */
type Role = "listen" | "sing";

/** Opus framing, invisible to getStats. */
const CODEC_MS = 27; // WebRTC Opus: 20 ms packets + 6.5 ms look-ahead
/** Singer's mic + speaker latency until their answer says (they sing that late to what they hear). */
const DEFAULT_SINGER_LATENCY_MS = 30;
/** Used until a connection has reported stats. */
const DEFAULT_VOICE_DELAY_MS = 150;
/** Re-align the music only for changes this big, so it isn't nudged constantly. */
const DELAY_HYSTERESIS_MS = 30;
/** Raising the hold is urgent (voices would come too late), so smaller steps up go through. */
const DELAY_RAISE_MS = 10;
const STATS_INTERVAL_MS = 1_000;
const MAX_VOICE_DELAY_S = 2;
/** Voice volume slider at 100%: twice the mic's level, so a voice can sit over the music. */
const MAX_VOICE_GAIN = 2;
const RECONNECT_MS = 2_000;
/**
 * Not connected directly by then: take the voice through the server instead
 * (without any usable route, ICE can sit in "connecting" forever).
 */
const RELAY_FALLBACK_MS = 6_000;
/** A relayed voice with no audio by then really can't get through. */
const RELAY_SILENT_MS = 8_000;

interface Voice {
  element: HTMLAudioElement;
  delay: DelayNode;
  gain: GainNode;
  analyser: AnalyserNode;
}

interface Peer {
  remote: string;
  /** Sing peers: the listener's user, so they can be cut off when they leave or are removed. */
  remoteUserId: string | null;
  role: Role;
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
  voice: Voice | null;
  /** Measured one-way voice delay, ms (listen peers). */
  delayMs: number | null;
  jitter: { delay: number; count: number } | null;
  /** Listen peers: the singer's own mic + speaker latency, from their answer. */
  singerLatencyMs: number | null;
}

const key = (remote: string, role: Role) => `${remote}|${role}`;

type AudioSessionType = "auto" | "playback" | "play-and-record";

/**
 * iOS plays Web Audio — which is how voices are mixed and delayed here — in
 * an "ambient" session that the ring/silent switch mutes, while the YouTube
 * video next to it keeps playing: listeners heard the music but no singer.
 * "playback" ignores the switch; singing needs "play-and-record" (Safari
 * 16.4+, a no-op elsewhere).
 */
function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session || session.type === type) return;
  try {
    session.type = type;
  } catch {
    // Not allowed right now (e.g. mid-capture): the default session still works.
  }
}

/**
 * Peer-to-peer karaoke voice for one room.
 *
 * Every tab opens a receive-only connection to each singer (listeners offer,
 * singers answer with their mic — offers never collide). Incoming voices go
 * through Web Audio: each gets a DelayNode so that all voices land at the
 * same moment, and the music itself is held back by the largest voice delay
 * (listen-delay), so a listener hears every singer exactly on the beat.
 * Singers hear the live music and, by default, not the other singers — those
 * voices can't help arriving late for them.
 *
 * When a network won't let two browsers connect (mobile data, offices), the
 * listener falls back to the server relay (voice-relay.ts): the singer
 * streams PCM through our own socket server, timestamped on the shared
 * clock, and it joins the same delay alignment.
 */
export class VoiceMesh {
  private readonly peers = new Map<string, Peer>();
  /** singer socketId → voice arriving through the server relay. */
  private readonly relays = new Map<string, RelayVoice>();
  private sender: RelaySender | null = null;
  private relayDemand = { listeners: 0, pcmOnly: 0 };
  private mic: MediaStream | null = null;
  /** The singer's voice with effects — what peers and the relay actually receive. */
  private fx: VoiceFx | null = null;
  /** Asking for the mic: the session must already allow recording. */
  private openingMic = false;
  private micAnalyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private singers: MicSinger[] = [];
  private appliedDelay = 0;
  private readonly statsTimer: number;
  private destroyed = false;

  constructor(
    private readonly socket: AppSocket,
    private readonly roomId: string,
  ) {
    this.statsTimer = window.setInterval(() => void this.measure(), STATS_INTERVAL_MS);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __swmKaraoke?: VoiceMesh }).__swmKaraoke = this;
  }

  /**
   * Call from any user gesture: browsers keep audio suspended until one. The
   * context is created here, inside the gesture — on iOS one created later
   * (when a voice arrives) would stay suspended until the next tap.
   */
  resume(): void {
    this.audio();
  }

  /** Call right before getUserMedia (in the same gesture), and with false if it fails. */
  openingMicrophone(opening: boolean): void {
    this.openingMic = opening;
    this.audio();
  }

  /** Starts or stops sending this tab's mic. */
  setMic(stream: MediaStream | null): void {
    this.openingMic = false;
    if (stream === this.mic) return;
    this.mic?.getTracks().forEach((track) => track.stop());
    this.fx?.destroy();
    this.fx = null;
    this.micAnalyser = null;
    this.mic = stream;
    this.sender?.stop();
    this.sender = null;
    if (!stream) {
      for (const peer of [...this.peers.values()]) if (peer.role === "sing") this.closePeer(peer);
      if (this.ctx) this.audio(); // back to a playback session, and un-interrupted
    } else {
      const { ctx } = this.audio();
      this.micAnalyser = ctx.createAnalyser();
      this.micAnalyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(this.micAnalyser);
      this.fx = new VoiceFx(ctx, stream);
      const { voiceEffect, voiceEffectAmount } = useKaraokeStore.getState();
      this.fx.set(voiceEffect, voiceEffectAmount);
      void this.updateSender();
    }
    this.applyMix();
  }

  /** Re-applies the singer's chosen effect (live: listeners hear the change at once). */
  applyVoiceEffect(): void {
    const { voiceEffect, voiceEffectAmount } = useKaraokeStore.getState();
    this.fx?.set(voiceEffect, voiceEffectAmount);
  }

  /** What leaves this tab: the processed voice, or the raw mic if effects aren't available. */
  private outgoing(): MediaStream | null {
    return this.fx?.output ?? this.mic;
  }

  /** Server says how many listeners take this tab's voice through the relay. */
  setRelayDemand(listeners: number, pcmOnly: number): void {
    this.relayDemand = { listeners, pcmOnly };
    void this.updateSender();
  }

  /** A chunk of relayed voice from a singer. */
  handleChunk(chunk: VoiceChunkEvent): void {
    if (chunk.roomId !== this.roomId || this.destroyed) return;
    const relay = this.relays.get(chunk.from);
    if (!relay) return;
    const first = relay.received === 0;
    const singing = isSinging({ singers: this.singers, mySocketId: this.socket.id ?? null });
    // Listeners play every voice at the music's hold, which moves in steps — steady playout, no gaps.
    relay.push(chunk, (own) => (singing || this.appliedDelay === 0 ? own : this.appliedDelay));
    if (first) {
      useKaraokeStore.getState().setConnected(chunk.from, true);
      useKaraokeStore.getState().setVoiceFailed(chunk.from, false);
      this.applyMix();
    } else if (!singing && (relay.delayMs ?? 0) >= this.appliedDelay + DELAY_RAISE_MS) {
      this.applyMix(); // the network slowed: hold the music back further right away
    }
  }

  hasMic(): boolean {
    return this.mic !== null;
  }

  /** Follows the room's MIC_STATE: connect to new singers, drop old ones. */
  syncSingers(singers: MicSinger[]): void {
    this.singers = singers;
    const me = this.socket.id;
    const singerIds = new Set(singers.map((s) => s.socketId));
    for (const peer of [...this.peers.values()]) {
      if (peer.role === "listen" && !singerIds.has(peer.remote)) this.closePeer(peer);
    }
    for (const singer of [...this.relays.keys()]) if (!singerIds.has(singer) || singer === me) this.stopRelay(singer);
    if (!me || !singerIds.has(me)) {
      for (const peer of [...this.peers.values()]) if (peer.role === "sing") this.closePeer(peer);
    }
    for (const singer of singers) {
      if (singer.socketId !== me && !this.peers.has(key(singer.socketId, "listen")) && !this.relays.has(singer.socketId)) {
        void this.listenTo(singer.socketId);
      }
    }
    this.applyMix();
  }

  /**
   * The room's listeners changed (someone left, or the host removed them).
   * The server can't close a browser-to-browser connection, so this tab cuts
   * off the voice it sends to anyone no longer in the room.
   */
  syncListeners(userIds: Iterable<string>): void {
    const present = new Set(userIds);
    for (const peer of [...this.peers.values()]) {
      if (peer.role === "sing" && peer.remoteUserId !== null && !present.has(peer.remoteUserId)) this.closePeer(peer);
    }
  }

  async handleSignal({ roomId, from, fromUserId, channel, signal }: RtcSignalEvent): Promise<void> {
    if (roomId !== this.roomId || this.destroyed) return;
    // The sender's "listen" is our "sing", and the other way round.
    const role: Role = channel === "listen" ? "sing" : "listen";
    try {
      if (signal.type === "offer") {
        if (role === "sing") await this.answerListener(from, fromUserId, signal.sdp);
        return;
      }
      const peer = this.peers.get(key(from, role));
      if (!peer) return;
      if (signal.type === "answer") {
        await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        if (typeof signal.latencyMs === "number") peer.singerLatencyMs = signal.latencyMs;
        for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
        return;
      }
      if (signal.type !== "candidate") return;
      const candidate: RTCIceCandidateInit = {
        candidate: signal.candidate,
        sdpMid: signal.sdpMid,
        sdpMLineIndex: signal.sdpMLineIndex,
      };
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
      else peer.pending.push(candidate);
    } catch (error: unknown) {
      console.warn("[karaoke] signal failed", error);
    }
  }

  /** 0–1 loudness of a singer's voice as heard here ("me" = this tab's mic). */
  level(socketId: string | "me"): number {
    const analyser =
      socketId === "me"
        ? this.micAnalyser
        : (this.relays.get(socketId)?.analyser ?? this.peers.get(key(socketId, "listen"))?.voice?.analyser);
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  /** Re-applies volume / "hear other singers" after a settings change. */
  applyMix(): void {
    const state = useKaraokeStore.getState();
    const singing = isSinging({ singers: this.singers, mySocketId: this.socket.id ?? null });
    const listening = [...this.peers.values()].filter((p) => p.role === "listen" && p.voice);
    const relayed = [...this.relays.values()].filter((r) => r.delayMs !== null);
    const delays = [
      ...listening.map((p) => p.delayMs ?? DEFAULT_VOICE_DELAY_MS),
      ...relayed.map((r) => r.delayMs!),
    ];

    // Music waits for the slowest voice; nothing to wait for while singing.
    const target = singing || delays.length === 0 ? 0 : Math.round(Math.max(...delays));
    const step = target - this.appliedDelay;
    if (target === 0 || step >= DELAY_RAISE_MS || -step >= DELAY_HYSTERESIS_MS) {
      this.appliedDelay = target;
      setListenDelay(target);
      state.setListenDelayMs(target);
    }

    // Karaoke ducking: the music steps back while you hear someone sing.
    const hearingVoices = (listening.length > 0 || relayed.length > 0) && (!singing || state.hearOtherSingers);
    usePlayerStore.getState().setDuckScale(hearingVoices ? state.musicWhileSinging / 100 : 1);

    const ctx = this.ctx;
    if (!ctx) return;
    const volume = (state.voiceVolume / 100) * MAX_VOICE_GAIN;
    for (const peer of listening) {
      const voice = peer.voice!;
      const extra = singing ? 0 : Math.max(0, this.appliedDelay - (peer.delayMs ?? DEFAULT_VOICE_DELAY_MS));
      voice.delay.delayTime.setTargetAtTime(extra / 1000, ctx.currentTime, 0.05);
      voice.gain.gain.setTargetAtTime(singing && !state.hearOtherSingers ? 0 : volume, ctx.currentTime, 0.05);
    }
    // Relayed voices line up by scheduling (handleChunk), so only their volume is set here.
    for (const relay of this.relays.values()) {
      relay.gain.gain.setTargetAtTime(singing && !state.hearOtherSingers ? 0 : volume, ctx.currentTime, 0.05);
    }
  }

  destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.statsTimer);
    for (const peer of [...this.peers.values()]) this.closePeer(peer);
    for (const singer of [...this.relays.keys()]) this.stopRelay(singer);
    this.sender?.stop();
    this.sender = null;
    this.mic?.getTracks().forEach((track) => track.stop());
    this.mic = null;
    this.fx?.destroy();
    this.fx = null;
    void this.ctx?.close();
    this.ctx = null;
    setAudioSession("auto");
    setListenDelay(0);
    usePlayerStore.getState().setDuckScale(1);
  }

  private audio(): { ctx: AudioContext; master: GainNode } {
    setAudioSession(this.mic || this.openingMic ? "play-and-record" : "playback");
    if (!this.ctx || !this.master) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.master = ctx.createGain();
      // Voices are boosted up to 2× to sit over the music; the compressor
      // keeps loud singers (and several at once) from clipping.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 10;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      this.master.connect(limiter).connect(ctx.destination);
      // iOS "interrupts" Web Audio when the mic starts or stops, a call
      // comes in or the tab is hidden, and doesn't always resume it itself.
      ctx.onstatechange = () => {
        if (this.ctx === ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => undefined);
      };
    }
    void this.ctx.resume().catch(() => undefined);
    return { ctx: this.ctx, master: this.master };
  }

  private createPeer(remote: string, role: Role): Peer {
    const existing = this.peers.get(key(remote, role));
    if (existing) this.closePeer(existing);
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const peer: Peer = {
      remote,
      remoteUserId: null,
      role,
      pc,
      pending: [],
      voice: null,
      delayMs: null,
      jitter: null,
      singerLatencyMs: null,
    };
    this.peers.set(key(remote, role), peer);

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      this.send(remote, role, {
        type: "candidate",
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      });
    };
    if (role === "listen") {
      window.setTimeout(() => {
        if (this.peers.get(key(remote, role)) === peer && pc.connectionState !== "connected") this.startRelay(remote);
      }, RELAY_FALLBACK_MS);
    }
    pc.onconnectionstatechange = () => {
      if (this.peers.get(key(remote, role)) !== peer) return;
      if (role === "listen") {
        useKaraokeStore.getState().setConnected(remote, pc.connectionState === "connected");
        if (pc.connectionState === "connected") useKaraokeStore.getState().setVoiceFailed(remote, false);
      }
      // No direct route: go through the server.
      if (role === "listen" && pc.connectionState === "failed") {
        this.startRelay(remote);
        return;
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.closePeer(peer);
        // Still singing? Try again — networks hiccup.
        if (role === "listen" && !this.destroyed) {
          window.setTimeout(() => {
            if (this.singers.some((s) => s.socketId === remote) && !this.peers.has(key(remote, "listen"))) {
              void this.listenTo(remote);
            }
          }, RECONNECT_MS);
        }
      }
    };
    return peer;
  }

  private async listenTo(remote: string): Promise<void> {
    const peer = this.createPeer(remote, "listen");
    peer.pc.addTransceiver("audio", { direction: "recvonly" });
    peer.pc.ontrack = ({ track, streams }) => this.attachVoice(peer, streams[0] ?? new MediaStream([track]));
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.send(remote, "listen", { type: "offer", sdp: tuneOpus(offer.sdp ?? "") });
    } catch (error: unknown) {
      console.warn("[karaoke] offer failed", error);
      this.closePeer(peer);
    }
  }

  private async answerListener(remote: string, remoteUserId: string, sdp: string): Promise<void> {
    const track = this.outgoing()?.getAudioTracks()[0];
    if (!track) return; // not singing (any more)
    const peer = this.createPeer(remote, "sing");
    peer.remoteUserId = remoteUserId;
    await peer.pc.setRemoteDescription({ type: "offer", sdp });
    const transceiver = peer.pc.getTransceivers()[0];
    if (!transceiver) return;
    transceiver.direction = "sendonly";
    await transceiver.sender.replaceTrack(track);
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    // Listeners hold the music back by our own latency too: we sing that late to what we hear.
    const latencyMs = this.mic && this.ctx ? Math.round(singerLatencyMs(this.ctx, this.mic)) : undefined;
    this.send(remote, "sing", { type: "answer", sdp: answer.sdp ?? "", latencyMs });
    for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
  }

  private attachVoice(peer: Peer, stream: MediaStream): void {
    if (peer.voice) return;
    const { ctx, master } = this.audio();
    // Chrome only feeds a remote WebRTC stream into Web Audio while a media
    // element is playing it; the element itself stays muted.
    const element = new Audio();
    element.muted = true;
    element.srcObject = stream;
    void element.play().catch(() => undefined);

    const source = ctx.createMediaStreamSource(stream);
    const delay = ctx.createDelay(MAX_VOICE_DELAY_S);
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(delay).connect(gain).connect(master);
    source.connect(analyser);
    peer.voice = { element, delay, gain, analyser };
    this.applyMix();
  }

  /** One-way voice delay per singer: half the round trip + jitter buffer + pipeline. */
  private async measure(): Promise<void> {
    const listening = [...this.peers.values()].filter((p) => p.role === "listen" && p.voice);
    // Relayed voices measure themselves per chunk; the music just has to follow.
    if (listening.length === 0 && this.relays.size === 0) return;
    for (const peer of listening) {
      try {
        const stats = await peer.pc.getStats();
        let rttS: number | null = null;
        let jitter: { delay: number; count: number } | null = null;
        stats.forEach((report: Record<string, unknown>) => {
          if (report.type === "candidate-pair" && report.nominated && typeof report.currentRoundTripTime === "number") {
            rttS = report.currentRoundTripTime;
          }
          if (report.type === "inbound-rtp" && report.kind === "audio" && typeof report.jitterBufferDelay === "number") {
            jitter = { delay: report.jitterBufferDelay, count: Number(report.jitterBufferEmittedCount) || 0 };
          }
        });
        const current = jitter as { delay: number; count: number } | null;
        if (!current || current.count === 0) continue;
        const previous = peer.jitter;
        const jitterS =
          previous && current.count > previous.count
            ? (current.delay - previous.delay) / (current.count - previous.count)
            : current.delay / current.count;
        peer.jitter = current;
        const measured =
          ((rttS ?? 0.05) / 2 + jitterS) * 1000 + CODEC_MS + (peer.singerLatencyMs ?? DEFAULT_SINGER_LATENCY_MS);
        peer.delayMs = peer.delayMs === null ? measured : peer.delayMs * 0.7 + measured * 0.3;
      } catch {
        // A closing connection: skip this round.
      }
    }
    this.applyMix();
  }

  /** Switches a singer's voice to the server relay (for good, while they sing). */
  private startRelay(remote: string): void {
    if (this.destroyed || this.relays.has(remote) || !this.singers.some((s) => s.socketId === remote)) return;
    const peer = this.peers.get(key(remote, "listen"));
    if (peer) this.closePeer(peer);
    const { ctx, master } = this.audio();
    const relay = new RelayVoice(ctx, master);
    this.relays.set(remote, relay);
    useKaraokeStore.getState().setRelayed(remote, true);
    void canDecodeOpus().then((opus) => {
      if (this.relays.get(remote) === relay) {
        this.socket.emit(SOCKET_EVENTS.VOICE_RELAY_JOIN, { roomId: this.roomId, singer: remote, opus });
      }
    });
    this.applyMix();
    window.setTimeout(() => {
      if (this.relays.get(remote) === relay && relay.received === 0) useKaraokeStore.getState().setVoiceFailed(remote, true);
    }, RELAY_SILENT_MS);
  }

  private stopRelay(remote: string): void {
    const relay = this.relays.get(remote);
    if (!relay) return;
    this.relays.delete(remote);
    relay.close();
    this.socket.emit(SOCKET_EVENTS.VOICE_RELAY_LEAVE, { roomId: this.roomId, singer: remote });
    const store = useKaraokeStore.getState();
    store.setRelayed(remote, false);
    store.setConnected(remote, false);
  }

  /**
   * Streams the mic to the server only while someone listens through it —
   * as Opus when this browser can encode it and every relay listener can
   * decode it, otherwise as PCM.
   */
  private async updateSender(): Promise<void> {
    const want = this.relayDemand.listeners > 0 && this.mic !== null && !this.destroyed;
    if (!want) {
      this.sender?.stop();
      this.sender = null;
      return;
    }
    const codec = this.relayDemand.pcmOnly === 0 && (await canEncodeOpus()) ? "opus" : "pcm";
    if (this.sender?.codec === codec || !this.mic || this.destroyed || this.relayDemand.listeners === 0) return;
    this.sender?.stop();
    const sender = new RelaySender(
      this.audio().ctx,
      this.outgoing() ?? this.mic,
      // Not volatile: at 100 chunks a second, volatile drops whatever arrives while the
      // previous write is in flight (~30% here). Skipped while offline instead of queued.
      (chunk) => {
        if (this.socket.connected) this.socket.emit(SOCKET_EVENTS.VOICE_CHUNK, chunk);
      },
      this.roomId,
      codec,
    );
    this.sender = sender;
    sender.start().catch((error: unknown) => {
      console.warn("[karaoke] relay capture failed", error);
      if (this.sender === sender) this.sender = null;
    });
  }

  private send(to: string, channel: Role, signal: RtcSignal): void {
    this.socket.emit(SOCKET_EVENTS.RTC_SIGNAL, { roomId: this.roomId, to, channel, signal });
  }

  private closePeer(peer: Peer): void {
    if (this.peers.get(key(peer.remote, peer.role)) === peer) this.peers.delete(key(peer.remote, peer.role));
    peer.pc.onconnectionstatechange = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
    if (peer.voice) {
      peer.voice.gain.disconnect();
      peer.voice.element.srcObject = null;
    }
    if (peer.role === "listen") useKaraokeStore.getState().setConnected(peer.remote, false);
  }
}

/**
 * Asks the singer for singing-quality Opus: a higher bitrate, in-band FEC
 * against packet loss, and no DTX (which would chop sustained notes).
 * The offer's fmtp says what this side wants to receive.
 */
function tuneOpus(sdp: string): string {
  const payload = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!payload) return sdp;
  return sdp.replace(new RegExp(`a=fmtp:${payload} (.*)`), (_line, params: string) => {
    const kept = params
      .split(";")
      .filter((p) => !/^(maxaveragebitrate|usedtx|useinbandfec)=/i.test(p.trim()));
    return `a=fmtp:${payload} ${[...kept, "useinbandfec=1", "usedtx=0", "maxaveragebitrate=96000"].join(";")}`;
  });
}
