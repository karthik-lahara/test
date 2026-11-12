import { Link } from "react-router-dom";

import { ROUTES } from "@/shared/constants/routes";
import { useZodForm } from "@/shared/hooks/useZodForm";
import Button from "@/shared/ui/Button";
import { Form, FormError, FormInput } from "@/shared/ui/form";

import { type SignupInput, signupSchema } from "../auth.validation";
import { useSignup } from "../queries/auth.queries";

export default function SignupForm() {
  const signup = useSignup();
  const form = useZodForm(signupSchema, {
    defaultValues: { fullName: "", email: "", password: "" },
  });

  async function onSubmit(values: SignupInput) {
    // PublicOnlyRoute sees the new user and moves them to the organisation step.
    await signup.mutateAsync(values);
  }

  return (
    <div className="flex flex-col gap-5">
      <Form form={form} onSubmit={onSubmit}>
        <FormError />
        <FormInput name="fullName" label="Full name" autoComplete="name" placeholder="Jane Doe" />
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting}
          className="mt-1 w-full"
        >
          Create account
        </Button>
      </Form>

      <p className="text-center text-[13px] text-fg-muted">
        Already have an account?{" "}
        <Link to={ROUTES.LOGIN} className="font-medium text-fg hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
