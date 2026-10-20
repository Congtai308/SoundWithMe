import type { AuthenticatedUser } from "@soundwithme/types";
import type { GuestLoginInput, LoginInput, RegisterInput } from "@soundwithme/validation";
import { apiClient, API_BASE_URL } from "@/services/api-client";

// Google login is a full-page redirect flow (GET -> Google consent ->
// callback sets cookies -> redirects back), not a fetch/mutation — the
// component just needs the URL to link/navigate to.
export const googleLoginUrl = `${API_BASE_URL}/auth/google`;

export const authApi = {
  register: (input: RegisterInput) =>
    apiClient.post<{ user: AuthenticatedUser }>("/auth/register", input),

  login: (input: LoginInput) =>
    apiClient.post<{ user: AuthenticatedUser }>("/auth/login", input),

  loginAsGuest: (input: GuestLoginInput) =>
    apiClient.post<{ user: AuthenticatedUser }>("/auth/guest", input),

  me: () => apiClient.get<{ user: AuthenticatedUser }>("/auth/me"),

  logout: () => apiClient.post<{ status: string }>("/auth/logout"),
};
