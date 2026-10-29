import { FormField, useFieldContext, useFieldControl } from "@repo/form";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@repo/ui/primitives/autocomplete";
import { Badge } from "@repo/ui/primitives/badge";
import { Spinner } from "@repo/ui/primitives/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/primitives/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  POPULAR_IMAGES,
  imageSearchQuery,
  imageTagsQuery,
} from "../../domains/add-service/docker-hub";
import type { ImageSuggestion } from "../../domains/add-service/docker-hub";
import { DEFAULT_TAG, parseImageRef } from "../../domains/add-service/image-ref";

const pulls = new Intl.NumberFormat("en", { notation: "compact" });

/**
 * The image input. Suggests popular images when empty and Docker Hub repositories while typing a name.
 * Any image works, including other registries we can't search. The tag has its own field. How
 * searches are cached on the way to Docker Hub is described in `domains/add-service/docker-hub.ts`.
 */
export function ImageField(props: { onPick?: (image: string) => void; className?: string }) {
  const field = useFieldContext<string>();
  const control = useFieldControl();
  const typed = field.state.value.trim();
  const { registry, repository } = parseImageRef(typed);
  const searchable = registry === null && repository.length >= 2;
  const query = useDebouncedValue(searchable ? repository : "", 250);

  const search = useQuery({ ...imageSearchQuery(query), enabled: query !== "" });
  // Counts the debounce as searching too, so a new search never flashes "nothing matches" first.
  const searching = searchable && (query !== repository || search.isFetching);

  let items: ImageSuggestion[] = [];
  if (!typed) items = POPULAR_IMAGES;
  else if (searchable) items = search.data ?? [];

  let empty = "";
  if (registry !== null) empty = `${registry} can't be searched, but any image there works.`;
  else if (!typed) empty = "";
  else if (!searchable) empty = "Keep typing to search Docker Hub.";
  else if (searching) empty = "Searching Docker Hub…";
  else if (search.isError) empty = "Couldn't search Docker Hub, but any image name works.";
  else empty = "Nothing on Docker Hub matches. Any image name works.";

  return (
    <FormField label="Image" className={props.className}>
      <Autocomplete
        items={items}
        // Docker Hub already filtered these.
        mode="none"
        openOnInputClick
        itemToStringValue={(item: ImageSuggestion) => item.ref}
        value={field.state.value}
        onValueChange={(value, details) => {
          field.handleChange(value);
          if (details.reason === "item-press") props.onPick?.(value);
        }}
      >
        <AutocompleteInput
          {...control}
          placeholder="kennethreitz/httpbin"
          autoComplete="off"
          spellCheck={false}
        >
          {searching && <Spinner className="text-muted-foreground" />}
        </AutocompleteInput>
        <AutocompleteContent>
          {!typed && <p className="px-3 pt-2 text-xs text-muted-foreground">Popular</p>}
          <AutocompleteEmpty>{empty}</AutocompleteEmpty>
          <AutocompleteList>
            {(item: ImageSuggestion) => (
              <AutocompleteItem key={item.ref} value={item} className="grid gap-0.5 py-1.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.ref}</span>
                  {item.official && <Badge variant="muted">Official</Badge>}
                  {item.pulls !== null && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {pulls.format(item.pulls)} pulls
                    </span>
                  )}
                </span>
                {item.description && (
                  <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                )}
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </FormField>
  );
}

/**
 * The tag input. Lists the image's tags on Docker Hub, newest first; any tag works. Disabled until
 * there's an image to pick a tag for.
 */
export function TagField(props: { image: string; className?: string }) {
  const field = useFieldContext<string>();
  const control = useFieldControl();
  const typed = field.state.value.trim();
  // `latest` is the default rather than a search, so it shows every tag.
  const wanted = typed === DEFAULT_TAG ? "" : typed;
  const prefix = useDebouncedValue(wanted, 250);
  // Only look tags up while the list is open, not on every keystroke in the image field.
  const [open, setOpen] = useState(false);
  const { registry, repository } = parseImageRef(props.image);
  const disabled = repository === "";
  const listable = registry === null && !disabled;

  const tags = useQuery({ ...imageTagsQuery(repository, prefix), enabled: listable && open });
  const searching = listable && open && (prefix !== wanted || tags.isFetching);

  let empty = "";
  if (registry !== null) empty = `${registry} can't be searched, but any tag works.`;
  else if (searching) empty = "Looking up tags…";
  else if (tags.isError) empty = "Couldn't list tags on Docker Hub, but any tag works.";
  else empty = "No tags on Docker Hub match. Any tag works.";

  return (
    <FormField label="Tag" className={props.className}>
      <Autocomplete
        items={listable ? (tags.data ?? []) : []}
        // Docker Hub already filtered these.
        mode="none"
        openOnInputClick
        onOpenChange={setOpen}
        disabled={disabled}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
      >
        {/* A disabled input ignores the pointer, so the tooltip hangs off a wrapper. */}
        <Tooltip disabled={!disabled}>
          <TooltipTrigger render={<div />}>
            <AutocompleteInput
              {...control}
              disabled={disabled}
              placeholder={DEFAULT_TAG}
              autoComplete="off"
              spellCheck={false}
            >
              {searching && <Spinner className="text-muted-foreground" />}
            </AutocompleteInput>
          </TooltipTrigger>
          <TooltipContent>Pick an image first to choose its tag.</TooltipContent>
        </Tooltip>
        <AutocompleteContent align="end" className="w-max min-w-(--anchor-width) max-w-80">
          <AutocompleteEmpty>{empty}</AutocompleteEmpty>
          <AutocompleteList>
            {(tag: string) => (
              <AutocompleteItem key={tag} value={tag}>
                <span className="truncate">{tag}</span>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </FormField>
  );
}

function useDebouncedValue<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timeout);
  }, [value, ms]);
  return debounced;
}
