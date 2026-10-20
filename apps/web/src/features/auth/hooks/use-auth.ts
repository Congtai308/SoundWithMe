import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../services/auth-api";
import { ApiClientError } from "@/services/api-client";

const CURRENT_USER_QUERY_KEY = ["auth", "me"];

/**
 * The currently-authenticated user, or null if not logged in. Treats a 401
 * as "not logged in" rather than an error state — that's the expected,
 * common case for a visitor who hasn't signed in yet.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: async () => {
      try {
        const { user } = await authApi.me();
        return user;
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "UNAUTHENTICATED") {
          return null;
        }
        throw err;
      }
    },
    retry: false,
  });
}

function useInvalidateCurrentUser() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
}

export function useRegister() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: () => invalidate(),
  });
}

export function useLogin() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: () => invalidate(),
  });
}

export function useGuestLogin() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({
    mutationFn: authApi.loginAsGuest,
    onSuccess: () => invalidate(),
  });
}

export function useLogout() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => invalidate(),
  });
}
