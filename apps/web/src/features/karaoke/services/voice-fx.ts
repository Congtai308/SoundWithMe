/**
 * Karaoke voice effects, applied on the singer's side so every listener
 * hears the same thing: mic → dry + reverb (convolver) + echo (feedback
 * delay) → one MediaStream that is sent instead of the raw mic. Changing the
 * effect only moves gains, so the stream (and every connection using it)
 * never has to be replaced.
 */
export type VoiceEffect = "off" | "room" | "hall" | "echo";

export const VOICE_EFFECTS: { value: VoiceEffect; label: string; icon: string }[] = [
  { value: "off", label: "Gốc", icon: "mic" },
  { value: "room", label: "Phòng", icon: "meeting_room" },
  { value: "hall", label: "Hội trường", icon: "stadium" },
  { value: "echo", label: "Vang", icon: "graphic_eq" },
];

interface EffectShape {
  reverb: number; // wet level at amount 100
  echo: number;
  echoDelayS: number;
  feedback: number;
}

const SHAPES: Record<VoiceEffect, EffectShape> = {
  off: { reverb: 0, echo: 0, echoDelayS: 0.25, feedback: 0 },
  room: { reverb: 0.35, echo: 0, echoDelayS: 0.25, feedback: 0 },
  hall: { reverb: 0.7, echo: 0.12, echoDelayS: 0.32, feedback: 0.2 },
  echo: { reverb: 0.15, echo: 0.45, echoDelayS: 0.28, feedback: 0.38 },
};

const RAMP_S = 0.08;

/** Exponentially decaying stereo noise: a cheap, natural-sounding impulse response. */
function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

export class VoiceFx {
  readonly output: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly destination: MediaStreamAudioDestinationNode;
  private readonly dry: GainNode;
  private readonly reverbWet: GainNode;
  private readonly echoWet: GainNode;
  private readonly delay: DelayNode;
  private readonly feedback: GainNode;
  private readonly nodes: AudioNode[];

  constructor(
    private readonly ctx: AudioContext,
    mic: MediaStream,
  ) {
    this.source = ctx.createMediaStreamSource(mic);
    this.destination = ctx.createMediaStreamDestination();
    this.dry = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = impulseResponse(ctx, 2.4, 3);
    this.reverbWet = ctx.createGain();
    this.delay = ctx.createDelay(1);
    this.feedback = ctx.createGain();
    this.echoWet = ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.echoWet.gain.value = 0;
    this.feedback.gain.value = 0;

    this.source.connect(this.dry).connect(this.destination);
    this.source.connect(convolver).connect(this.reverbWet).connect(this.destination);
    this.source.connect(this.delay);
    this.delay.connect(this.feedback).connect(this.delay);
    this.delay.connect(this.echoWet).connect(this.destination);

    this.nodes = [this.source, this.dry, convolver, this.reverbWet, this.delay, this.feedback, this.echoWet, this.destination];
    this.output = this.destination.stream;
  }

  /** `amount` 0–100 scales the effect's wet levels; the dry voice always stays at full. */
  set(effect: VoiceEffect, amount: number): void {
    const shape = SHAPES[effect];
    const scale = Math.max(0, Math.min(100, amount)) / 100;
    const now = this.ctx.currentTime;
    this.reverbWet.gain.setTargetAtTime(shape.reverb * scale, now, RAMP_S);
    this.echoWet.gain.setTargetAtTime(shape.echo * scale, now, RAMP_S);
    this.feedback.gain.setTargetAtTime(shape.feedback * scale, now, RAMP_S);
    this.delay.delayTime.setTargetAtTime(shape.echoDelayS, now, RAMP_S);
    // A touch less dry voice with heavy effects keeps the total level steady.
    this.dry.gain.setTargetAtTime(1 - 0.2 * Math.max(shape.reverb, shape.echo) * scale, now, RAMP_S);
  }

  destroy(): void {
    for (const node of this.nodes) node.disconnect();
    this.output.getTracks().forEach((track) => track.stop());
  }
}
