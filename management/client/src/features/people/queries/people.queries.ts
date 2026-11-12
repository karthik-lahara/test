import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateRoots, QUERY_ROOTS } from "@/shared/lib/invalidate";
import type { Member } from "@/shared/types/entities";

import {
  createTeamApi,
  inviteMemberApi,
  listMembersApi,
  listTeamsApi,
  setMemberStatusApi,
  updateMemberApi,
} from "../api/people.api";
import type { UpdateMemberInput } from "../people.validation";

export const peopleKeys = {
  members: [QUERY_ROOTS.users, "list"] as const,
  teams: [QUERY_ROOTS.teams, "list"] as const,
};

export const useMembers = () => useQuery({ queryKey: peopleKeys.members, queryFn: listMembersApi });

/** Members by id, for showing avatars and names next to any record. */
export function useMemberMap() {
  const { data } = useMembers();
  return useMemo(() => new Map((data ?? []).map((member) => [member.id, member])), [data]);
}

export const useTeams = () => useQuery({ queryKey: peopleKeys.teams, queryFn: listTeamsApi });

// The organisation lives in the organization feature; re-exported for existing callers.
export {
  useCurrentOrganization as useOrganization,
  useUpdateOrganization,
} from "@/features/organization";

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inviteMemberApi,
    onSuccess: () =>
      invalidateRoots(queryClient, QUERY_ROOTS.users, QUERY_ROOTS.teams, QUERY_ROOTS.dashboard),
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<UpdateMemberInput> }) =>
      updateMemberApi(id, input),
    onSuccess: () =>
      invalidateRoots(queryClient, QUERY_ROOTS.users, QUERY_ROOTS.teams, QUERY_ROOTS.auth),
  });
}

export function useSetMemberStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Member["status"] }) =>
      setMemberStatusApi(id, status),
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.users, QUERY_ROOTS.dashboard),
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTeamApi,
    onSuccess: () => invalidateRoots(queryClient, QUERY_ROOTS.teams, QUERY_ROOTS.users),
  });
}
