import { Button } from "@repo/ui/primitives/button";
import { Spinner } from "@repo/ui/primitives/spinner";
import type { ComponentProps } from "react";

import { useFormContext } from "./contexts";

/** A submit button that shows a spinner and disables itself while the form submits. */
export function SubmitButton(props: Omit<ComponentProps<typeof Button>, "type">) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button {...props} type="submit" disabled={isSubmitting || props.disabled}>
          {isSubmitting && <Spinner />}
          {props.children}
        </Button>
      )}
    </form.Subscribe>
  );
}
