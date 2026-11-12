import dayjs from "dayjs";

import {
  type ApiAvailability,
  type ApiInvitation,
  type ApiMemberStatus,
  type ApiOrgRole,
  fromApiAvailability,
  fromApiMemberStatus,
  fromApiRole,
  toApiAvailability,
  toApiMember,
  toApiMemberStatus,
  toApiNotification,
  toApiRole,
  toApiTeam,
} from "@/shared/api/contract";
import type { Team } from "@/shared/types/entities";

import {
  type MockUser,
  newId,
  notifications,
  organization,
  projects,
  publicUser,
  teams,
  users,
  workItems,
} from "../db";
import { paginate } from "../logic";
import { MOCK_TOKEN_PREFIX, MockHttpError, route } from "../router";

const isAdmin = (userId: string) => {
  const role = users.find((u) => u.id === userId)?.role;
  return role === "ORG_ADMIN" || role === "SUPER_ADMIN";
};

function requireAdmin(userId: string) {
  if (!isAdmin(userId)) throw new MockHttpError(403, "Only organisation admins can do this.");
}

// ---- Auth ----
route(
  "POST",
  "/auth/login",
  ({ body }) => {
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const user = users.find((u) => u.email === email);
    if (!user || user.password !== body.password) {
      throw new MockHttpError(401, "Email or password is incorrect.");
    }
    if (user.status !== "ACTIVE") throw new MockHttpError(403, "This account is not active.");
    return { accessToken: `${MOCK_TOKEN_PREFIX}${user.id}`, user: publicUser(user) };
  },
  { isPublic: true },
);

route(
  "POST",
  "/auth/signup",
  ({ body }) => {
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    if (users.some((u) => u.email === email)) {
      throw new MockHttpError(409, "An account with this email already exists.", [
        { field: "email", message: "This email is already registered" },
      ]);
    }
    const user: MockUser = {
      id: newId("u"),
      name,
      email,
      avatarColor: "#38bdf8",
      role: "MEMBER",
      status: "ACTIVE",
      designation: "",
      teamIds: [],
      reportingManagerId: null,
      skills: [],
      availability: "AVAILABLE",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      joinedAt: new Date().toISOString(),
      password,
      favoriteProjectIds: [],
      needsOrganization: true,
    };
    users.push(user);
    notifications[user.id] = [];
    return { accessToken: `${MOCK_TOKEN_PREFIX}${user.id}`, user: publicUser(user) };
  },
  { isPublic: true },
);

route("POST", "/auth/organization", ({ body, userId }) => {
  const user = users.find((u) => u.id === userId)!;
  if (!user.needsOrganization) {
    throw new MockHttpError(403, "Your organisation is already set up.");
  }
  const type = body.type === "PERSONAL" ? "PERSONAL" : "WORK";
  const name = String(body.name ?? "").trim();
  if (name.length < 2) {
    const what = type === "WORK" ? "organisation" : "workspace";
    throw new MockHttpError(400, `Enter your ${what} name.`, [
      { field: "organizationName", message: `Enter your ${what} name` },
    ]);
  }
  // The demo has a single organisation, so this names it.
  organization.name = name;
  organization.type = type;
  organization.slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Whoever creates the organisation administers it.
  user.role = "ORG_ADMIN";
  delete user.needsOrganization;
  return publicUser(user);
});

route("GET", "/auth/me", ({ userId }) => publicUser(users.find((u) => u.id === userId)!));
route("POST", "/auth/logout", () => null);

// ---- Organisation ----
route("GET", "/organization", () => organization);
route("PATCH", "/organization", ({ body, userId }) => {
  requireAdmin(userId);
  Object.assign(organization, body);
  return organization;
});

// ---- People: members and invitations (contract paths) ----

const toInvitation = (
  user: MockUser,
  status: ApiInvitation["status"] = "pending",
): ApiInvitation => ({
  id: user.id,
  email: user.email,
  fullName: user.name,
  role: toApiRole(user.role),
  designation: user.designation,
  teamIds: user.teamIds,
  reportingManagerId: user.reportingManagerId,
  invitedBy: "",
  expiresAt: dayjs(user.joinedAt).add(7, "day").toISOString(),
  status,
  createdAt: user.joinedAt,
});

/** Members of the organisation; invited people are listed as invitations instead. */
route("GET", "/organization/members/:organizationId", ({ query }) => {
  const search = (query.search ?? "").toLowerCase();
  const members = users
    .filter((u) => u.status !== "INVITED")
    .filter((u) => !query.role || toApiRole(u.role) === query.role)
    .filter((u) => !query.status || toApiMemberStatus(u.status) === query.status)
    .filter((u) => !query.availability || toApiAvailability(u.availability) === query.availability)
    .filter((u) => !query.teamId || u.teamIds.includes(query.teamId))
    .filter((u) => !search || u.name.toLowerCase().includes(search) || u.email.includes(search))
    .map((u) => toApiMember(publicUser(u)));
  return paginate(members, query, "members");
});

route("GET", "/organization/invitations/:organizationId", ({ userId }) => {
  requireAdmin(userId);
  return {
    invitations: users.filter((u) => u.status === "INVITED").map((u) => toInvitation(u)),
  };
});

