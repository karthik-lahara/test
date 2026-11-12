import type { ReactNode } from "react";
import {
  Controller,
  type FieldValues,
  FormProvider,
  useFormContext,
  type UseFormReturn,
} from "react-hook-form";

import Input from "../Input";
import Select, { type SelectOption } from "../Select";
import TextArea from "../TextArea";
import { applyServerErrors } from "./serverErrors";

interface FormProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  onSubmit: (values: T) => unknown | Promise<unknown>;
  children: ReactNode;
  className?: string;
  /** Lets a button outside the <form> (a modal footer) submit it via form={id}. */
  id?: string;
}

export function Form<T extends FieldValues>({
  form,
  onSubmit,
  children,
  className = "",
  id,
}: FormProps<T>) {
  const handleValid = async (values: T) => {
    form.clearErrors("root");
    try {
      await onSubmit(values);
    } catch (error) {
      applyServerErrors(form, error);
    }
  };
  return (
    <FormProvider {...form}>
      <form
        id={id}
        noValidate
        className={`flex flex-col gap-4 ${className}`}
        onSubmit={form.handleSubmit(handleValid)}
      >
        {children}
      </form>
    </FormProvider>
  );
}

interface BaseFieldProps {
  name: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}

export function FormInput({
  name,
  type = "text",
  autoComplete,
  disabled,
  ...rest
}: BaseFieldProps & { type?: string; autoComplete?: string }) {
  const { control, formState } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Input
          {...field}
          value={field.value ?? ""}
          type={type}
          autoComplete={autoComplete}
          disabled={disabled || formState.isSubmitting}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}

export function FormTextarea({ name, rows, ...rest }: BaseFieldProps & { rows?: number }) {
  const { control, formState } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextArea
          {...field}
          value={field.value ?? ""}
          rows={rows}
          disabled={formState.isSubmitting}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}

export function FormSelect({
  name,
  options,
  ...rest
}: BaseFieldProps & { options: SelectOption[] }) {
  const { control, formState } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Select
          {...field}
          value={field.value ?? ""}
          options={options}
          disabled={formState.isSubmitting}
          error={fieldState.error?.message}
          {...rest}
        />
      )}
    />
  );
}

export function FormError() {
  const { formState } = useFormContext();
  const message = formState.errors.root?.server?.message;
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-[#e5484d]"
    >
      {String(message)}
    </p>
  );
}
