import { Navigate, Outlet, useLocation } from "react-router-dom";

import { type Ability, useCurrentUser, usePermissions } from "@/features/auth";
import { env } from "@/shared/config/env";
import { ROUTES } from "@/shared/constants/routes";
import BootSplash from "@/shared/ui/BootSplash";

export default function ProtectedRoute({ ability }: { ability?: Ability }) {
  const location = useLocation();
  const { data: user, isLoading } = useCurrentUser();
  const { can } = usePermissions();

  if (isLoading) return <BootSplash />;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace state={{ from: location.pathname }} />;
  // Both setup steps: /signup/organization and /signup/organization/:workspaceType
  const onSetupPage =
    location.pathname === ROUTES.SETUP_ORGANIZATION ||
    location.pathname.startsWith(`${ROUTES.SETUP_ORGANIZATION}/`);
  if (user.needsOrganization && !onSetupPage) {
    return <Navigate to={ROUTES.SETUP_ORGANIZATION} replace />;
  }
  // Users who already have an organisation may still open the setup pages to create another.
  // Demo mode keeps the original rule: setup is only for users without one.
  if (env.USE_MOCKS && !user.needsOrganization && onSetupPage) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }
  if (ability && !can(ability)) return <Navigate to={ROUTES.DASHBOARD} replace />;
  return <Outlet />;
}
