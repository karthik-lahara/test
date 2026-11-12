import { LoginForm } from "@/features/auth";

import AuthShell from "./AuthShell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in to your workspace"
      subtitle="Plan epics, ship stories, track every task."
    >
      <LoginForm />
    </AuthShell>
  );
}
