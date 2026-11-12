import type { ReactNode } from "react";
import { Buildings, CreditCard, Sparkle } from "@phosphor-icons/react";

import { useZodForm } from "@/shared/hooks/useZodForm";
import { toast } from "@/shared/lib/toast";
import type { Organization } from "@/shared/types/entities";
import Button from "@/shared/ui/Button";
import { Badge, Card, ProgressBar, Skeleton } from "@/shared/ui/Display";
import { Form, FormError, FormInput, FormSelect } from "@/shared/ui/form";
import Toggle from "@/shared/ui/Toggle";
import { getApiErrorMessage } from "@/shared/utils/errorHandler";

import { type OrganizationInput, organizationSchema } from "../people.validation";
import { useMembers, useOrganization, useUpdateOrganization } from "../queries/people.queries";

const TIME_ZONES = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York", "UTC"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-t border-line px-4 py-3.5">
      <div>
        <p className="text-[12.5px] font-medium text-fg">{title}</p>
        <p className="text-xs text-fg-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ProfileForm({ organization, canEdit }: { organization: Organization; canEdit: boolean }) {
  const update = useUpdateOrganization();
  const form = useZodForm(organizationSchema, {
    defaultValues: { name: organization.name, timeZone: organization.timeZone },
  });
  async function onSubmit(values: OrganizationInput) {
    await update.mutateAsync(values);
    toast.success("Organisation saved");
    form.reset(values);
  }
  return (
    <Form form={form} onSubmit={onSubmit} className="px-4 pb-4">
      <FormError />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput name="name" label="Organisation name" />
        <FormSelect
          name="timeZone"
          label="Time zone"
          options={TIME_ZONES.map((z) => ({ value: z, label: z }))}
        />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!form.formState.isDirty}
            loading={form.formState.isSubmitting}
          >
            Save
          </Button>
        </div>
      )}
    </Form>
  );
}

export default function OrganizationSettings({ canEdit }: { canEdit: boolean }) {
  const { data: organization, isLoading } = useOrganization();
  const { data: members = [] } = useMembers();
  const update = useUpdateOrganization();

  if (isLoading || !organization) return <Skeleton className="m-6 h-96 rounded-lg" />;

  const seatsUsed = members.filter((m) => m.status === "ACTIVE" || m.status === "INVITED").length;
  const save = (input: Partial<Organization>) =>
    update.mutateAsync(input).then(
      () => toast.success("Setting saved"),
      (error: unknown) =>
        toast.error(getApiErrorMessage(error, error instanceof Error ? error.message : undefined)),
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:p-6">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Buildings size={15} /> Organisation profile
          </span>
        }
      >
        <ProfileForm organization={organization} canEdit={canEdit} />
        <Row
          title="Working days"
          description="Used for sprint length, days left and the burndown chart."
        >
          <div className="flex gap-1">
            {DAYS.map((label, index) => {
              const on = organization.workingDays.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    save({
                      workingDays: on
                        ? organization.workingDays.filter((d) => d !== index)
                        : [...organization.workingDays, index].sort(),
                    })
                  }
                  className={`h-7 w-9 rounded-md border text-xs ${on ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-subtle"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Row>
        <Row title="Multiple assignees" description="Allow more than one person on a work item.">
          <Toggle
            checked={organization.allowMultipleAssignees}
            disabled={!canEdit}
            onChange={(v) => save({ allowMultipleAssignees: v })}
            label="Multiple assignees"
          />
        </Row>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Sparkle size={15} /> AI
          </span>
        }
      >
        <Row
          title="AI task creation"
          description="Create work items from plain text and voice. Every suggestion is reviewed before it is saved."
        >
          <Toggle
            checked={organization.aiEnabled}
            disabled={!canEdit}
            onChange={(v) => save({ aiEnabled: v })}
            label="AI task creation"
          />
        </Row>
        <Row title="AI credits this month" description="One credit per text or voice command.">
          <span className="font-mono text-[13px] text-fg">
            {organization.aiCreditsLeft.toLocaleString()}
          </span>
        </Row>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <CreditCard size={15} /> Plan and seats
          </span>
        }
      >
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-fg">
              Current plan <Badge className="ml-2">{organization.plan}</Badge>
            </span>
            <span className="text-xs text-fg-muted">
              {seatsUsed} of {organization.seats} seats used
            </span>
          </div>
          <ProgressBar value={seatsUsed / organization.seats} />
        </div>
      </Card>
    </div>
  );
}
