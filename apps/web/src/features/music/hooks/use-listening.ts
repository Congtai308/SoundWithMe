"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { musicApi } from "../services/music-api";

/** A track counts toward the taste profile after this much actual playback. */
const LISTEN_THRESHOLD_MS = 30_000;
const TICK_MS = 1_000;
/** What this user plays most (signed-in only; empty for visitors). */
export function useListeningProfile() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["music", "listening-profile", user?.id],
    queryFn: () => musicApi.listeningProfile().then((r) => r.profile),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });
}

/**
 * Reports `trackId` once it has actually been playing for 30 s (paused time
 * doesn't count). Each track is reported at most once per mount; the server
 * also de-duplicates replays.
 */
export function useReportListen(trackId: string | null | undefined, isPlaying: boolean) {
  const { data: user } = useCurrentUser();
  const playedMsRef = useRef(0);
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    playedMsRef.current = 0;
  }, [trackId]);

  useEffect(() => {
    if (!user || !trackId || !isPlaying || reportedRef.current === trackId) return;
    const timer = window.setInterval(() => {
      playedMsRef.current += TICK_MS;
      if (playedMsRef.current < LISTEN_THRESHOLD_MS || reportedRef.current === trackId) return;
      reportedRef.current = trackId;
      // No profile refetch here: new seeds would restart the song playing on Home.
      musicApi.recordListen(trackId).catch(() => {
        // Losing one listen just makes the profile slightly less precise.
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [user, trackId, isPlaying]);
}
