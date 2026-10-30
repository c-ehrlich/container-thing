import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/primitives/alert-dialog";
import { Button } from "@repo/ui/primitives/button";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useState } from "react";

import { describeAction, useRailwayAction } from "../domains/actions";
import type { RailwayAction } from "../domains/actions";

/**
 * A button that runs one `RailwayAction`; afterwards the project is refetched everywhere it's shown.
 * Actions that can't be undone ask first.
 */
export function ActionButton(props: {
  projectId: string;
  action: RailwayAction;
  label: string;
  /** What it says while running, if not the action's usual wording ("Starting…" for a deploy). */
  pending?: string;
  icon?: React.ReactNode;
  title?: string;
  variant?: "default" | "outline" | "ghost";
  /** Runs once the action succeeded and the project was refetched. */
  onSuccess?: () => void;
}) {
  const { pending, confirm } = describeAction(props.action);
  const [open, setOpen] = useState(false);
  const mutation = useRailwayAction(props.projectId);
  const run = () => mutation.mutate(props.action, { onSuccess: props.onSuccess });

  const button = {
    size: "sm",
    variant: mutation.isError ? "destructive" : (props.variant ?? "outline"),
    disabled: mutation.isPending,
    title: mutation.error?.message ?? props.title,
  } as const;
  const content = (
    <>
      {mutation.isPending ? <Spinner data-icon="inline-start" /> : props.icon}
      {mutation.isPending
        ? (props.pending ?? pending)
        : mutation.isError
          ? "Try again"
          : props.label}
    </>
  );

  if (!confirm) {
    return (
      <Button {...button} onClick={run}>
        {content}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button {...button} />}>{content}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              run();
            }}
          >
            {confirm.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
