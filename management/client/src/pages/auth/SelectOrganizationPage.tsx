import { useLocation, useNavigate } from "react-router-dom";

import { OrganizationPicker, useCurrentUser, useLogout } from "@/features/auth";
import { ROUTES } from "@/shared/constants/routes";

import AuthShell from "./AuthShell";

/** /organizations: shown after login, and from "Switch organisation" in the sidebar. */
export default function SelectOrganizationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  // The page the user was heading to before signing in
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <AuthShell
      title="Choose an organisation"
      subtitle={
        user ? `Signed in as ${user.email}. Pick where you want to work.` : "Pick where to work."
      }
    >
      <OrganizationPicker
        // Opens the assistant, unless the person was on their way to a specific page.
        onSelected={() =>
          navigate(
            from && from !== ROUTES.LOGIN && from !== "/" && from !== ROUTES.DASHBOARD
              ? from
              : ROUTES.ASSISTANT,
          )
        }
      />
      <p className="mt-6 text-center text-[13px] text-fg-muted">
        Not you?{" "}
        <button
          type="button"
          className="font-medium text-fg hover:underline"
          onClick={() =>
            logout.mutate(undefined, {
              onSettled: () => navigate(ROUTES.LOGIN, { replace: true }),
            })
          }
        >
          Sign in with another account
        </button>
      </p>
    </AuthShell>
  );
}
