import { env } from "@/shared/config/env";
import type { Role } from "@/shared/constants/workItem";
import { request } from "@/shared/lib/request";
import type { Member, Organization } from "@/shared/types/entities";

// Shapes of server/src/modules/organization/entities/organization.entity.ts

export type ApiOrganizationType = "work" | "personal";
export type ApiOrganizationRole = "organization_admin" | "member";
export type OnboardingStatus = "NO_ORGANIZATION" | "SINGLE_ORGANIZATION" | "MULTIPLE_ORGANIZATIONS";

interface ApiOrganization {
  id: string;
  name: string;
  type: ApiOrganizationType;
  description?: string;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiUserOrganization {
  organization: ApiOrganization;
  membership: {
    id: string;
    role: ApiOrganizationRole;
    status: "active" | "inactive";
    joinedAt: string;
  };
}

export interface MyOrganizations {
  user: { id: string; fullName: string; email: string };
  onboarding: { status: OnboardingStatus };
  organizations: ApiUserOrganization[];
}

/** An organisation with the signed-in user's role in it, ready for the UI. */
export interface UserOrganization {
  organization: Organization;
  role: Role;
}

export interface CreateOrganizationInput {
  name: string;
  type: ApiOrganizationType;
  description?: string;
}

const ROLE_FROM_API: Record<ApiOrganizationRole, Role> = {
  organization_admin: "ORG_ADMIN",
  member: "MEMBER",
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Fills the settings the backend does not store yet with defaults. */
export function toUserOrganization({
  organization,
  membership,
}: ApiUserOrganization): UserOrganization {
  return {
    organization: {
      slug: slugify(organization.name),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workingDays: [1, 2, 3, 4, 5],
      plan: "FREE",
      seats: 10,
      allowMultipleAssignees: false,
      aiEnabled: false,
      aiCreditsLeft: 0,
      ...organization,
      type: organization.type === "personal" ? "PERSONAL" : "WORK",
    },
    role: ROLE_FROM_API[membership.role],
  };
}

const STORAGE_KEY = "tm.organizationId";

/** The organisation the user last worked in, remembered per browser. */
export const selectedOrganizationId = {
  get(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(id: string) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage blocked: falls back to the first organisation */
    }
  },
};

/**
 * The organisation the app works in: the remembered one if the user still belongs to it,
 * otherwise the first (the list is sorted by name). null when the user has none yet.
 */
export function pickCurrentOrganization(data: MyOrganizations): UserOrganization | null {
  const { organizations } = data;
  if (organizations.length === 0) return null;
  const rememberedId = selectedOrganizationId.get();
  const current = organizations.find((o) => o.organization.id === rememberedId) ?? organizations[0];
  return toUserOrganization(current);
}

/** GET /organization/list: the user's organisations and where onboarding should send them. */
export const myOrganizationsApi = () => request.get<MyOrganizations>("/organization/list");

interface ApiOrganizationMember {
  userId: string;
  fullName: string;
  email: string;
  role: ApiOrganizationRole;
  joinedAt: string;
}

interface ApiListOrganizationMembersResult {
  members: ApiOrganizationMember[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/** An active member of an organisation, as the pickers need it. */
export interface OrganizationMember {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** The server's largest page (MAX_PAGE_LIMIT in server/src/utils/pagination.ts). */
const MEMBERS_PAGE_LIMIT = 100;

/** GET /organization/members/:organizationId, every page: the organisation's active members. */
export async function listOrganizationMembersApi(
  organizationId: string,
): Promise<OrganizationMember[]> {
  const all: OrganizationMember[] = [];
  for (let page = 1; ; page++) {
    const result = await request.get<ApiListOrganizationMembersResult>(
      `/organization/members/${organizationId}`,
      { params: { page, limit: MEMBERS_PAGE_LIMIT } },
    );
    all.push(
      ...result.members.map((m) => ({
        id: m.userId,
        name: m.fullName,
        email: m.email,
        role: ROLE_FROM_API[m.role],
      })),
    );
    if (page >= result.pagination.totalPages) return all;
  }
}

interface OrganizationApi {
  /** The organisation the app works in, or null before the user has created one. */
  getCurrent(): Promise<Organization | null>;
  /** Every organisation the user belongs to, with their role in each. */
  listMine(): Promise<UserOrganization[]>;
  /** Creates the user's organisation; they become its admin. */
  create(input: CreateOrganizationInput): Promise<UserOrganization>;
  update(id: string, input: Partial<Organization>): Promise<Organization>;
}

/** The real backend: /organization/list, /create, /update/:id. */
const backendOrganizationApi: OrganizationApi = {
  async getCurrent() {
    return pickCurrentOrganization(await myOrganizationsApi())?.organization ?? null;
  },
  async listMine() {
    return (await myOrganizationsApi()).organizations.map(toUserOrganization);
  },
  async create(input) {
    const result = toUserOrganization(
      await request.post<ApiUserOrganization>("/organization/create", input),
    );
    selectedOrganizationId.set(result.organization.id);
    return result;
  },
  async update(id, { name, description }) {
    // The backend only stores name and description and rejects any other field.
    const body = Object.fromEntries(
      Object.entries({ name, description }).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(body).length === 0) {
      throw new Error("This setting can't be saved yet: the server doesn't support it.");
    }
    const result = await request.patch<ApiUserOrganization>(`/organization/update/${id}`, body);
    return toUserOrganization(result).organization;
  },
};

/** The demo API in src/mocks: GET/PATCH /organization and POST /auth/organization. */
const demoOrganizationApi: OrganizationApi = {
  getCurrent: () => request.get<Organization>("/organization"),
  // The demo data has one organisation; the role comes from the demo user.
  async listMine() {
    const [organization, user] = await Promise.all([
      request.get<Organization>("/organization"),
      request.get<Member>("/auth/me"),
    ]);
    return [{ organization, role: user.role }];
  },
  async create({ name, type }) {
    const user = await request.post<Member>("/auth/organization", {
      type: type === "personal" ? "PERSONAL" : "WORK",
      name,
    });
    return { organization: await request.get<Organization>("/organization"), role: user.role };
  },
  update: (_id, input) => request.patch<Organization>("/organization", input),
};

export const organizationApi = env.USE_MOCKS ? demoOrganizationApi : backendOrganizationApi;
