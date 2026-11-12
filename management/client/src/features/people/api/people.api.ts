import { isAxiosError } from "axios";

import { currentOrganizationId } from "@/features/organization";
import {
  type ApiInvitation,
  type ApiMember,
  type ApiTeam,
  fromApiInvitation,
  fromApiMember,
  fromApiTeam,
  toApiAvailability,
  toApiMemberStatus,
  toApiRole,
} from "@/shared/api/contract";
import { fetchAllPages } from "@/shared/api/pages";
import { request } from "@/shared/lib/request";
import type { Member, Team } from "@/shared/types/entities";

import type { InviteMemberInput, TeamInput, UpdateMemberInput } from "../people.validation";

// Paths and shapes of the API contract: /organization/members, /organization/invite, /teams.

/** Pending invitations; only admins may list them, so others get none. */
async function listInvitations(organizationId: string): Promise<Member[]> {
  try {
    const { invitations } = await request.get<{ invitations: ApiInvitation[] }>(
      `/organization/invitations/${organizationId}`,
      { params: { status: "pending" } },
    );
    return invitations.map(fromApiInvitation);
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) return [];
    throw error;
  }
}

/** Members and pending invitations in one list: the People table shows both. */
export async function listMembersApi(): Promise<Member[]> {
  const organizationId = await currentOrganizationId();
  const [members, invited] = await Promise.all([
    fetchAllPages<ApiMember>(`/organization/members/${organizationId}`, "members"),
    listInvitations(organizationId),
  ]);
  return [...members.map(fromApiMember), ...invited];
}

export async function inviteMemberApi(input: InviteMemberInput): Promise<Member> {
  const organizationId = await currentOrganizationId();
  const invitation = await request.post<ApiInvitation>(`/organization/invite/${organizationId}`, {
    email: input.email,
    fullName: input.name,
    role: toApiRole(input.role),
    designation: input.designation,
    teamIds: input.teamIds,
    reportingManagerId: input.reportingManagerId || null,
  });
  return fromApiInvitation(invitation);
}

export async function updateMemberApi(
  userId: string,
  input: Partial<UpdateMemberInput>,
): Promise<Member> {
  const organizationId = await currentOrganizationId();
  const body = {
    ...input,
    role: input.role && toApiRole(input.role),
    availability: input.availability && toApiAvailability(input.availability),
  };
  const member = await request.patch<ApiMember>(
    `/organization/members/update/${organizationId}/${userId}`,
    body,
  );
  return fromApiMember(member);
}

export async function setMemberStatusApi(
  userId: string,
  status: Member["status"],
): Promise<Member> {
  const organizationId = await currentOrganizationId();
  const member = await request.patch<ApiMember>(
    `/organization/members/status/${organizationId}/${userId}`,
    { status: toApiMemberStatus(status) },
  );
  return fromApiMember(member);
}

export async function listTeamsApi(): Promise<Team[]> {
  const organizationId = await currentOrganizationId();
  const { teams } = await request.get<{ teams: ApiTeam[] }>(`/teams/list/${organizationId}`);
  return teams.map(fromApiTeam);
}

export async function createTeamApi(input: TeamInput): Promise<Team> {
  const organizationId = await currentOrganizationId();
  const team = await request.post<ApiTeam>(`/teams/${organizationId}`, {
    ...input,
    leadId: input.leadId || null,
  });
  return fromApiTeam(team);
}
