export const ROUTES = {
  LOGIN: "/login",
  SIGNUP: "/signup",
  /** Setup step 1: Work or Personal. */
  SETUP_ORGANIZATION: "/signup/organization",
  /** Setup step 2: name and description. :workspaceType is "work" or "personal". */
  SETUP_ORGANIZATION_DETAILS: "/signup/organization/:workspaceType",
  /** After login: pick one of your organisations, or create a new one. */
  SELECT_ORGANIZATION: "/organizations",
  DASHBOARD: "/dashboard",
  MY_WORK: "/my-work",
  INBOX: "/inbox",
  ASSISTANT: "/assistant",
  PROJECTS: "/projects",
  PROJECT: "/projects/:projectKey",
  WORK_ITEM: "/items/:itemKey",
  TEAMS: "/teams",
  PEOPLE: "/people",
  SETTINGS: "/settings",
} as const;

export const setupOrganizationDetailsPath = (workspaceType: "WORK" | "PERSONAL") =>
  `/signup/organization/${workspaceType.toLowerCase()}`;

export const projectPath = (key: string, tab = "") => `/projects/${key}${tab ? `/${tab}` : ""}`;

export const workItemPath = (key: string) => `/items/${key}`;
