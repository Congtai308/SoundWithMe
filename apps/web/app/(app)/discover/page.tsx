"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ERROR_CODES } from "@soundwithme/constants";
import { useSearchTracks } from "@/features/music/hooks/use-search-tracks";
import { VideoCard, VideoCardSkeleton } from "@/features/music/components/VideoCard";
import { MUSIC_ARTISTS, MUSIC_TOPICS } from "@/features/music/topics";
import { VIBES } from "@/features/music/vibes";
import { useTrackActions, type TrackActionMode } from "@/features/rooms/hooks/use-track-actions";
import { useRecentTracks } from "@/features/rooms/stores/recent-tracks";
import { TrackArt } from "@/features/rooms/components/TrackArt";
import { Icon } from "@/components/ui/Icon";
import { ApiClientError } from "@/services/api-client";
import { StatePanel, ghostPillClass } from "@/components/ui/StatePanel";

const SKELETON_COUNT = 10;

const MODE_HINT: Record<TrackActionMode, string> = {
  control: "Bấm vào video để phát trong phòng của bạn — hoặc thêm vào hàng chờ nếu đang có bài phát.",
  add: "Bấm vào video để thêm vào hàng chờ phòng bạn.",
  locked: "Chỉ chủ phòng được thêm bài trong phòng bạn đang nghe.",
  "no-room": "Bấm vào video để mở phòng với bài đó và mời bạn bè nghe cùng.",
};

// useSearchParams() requires a Suspense boundary in the App Router, or
// `next build` fails static generation for this route.
/** Thumbnails in the first rows (2 columns on phones) load first: they're what people see. */
const PRIORITY_THUMBNAILS = 4;

export default function MusicPage() {
  return (
    <Suspense fallback={null}>
      <MusicContent />
    </Suspense>
  );
}

