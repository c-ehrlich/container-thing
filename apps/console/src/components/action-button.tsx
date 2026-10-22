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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { projectScope } from "../domains/project/overview";

/**
 * A button for one Railway call. Afterwards the project is refetched everywhere it's shown: the
 * overview and service queries all live under `projectScope`. With `confirm`, it asks
 * first, for calls that can't be undone.
 */
export function ActionButton(props: {
  projectId: string;
  label: string;
  pending: string;
  run: () => Promise<unknown>;
  icon?: React.ReactNode;
  title?: string;
  variant?: "default" | "outline" | "ghost";
  confirm?: { title: string; description: string; action: string };
}) {
  const { confirm } = props;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: props.run,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: projectScope(props.projectId),
      }),
  });

  const button = {
    size: "sm",
    variant: mutation.isError ? "destructive" : (props.variant ?? "outline"),
    disabled: mutation.isPending,
    title: mutation.error?.message ?? props.title,
  } as const;
  const content = (
    <>
      {mutation.isPending ? <Spinner data-icon="inline-start" /> : props.icon}
      {mutation.isPending ? props.pending : mutation.isError ? "Try again" : props.label}
    </>
  );

  if (!confirm) {
    return (
      <Button {...button} onClick={() => mutation.mutate()}>
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
              mutation.mutate();
            }}
          >
            {confirm.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
