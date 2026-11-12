import { Navigate, useParams } from "react-router-dom";

import { OrganizationForm, type WorkspaceType } from "@/features/auth";
import { ROUTES } from "@/shared/constants/routes";

import AuthShell from "./AuthShell";

const FROM_PARAM: Record<string, WorkspaceType> = { work: "WORK", personal: "PERSONAL" };

/** /signup/organization/work or /personal: name and description. */
export default function SetupOrganizationDetailsPage() {
  const workspaceType = FROM_PARAM[useParams().workspaceType ?? ""];
  if (!workspaceType) return <Navigate to={ROUTES.SETUP_ORGANIZATION} replace />;

  const isWork = workspaceType === "WORK";
  return (
    <AuthShell
      title={isWork ? "Set up your organisation" : "Set up your workspace"}
      subtitle={
        isWork
          ? "Your team will see this name. You can change it later in Settings."
          : "Only you will see this workspace. You can change it later in Settings."
      }
    >
      {/* key: switching type remounts the form with fresh fields */}
      <OrganizationForm key={workspaceType} workspaceType={workspaceType} />
    </AuthShell>
  );
}
