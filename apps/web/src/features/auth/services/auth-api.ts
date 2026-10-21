import type { AuthenticatedUser } from "@soundwithme/types";
import type {
  CompleteSignupInput,
  GuestLoginInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@soundwithme/validation";
import { apiClient, API_BASE_URL } from "@/services/api-client";

// Google login is a full-page redirect flow (GET -> Google consent ->
// callback sets cookies -> redirects back), not a fetch/mutation — the
// component just needs the URL to link/navigate to.
export const googleLoginUrl = `${API_BASE_URL}/auth/google`;

export const authApi = {
  /** Step 1: always "check-email" (the account is made from the mailed link). */
  register: (input: RegisterInput) => apiClient.post<{ status: string }>("/auth/register", input),

  completeSignup: (input: CompleteSignupInput) =>
    apiClient.post<{ user: AuthenticatedUser }>("/auth/register/complete", input),

  login: (input: LoginInput) =>
    apiClient.post<{ user: AuthenticatedUser }>("/auth/login", input),

  loginAsGuest: (input: GuestLoginInput) =>
    apiClient.post<{ user: AuthenticatedUser }>("/auth/guest", input),

  me: () => apiClient.get<{ user: AuthenticatedUser }>("/auth/me"),

  logout: () => apiClient.post<{ status: string }>("/auth/logout"),

  resendVerification: () => apiClient.post<{ status: string }>("/auth/verify-email/send"),

  verifyEmail: (token: string) => apiClient.post<{ status: string }>("/auth/verify-email", { token }),

  forgotPassword: (email: string) => apiClient.post<{ status: string }>("/auth/password/forgot", { email }),

  resetPassword: (input: ResetPasswordInput) => apiClient.post<{ status: string }>("/auth/password/reset", input),
};
