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

/** Sign-up step 1: nobody is signed in yet, the mailed link finishes it. */
export function useRegister() {
  return useMutation({ mutationFn: authApi.register });
}

export function useCompleteSignup() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({ mutationFn: authApi.completeSignup, onSuccess: () => invalidate() });
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

export function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification });
}

export function useVerifyEmail() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({ mutationFn: authApi.verifyEmail, onSuccess: () => invalidate() });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword });
}

/** Every session ends on a reset, this one included. */
export function useResetPassword() {
  const invalidate = useInvalidateCurrentUser();
  return useMutation({ mutationFn: authApi.resetPassword, onSuccess: () => invalidate() });
}
