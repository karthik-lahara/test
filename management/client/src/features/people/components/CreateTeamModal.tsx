import { Controller } from "react-hook-form";

import { useZodForm } from "@/shared/hooks/useZodForm";
import { cn } from "@/shared/lib/cn";
import { toast } from "@/shared/lib/toast";
import Button from "@/shared/ui/Button";
import ChipSelect from "@/shared/ui/ChipSelect";
import { Form, FormError, FormInput, FormSelect, FormTextarea } from "@/shared/ui/form";
import Modal from "@/shared/ui/Modal";

import { type TeamInput, teamSchema } from "../people.validation";
import { useCreateTeam, useMembers } from "../queries/people.queries";

const COLORS = [
  "#7c6cff",
  "#4cc38a",
  "#f5a524",
  "#f472b6",
  "#38bdf8",
  "#f06a6a",
  "#a78bfa",
  "#2dd4bf",
];

export default function CreateTeamModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTeam();
  const { data: members = [] } = useMembers();
  const active = members.filter((m) => m.status === "ACTIVE");
  const form = useZodForm(teamSchema, {
    defaultValues: { name: "", description: "", color: COLORS[0], leadId: "", memberIds: [] },
  });

  async function onSubmit(values: TeamInput) {
    const team = await create.mutateAsync({
      ...values,
      memberIds: Array.from(
        new Set([...values.memberIds, ...(values.leadId ? [values.leadId] : [])]),
      ),
    });
    toast.success(`Team ${team.name} created`);
    form.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create team"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-team"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            Create team
          </Button>
        </>
      }
    >
      <Form id="create-team" form={form} onSubmit={onSubmit}>
        <FormError />
        <FormInput name="name" label="Team name" placeholder="Platform" />
        <FormTextarea name="description" label="What the team does" rows={2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            name="leadId"
            label="Team lead"
            placeholder="No lead"
            options={active.map((m) => ({ value: m.id, label: m.name }))}
          />
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-fg-muted">Colour</span>
                <div className="flex h-8 items-center gap-1.5">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Colour ${color}`}
                      onClick={() => field.onChange(color)}
                      className={cn(
                        "size-5 rounded-full ring-offset-2 ring-offset-panel",
                        field.value === color && "ring-2 ring-fg",
                      )}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          />
        </div>
        <Controller
          control={form.control}
          name="memberIds"
          render={({ field }) => (
            <ChipSelect
              label="Members"
              value={field.value}
              onChange={field.onChange}
              options={active.map((m) => ({ value: m.id, label: m.name }))}
            />
          )}
        />
      </Form>
    </Modal>
  );
}
