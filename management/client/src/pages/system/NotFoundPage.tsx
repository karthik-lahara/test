import { useNavigate } from "react-router-dom";
import { Compass } from "@phosphor-icons/react";

import { ROUTES } from "@/shared/constants/routes";
import Button from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/Display";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="The link may be old, or the page moved."
      action={<Button onClick={() => navigate(ROUTES.DASHBOARD)}>Go to dashboard</Button>}
      className="flex-1"
    />
  );
}
