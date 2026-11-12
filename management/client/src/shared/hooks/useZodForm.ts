import type { FieldValues, Resolver, UseFormProps } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

export function useZodForm<TFieldValues extends FieldValues>(
  schema: ZodType<TFieldValues, FieldValues>,
  formProps?: Omit<UseFormProps<TFieldValues>, "resolver">,
) {
  return useForm<TFieldValues>({
    mode: "onBlur",
    ...formProps,
    resolver: zodResolver(schema) as unknown as Resolver<TFieldValues>,
  });
}
