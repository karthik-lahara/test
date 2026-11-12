import { Navigate, Outlet } from "react-router-dom";

import { useCurrentUser } from "@/features/auth";
import { env } from "@/shared/config/env";
import { ROUTES } from "@/shared/constants/routes";
import BootSplash from "@/shared/ui/BootSplash";

export default function PublicOnlyRoute() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <BootSplash />;
  // A fresh signup still has to name their organisation; everyone else picks one.
  if (user) {
    return (
      <Navigate
        to={
          user.needsOrganization
            ? ROUTES.SETUP_ORGANIZATION
            : // Demo mode keeps the original flow, without the organisation picker
              env.USE_MOCKS
              ? ROUTES.DASHBOARD
              : ROUTES.SELECT_ORGANIZATION
        }
        replace
      />
    );
  }
  return <Outlet />;
}
