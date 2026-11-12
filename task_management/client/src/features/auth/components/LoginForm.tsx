import { Link, useLocation, useNavigate } from "react-router-dom";
import { EnvelopeSimple, LockSimple } from "@phosphor-icons/react";

import { env } from "@/shared/config/env";
import { ROUTES } from "@/shared/constants/routes";
import { useZodForm } from "@/shared/hooks/useZodForm";
import Button from "@/shared/ui/Button";
import { Form, FormError, FormInput } from "@/shared/ui/form";

import { type LoginInput, loginSchema } from "../auth.validation";
import { useLogin } from "../queries/auth.queries";

const DEMO_ACCOUNTS = [
  { label: "Org admin", email: "amal@lahara.dev" },
  { label: "Project manager", email: "aisawarya@lahara.dev" },
  { label: "Member", email: "shahanas@lahara.dev" },
];

export default function LoginForm() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useZodForm(loginSchema, { defaultValues: { email: "", password: "" } });

  async function onSubmit(values: LoginInput) {
    await login.mutateAsync(values);
    const from = (location.state as { from?: string } | null)?.from;
    if (env.USE_MOCKS) {
      // Demo mode keeps the original flow: straight to the page asked for, or the dashboard
      navigate(from && from !== ROUTES.LOGIN ? from : ROUTES.DASHBOARD, { replace: true });
      return;
    }
    // Pick an organisation first; the picker then continues to the page asked for.
    // (A user with no organisation is sent on to create one.)
    navigate(ROUTES.SELECT_ORGANIZATION, { replace: true, state: { from } });
  }

  return (
    <div className="flex flex-col gap-5">
      <Form form={form} onSubmit={onSubmit}>
        <FormError />
        <FormInput
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
        />
        <FormInput
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting}
          className="mt-1 w-full"
        >
          Sign in
        </Button>
      </Form>

      <p className="text-center text-[13px] text-fg-muted">
        New to Lahara Tasks?{" "}
        <Link to={ROUTES.SIGNUP} className="font-medium text-fg hover:underline">
          Create an account
        </Link>
      </p>

      {env.USE_MOCKS && (
        <div className="rounded-lg border border-dashed border-line p-3">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-fg-subtle uppercase">
            Demo accounts
          </p>
          <div className="flex flex-col gap-1">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-hover"
                onClick={() => {
                  form.setValue("email", account.email);
                  form.setValue("password", "demo123");
                  void form.handleSubmit(onSubmit)();
                }}
              >
                <span className="flex items-center gap-2 text-fg">
                  <EnvelopeSimple size={13} className="text-fg-subtle" />
                  {account.email}
                </span>
                <span className="flex items-center gap-1 text-fg-subtle">
                  <LockSimple size={11} />
                  {account.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
