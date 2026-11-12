// Demo mode (npm run dev:mock) shows this original screen, unchanged.
// The real-API app uses OrganizationForm.tsx with WorkspaceTypeForm.tsx.
import { useNavigate } from "react-router-dom";
import { Briefcase, CheckCircle, House, type Icon } from "@phosphor-icons/react";

import { ROUTES } from "@/shared/constants/routes";
import { useZodForm } from "@/shared/hooks/useZodForm";
import { cn } from "@/shared/lib/cn";
import Button from "@/shared/ui/Button";
import { Form, FormError, FormInput } from "@/shared/ui/form";

import { type OrganizationInput, organizationSchema, type WorkspaceType } from "../auth.validation";
import { useCreateOrganization } from "../queries/auth.queries";

const OPTIONS: Array<{ type: WorkspaceType; title: string; description: string; icon: Icon }> = [
  {
    type: "WORK",
    title: "Work",
    description: "Plan with your team. Invite colleagues and manage projects together.",
    icon: Briefcase,
  },
  {
    type: "PERSONAL",
    title: "Personal",
    description: "Track your own tasks and side projects in a private workspace.",
    icon: House,
  },
];

export default function OrganizationFormClassic() {
  const createOrganization = useCreateOrganization();
  const navigate = useNavigate();
  const form = useZodForm<OrganizationInput>(organizationSchema, {
    defaultValues: { workspaceType: "WORK", organizationName: "", description: "" },
  });
  const workspaceType = form.watch("workspaceType");

  async function onSubmit(values: OrganizationInput) {
    await createOrganization.mutateAsync(values);
    navigate(ROUTES.DASHBOARD, { replace: true });
  }

  function choose(type: WorkspaceType) {
    form.setValue("workspaceType", type);
    form.clearErrors();
  }

  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormError />
      <div role="radiogroup" aria-label="Workspace type" className="grid grid-cols-2 gap-3">
        {OPTIONS.map(({ type, title, description, icon: IconCmp }) => {
          const selected = workspaceType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(type)}
              className={cn(
                "relative flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors",
                selected
                  ? "border-accent bg-hover"
                  : "border-line-strong hover:border-fg-subtle hover:bg-hover",
              )}
            >
              <CheckCircle
                size={16}
                weight="fill"
                className={cn("absolute top-3 right-3 text-accent", !selected && "invisible")}
              />
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-md border",
                  selected ? "border-accent text-accent" : "border-line text-fg-muted",
                )}
              >
                <IconCmp size={18} weight={selected ? "fill" : "regular"} />
              </span>
              <span className="text-[14px] font-semibold text-fg">{title}</span>
              <span className="text-[12px] leading-snug text-fg-muted">{description}</span>
            </button>
          );
        })}
      </div>

      {workspaceType === "WORK" ? (
        <FormInput
          key="WORK"
          name="organizationName"
          label="Organisation name"
          autoComplete="organization"
          placeholder="Acme Inc."
        />
      ) : (
        <FormInput
          key="PERSONAL"
          name="organizationName"
          label="Workspace name"
          autoComplete="off"
          placeholder="My workspace"
        />
      )}

      <Button
        type="submit"
        variant="primary"
        loading={form.formState.isSubmitting}
        className="mt-1 w-full"
      >
        Continue
      </Button>
    </Form>
  );
}
