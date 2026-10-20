import { Input } from "@repo/ui/primitives/input";
import type { ComponentProps, ReactNode } from "react";

import { useFieldContext } from "./contexts";
import { FormField, useFieldControl } from "./form-field";

type InputProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "onBlur" | "name" | "id"
>;

/** A labelled text input bound to the surrounding `form.AppField`. */
export function TextField(
  props: InputProps & { label?: ReactNode; description?: ReactNode; className?: string },
) {
  const { label, description, className, ...inputProps } = props;
  const field = useFieldContext<string>();
  const control = useFieldControl();
  return (
    <FormField label={label} description={description} className={className}>
      <Input
        {...inputProps}
        {...control}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </FormField>
  );
}
