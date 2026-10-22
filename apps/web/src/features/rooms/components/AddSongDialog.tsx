"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { TrackWithArtist } from "@soundwithme/types";
import { MAX_QUEUE_ADD_MANY } from "@soundwithme/validation";
import { ApiClientError } from "@/services/api-client";
import { Icon } from "@/components/ui/Icon";
import { musicApi } from "@/features/music/services/music-api";
import { useSearchTracks } from "@/features/music/hooks/use-search-tracks";
import { TrackArt, formatClock } from "./TrackArt";

const YOUTUBE_LINK = /(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i;
/** Each URL runs until whitespace or the next "http" — pasted lists sometimes lose their separators. */
const URL_PATTERN = /https?:\/\/.+?(?=https?:\/\/|\s|$)/gi;

/** Every distinct YouTube link in a paste, in order. */
export function extractYouTubeLinks(text: string): string[] {
  const links = (text.match(URL_PATTERN) ?? []).filter((url) => YOUTUBE_LINK.test(url));
  return [...new Set(links)];
}

interface ResolveResult {
  tracks: TrackWithArtist[];
  failed: string[];
}

interface AddSongDialogProps {
  canPlayNow: boolean;
  onQueue: (trackId: string) => void;
  onQueueMany: (trackIds: string[]) => void;
  onPlayNow: (trackId: string) => void;
  onClose: () => void;
}

/**
 * Add songs by pasting YouTube links (one or many at once) or by searching
 * the catalog. The dialog stays open while queueing so several songs can be
 * added in one go; "Play now" or Done closes it.
 */
export function AddSongDialog({ canPlayNow, onQueue, onQueueMany, onPlayNow, onClose }: AddSongDialogProps) {
  const [input, setInput] = useState("");
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allLinks = extractYouTubeLinks(input);
  const links = allLinks.slice(0, MAX_QUEUE_ADD_MANY);
  const isLink = allLinks.length > 0;

  // Sequential so the results keep the pasted order (and stay under the resolve rate limit).
  const resolve = useMutation({
    mutationFn: async (urls: string[]): Promise<ResolveResult> => {
      const result: ResolveResult = { tracks: [], failed: [] };
      setProgress({ done: 0, total: urls.length });
      for (const [i, url] of urls.entries()) {
        try {
          const { track } = await musicApi.resolve(url);
          if (!result.tracks.some((t) => t.id === track.id)) result.tracks.push(track);
        } catch (error: unknown) {
          if (urls.length === 1) throw error;
          result.failed.push(url);
        }
        setProgress({ done: i + 1, total: urls.length });
      }
      return result;
    },
    onSettled: () => setProgress(null),
  });
  const search = useSearchTracks(isLink ? "" : input);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isLink) resolve.mutate(links);
  };

  // A single-line input drops newlines from a pasted list; keep the links apart.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/\r|\n/.test(text)) return;
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? input.length;
    const end = target.selectionEnd ?? input.length;
    setInput(`${input.slice(0, start)}${text.replace(/\s+/g, " ").trim()}${input.slice(end)}`);
    resolve.reset();
  };

  const markAdded = (ids: string[]) => setAdded((prev) => new Set([...prev, ...ids]));

  const queueOne = (track: TrackWithArtist) => {
    onQueue(track.id);
    markAdded([track.id]);
  };

  const playNow = (track: TrackWithArtist) => {
    onPlayNow(track.id);
    onClose();
  };

  const results: TrackWithArtist[] = isLink ? (resolve.data?.tracks ?? []) : (search.data ?? []);
  const notYetAdded = results.filter((t) => !added.has(t.id));

  const queueAll = () => {
    const ids = notYetAdded.map((t) => t.id);
    if (ids.length === 0) return;
    onQueueMany(ids);
    markAdded(ids);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-md pt-[10vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-song-title"
        className="flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-white/[0.16] bg-[rgba(30,41,59,0.92)] shadow-[0_12px_36px_-4px_rgba(0,0,0,0.65),0_0_24px_-2px_rgba(139,92,246,0.12)] backdrop-blur-[32px]"
      >
        <header className="flex items-center justify-between px-lg pb-sm pt-lg">
          <h2 id="add-song-title" className="text-headline-md text-on-surface">
            Thêm bài hát
          </h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-outline hover:text-on-surface">
            <Icon name="close" className="text-[22px]" />
          </button>
        </header>

        <form onSubmit={submit} className="px-lg">
          <div className="relative">
            <Icon
              name={isLink ? "link" : "search"}
              className="pointer-events-none absolute left-md top-1/2 z-10 -translate-y-1/2 text-[20px] text-primary"
            />
            <input
              ref={inputRef}
              value={input}
              onPaste={onPaste}
              onChange={(e) => {
                setInput(e.target.value);
                resolve.reset();
              }}
              placeholder="Dán link YouTube (nhiều link cùng lúc) hoặc tìm kiếm"
              aria-label="Link YouTube hoặc tên bài hát"
              className="w-full rounded-full border border-white/[0.08] bg-[rgba(18,24,38,0.75)] py-sm pl-[48px] pr-[120px] text-body-md text-on-surface placeholder:text-[#475569] focus:border-[#8B5CF6] focus:outline-none"
            />
            {isLink && (
              <button
                type="submit"
                disabled={resolve.isPending}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-primary-container px-md py-1.5 text-body-sm font-semibold text-on-primary-container disabled:opacity-60"
              >
                {progress ? `Đang tìm ${progress.done}/${progress.total}…` : links.length > 1 ? `Tìm ${links.length}` : "Tìm"}
              </button>
            )}
          </div>
          <p className="mt-xs px-xs text-body-sm text-outline">
            {allLinks.length > MAX_QUEUE_ADD_MANY
              ? `Tối đa ${MAX_QUEUE_ADD_MANY} link mỗi lần — chỉ lấy ${MAX_QUEUE_ADD_MANY} link đầu.`
              : "Dán một link hoặc cả danh sách (mỗi dòng một link). Dùng được với youtube.com, youtu.be, Shorts và YouTube Music."}
          </p>
        </form>

        {isLink && results.length > 1 && (
          <div className="mx-lg mt-sm flex items-center justify-between gap-sm rounded-md border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 px-md py-xs">
            <span className="text-body-sm text-on-surface">
              {results.length} songs found
              {resolve.data && resolve.data.failed.length > 0 && (
                <span className="text-outline"> · {resolve.data.failed.length} link(s) couldn&apos;t be used</span>
              )}
            </span>
            <button
              type="button"
              onClick={queueAll}
              disabled={notYetAdded.length === 0}
              className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container disabled:opacity-50"
            >
              <Icon name={notYetAdded.length === 0 ? "done_all" : "playlist_add"} className="text-[18px]" />
              {notYetAdded.length === 0 ? "Đã thêm hết" : `Thêm cả ${notYetAdded.length} bài`}
            </button>
          </div>
        )}

        <div className="scrollbar-none mt-sm flex min-h-[120px] flex-1 flex-col gap-1 overflow-y-auto px-sm pb-md">
          {resolve.isError && (
            <p role="alert" className="px-md py-sm text-body-md text-error">
              {resolve.error instanceof ApiClientError ? resolve.error.message : "Không tra được link này."}
            </p>
          )}
          {!isLink && search.isFetching && <p className="px-md py-sm text-body-sm text-outline">Đang tìm…</p>}
          {!isLink && input.trim() && search.data && search.data.length === 0 && (
            <p className="px-md py-sm text-body-md text-on-surface-variant">
              Không tìm thấy bài nào. Thử dán link YouTube nhé.
            </p>
          )}
          {!input.trim() && (
            <div className="flex flex-col items-center gap-xs px-md py-lg text-center">
              <Icon name="smart_display" className="text-[36px] text-tertiary-container" />
              <p className="text-body-md text-on-surface-variant">Copy link bài hát trên YouTube rồi dán vào ô bên trên.</p>
              <p className="text-body-sm text-outline">Mẹo: dán cả danh sách một lần, mỗi dòng một link.</p>
            </div>
          )}
          {results.map((track) => {
            const isAdded = added.has(track.id);
            return (
              <div key={track.id} className="flex items-center gap-sm rounded-md px-sm py-xs hover:bg-white/[0.04]">
                <TrackArt artworkUrl={track.artworkUrl} seed={track.id} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md font-semibold text-on-surface">{track.title}</p>
                  <p className="truncate text-body-sm text-on-surface-variant">
                    {track.artistName}
                    {track.durationMs > 0 && <> · {formatClock(track.durationMs)}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-xs">
                  <button
                    type="button"
                    onClick={() => queueOne(track)}
                    disabled={isAdded}
                    className={`flex items-center gap-1 rounded-full border px-sm py-1 text-body-sm font-semibold ${
                      isAdded
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-white/[0.12] bg-white/[0.06] text-on-surface hover:border-white/[0.18]"
                    }`}
                  >
                    <Icon name={isAdded ? "check" : "playlist_add"} className="text-[18px]" />
                    {isAdded ? "Đã thêm" : "Thêm"}
                  </button>
                  {canPlayNow && (
                    <button
                      type="button"
                      onClick={() => playNow(track)}
                      className="flex items-center gap-1 rounded-full bg-primary-container px-sm py-1 text-body-sm font-semibold text-on-primary-container"
                    >
                      <Icon name="play_arrow" className="text-[18px]" filled />
                      Phát ngay
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {added.size > 0 && (
          <footer className="flex items-center justify-between gap-sm border-t border-white/[0.08] px-lg py-sm">
            <span className="flex items-center gap-1.5 text-body-sm text-success">
              <Icon name="check_circle" className="text-[18px]" filled />
              {added.size} {added.size === 1 ? "song" : "songs"} added to the queue
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-primary-container px-md py-1.5 text-body-sm font-semibold text-on-primary-container"
            >
              Xong
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
