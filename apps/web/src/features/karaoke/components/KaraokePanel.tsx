"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { karaoke } from "../hooks/use-karaoke";
import { VOICE_EFFECTS } from "../services/voice-fx";
import { isSinging, useKaraokeStore } from "../stores/karaoke-store";

/**
 * Karaoke mics for the room: who's singing (with live voice levels), and
 * the controls to take a mic, drop it, or set how the voices sound here.
 */
export function KaraokePanel({ isHost }: { isHost: boolean }) {
  const singers = useKaraokeStore((s) => s.singers);
  const maxSingers = useKaraokeStore((s) => s.maxSingers);
  const line = useKaraokeStore((s) => s.line);
  const voiceEffect = useKaraokeStore((s) => s.voiceEffect);
  const voiceEffectAmount = useKaraokeStore((s) => s.voiceEffectAmount);
  const mySocketId = useKaraokeStore((s) => s.mySocketId);
  const micStatus = useKaraokeStore((s) => s.micStatus);
  const micError = useKaraokeStore((s) => s.micError);
  const voiceVolume = useKaraokeStore((s) => s.voiceVolume);
  const musicWhileSinging = useKaraokeStore((s) => s.musicWhileSinging);
  const hearOtherSingers = useKaraokeStore((s) => s.hearOtherSingers);
  const listenDelayMs = useKaraokeStore((s) => s.listenDelayMs);
  const connected = useKaraokeStore((s) => s.connected);
  const voiceFailed = useKaraokeStore((s) => s.voiceFailed);
  const relayed = useKaraokeStore((s) => s.relayed);

  const singing = isSinging({ singers, mySocketId });
  const others = singers.filter((s) => s.socketId !== mySocketId);
  const full = singers.length >= maxSingers && !singing;
  const linePosition = line.findIndex((entry) => entry.socketId === mySocketId);
  const inLine = linePosition >= 0;
  // Free mics go to the line first: with people waiting, you queue too.
  const mustWait = !singing && (full || (line.length > 0 && linePosition !== 0));
  const unreachable = others.filter((s) => voiceFailed[s.socketId] && !connected[s.socketId]);
  const levelRefs = useRef(new Map<string, HTMLElement>());

  // Voice level rings, painted straight onto the elements ~30× a second.
  useEffect(() => {
    if (singers.length === 0) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 33) {
        last = now;
        for (const [socketId, element] of levelRefs.current) {
          const level = karaoke.level(socketId === mySocketId ? "me" : socketId);
          element.style.setProperty("--level", level.toFixed(2));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [singers, mySocketId]);

  return (
    <section aria-label="Karaoke" className="flex shrink-0 flex-col gap-sm border-b border-white/[0.08] px-md py-sm">
      <div className="flex items-center justify-between gap-sm">
        <h2 className="flex items-center gap-1.5 text-headline-sm text-on-surface">
          <Icon name="mic" className="text-[20px] text-[#f472b6]" filled />
          Karaoke
        </h2>
        <span className="font-technical rounded-full bg-white/[0.06] px-xs py-0.5 text-label-mono-sm text-on-surface-variant">
          {singers.length}/{maxSingers} mic
        </span>
      </div>

      {singers.length > 0 && (
        <ul className="flex flex-wrap gap-sm" aria-label="Đang hát">
          {singers.map((singer) => {
            const isMe = singer.socketId === mySocketId;
            const live = isMe || connected[singer.socketId];
            return (
              <li key={singer.socketId} className="flex items-center gap-xs rounded-full bg-white/[0.05] py-1 pl-1 pr-sm">
                <span
                  ref={(element) => {
                    if (element) levelRefs.current.set(singer.socketId, element);
                    else levelRefs.current.delete(singer.socketId);
                  }}
                  className="rounded-full transition-shadow duration-75 [box-shadow:0_0_0_calc(2px+var(--level,0)*6px)_rgba(244,114,182,calc(0.25+var(--level,0)*0.6))]"
                >
                  <Avatar name={singer.displayName} size={28} />
                </span>
                <span className="max-w-[9rem] truncate text-body-sm font-semibold text-on-surface">
                  {isMe ? "Bạn" : singer.displayName}
                </span>
                {!live && <Icon name="progress_activity" className="animate-spin text-[14px] text-outline" />}
                {live && !isMe && relayed[singer.socketId] && (
                  <span title="Mạng của bạn chặn kết nối giọng trực tiếp nên giọng hát đi qua máy chủ SoundWithMe">
                    <Icon name="dns" className="text-[14px] text-outline" />
                  </span>
                )}
                {isHost && !isMe && (
                  <button
                    type="button"
                    onClick={() => karaoke.releaseMic(singer.socketId)}
                    aria-label={`Tắt mic của ${singer.displayName}`}
                    title="Tắt mic này"
                    className="rounded-full p-0.5 text-outline hover:text-error"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-sm">
        {singing || micStatus !== "off" ? (
          <button
            type="button"
            onClick={() => karaoke.releaseMic()}
            className="flex items-center gap-1.5 rounded-full border border-error/50 bg-error/10 px-md py-1.5 text-body-sm font-semibold text-error hover:bg-error/20"
          >
            <Icon name="mic_off" className="text-[18px]" />
            {micStatus === "starting" ? "Huỷ" : "Dừng hát"}
          </button>
        ) : inLine ? (
          <button
            type="button"
            onClick={() => karaoke.leaveLine()}
            title="Mic tự bật khi đến lượt bạn"
            className="flex items-center gap-1.5 rounded-full border border-[#f59e0b]/50 bg-[#f59e0b]/10 px-md py-1.5 text-body-sm font-semibold text-[#fbbf24] hover:bg-[#f59e0b]/20"
          >
            <Icon name="hourglass_top" className="text-[18px]" />
            #{linePosition + 1} in line · Leave
          </button>
        ) : mustWait ? (
          <button
            type="button"
            onClick={() => karaoke.joinLine()}
            title="Chờ mic trống tiếp theo — mic tự bật khi đến lượt bạn"
            className="flex items-center gap-1.5 rounded-full border border-[#ec4899]/50 bg-[#ec4899]/10 px-md py-1.5 text-body-sm font-semibold text-[#f9a8d4] hover:bg-[#ec4899]/20"
          >
            <Icon name="playlist_add" className="text-[18px]" />
            Xếp hàng hát
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void karaoke.requestMic()}
            title="Hát cùng — mọi người nghe bạn khớp với nhạc"
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#d946ef] to-[#ec4899] px-md py-1.5 text-body-sm font-semibold text-white shadow-[0_0_18px_rgba(236,72,153,0.4)] transition-transform hover:scale-[1.03]"
          >
            <Icon name="mic" className="text-[18px]" filled />
            Hát
          </button>
        )}

        {singing && others.length > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-body-sm text-on-surface-variant">
            <input
              type="checkbox"
              checked={hearOtherSingers}
              onChange={(e) => karaoke.setHearOtherSingers(e.target.checked)}
              className="accent-[#ec4899]"
            />
            Nghe người khác hát
          </label>
        )}
      </div>

      {(!singing || hearOtherSingers) && others.length > 0 && (
        <div className="grid grid-cols-[auto_1fr_2.5rem] items-center gap-x-sm gap-y-1.5 text-body-sm text-on-surface-variant">
          <Icon name="record_voice_over" className="text-[18px]" />
          <input
            type="range"
            min={0}
            max={100}
            value={voiceVolume}
            onChange={(e) => karaoke.setVoiceVolume(Number(e.target.value))}
            aria-label="Âm lượng người hát"
            title="Âm lượng người hát (chỉ với bạn)"
            className="h-1 w-full cursor-pointer accent-[#ec4899]"
          />
          <span className="font-technical text-right text-label-mono-sm">{voiceVolume * 2}%</span>
          <Icon name="music_note" className="text-[18px]" />
          <input
            type="range"
            min={0}
            max={100}
            value={musicWhileSinging}
            onChange={(e) => karaoke.setMusicWhileSinging(Number(e.target.value))}
            aria-label="Nhạc khi có người hát"
            title="Nhạc khi có người hát (% âm lượng, chỉ với bạn)"
            className="h-1 w-full cursor-pointer accent-[#8b5cf6]"
          />
          <span className="font-technical text-right text-label-mono-sm">{musicWhileSinging}%</span>
        </div>
      )}

      {line.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-body-sm text-on-surface-variant" aria-label="Đang chờ hát">
          <Icon name="queue" className="text-[16px] text-outline" />
          Tiếp theo:
          {line.map((entry, index) => (
            <span key={entry.socketId} className={entry.socketId === mySocketId ? "font-semibold text-[#fbbf24]" : ""}>
              {index + 1}. {entry.socketId === mySocketId ? "Bạn" : entry.displayName}
              {index < line.length - 1 ? "," : ""}
            </span>
          ))}
        </p>
      )}

      <div className="flex flex-col gap-1.5" aria-label="Hiệu ứng giọng">
        <div className="flex items-center gap-1">
          <Icon name="graphic_eq" className="text-[18px] text-on-surface-variant" />
          <div role="radiogroup" aria-label="Hiệu ứng giọng" className="flex flex-1 gap-1">
            {VOICE_EFFECTS.map((effect) => (
              <button
                key={effect.value}
                type="button"
                role="radio"
                aria-checked={voiceEffect === effect.value}
                onClick={() => karaoke.setVoiceEffect(effect.value, voiceEffectAmount)}
                title={`${effect.label} — mọi người nghe giọng bạn như thế này`}
                className={`flex-1 rounded-full px-1.5 py-0.5 text-body-sm transition-colors ${
                  voiceEffect === effect.value
                    ? "bg-[#ec4899]/25 font-semibold text-[#f9a8d4]"
                    : "bg-white/[0.05] text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {effect.label}
              </button>
            ))}
          </div>
        </div>
        {voiceEffect !== "off" && (
          <label className="flex items-center gap-1.5 text-on-surface-variant" title="Độ mạnh hiệu ứng">
            <span className="w-[18px]" />
            <input
              type="range"
              min={0}
              max={100}
              value={voiceEffectAmount}
              onChange={(e) => karaoke.setVoiceEffect(voiceEffect, Number(e.target.value))}
              aria-label="Độ mạnh hiệu ứng"
              className="h-1 w-full cursor-pointer accent-[#ec4899]"
            />
            <span className="font-technical w-9 text-right text-label-mono-sm">{voiceEffectAmount}%</span>
          </label>
        )}
      </div>

      {micStatus === "starting" && (
        <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <Icon name="headphones" className="text-[16px]" />
          Use headphones, so your mic doesn&apos;t pick up the music.
        </p>
      )}
      {singing && others.length > 0 && !hearOtherSingers && (
        <p className="text-body-sm text-outline">
          The room hears everyone in time; other singers&apos; voices reach you a little late, so they&apos;re off here.
        </p>
      )}
      {!singing && others.length > 0 && listenDelayMs > 0 && (
        <p className="text-body-sm text-outline" title="Để giọng hát và nhạc đến tai bạn cùng lúc">
          Music held back {listenDelayMs} ms to match the singers.
        </p>
      )}
      {unreachable.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 text-body-sm text-[#fbbf24]">
          <Icon name="wifi_off" className="mt-0.5 text-[16px]" />
          <span>
            Can&apos;t reach {unreachable.map((s) => s.displayName).join(", ")}&apos;s voice, even through the server —
            check the connection on both sides.
          </span>
        </p>
      )}
      {micError && (
        <p role="alert" className="text-body-sm text-error">
          {micError}
        </p>
      )}
    </section>
  );
}
