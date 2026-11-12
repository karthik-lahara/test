import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";

import { ROUTES } from "@/shared/constants/routes";
import { useZodForm } from "@/shared/hooks/useZodForm";
import Button from "@/shared/ui/Button";
import { Form, FormError, FormInput, FormTextarea } from "@/shared/ui/form";

import { type OrganizationInput, organizationSchema, type WorkspaceType } from "../auth.validation";
import { useCreateOrganization } from "../queries/auth.queries";

const COPY: Record<
  WorkspaceType,
  { label: string; placeholder: string; autoComplete: string; descriptionPlaceholder: string }
> = {
  WORK: {
    label: "Organisation",
    placeholder: "Acme Inc.",
    autoComplete: "organization",
    descriptionPlaceholder: "What does your team work on?",
  },
  PERSONAL: {
    label: "Workspace",
    placeholder: "My workspace",
    autoComplete: "off",
    descriptionPlaceholder: "What will you track here?",
  },
};

/** Setup step 2: name and describe the organisation (Work) or workspace (Personal). */
export default function OrganizationForm({ workspaceType }: { workspaceType: WorkspaceType }) {
  const createOrganization = useCreateOrganization();
  const navigate = useNavigate();
  const form = useZodForm<OrganizationInput>(organizationSchema, {
    defaultValues: { workspaceType, organizationName: "", description: "" },
  });
  const copy = COPY[workspaceType];

  async function onSubmit(values: OrganizationInput) {
    await createOrganization.mutateAsync(values);
    navigate(ROUTES.DASHBOARD, { replace: true });
  }

  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormError />
      <FormInput
        name="organizationName"
        label={`${copy.label} name`}
        autoComplete={copy.autoComplete}
        placeholder={copy.placeholder}
      />
      <FormTextarea
        name="description"
        label={`${copy.label} description`}
        hint="Optional"
        placeholder={copy.descriptionPlaceholder}
        rows={3}
      />

      <Button
        type="submit"
        variant="primary"
        loading={form.formState.isSubmitting}
        className="mt-1 w-full"
      >
        Create {copy.label.toLowerCase()}
      </Button>
      <Link
        to={ROUTES.SETUP_ORGANIZATION}
        state={{ workspaceType }}
        className="inline-flex items-center justify-center gap-1.5 text-[13px] text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={13} /> Back
      </Link>
    </Form>
  );
}
