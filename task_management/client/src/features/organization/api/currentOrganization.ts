import { queryClient } from "@/shared/lib/queryClient";

import { CURRENT_ORGANIZATION_QUERY_KEY } from "../queries/organization.queries";
import { organizationApi } from "./organization.api";

/**
 * The id of the organisation the app works in (cached by the current-organisation query).
 * Every organisation-level path in the API contract carries it: /teams/list/:organizationId.
 */
export async function currentOrganizationId(): Promise<string> {
  const organization = await queryClient.fetchQuery({
    queryKey: CURRENT_ORGANIZATION_QUERY_KEY,
    queryFn: organizationApi.getCurrent,
  });
  if (!organization) throw new Error("Create an organisation first.");
  return organization.id;
}
