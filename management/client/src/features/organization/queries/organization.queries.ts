import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_ROOTS } from "@/shared/lib/invalidate";
import type { Organization } from "@/shared/types/entities";

import { listOrganizationMembersApi, organizationApi } from "../api/organization.api";

export const CURRENT_ORGANIZATION_QUERY_KEY = [QUERY_ROOTS.organization, "current"] as const;

/** The current organisation, or null before the user has created one. */
export const useCurrentOrganization = () =>
  useQuery({ queryKey: CURRENT_ORGANIZATION_QUERY_KEY, queryFn: organizationApi.getCurrent });

export const MY_ORGANIZATIONS_QUERY_KEY = [QUERY_ROOTS.organization, "mine"] as const;

/** Every organisation the user belongs to, for the picker after login. */
export const useMyOrganizations = () =>
  useQuery({ queryKey: MY_ORGANIZATIONS_QUERY_KEY, queryFn: organizationApi.listMine });

/**
 * Active members of the current organisation, from the real backend. Pass enabled: false
 * where the screen gets its people elsewhere (demo mode).
 */
export function useOrganizationMembers(enabled = true) {
  const { data: organization } = useCurrentOrganization();
  const organizationId = organization?.id;
  return useQuery({
    queryKey: [QUERY_ROOTS.organization, "members", organizationId] as const,
    queryFn: () => listOrganizationMembersApi(organizationId!),
    enabled: enabled && Boolean(organizationId),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  const { data: organization } = useCurrentOrganization();
  return useMutation({
    mutationFn: (input: Partial<Organization>) => {
      if (!organization) throw new Error("No organisation selected");
      return organizationApi.update(organization.id, input);
    },
    onSuccess: (updated) => queryClient.setQueryData(CURRENT_ORGANIZATION_QUERY_KEY, updated),
  });
}
