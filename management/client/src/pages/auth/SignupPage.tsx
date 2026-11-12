import { SignupForm } from "@/features/auth";

import AuthShell from "./AuthShell";

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Get your team planning in minutes.">
      <SignupForm />
    </AuthShell>
  );
}
