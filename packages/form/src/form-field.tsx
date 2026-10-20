import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/primitives/field";
import type { ReactNode } from "react";

import { useFieldContext } from "./contexts";

/**
 * Props that wire a control to the surrounding `form.AppField`: an `id` for the label to point at,
 * and `aria-invalid` once there is an error worth showing.
 */
export function useFieldControl() {
  const field = useFieldContext<unknown>();
  return {
    id: controlId(field.name),
    name: field.name,
    onBlur: field.handleBlur,
    "aria-invalid": showsError(field.state.meta),
  };
}

/**
 * The shadcn `Field` layout (label, control, description, error) for the surrounding
 * `form.AppField`. Pass the control as children and spread `useFieldControl()` onto it.
 */
export function FormField(props: {
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const field = useFieldContext<unknown>();
  const invalid = showsError(field.state.meta);
  return (
    <Field data-invalid={invalid} className={props.className}>
      {props.label && <FieldLabel htmlFor={controlId(field.name)}>{props.label}</FieldLabel>}
      {props.children}
      {props.description && <FieldDescription>{props.description}</FieldDescription>}
      {invalid && <FieldError errors={field.state.meta.errors.map(toMessage)} />}
    </Field>
  );
}

/** Errors only show once the user has left the field or tried to submit. */
function showsError(meta: { isTouched: boolean; isValid: boolean }) {
  return meta.isTouched && !meta.isValid;
}

/** Field names like `variables[0].key` aren't nice ids, so make them so. */
function controlId(name: string) {
  return `field-${name.replaceAll(/[^\w-]+/g, "-")}`;
}

/** Validators return Standard Schema issues (`{ message }`) or plain strings. */
function toMessage(error: unknown) {
  if (typeof error === "string") return { message: error };
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return { message: error.message };
  }
  return undefined;
}
