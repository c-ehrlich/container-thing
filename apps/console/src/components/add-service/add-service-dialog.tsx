import { formOptions, revalidateLogic, useAppForm, useStore, withForm } from "@repo/form";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/primitives/alert";
import { Button } from "@repo/ui/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/primitives/dialog";
import { FieldDescription, FieldError, FieldGroup } from "@repo/ui/primitives/field";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";

import { createServiceFn, useProjectMutation } from "../../domains/actions";
import {
  DEFAULT_TAG,
  IMAGE_NAME,
  IMAGE_TAG,
  imageBaseName,
  parseImageRef,
  splitTag,
} from "../../domains/add-service/image-ref";
import { templateSuggestionQuery } from "../../domains/add-service/templates";
import type { SuggestedVariable, TemplateSuggestion } from "../../domains/add-service/templates";
import { ImageField, TagField } from "./image-field";

/** Adds a service to the environment from a Docker image, in two steps: the image, then its variables. */
export function AddServiceDialog(props: { projectId: string; environmentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PlusIcon />
        Add service
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {/* The dialog unmounts its content when closed, so every open starts fresh. */}
        <AddServiceSteps {...props} onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const ImageStep = z.object({
  image: z
    .string()
    .trim()
    .min(1, "Pick an image or type its name.")
    .regex(IMAGE_NAME, "That isn't a valid image name. Names are lowercase, like postgres."),
  tag: z
    .string()
    .trim()
    .refine((tag) => !tag || IMAGE_TAG.test(tag), "Use letters, numbers, ., - and _."),
  name: z
    .string()
    .trim()
    .regex(/^[\w-]*$/, "Use letters, numbers, - and _.")
    .max(63, "Keep it under 64 characters."),
});

/** The reference to deploy; a blank tag means the default. */
const imageRef = (values: { image: string; tag: string }) =>
  `${values.image.trim()}:${values.tag.trim() || DEFAULT_TAG}`;

interface VariableRow extends SuggestedVariable {
  /** Only for React keys, so removing a row doesn't shuffle the inputs. */
  id: string;
}

const VariablesStep = z.object({
  variables: z
    .array(
      z
        .object({
          id: z.string(),
          key: z.string(),
          value: z.string(),
          description: z.string().nullable(),
          required: z.boolean(),
        })
        .superRefine((variable, ctx) => {
          if (!/^[A-Za-z_]\w*$/.test(variable.key)) {
            ctx.addIssue({
              code: "custom",
              path: ["key"],
              message: variable.key
                ? "Use letters, numbers and _, not starting with a number."
                : "Name this variable or remove it.",
            });
          }
          if (variable.required && !variable.value.trim()) {
            ctx.addIssue({
              code: "custom",
              path: ["value"],
              message: "The template requires this.",
            });
          }
        }),
    )
    .superRefine((variables, ctx) => {
      const seen = new Set<string>();
      for (const [index, variable] of variables.entries()) {
        if (seen.has(variable.key)) {
          ctx.addIssue({ code: "custom", path: [index, "key"], message: "Already set above." });
        }
        seen.add(variable.key);
      }
    }),
});

const variablesFormOptions = formOptions({
  defaultValues: { variables: [] as VariableRow[] },
});

const toRow = (variable: SuggestedVariable): VariableRow => ({
  ...variable,
  id: crypto.randomUUID(),
});

/**
 * One form per step, so each validates only its own fields and Enter submits the step you're on.
 * Both live here, so going back keeps what was entered.
 */
function AddServiceSteps(props: {
  projectId: string;
  environmentId: string;
  onCreated: () => void;
}) {
  const { projectId, environmentId, onCreated } = props;
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"image" | "variables">("image");
  const [suggestion, setSuggestion] = useState<TemplateSuggestion | null>(null);
  // Which image the variables were filled in for, so going back and forth doesn't undo edits.
  const filledFor = useRef<string | null>(null);

  const imageForm = useAppForm({
    defaultValues: { image: "", tag: DEFAULT_TAG, name: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ImageStep },
    onSubmit: async ({ value }) => {
      const image = value.image.trim();
      // A missing suggestion shouldn't stop anyone, they can still add variables by hand.
      const found = await queryClient.fetchQuery(templateSuggestionQuery(image)).catch(() => null);
      const repository = parseImageRef(image).repository;
      if (filledFor.current !== repository) {
        variablesForm.setFieldValue("variables", found?.variables.map(toRow) ?? []);
        filledFor.current = repository;
      }
      setSuggestion(found);
      setStep("variables");
    },
  });

  // People paste `postgres:18` into the image field; the tag belongs in its own.
  const moveTagOut = () => {
    const { name, tag } = splitTag(imageForm.getFieldValue("image"));
    if (tag === null) return;
    imageForm.setFieldValue("image", name);
    if (tag) imageForm.setFieldValue("tag", tag);
  };

  const create = useProjectMutation(projectId, createServiceFn);

  const variablesForm = useAppForm({
    ...variablesFormOptions,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: VariablesStep },
    onSubmit: async ({ value }) => {
      const { image, name } = imageForm.state.values;
      await create
        .mutateAsync({
          data: {
            projectId,
            environmentId,
            image: imageRef(imageForm.state.values),
            name: name.trim() || imageBaseName(image),
            variables: Object.fromEntries(value.variables.map((v) => [v.key, v.value])),
          },
        })
        // Settles once the project is refetched, so the new service is on the canvas when it closes.
        // `create.error` shows a failure below.
        .then(onCreated, () => undefined);
    },
  });

  const image = useStore(imageForm.store, (state) => state.values.image.trim());
  const ref = useStore(imageForm.store, (state) => imageRef(state.values));

  if (step === "image") {
    return (
      <imageForm.AppForm>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            moveTagOut();
            void imageForm.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a service</DialogTitle>
            <DialogDescription>
              Deploy a Docker image from Docker Hub or any public registry.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid grid-cols-3 items-start gap-3">
              <imageForm.AppField name="image" listeners={{ onBlur: moveTagOut }}>
                {() => (
                  <ImageField
                    className="col-span-2 min-w-0"
                    onPick={(picked) => {
                      // A tag picked for the previous image probably doesn't exist for this one.
                      imageForm.setFieldValue("tag", DEFAULT_TAG);
                      // Usually the next step; start looking up its variables now.
                      void queryClient.prefetchQuery(templateSuggestionQuery(picked));
                    }}
                  />
                )}
              </imageForm.AppField>
              <imageForm.AppField name="tag">
                {() => <TagField className="min-w-0" image={image} />}
              </imageForm.AppField>
            </div>
            <imageForm.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name"
                  placeholder={imageBaseName(image) || "Defaults to the image name"}
                  autoComplete="off"
                />
              )}
            </imageForm.AppField>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <imageForm.SubmitButton>Next</imageForm.SubmitButton>
          </DialogFooter>
        </form>
      </imageForm.AppForm>
    );
  }

  return (
    <variablesForm.AppForm>
      <form
        className="grid min-h-0 gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void variablesForm.handleSubmit();
        }}
      >
        <DialogHeader>
          <DialogTitle>Variables for {ref}</DialogTitle>
          <DialogDescription>
            {suggestion
              ? `Suggested by Railway's ${suggestion.templateName} template. Change anything you like.`
              : "We don't know what this image needs, so check its docs and add any variables here."}
          </DialogDescription>
        </DialogHeader>
        <VariablesFields form={variablesForm} />
        {(suggestion?.volumeMountPath || suggestion?.startCommand) && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>The template sets up more than variables</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {suggestion.volumeMountPath && (
                  <li>
                    It mounts a volume at <code>{suggestion.volumeMountPath}</code>. This app can't
                    add volumes yet, so data there is lost when the service redeploys.
                  </li>
                )}
                {suggestion.startCommand && (
                  <li>
                    It runs a custom start command, which this app doesn't copy, so some of these
                    variables may have no effect.
                  </li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {create.error && <FieldError>{create.error.message}</FieldError>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setStep("image")}>
            Back
          </Button>
          <variablesForm.SubmitButton>Create service</variablesForm.SubmitButton>
        </DialogFooter>
      </form>
    </variablesForm.AppForm>
  );
}

const VariablesFields = withForm({
  ...variablesFormOptions,
  render: function Render({ form }) {
    return (
      <form.Field name="variables" mode="array">
        {(field) => (
          <div className="grid gap-3">
            {field.state.value.length > 0 && (
              <div className="-mx-4 grid max-h-[50vh] gap-3 overflow-y-auto px-4">
                {field.state.value.map((variable, index) => (
                  <div key={variable.id} className="grid gap-1">
                    <div className="flex items-start gap-2">
                      <form.AppField name={`variables[${index}].key`}>
                        {(keyField) => (
                          <keyField.TextField
                            className="w-2/5 shrink-0 font-mono"
                            aria-label="Variable name"
                            placeholder="NAME"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        )}
                      </form.AppField>
                      <form.AppField name={`variables[${index}].value`}>
                        {(valueField) => (
                          <valueField.TextField
                            className="font-mono"
                            aria-label={`Value of ${variable.key || "variable"}`}
                            placeholder="value"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        )}
                      </form.AppField>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${variable.key || "variable"}`}
                        onClick={() => field.removeValue(index)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                    {variable.description && (
                      <FieldDescription className="text-xs">
                        {variable.description}
                      </FieldDescription>
                    )}
                  </div>
                ))}
              </div>
            )}
            {field.state.value.some((v) => v.value.includes("${{")) && (
              <FieldDescription>
                Railway fills in <code>{"${{ … }}"}</code> when the service is created, like
                generated passwords and references to other variables.
              </FieldDescription>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                field.pushValue(toRow({ key: "", value: "", description: null, required: false }))
              }
            >
              <PlusIcon />
              Add variable
            </Button>
          </div>
        )}
      </form.Field>
    );
  },
});
