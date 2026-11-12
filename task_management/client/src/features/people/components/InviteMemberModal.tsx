import { Controller } from "react-hook-form";

import { ROLE_LABELS, ROLES } from "@/shared/constants/workItem";
import { useZodForm } from "@/shared/hooks/useZodForm";
import { toast } from "@/shared/lib/toast";
import Button from "@/shared/ui/Button";
import ChipSelect from "@/shared/ui/ChipSelect";
import { Form, FormError, FormInput, FormSelect } from "@/shared/ui/form";
import Modal from "@/shared/ui/Modal";

import { type InviteMemberInput, inviteMemberSchema } from "../people.validation";
import { useInviteMember, useMembers, useTeams } from "../queries/people.queries";

export default function InviteMemberModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const invite = useInviteMember();
  const { data: teams = [] } = useTeams();
  const { data: members = [] } = useMembers();
  const form = useZodForm(inviteMemberSchema, {
    defaultValues: {
      name: "",
      email: "",
      role: "MEMBER",
      designation: "",
      teamIds: [],
      reportingManagerId: "",
    },
  });

  async function onSubmit(values: InviteMemberInput) {
    const member = await invite.mutateAsync(values);
    toast.success(`Invitation sent to ${member.email}`);
    form.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a member"
      description="They get an email with a link to join your organisation."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="invite-member"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            Send invite
          </Button>
        </>
      }
    >
      <Form id="invite-member" form={form} onSubmit={onSubmit}>
        <FormError />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput name="name" label="Full name" placeholder="Ramya K" />
          <FormInput name="email" label="Work email" type="email" placeholder="ramya@company.com" />
          <FormSelect
            name="role"
            label="Role"
            options={ROLES.filter((r) => r !== "SUPER_ADMIN").map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            }))}
          />
          <FormInput name="designation" label="Designation" placeholder="MERN Developer" />
        </div>
        <FormSelect
          name="reportingManagerId"
          label="Reporting manager"
          placeholder="None"
          options={members
            .filter((m) => m.status === "ACTIVE")
            .map((m) => ({ value: m.id, label: m.name }))}
        />
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
      </Form>
    </Modal>
  );
}
