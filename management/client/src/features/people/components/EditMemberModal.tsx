import { Controller } from "react-hook-form";

import { AVAILABILITY, AVAILABILITY_META, ROLE_LABELS, ROLES } from "@/shared/constants/workItem";
import { useZodForm } from "@/shared/hooks/useZodForm";
import { toast } from "@/shared/lib/toast";
import type { Member } from "@/shared/types/entities";
import Avatar from "@/shared/ui/Avatar";
import Button from "@/shared/ui/Button";
import ChipSelect from "@/shared/ui/ChipSelect";
import { Form, FormError, FormInput, FormSelect } from "@/shared/ui/form";
import Modal from "@/shared/ui/Modal";

import { type UpdateMemberForm, updateMemberSchema } from "../people.validation";
import { useMembers, useTeams, useUpdateMember } from "../queries/people.queries";

interface EditMemberModalProps {
  member: Member;
  canManage: boolean;
  onClose: () => void;
}

export default function EditMemberModal({ member, canManage, onClose }: EditMemberModalProps) {
  const update = useUpdateMember();
  const { data: teams = [] } = useTeams();
  const { data: members = [] } = useMembers();
  const form = useZodForm(updateMemberSchema, {
    defaultValues: {
      role: member.role,
      designation: member.designation,
      teamIds: member.teamIds,
      reportingManagerId: member.reportingManagerId ?? "",
      availability: member.availability,
      skills: member.skills.join(", "),
    },
  });

  async function onSubmit(values: UpdateMemberForm) {
    await update.mutateAsync({
      id: member.id,
      input: {
        ...values,
        reportingManagerId: values.reportingManagerId || null,
        skills: values.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
    toast.success(`${member.name} updated`);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      header={
        <div className="flex items-center gap-3">
          <Avatar person={member} size={36} />
          <div>
            <h2 className="text-[14px] font-semibold text-fg">{member.name}</h2>
            <p className="text-xs text-fg-muted">{member.email}</p>
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-member"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            Save changes
          </Button>
        </>
      }
    >
      <Form id="edit-member" form={form} onSubmit={onSubmit}>
        <FormError />
        <div className="grid gap-4 sm:grid-cols-2">
          {canManage && (
            <FormSelect
              name="role"
              label="Role"
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
          )}
          {canManage && <FormInput name="designation" label="Designation" />}
          <FormSelect
            name="availability"
            label="Availability"
            options={AVAILABILITY.map((a) => ({ value: a, label: AVAILABILITY_META[a].label }))}
          />
          {canManage && (
            <FormSelect
              name="reportingManagerId"
              label="Reporting manager"
              placeholder="None"
              options={members
                .filter((m) => m.id !== member.id && m.status === "ACTIVE")
                .map((m) => ({ value: m.id, label: m.name }))}
            />
          )}
        </div>
        <FormInput
          name="skills"
          label="Skills and expertise"
          placeholder="React, Node.js, Figma"
          hint="Separate with commas. Used for smart assignment."
        />
        {canManage && (
          <Controller
            control={form.control}
            name="teamIds"
            render={({ field }) => (
              <ChipSelect
                label="Teams"
                value={field.value}
                onChange={field.onChange}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
              />
            )}
          />
        )}
      </Form>
    </Modal>
  );
}
