"use client";

import { useQuery } from "@tanstack/react-query";
import { API_ROOT_URL } from "@/services/api-client";

interface ReadyResponse {
  status: string;
  checks: { mongodb: boolean; redis: boolean };
}

async function fetchReadiness(): Promise<ReadyResponse> {
  const res = await fetch(`${API_ROOT_URL}/ready`);
  const body = await res.json();
  if (!body.success) {
    throw new Error(body.error?.message ?? "API not ready");
  }
  return body.data;
}

export default function HomePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["api-ready"],
    queryFn: fetchReadiness,
    retry: false,
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-h1 font-bold text-text-primary">SoundWithMe</h1>
      <p className="text-body text-text-secondary">
        Foundation bootstrap — this page will become Discover once Phase 1
        auth/music/rooms are implemented.
      </p>
      <div className="rounded-md border border-border bg-surface px-4 py-3 text-caption text-text-secondary">
        {isLoading && "Checking API connectivity…"}
        {isError && "API unreachable — start the API and its dependencies (see README)."}
        {data && (
          <span>
            API ready — MongoDB: {data.checks.mongodb ? "ok" : "down"}, Redis:{" "}
            {data.checks.redis ? "ok" : "down"}
          </span>
        )}
      </div>
    </main>
  );
}