route("POST", "/organization/invite/:organizationId", ({ body, userId }) => {
  requireAdmin(userId);
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (users.some((u) => u.email === email)) {
    throw new MockHttpError(409, "Someone with this email is already in the organisation.", [
      { field: "email", message: "Already in the organisation" },
    ]);
  }
  const user: MockUser = {
    id: newId("u"),
    name: String(body.fullName),
    email,
    avatarColor: "",
    role: fromApiRole((body.role as ApiOrgRole) ?? "member"),
    status: "INVITED",
    designation: String(body.designation ?? ""),
    teamIds: (body.teamIds as string[]) ?? [],
    reportingManagerId: (body.reportingManagerId as string) || null,
    skills: [],
    availability: "AVAILABLE",
    timeZone: organization.timeZone,
    joinedAt: new Date().toISOString(),
    password: "demo123",
    favoriteProjectIds: [],
  };
  users.push(user);
  for (const teamId of user.teamIds) teams.find((t) => t.id === teamId)?.memberIds.push(user.id);
  return toInvitation(user);
});

route("POST", "/organization/invitations/revoke/:invitationId", ({ params, userId }) => {
  requireAdmin(userId);
  const index = users.findIndex((u) => u.id === params.invitationId && u.status === "INVITED");
  if (index < 0) throw new MockHttpError(404, "Invitation not found");
  const [user] = users.splice(index, 1);
  for (const team of teams) team.memberIds = team.memberIds.filter((id) => id !== user.id);
  return toInvitation(user, "revoked");
});

/** Admins change anything; people may change their own title, skills and availability. */
route(
  "PATCH",
  "/organization/members/update/:organizationId/:userId",
  ({ params, body, userId }) => {
    const self = params.userId === userId;
    const ownFields = ["designation", "skills", "availability"];
    if (!self || Object.keys(body).some((k) => !ownFields.includes(k))) requireAdmin(userId);
    const user = users.find((u) => u.id === params.userId);
    if (!user) throw new MockHttpError(404, "Member not found");
    const role = body.role ? fromApiRole(body.role as ApiOrgRole) : undefined;
    if (role && self && toApiRole(role) !== toApiRole(user.role)) {
      throw new MockHttpError(400, "You can't change your own role.");
    }
    Object.assign(user, {
      ...body,
      // Keep the demo user's finer role when the contract role did not change.
      role: role && toApiRole(role) !== toApiRole(user.role) ? role : user.role,
      availability: body.availability
        ? fromApiAvailability(body.availability as ApiAvailability)
        : user.availability,
    });
    if (Array.isArray(body.teamIds)) {
      for (const team of teams) {
        const inTeam = user.teamIds.includes(team.id);
        team.memberIds = team.memberIds.filter((id) => id !== user.id);
        if (inTeam) team.memberIds.push(user.id);
      }
    }
    return toApiMember(publicUser(user));
  },
);

route(
  "PATCH",
  "/organization/members/status/:organizationId/:userId",
  ({ params, body, userId }) => {
    requireAdmin(userId);
    if (params.userId === userId) throw new MockHttpError(400, "You can't change your own status.");
    const user = users.find((u) => u.id === params.userId);
    if (!user) throw new MockHttpError(404, "Member not found");
    user.status = fromApiMemberStatus(body.status as ApiMemberStatus);
    return toApiMember(publicUser(user));
  },
);

// ---- Teams ----
route("GET", "/teams/list/:organizationId", () => ({ teams: teams.map(toApiTeam) }));
route("POST", "/teams/:organizationId", ({ body, userId }) => {
  requireAdmin(userId);
  const name = String(body.name ?? "").trim();
  if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    throw new MockHttpError(409, "A team with this name already exists.", [
      { field: "name", message: "This name is already used" },
    ]);
  }
  const team: Team = {
    id: newId("t"),
    name,
    description: String(body.description ?? ""),
    color: String(body.color ?? "#7c6cff"),
    leadId: (body.leadId as string) || null,
    memberIds: (body.memberIds as string[]) ?? [],
  };
  teams.push(team);
  for (const id of team.memberIds) users.find((u) => u.id === id)?.teamIds.push(team.id);
  return toApiTeam(team);
});

// ---- Notifications ----
const mine = (userId: string) =>
  [...(notifications[userId] ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

route("GET", "/notifications/list/:organizationId", ({ userId, query }) => {
  const list = mine(userId)
    .filter((n) => query.unread !== "true" || !n.read)
    .map((n) =>
      toApiNotification(n, {
        workItemId: workItems.find((w) => w.key === n.workItemKey)?.id ?? null,
        projectId: projects.find((p) => p.key === n.projectKey)?.id ?? null,
      }),
    );
  return paginate(list, query, "notifications");
});

route("GET", "/notifications/unread-count/:organizationId", ({ userId }) => ({
  count: mine(userId).filter((n) => !n.read).length,
}));

route("POST", "/notifications/read/:notificationId", ({ params, userId }) => {
  const item = notifications[userId]?.find((n) => n.id === params.notificationId);
  if (!item) throw new MockHttpError(404, "Notification not found");
  item.read = true;
  return null;
});

route("POST", "/notifications/read-all/:organizationId", ({ userId }) => {
  const unread = (notifications[userId] ?? []).filter((n) => !n.read);
  for (const item of unread) item.read = true;
  return { updated: unread.length };
});
