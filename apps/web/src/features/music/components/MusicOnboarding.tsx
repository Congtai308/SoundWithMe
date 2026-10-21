"use client";

import { useEffect, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MAX_ARTIST_IMAGE_NAMES } from "@soundwithme/validation";
import { Icon } from "@/components/ui/Icon";
import { musicApi } from "../services/music-api";
import { GENRES, SUGGESTED_ARTISTS, artistHue, initials } from "../preferences";
import type { Preferences } from "../hooks/use-music-preferences";

const MAX_ARTIST_NAME = 60;

interface MusicOnboardingProps {
  initial: Preferences | null;
  /** Genres/artists the listener plays a lot — badged so they're easy to keep. */
  habitGenres: Set<string>;
  habitArtists: string[];
  isSaving: boolean;
  onSave: (preferences: Preferences) => void;
  /** Only when editing existing answers; first-time onboarding offers "Để sau" instead. */
  onClose?: () => void;
}

/** Channel avatars for the bubbles; missing names keep their initials. */
function useArtistImages(names: string[]): Record<string, string> {
  const capped = names.slice(0, MAX_ARTIST_IMAGE_NAMES);
  const { data } = useQuery({
    queryKey: ["music", "artist-images", capped],
    queryFn: () => musicApi.artistImages(capped).then((r) => r.images),
    enabled: capped.length > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return data ?? {};
}

/** Channel photo, or the artist's initials when there's none or it fails to load. */
function ArtistAvatar({ name, src }: { name: string; src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{initials(name)}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- channel avatars come from YouTube's CDN
    <img
      src={src}
      alt=""
      // YouTube's image CDN rejects many hotlinked requests that carry a Referer.
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full rounded-full object-cover"
    />
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Spotify-style first-run picker: genres first, then favourite artists. */
export function MusicOnboarding({ initial, habitGenres, habitArtists, isSaving, onSave, onClose }: MusicOnboardingProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [genres, setGenres] = useState<string[]>(initial?.genres ?? []);
  const [artists, setArtists] = useState<string[]>(initial?.artists ?? []);
  const [custom, setCustom] = useState("");

  // Habits first, then suggestions; typed artists stay visible as bubbles too.
  const artistOptions = [...new Set([...habitArtists, ...SUGGESTED_ARTISTS, ...artists])];
  const habitArtistSet = new Set(habitArtists);
  const images = useArtistImages(step === 2 ? artistOptions : []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const name = custom.trim().slice(0, MAX_ARTIST_NAME);
    if (!name) return;
    const existing = artistOptions.find((a) => a.toLowerCase() === name.toLowerCase());
    setArtists((current) => (current.includes(existing ?? name) ? current : [...current, existing ?? name]));
    setCustom("");
  };

  const finish = () => onSave({ genres, artists });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_top,#2b2150_0%,#121318_55%)]"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-md pb-[120px] pt-xl md:px-xl">
        <div className="mb-lg flex items-center justify-between">
          <div className="flex items-center gap-xs">
            {[1, 2].map((n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === step ? "w-10 bg-primary-container" : "w-5 bg-white/20"}`} />
            ))}
            <span className="font-technical ml-xs text-label-mono-sm text-on-surface-variant">Bước {step}/2</span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-10 w-10 items-center justify-center rounded-full text-outline hover:bg-white/[0.06] hover:text-on-surface"
            >
              <Icon name="close" className="text-[22px]" />
            </button>
          )}
        </div>

        {step === 1 ? (
          <>
            <h1 id="onboarding-title" className="text-[30px] font-bold leading-tight tracking-tight text-on-surface md:text-[40px]">
              Bạn thích nghe thể loại nào?
            </h1>
            <p className="mb-lg mt-xs text-body-lg text-on-surface-variant">
              Chọn ít nhất 1 thể loại — chọn càng nhiều, gợi ý càng hợp gu bạn.
            </p>
            <div className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-4">
              {GENRES.map((genre) => {
                const selected = genres.includes(genre.slug);
                return (
                  <button
                    key={genre.slug}
                    type="button"
                    onClick={() => setGenres((current) => toggle(current, genre.slug))}
                    aria-pressed={selected}
                    className={`relative flex h-24 overflow-hidden rounded-xl bg-gradient-to-br ${genre.color} p-sm text-left transition-all hover:scale-[1.02] active:scale-[0.98] md:h-28 ${
                      selected ? "ring-4 ring-white/90 ring-offset-2 ring-offset-[#121318]" : "opacity-90 hover:opacity-100"
                    }`}
                  >
                    <span className="max-w-[75%] text-headline-sm font-bold text-white md:text-headline-md">{genre.label}</span>
                    <span aria-hidden="true" className="absolute -bottom-2 -right-1 rotate-[20deg] text-[48px] drop-shadow-lg md:text-[56px]">
                      {genre.emoji}
                    </span>
                    {selected && (
                      <span className="absolute right-xs top-xs flex h-7 w-7 items-center justify-center rounded-full bg-white text-black shadow-md">
                        <Icon name="check" className="text-[18px]" />
                      </span>
                    )}
                    {habitGenres.has(genre.slug) && (
                      <span className="absolute bottom-xs left-sm rounded-full bg-black/45 px-xs py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                        🔥 Bạn hay nghe
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h1 id="onboarding-title" className="text-[30px] font-bold leading-tight tracking-tight text-on-surface md:text-[40px]">
              Chọn ca sĩ bạn yêu thích
            </h1>
            <p className="mb-md mt-xs text-body-lg text-on-surface-variant">
              Không thấy ai? Gõ tên để thêm. Bước này có thể bỏ qua.
            </p>
            <form onSubmit={addCustom} className="relative mb-lg max-w-md">
              <Icon name="person_search" className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2 text-[20px] text-outline" />
              <label htmlFor="artist-input" className="sr-only">
                Thêm ca sĩ
              </label>
              <input
                id="artist-input"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={MAX_ARTIST_NAME}
                placeholder="Gõ tên ca sĩ rồi nhấn Enter…"
                className="w-full rounded-full border border-white/[0.12] bg-white/[0.06] py-sm pl-[48px] pr-[96px] text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:outline-none"
              />
              <button
                type="submit"
                disabled={!custom.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-primary-container px-md py-1.5 text-body-sm font-semibold text-on-primary-container disabled:opacity-40"
              >
                Thêm
              </button>
            </form>
            <div className="grid grid-cols-3 gap-x-sm gap-y-lg sm:grid-cols-4 md:grid-cols-6">
              {artistOptions.map((name) => {
                const selected = artists.includes(name);
                const hue = artistHue(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setArtists((current) => toggle(current, name))}
                    aria-pressed={selected}
                    className="group flex flex-col items-center gap-xs"
                  >
                    <span
                      className={`relative flex aspect-square w-full max-w-[112px] items-center justify-center rounded-full text-[26px] font-bold text-white shadow-lg transition-all group-hover:scale-105 ${
                        selected ? "ring-4 ring-primary-container ring-offset-2 ring-offset-[#121318]" : ""
                      }`}
                      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 65% 25%))` }}
                    >
                      <ArtistAvatar name={name} src={images[name]} />
                      {habitArtistSet.has(name) && (
                        <span className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-tertiary-container px-xs py-0.5 text-[10px] font-bold text-white shadow-md">
                          🔥 Hay nghe
                        </span>
                      )}
                      {selected && (
                        <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-md">
                          <Icon name="check" className="text-[20px]" />
                        </span>
                      )}
                    </span>
                    <span className={`line-clamp-2 text-center text-body-sm ${selected ? "font-semibold text-on-surface" : "text-on-surface-variant"}`}>
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-white/[0.06] bg-[#121318]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-sm px-md py-sm md:px-xl">
          <p className="text-body-sm text-on-surface-variant">
            {step === 1 ? `Đã chọn ${genres.length} thể loại` : `Đã chọn ${artists.length} ca sĩ`}
          </p>
          <div className="flex items-center gap-xs">
            {step === 1 ? (
              <>
                {!onClose && (
                  <button
                    type="button"
                    onClick={() => onSave({ genres: [], artists: [] })}
                    disabled={isSaving}
                    className="rounded-full px-md py-sm text-body-md text-outline hover:text-on-surface"
                  >
                    Để sau
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={genres.length === 0}
                  className="flex items-center gap-xs rounded-full bg-primary-container px-lg py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.4)] transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                >
                  Tiếp tục
                  <Icon name="arrow_forward" className="text-[20px]" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full px-md py-sm text-body-md text-outline hover:text-on-surface"
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  onClick={finish}
                  disabled={isSaving}
                  className="flex items-center gap-xs rounded-full bg-primary-container px-lg py-sm text-headline-sm text-on-primary-container shadow-[0_0_24px_rgba(160,120,255,0.4)] transition-all hover:scale-[1.02] disabled:opacity-60"
                >
                  {isSaving ? <Icon name="progress_activity" className="animate-spin text-[20px]" /> : <Icon name="check" className="text-[20px]" />}
                  {artists.length === 0 ? "Bỏ qua & xong" : "Xong"}
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
