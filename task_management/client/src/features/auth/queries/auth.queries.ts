import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import {
  CURRENT_ORGANIZATION_QUERY_KEY,
  organizationApi,
  selectedOrganizationId,
  type UserOrganization,
} from "@/features/organization";
import { authToken } from "@/shared/lib/authToken";
import { invalidateRoots, QUERY_ROOTS } from "@/shared/lib/invalidate";
import type { Member } from "@/shared/types/entities";

import { authApi, type AuthSession } from "../api/auth.api";
import type { LoginInput, OrganizationInput, SignupInput } from "../auth.validation";

export const CURRENT_USER_QUERY_KEY = [QUERY_ROOTS.auth, "me"] as const;

/**
 * The signed-in user, or null. On page load the session is restored (from the
 * refresh-token cookie on the real backend), so a reload or a new tab stays signed in.
 */
export const useCurrentUser = () =>
  useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: async (): Promise<Member | null> => {
      try {
        return (await authApi.restore())?.user ?? null;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          authToken.clear();
          return null;
        }
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

function useSessionMutation<TInput>(start: (input: TInput) => Promise<AuthSession>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: start,
    onSuccess: ({ accessToken, user }) => {
      authToken.set(accessToken);
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user);
    },
  });
}

export const useLogin = () => useSessionMutation((input: LoginInput) => authApi.login(input));

/** Creates the account and signs in. A new user has no organisation, so setup comes next. */
export const useSignup = () => useSessionMutation((input: SignupInput) => authApi.signup(input));

/** The step after signup: creates the user's first organisation; they become its admin. */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceType, organizationName, description }: OrganizationInput) =>
      organizationApi.create({
        name: organizationName,
        type: workspaceType === "PERSONAL" ? "personal" : "work",
        // Left out when empty: the backend stores no description then
        ...(description && { description }),
      }),
    onSuccess: async (created) => {
      switchToOrganization(queryClient, created);
      await invalidateRoots(queryClient, QUERY_ROOTS.organization);
    },
  });
}

/**
 * Makes `organization` the one the app works in: remembers it, sets the user's role to
 * their role there, and drops data loaded for the previous organisation.
 */
function switchToOrganization(queryClient: QueryClient, { organization, role }: UserOrganization) {
  selectedOrganizationId.set(organization.id);
  const keep: string[] = [QUERY_ROOTS.auth, QUERY_ROOTS.organization];
  queryClient.removeQueries({ predicate: (query) => !keep.includes(String(query.queryKey[0])) });
  queryClient.setQueryData(CURRENT_ORGANIZATION_QUERY_KEY, organization);
  queryClient.setQueryData<Member | null>(CURRENT_USER_QUERY_KEY, (user) =>
    user ? { ...user, role, needsOrganization: false } : user,
  );
}

/** The organisation picker after login (and "Switch organisation" in the sidebar). */
export function useSelectOrganization() {
  const queryClient = useQueryClient();
  return (choice: UserOrganization) => switchToOrganization(queryClient, choice);
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      authToken.clear();
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, null);
    },
  });
}
