import dayjs from "dayjs";

import { useZodForm } from "@/shared/hooks/useZodForm";
import { toast } from "@/shared/lib/toast";
import type { Sprint } from "@/shared/types/entities";
import Button from "@/shared/ui/Button";
import { Form, FormError, FormInput, FormTextarea } from "@/shared/ui/form";
import Modal from "@/shared/ui/Modal";

import { type SprintInput, sprintSchema } from "../projects.types";
import { useCreateSprint, useUpdateSprint } from "../queries/projects.queries";

type SprintModalProps = { onClose: () => void } & (
  | {
      /** Plan a new sprint with these suggestions. */
      projectId: string;
      suggestedName: string;
      suggestedStart: string;
      sprint?: undefined;
    }
  | { sprint: Sprint; projectId?: undefined; suggestedName?: undefined; suggestedStart?: undefined }
);

/** Plans a new sprint, or edits a planned or active one. */
export default function SprintModal(props: SprintModalProps) {
  const { sprint, onClose } = props;
  const create = useCreateSprint();
  const update = useUpdateSprint();
  const started = sprint?.status === "ACTIVE";
  const form = useZodForm(sprintSchema, {
    defaultValues: sprint
      ? {
          projectId: sprint.projectId,
          name: sprint.name,
          goal: sprint.goal,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
        }
      : {
          projectId: props.projectId,
          name: props.suggestedName,
          goal: "",
          startDate: props.suggestedStart,
          // Two weeks is the common default.
          endDate: dayjs(props.suggestedStart).add(13, "day").format("YYYY-MM-DD"),
        },
  });

  async function onSubmit(values: SprintInput) {
    if (sprint) {
      await update.mutateAsync({ id: sprint.id, ...values });
      toast.success(`${values.name} updated`);
    } else {
      await create.mutateAsync(values);
      toast.success(`${values.name} planned`);
    }
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={sprint ? `Edit ${sprint.name}` : "Plan a sprint"}
      description={
        started
          ? "The sprint has started, so only its name, goal and end date can change."
          : "A fixed period, usually two weeks, in which the team finishes the selected work."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="sprint-form"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            {sprint ? "Save changes" : "Create sprint"}
          </Button>
        </>
      }
    >
      <Form id="sprint-form" form={form} onSubmit={onSubmit}>
        <FormError />
        <FormInput name="name" label="Sprint name" />
        <FormTextarea
          name="goal"
          label="Sprint goal"
          rows={2}
          placeholder="What the team commits to finish"
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInput name="startDate" label="Start date" type="date" disabled={started} />
          <FormInput name="endDate" label="End date" type="date" />
        </div>
      </Form>
    </Modal>
  );
}