/** Music — search YouTube, browse topics and artists, and send songs to your room. */
function MusicContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const topicParam = searchParams.get("topic");
  const vibeParam = searchParams.get("vibe");

  // `?vibe=` links (Home, top bar) still work: they map to the vibe's query.
  const vibe = VIBES.find((v) => v.slug === vibeParam) ?? null;
  const topic = MUSIC_TOPICS.find((t) => t.slug === topicParam) ?? (vibe || qParam ? null : MUSIC_TOPICS[0]);

  const [input, setInput] = useState(qParam);
  useEffect(() => setInput(qParam), [qParam]);

  const query = input.trim() || topic?.query || vibe?.query || "";
  const { data: tracks, isFetching, isError, error, refetch } = useSearchTracks(query);
  const quotaSpent = error instanceof ApiClientError && error.code === ERROR_CODES.MUSIC_PROVIDER_QUOTA_EXCEEDED;
  const { mode, pick, playNow, notice } = useTrackActions();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    router.replace(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover");
  };
  const pickTopic = (slug: string) => {
    setInput("");
    router.replace(`/discover?topic=${slug}`);
  };
  const searchArtist = (name: string) => router.replace(`/discover?q=${encodeURIComponent(name)}`);

  const heading = input.trim()
    ? `Kết quả cho “${input.trim()}”`
    : topic
      ? `${topic.emoji} ${topic.label}`
      : vibe
        ? `${vibe.emoji} ${vibe.label}`
        : "Bài hát";

  return (
    <div className="relative mx-auto w-full max-w-[1400px] px-md py-lg md:px-[40px]">
      <div className="pointer-events-none absolute -top-24 left-1/3 h-96 w-96 rounded-full bg-primary-container/10 blur-[120px]" />

      <form onSubmit={submit} role="search" className="relative mx-auto mb-xl max-w-2xl">
        <Icon name="search" className="pointer-events-none absolute left-lg top-1/2 z-10 -translate-y-1/2 text-[22px] text-outline" />
        <label htmlFor="music-search" className="sr-only">
          Tìm bài hát
        </label>
        <input
          id="music-search"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tìm bài bạn muốn nghe…"
          className="w-full rounded-full border border-[#8B5CF6]/40 bg-[rgba(18,24,38,0.85)] py-sm pl-[56px] pr-[52px] text-body-lg text-on-surface shadow-[0_0_32px_rgba(139,92,246,0.18)] transition-shadow placeholder:text-[#475569] focus:border-[#8B5CF6] focus:shadow-[0_0_40px_rgba(139,92,246,0.3)] focus:outline-none"
        />
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput("");
              router.replace("/discover");
            }}
            aria-label="Xoá tìm kiếm"
            className="absolute right-sm top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-outline hover:bg-white/[0.06] hover:text-on-surface"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        )}
      </form>

      <div className="relative grid grid-cols-1 gap-xl lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <section aria-labelledby="topics-heading" className="mb-lg flex flex-col gap-sm">
            <h2 id="topics-heading" className="font-technical flex items-center gap-1.5 text-label-mono-sm uppercase text-on-surface-variant">
              <Icon name="explore" className="text-[16px] text-tertiary" />
              Hôm nay bạn muốn nghe gì?
            </h2>
            <div className="flex flex-wrap gap-xs">
              {MUSIC_TOPICS.map((t) => {
                const active = !input.trim() && topic?.slug === t.slug;
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => pickTopic(t.slug)}
                    aria-pressed={active}
                    className={`rounded-full border px-md py-1.5 text-body-md transition-colors ${
                      active
                        ? "border-[#8B5CF6] bg-[#8B5CF6]/20 text-[#c4b5fd]"
                        : "border-white/[0.1] bg-surface-container-low text-on-surface-variant hover:border-white/[0.2] hover:text-on-surface"
                    }`}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-xs">
              {MUSIC_ARTISTS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => searchArtist(name)}
                  aria-pressed={input.trim() === name}
                  className={`rounded-full border px-sm py-1 text-body-sm transition-colors ${
                    input.trim() === name
                      ? "border-[#8B5CF6] text-[#c4b5fd]"
                      : "border-white/[0.08] text-outline hover:border-white/[0.18] hover:text-on-surface"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>

          <section aria-live="polite" aria-busy={isFetching}>
            <div className="mb-md flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="truncate text-headline-md text-on-surface">{heading}</h2>
              <p className="text-body-sm text-outline">{MODE_HINT[mode]}</p>
            </div>

            {isError ? (
              <StatePanel
                tone="error"
                icon={quotaSpent ? "hourglass_top" : "wifi_off"}
                title={quotaSpent ? "Tìm kiếm YouTube đang tạm nghỉ" : "Không kết nối được YouTube"}
                body={
                  quotaSpent
                    ? "Hôm nay đã hết lượt tìm kiếm — vài giờ nữa sẽ có lại. Dán link YouTube vào phòng vẫn dùng được."
                    : "Kiểm tra kết nối mạng rồi thử lại."
                }
                action={
                  <button type="button" onClick={() => refetch()} className={ghostPillClass}>
                    <Icon name="refresh" className="text-[18px]" />
                    Thử lại
                  </button>
                }
              />
            ) : !tracks ? (
              <div className="grid grid-cols-2 gap-x-md gap-y-lg sm:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                  <VideoCardSkeleton key={i} />
                ))}
              </div>
            ) : tracks.length === 0 ? (
              <StatePanel
                icon="search_off"
                title="Không tìm thấy video nào"
                body="Thử tên hoặc chủ đề khác. Nếu tìm gì cũng không ra, máy chủ chưa có YOUTUBE_API_KEY — dán link YouTube vào phòng vẫn dùng được."
              />
            ) : (
              <div
                className={`grid grid-cols-2 gap-x-md gap-y-lg transition-opacity sm:grid-cols-3 xl:grid-cols-5 ${
                  isFetching ? "opacity-60" : ""
                }`}
              >
                {tracks.map((track, index) => (
                  <VideoCard
                    key={track.id}
                    track={track}
                    mode={mode}
                    onPick={pick}
                    onPlayNow={playNow}
                    priority={index < PRIORITY_THUMBNAILS}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <RecentlyPlayed mode={mode} onPick={pick} />
      </div>

      {notice && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-xs rounded-full border border-white/[0.16] bg-[rgba(30,41,59,0.92)] px-md py-xs text-body-sm text-on-surface shadow-xl backdrop-blur-xl sm:bottom-md"
        >
          <Icon name="check_circle" className="text-[18px] text-success" filled />
          {notice}
        </div>
      )}
    </div>
  );
}

function RecentlyPlayed({ mode, onPick }: { mode: TrackActionMode; onPick: (trackId: string) => void }) {
  const tracks = useRecentTracks((s) => s.tracks);
  const hydrated = useRecentTracks((s) => s.hydrated);
  const hydrate = useRecentTracks((s) => s.hydrate);
  const clear = useRecentTracks((s) => s.clear);

  useEffect(hydrate, [hydrate]);

  return (
    <aside aria-labelledby="recent-heading" className="flex flex-col gap-sm lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center justify-between">
        <h2 id="recent-heading" className="flex items-center gap-1.5 text-headline-sm text-on-surface">
          <Icon name="history" className="text-[18px] text-outline" />
          Nghe gần đây
        </h2>
        {tracks.length > 0 && (
          <button
            type="button"
            onClick={clear}
            aria-label="Xoá lịch sử nghe"
            title="Xoá lịch sử nghe"
            className="flex h-8 w-8 items-center justify-center rounded-full text-outline hover:bg-white/[0.06] hover:text-on-surface"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        )}
      </div>

      {hydrated && tracks.length === 0 ? (
        <p className="text-body-sm text-outline">Các bài bạn nghe trong phòng sẽ hiện ở đây.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tracks.map((track) => (
            <li key={track.id}>
              <button
                type="button"
                onClick={() => onPick(track.id)}
                disabled={mode === "locked"}
                className="flex w-full items-center gap-sm rounded-md p-1.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed"
              >
                <span className="relative h-[45px] w-20 shrink-0 overflow-hidden rounded-md bg-surface-container-high">
                  {track.artworkUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- artwork comes from provider CDNs
                    <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <TrackArt artworkUrl={null} seed={track.id} size={45} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-body-sm font-medium text-on-surface">{track.title}</span>
                  <span className="block truncate text-[12px] text-outline">{track.artistName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
