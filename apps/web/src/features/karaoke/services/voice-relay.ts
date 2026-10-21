import { VOICE_RELAY_SAMPLE_RATE } from "@soundwithme/validation";
import type { VoiceChunkEvent, VoiceChunkPayload, VoiceCodec } from "@soundwithme/realtime-contracts";
import { serverNow } from "@/features/player/services/server-clock";

/**
 * Karaoke voice through our own server, for networks where browsers can't
 * connect to each other (mobile data, CGNAT, offices) — no TURN service
 * needed.
 *
 * Audio goes as 10 ms chunks: Opus at 96 kbps where the browsers have
 * WebCodecs (small packets keep mobile uplinks from queueing), otherwise
 * plain 16-bit PCM at 24 kHz. Each chunk is stamped with the *music time* it
 * was sung to — capture time on the shared server clock, minus the singer's
 * own mic and speaker latency (a singer hears the music that much late and
 * sings that much late) — so a listener can play it at exactly the moment
 * its music plays.
 */

const OPUS_RATE = 48_000;
const CHUNK_MS = 10;
const OPUS_BITRATE = 96_000;
/** Opus's look-ahead: decoded audio comes out this much after the packet's timestamp. */
const OPUS_LOOKAHEAD_MS = 6.5;
/** Used when the browser doesn't report the mic's latency. */
const DEFAULT_INPUT_LATENCY_MS = 10;
/** Re-anchor the chunk clock if it wanders this far from the real capture time. */
const REANCHOR_MS = 30;
/** Blocks over which the audio clock → server clock offset is tracked (2 s). */
const CLOCK_WINDOW = 200;
/** Headroom above the slowest recent chunk, against network bursts. */
const JITTER_MARGIN_MS = 20;
const MIN_DELAY_MS = 40;
const MAX_DELAY_MS = 1_500;
const LATENCY_WINDOW = 300; // 3 s of chunks
/** Gaps smaller than this are closed so chunks play back to back without clicks. */
const SNAP_S = 0.025;

const TAP_PROCESSOR = `
class SwmMicTap extends AudioWorkletProcessor {
  constructor() { super(); this.size = Math.round(sampleRate / 100); this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) {
        // end: the audio-clock frame just after this block's last sample.
        this.port.postMessage({ buf: this.buf, end: currentFrame + i + 1 });
        this.buf = new Float32Array(this.size);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("swm-mic-tap", SwmMicTap);
`;

let tapModuleUrl: string | null = null;
const tapModuleLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

function loadTap(ctx: AudioContext): Promise<void> {
  tapModuleUrl ??= URL.createObjectURL(new Blob([TAP_PROCESSOR], { type: "application/javascript" }));
  let loaded = tapModuleLoaded.get(ctx);
  if (!loaded) {
    loaded = ctx.audioWorklet.addModule(tapModuleUrl);
    tapModuleLoaded.set(ctx, loaded);
  }
  return loaded;
}

const OPUS_CONFIG = { codec: "opus", sampleRate: OPUS_RATE, numberOfChannels: 1 } as const;
let opusEncode: Promise<boolean> | null = null;
let opusDecode: Promise<boolean> | null = null;

/** Whether this browser can encode Opus with WebCodecs. */
export function canEncodeOpus(): Promise<boolean> {
  opusEncode ??=
    typeof AudioEncoder === "undefined"
      ? Promise.resolve(false)
      : AudioEncoder.isConfigSupported({ ...OPUS_CONFIG, bitrate: OPUS_BITRATE })
          .then((result) => result.supported === true)
          .catch(() => false);
  return opusEncode;
}

/** Whether this browser can decode Opus with WebCodecs. */
export function canDecodeOpus(): Promise<boolean> {
  opusDecode ??=
    typeof AudioDecoder === "undefined"
      ? Promise.resolve(false)
      : AudioDecoder.isConfigSupported(OPUS_CONFIG)
          .then((result) => result.supported === true)
          .catch(() => false);
  return opusDecode;
}

/** Mic input + speaker output latency of this device, ms: how late a singer sings to the music they hear. */
export function singerLatencyMs(ctx: AudioContext, mic: MediaStream): number {
  const reported = mic.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number };
  const input = typeof reported?.latency === "number" ? reported.latency * 1000 : DEFAULT_INPUT_LATENCY_MS;
  const output = ((ctx.outputLatency || 0) + ctx.baseLatency) * 1000;
  return Math.max(0, Math.min(500, input + output));
}

