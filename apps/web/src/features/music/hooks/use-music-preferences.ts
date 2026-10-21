"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { musicApi } from "../services/music-api";

const STORAGE_KEY = "swm.music-preferences";

/** Signing out: the next person on this browser must not inherit (or upload) these picks. */
export function forgetLocalPreferences(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing was kept.
  }
}

export interface Preferences {
  genres: string[];
  artists: string[];
}

function readLocal(): Preferences | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      typeof parsed === "object" && parsed !== null &&
      "genres" in parsed && Array.isArray(parsed.genres) &&
      "artists" in parsed && Array.isArray(parsed.artists)
    ) {
      return { genres: parsed.genres.map(String), artists: parsed.artists.map(String) };
    }
  } catch {
    // Storage unavailable or corrupted: treat as not onboarded.
  }
  return null;
}

function writeLocal(preferences: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Signed-in users still have the server copy; visitors will be asked again.
  }
}

/**
 * The listener's onboarding answers. Signed-in users keep them on their
 * account; visitors keep them in this browser until they sign in, at which
 * point the browser copy is uploaded once.
 *
 * status: "loading" until we know, "needs-onboarding" if never answered.
 */
export function useMusicPreferences() {
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useCurrentUser();
  const [local, setLocal] = useState<Preferences | null | undefined>(undefined);
  useEffect(() => setLocal(readLocal()), []);

  const uploadedForRef = useRef<string | null>(null);
  const save = useMutation({
    mutationFn: async (preferences: Preferences) => {
      writeLocal(preferences);
      setLocal(preferences);
      if (!user) return null;
      uploadedForRef.current = user.id; // this save is the upload; don't sync again

      return (await musicApi.savePreferences(preferences)).user;
    },
    onSuccess: (updated) => {
      if (updated) queryClient.setQueryData(["auth", "me"], updated);
    },
  });

  const server = user?.musicPreferences ?? null;

  // Answered before signing in: carry those answers over to the account
  // (once per page load, so a failing server can't cause a retry loop).
  const { mutate } = save;
  useEffect(() => {
    if (!user || server || !local || uploadedForRef.current === user.id) return;
    uploadedForRef.current = user.id;
    mutate(local);
  }, [user, server, local, mutate]);

  const preferences: Preferences | null = server
    ? { genres: server.genres, artists: server.artists }
    : (local ?? null);
  const status: "loading" | "needs-onboarding" | "ready" =
    isUserLoading || local === undefined ? "loading" : preferences ? "ready" : "needs-onboarding";

  const savePreferences = useCallback((next: Preferences) => save.mutateAsync(next), [save]);

  return { preferences, status, save: savePreferences, isSaving: save.isPending };
}
