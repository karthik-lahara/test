// Demo mode (npm run dev:mock) shows this original screen, unchanged.
// The real-API app uses SetupOrganizationPage.tsx.
import { OrganizationFormClassic as OrganizationForm } from "@/features/auth";

import AuthShell from "./AuthShell";

export default function SetupOrganizationPage() {
  return (
    <AuthShell
      title="How will you use Lahara Tasks?"
      subtitle="You'll be the admin of your workspace."
    >
      <OrganizationForm />
    </AuthShell>
  );
}
