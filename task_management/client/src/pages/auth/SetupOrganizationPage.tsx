import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";

import { useCurrentUser, useLogout, type WorkspaceType, WorkspaceTypeForm } from "@/features/auth";
import { ROUTES } from "@/shared/constants/routes";

import AuthShell from "./AuthShell";

/** /signup/organization: Work or Personal only. Also used to create another organisation. */
export default function SetupOrganizationPage() {
  const navigate = useNavigate();
  const logout = useLogout();
  // Coming back from step 2 keeps the earlier choice selected.
  const previous = (useLocation().state as { workspaceType?: WorkspaceType } | null)?.workspaceType;
  const { data: user } = useCurrentUser();
  const hasOrganization = Boolean(user && !user.needsOrganization);

  // With an organisation: back to the picker. A brand-new account has no page in the app
  // to return to, so Back signs out and returns to sign in.
  const goBack = () => {
    if (hasOrganization) {
      navigate(ROUTES.SELECT_ORGANIZATION);
      return;
    }
    logout.mutate(undefined, { onSettled: () => navigate(ROUTES.LOGIN, { replace: true }) });
  };

  return (
    <AuthShell
      title={hasOrganization ? "Create a new organisation" : "How will you use Lahara Tasks?"}
      subtitle="You'll be the admin of your workspace."
    >
      <WorkspaceTypeForm initial={previous} />
      <button
        type="button"
        onClick={goBack}
        disabled={logout.isPending}
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 text-[13px] text-fg-muted hover:text-fg disabled:opacity-60"
      >
        <ArrowLeft size={13} />
        {hasOrganization ? "Back to your organisations" : "Back to sign in"}
      </button>
    </AuthShell>
  );
}