/** Streams this tab's mic to the server while anyone listens through it. */
export class RelaySender {
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private encoder: AudioEncoder | null = null;
  /**
   * Music times of frames handed to the encoder, oldest first. WebCodecs
   * numbers its output from the first timestamp it saw, ignoring later jumps,
   * so each packet takes its time from here instead (one packet per frame).
   */
  private readonly encodeTimes: number[] = [];
  private seq = 0;
  /** Music time of output sample 0, and samples produced since. */
  private anchor: number | null = null;
  private produced = 0;
  private pending: number[] = [];
  private position = 0;
  private history: Float32Array = new Float32Array(0);
  private stopped = false;
  /** Recent (server time − audio-clock time) at message arrival; the smallest is the least delayed. */
  private readonly clockOffsets: number[] = [];
  private readonly rate: number;
  private readonly chunkSamples: number;

  constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
    private readonly send: (chunk: VoiceChunkPayload) => void,
    private readonly roomId: string,
    readonly codec: VoiceCodec,
  ) {
    this.rate = codec === "opus" ? OPUS_RATE : VOICE_RELAY_SAMPLE_RATE;
    this.chunkSamples = (this.rate * CHUNK_MS) / 1000;
  }

  async start(): Promise<void> {
    await loadTap(this.ctx);
    if (this.stopped) return;
    if (this.codec === "opus") {
      this.encoder = new AudioEncoder({
        output: (chunk) => this.emitOpus(chunk),
        error: (error) => console.warn("[karaoke] opus encoder", error),
      });
      this.configureEncoder();
    }
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "swm-mic-tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    // A worklet only runs while connected to the output; this one stays silent.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node).connect(this.sink).connect(this.ctx.destination);
    this.node.port.onmessage = ({ data }: MessageEvent<{ buf: Float32Array; end: number }>) => this.onBlock(data.buf, data.end);
  }

  stop(): void {
    this.stopped = true;
    if (this.node) this.node.port.onmessage = null;
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    if (this.encoder && this.encoder.state !== "closed") this.encoder.close();
  }

  /**
   * Timing comes from the audio clock (sample-exact), mapped onto the server
   * clock by the smallest offset seen lately — message delivery to the main
   * thread jitters by tens of ms, but never arrives early.
   */
  private onBlock(block: Float32Array, endFrame: number): void {
    const endAudioMs = (endFrame / this.ctx.sampleRate) * 1000;
    this.clockOffsets.push(serverNow() - endAudioMs);
    if (this.clockOffsets.length > CLOCK_WINDOW) this.clockOffsets.shift();
    const offset = Math.min(...this.clockOffsets);
    const blockMs = (block.length / this.ctx.sampleRate) * 1000;
    // When the block's first sample was sung, in music time.
    const musicTime = endAudioMs + offset - blockMs - singerLatencyMs(this.ctx, this.stream);
    const expected =
      this.anchor === null ? null : this.anchor + ((this.produced + this.pending.length) / this.rate) * 1000;
    if (expected === null || Math.abs(expected - musicTime) > REANCHOR_MS) {
      // (Re)start the chunk clock; drop half-built output so timestamps stay true.
      this.anchor = musicTime;
      this.produced = 0;
      this.pending = [];
      this.position = 0;
      this.history = new Float32Array(0);
    }
    this.resample(block);
    while (this.pending.length >= this.chunkSamples) this.emitSamples(this.pending.splice(0, this.chunkSamples));
  }

  /** Linear interpolation to the codec's rate (light low-pass when shrinking a lot). */
  private resample(block: Float32Array): void {
    if (this.ctx.sampleRate === this.rate) {
      for (const sample of block) this.pending.push(sample);
      return;
    }
    const input = new Float32Array(this.history.length + block.length);
    input.set(this.history);
    input.set(block, this.history.length);
    const step = this.ctx.sampleRate / this.rate;
    const last = input.length - 1;
    const at = (i: number) => {
      const c = input[Math.min(last, Math.max(0, i))]!;
      if (step < 1.5) return c;
      return 0.25 * input[Math.max(0, i - 1)]! + 0.5 * c + 0.25 * input[Math.min(last, i + 1)]!;
    };
    let pos = this.position;
    while (pos + 2 < input.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      this.pending.push(at(i) * (1 - frac) + at(i + 1) * frac);
      pos += step;
    }
    const keepFrom = Math.max(0, Math.floor(pos) - 1);
    this.history = input.slice(keepFrom);
    this.position = pos - keepFrom;
  }

  private configureEncoder(): void {
    this.encoder?.configure({
      ...OPUS_CONFIG,
      bitrate: OPUS_BITRATE,
      // 10 ms frames for low delay; no DTX, so sustained notes are never chopped.
      opus: { frameDuration: CHUNK_MS * 1000, complexity: 8, usedtx: false },
    } as AudioEncoderConfig);
  }

  private emitSamples(samples: number[]): void {
    const t = this.anchor! + (this.produced / this.rate) * 1000;
    this.produced += samples.length;
    if (this.encoder) {
      if (this.encoder.state !== "configured") return;
      const data = new AudioData({
        format: "f32",
        sampleRate: this.rate,
        numberOfFrames: samples.length,
        numberOfChannels: 1,
        timestamp: Math.round(t * 1000),
        data: Float32Array.from(samples),
      });
      this.encodeTimes.push(t);
      this.encoder.encode(data);
      data.close();
      return;
    }
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.send({ roomId: this.roomId, seq: this.seq++, t, codec: "pcm", sampleRate: this.rate, data: pcm.buffer });
  }

  private emitOpus(chunk: EncodedAudioChunk): void {
    const t = this.encodeTimes.shift();
    if (this.stopped || t === undefined) return;
    const data = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(data);
    this.send({ roomId: this.roomId, seq: this.seq++, t, codec: "opus", sampleRate: OPUS_RATE, data });
  }
}

