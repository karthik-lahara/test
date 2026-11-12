import { useEffect } from "react";
import { Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { usePermissions } from "@/features/auth";
import { useOrganizationMembers } from "@/features/organization";
import { useMembers, useTeams } from "@/features/people";
import { env } from "@/shared/config/env";
import { projectPath } from "@/shared/constants/routes";
import {
  PRIORITIES,
  PRIORITY_META,
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
} from "@/shared/constants/workItem";
import { useZodForm } from "@/shared/hooks/useZodForm";
import { cn } from "@/shared/lib/cn";
import { toast } from "@/shared/lib/toast";
import Button from "@/shared/ui/Button";
import ChipSelect from "@/shared/ui/ChipSelect";
import { Form, FormError, FormInput, FormSelect, FormTextarea } from "@/shared/ui/form";
import Modal from "@/shared/ui/Modal";

import { type ProjectInput, projectSchema } from "../projects.types";
import { useCreateProject } from "../queries/projects.queries";

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

export default function CreateProjectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateProject();
  const navigate = useNavigate();
  const { data: members = [] } = useMembers();
  const { data: teams = [] } = useTeams();
  const active = members.filter((m) => m.status === "ACTIVE");
  // Lead: the organisation's members from the real backend; demo mode keeps the demo people.
  const organizationMembers = useOrganizationMembers(!env.USE_MOCKS);
  const leadOptions = env.USE_MOCKS
    ? active.map((m) => ({ value: m.id, label: m.name }))
    : (organizationMembers.data ?? []).map((m) => ({ value: m.id, label: m.name }));
  const form = useZodForm(projectSchema, {
    defaultValues: {
      name: "",
      key: "",
      summary: "",
      description: "",
      status: "PLANNING",
      priority: "MEDIUM",
      leadId: "",
      teamId: "",
      memberIds: [],
      startDate: "",
      endDate: "",
      color: COLORS[0],
    },
  });

  // Members: everyone in the organisation except the lead (the one picked, or the creator
  // when Lead is left empty, as the server does). Demo mode keeps the demo people.
  const { user } = usePermissions();
  const leadId = form.watch("leadId") || user?.id || "";
  const memberOptions = env.USE_MOCKS
    ? active.map((m) => ({ value: m.id, label: m.name }))
    : (organizationMembers.data ?? [])
        .filter((m) => m.id !== leadId)
        .map((m) => ({ value: m.id, label: m.name }));

  // A member picked as lead is no longer listed, so take them out of Members too.
  useEffect(() => {
    if (env.USE_MOCKS || !leadId) return;
    const memberIds = form.getValues("memberIds");
    if (memberIds.includes(leadId)) {
      form.setValue(
        "memberIds",
        memberIds.filter((id) => id !== leadId),
      );
    }
  }, [leadId, form]);

  async function onSubmit(values: ProjectInput) {
    const project = await create.mutateAsync(values);
    toast.success(`Project ${project.name} created`);
    form.reset();
    onClose();
    navigate(projectPath(project.key));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="New project"
      description="Set the basics now. You can change everything later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-project"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            Create project
          </Button>
        </>
      }
    >
      <Form id="create-project" form={form} onSubmit={onSubmit}>
        <FormError />
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="project-name" className="text-xs font-medium text-fg-muted">
                  Project name
                </label>
                <input
                  id="project-name"
                  {...field}
                  placeholder="AXMS Website"
                  onChange={(e) => {
                    field.onChange(e);
                    if (!form.getFieldState("key").isDirty) {
                      const key = e.target.value
                        .replace(/[^A-Za-z0-9 ]/g, "")
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 4)
                        .toUpperCase();
                      form.setValue(
                        "key",
                        key.length >= 2
                          ? key
                          : e.target.value
                              .replace(/[^A-Za-z]/g, "")
                              .slice(0, 4)
                              .toUpperCase(),
                      );
                    }
                  }}
                  className="field-glow h-8 w-full rounded-md border border-line bg-panel px-2.5 text-[12.5px] text-fg focus:outline-none"
                />
                {fieldState.error && (
                  <p className="text-xs text-[#e5484d]">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
          <FormInput name="key" label="Key" placeholder="AXMS" hint="Prefix for item IDs" />
        </div>
        <FormInput name="summary" label="Summary" placeholder="One line about the goal" />
        <FormTextarea name="description" label="Description" rows={3} />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormSelect
            name="status"
            label="Status"
            options={PROJECT_STATUSES.filter((s) => s !== "ARCHIVED").map((s) => ({
              value: s,
              label: PROJECT_STATUS_META[s].label,
            }))}
          />
          <FormSelect
            name="priority"
            label="Priority"
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))}
          />
          <FormSelect
            name="leadId"
            label="Lead"
            placeholder={organizationMembers.isLoading ? "Loading members…" : "You"}
            options={leadOptions}
          />
          <FormInput name="startDate" label="Start date" type="date" />
          <FormInput name="endDate" label="End date" type="date" />
          <FormSelect
            name="teamId"
            label="Team"
            placeholder="No team"
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
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
              options={memberOptions}
            />
          )}
        />
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-fg-muted">Colour</span>
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
          )}
        />
      </Form>
    </Modal>
  );
}
