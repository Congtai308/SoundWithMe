"use client";

import { useCurrentUser } from "@/features/auth/hooks/use-auth";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/Toaster";
import { ApiClientError } from "@/services/api-client";
import { useFavoriteIds, useToggleLike } from "../hooks/use-library";

const SIZE_CLASS = { sm: "text-[18px]", md: "text-[20px]", lg: "text-[24px]" } as const;

/** Heart toggle for one song — saves it to Liked Songs in the Library. */
export function LikeButton({
  trackId,
  size = "md",
  className = "",
}: {
  trackId: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const { data: user } = useCurrentUser();
  const { data: liked } = useFavoriteIds({ enabled: Boolean(user) });
  const toggle = useToggleLike();
  if (!user) return null;
  const isLiked = liked?.has(trackId) ?? false;

  return (
    <button
      type="button"
      aria-pressed={isLiked}
      aria-label={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      title={isLiked ? "Remove from Liked Songs" : "Save to Liked Songs"}
      onClick={(event) => {
        event.stopPropagation();
        toggle.mutate(
          { trackId, liked: !isLiked },
          {
            onError: (error) =>
              showToast({
                icon: "error",
                tone: "error",
                title: "Couldn't update Liked Songs",
                body: error instanceof ApiClientError ? error.message : undefined,
              }),
          },
        );
      }}
      className={`flex items-center rounded-full p-1 transition-colors ${
        isLiked ? "text-[#f472b6]" : "text-outline hover:text-on-surface"
      } ${className}`}
    >
      <Icon name="favorite" filled={isLiked} className={SIZE_CLASS[size]} />
    </button>
  );
}
