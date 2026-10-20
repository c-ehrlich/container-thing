import { createFormHook } from "@tanstack/react-form";

import { fieldContext, formContext } from "./contexts";
import { SubmitButton } from "./submit-button";
import { TextField } from "./text-field";

/**
 * TanStack Form wired to the shadcn `Field` primitives from `@repo/ui`.
 *
 * `useAppForm` is `useForm` plus `form.AppField` (whose `field` has the components below) and
 * `form.AppForm` (which `SubmitButton` needs). For app-specific controls, render `FormField` inside
 * `form.AppField` and spread `useFieldControl()` onto the control.
 */
export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField },
  formComponents: { SubmitButton },
});

export { useFieldContext, useFormContext } from "./contexts";
export { FormField, useFieldControl } from "./form-field";
export { formOptions, revalidateLogic, useStore } from "@tanstack/react-form";
