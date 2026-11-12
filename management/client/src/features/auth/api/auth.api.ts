import {
  type MyOrganizations,
  myOrganizationsApi,
  pickCurrentOrganization,
} from "@/features/organization";
import { env } from "@/shared/config/env";
import { refreshSession, type SessionPayload } from "@/shared/lib/apiClient";
import { authToken } from "@/shared/lib/authToken";
import { request } from "@/shared/lib/request";
import type { Member } from "@/shared/types/entities";

import type { LoginInput, SignupInput } from "../auth.validation";

/** A signed-in session as the UI uses it. */
export interface AuthSession {
  accessToken: string;
  user: Member;
}

interface AuthApi {
  login(input: LoginInput): Promise<AuthSession>;
  /** Creates the account and signs in. */
  signup(input: SignupInput): Promise<AuthSession>;
  /** The session after a page load, or null when signed out (rejects with a 401). */
  restore(): Promise<AuthSession | null>;
  logout(): Promise<unknown>;
}

// ---- Real backend (server/src/modules/auth) ----

/** The user as the backend returns it: `{ id, fullName, email, createdAt, updatedAt }`. */
interface ApiUser {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

/**
 * Builds the signed-in Member. The backend keeps roles on organisation memberships, so the
 * role is the user's role in the current organisation, and a user with no organisation
 * still has to create one.
 */
function toMember(user: ApiUser, organizations: MyOrganizations): Member {
  const current = pickCurrentOrganization(organizations);
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    avatarColor: "",
    role: current?.role ?? "MEMBER",
    status: "ACTIVE",
    designation: "",
    teamIds: [],
    reportingManagerId: null,
    skills: [],
    availability: "AVAILABLE",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    joinedAt: user.createdAt,
    needsOrganization: organizations.onboarding.status === "NO_ORGANIZATION",
  };
}

/** Stores the access token, then loads the user's organisations to complete the Member. */
async function toSession({ accessToken, user }: SessionPayload<ApiUser>): Promise<AuthSession> {
  authToken.set(accessToken);
  return { accessToken, user: toMember(user, await myOrganizationsApi()) };
}

const backendAuthApi: AuthApi = {
  login: async ({ email, password }) =>
    toSession(await request.post<SessionPayload<ApiUser>>("/auth/login", { email, password })),

  async signup(input) {
    // The backend's signup only creates the account (no token), so log in right after.
    const { fullName, email, password } = input;
    await request.post<ApiUser>("/auth/signup", { fullName, email, password });
    return backendAuthApi.login({ email, password });
  },

  // Uses the httpOnly refresh-token cookie
  restore: async () => toSession((await refreshSession()) as SessionPayload<ApiUser>),

  logout: () => request.post<null>("/auth/logout"),
};

// ---- Demo API (src/mocks/handlers/core.ts) ----

const demoAuthApi: AuthApi = {
  login: ({ email, password }) => request.post<AuthSession>("/auth/login", { email, password }),

  signup: ({ fullName, email, password }) =>
    request.post<AuthSession>("/auth/signup", { name: fullName, email, password }),

  async restore() {
    const accessToken = authToken.get();
    if (!accessToken) return null;
    return { accessToken, user: await request.get<Member>("/auth/me") };
  },

  logout: () => request.post<null>("/auth/logout"),
};

export const authApi = env.USE_MOCKS ? demoAuthApi : backendAuthApi;