/** One singer's relayed voice on a listener: jitter-buffered and played at its music time + delay. */
export class RelayVoice {
  readonly gain: GainNode;
  readonly analyser: AnalyserNode;
  /** How long after its music time a chunk can reliably play, ms — what the music should be held back by. */
  delayMs: number | null = null;
  received = 0;
  late = 0;
  /** Silences between chunks (a chunk started after the previous one ended). */
  gaps = 0;
  /** Chunks that never arrived (gaps in `seq`). */
  lost = 0;
  private lastSeq = -1;
  private readonly latencies: number[] = [];
  private nextTime = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private decoder: AudioDecoder | null = null;
  /** Music times of packets in the decoder, oldest first (its own timestamps drift after any lost packet). */
  private readonly decodeTimes: number[] = [];
  private playDelayFor: (ownDelayMs: number) => number = (own) => own;

  constructor(
    private readonly ctx: AudioContext,
    master: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.gain.connect(master);
    this.gain.connect(this.analyser);
  }

  /** `playDelayFor`: how long after its music time to play (≥ own delay; more to line up with slower voices). */
  push(chunk: VoiceChunkEvent, playDelayFor: (ownDelayMs: number) => number): void {
    this.received += 1;
    if (this.lastSeq >= 0 && chunk.seq > this.lastSeq + 1) this.lost += chunk.seq - this.lastSeq - 1;
    this.lastSeq = chunk.seq;
    this.playDelayFor = playDelayFor;
    const lookahead = chunk.codec === "opus" ? OPUS_LOOKAHEAD_MS : 0;
    this.track(serverNow() - chunk.t + lookahead);

    if (chunk.codec === "pcm") {
      const samples = new Int16Array(chunk.data);
      const floats = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) floats[i] = samples[i]! / 0x8000;
      this.schedule(chunk.t, floats, chunk.sampleRate);
      return;
    }
    const decoder = this.opusDecoder();
    if (!decoder) return;
    this.decodeTimes.push(chunk.t);
    decoder.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(chunk.t * 1000), data: chunk.data }));
  }

  close(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already finished
      }
    }
    this.sources.clear();
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.gain.disconnect();
  }

  private opusDecoder(): AudioDecoder | null {
    if (this.decoder && this.decoder.state !== "closed") return this.decoder;
    if (typeof AudioDecoder === "undefined") return null;
    this.decoder = new AudioDecoder({
      output: (audio) => {
        const t = this.decodeTimes.shift() ?? audio.timestamp / 1000;
        const floats = new Float32Array(audio.numberOfFrames);
        audio.copyTo(floats, { planeIndex: 0, format: "f32-planar" });
        this.schedule(t + OPUS_LOOKAHEAD_MS, floats, audio.sampleRate);
        audio.close();
      },
      error: (error) => console.warn("[karaoke] opus decoder", error),
    });
    this.decoder.configure(OPUS_CONFIG);
    return this.decoder;
  }

  /** Plays samples at their music time + the play delay; the music itself is held back by the same amount. */
  private schedule(musicTime: number, samples: Float32Array<ArrayBuffer>, sampleRate: number): void {
    if (this.delayMs === null) return;
    const now = serverNow();
    let when = this.ctx.currentTime + (musicTime + this.playDelayFor(this.delayMs) - now) / 1000;
    if (when < this.ctx.currentTime) {
      this.late += 1; // arrived after its moment: skip rather than pile up
      return;
    }
    if (Math.abs(when - this.nextTime) < SNAP_S) when = this.nextTime;
    else if (when > this.nextTime && this.nextTime > 0) this.gaps += 1;
    else if (when < this.nextTime) {
      this.late += 1; // the delay shrank: drop 10 ms to catch up instead of overlapping
      return;
    }
    const buffer = this.ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.onended = () => this.sources.delete(source);
    source.start(when);
    this.sources.add(source);
    this.nextTime = when + buffer.duration;
  }

  /** Delay = nearly the slowest recent chunk + margin; rises at once, falls over ~5 s. */
  private track(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > LATENCY_WINDOW) this.latencies.shift();
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]!;
    const target = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, p98 + JITTER_MARGIN_MS));
    this.delayMs = this.delayMs === null || target > this.delayMs ? target : this.delayMs * 0.998 + target * 0.002;
  }
}
