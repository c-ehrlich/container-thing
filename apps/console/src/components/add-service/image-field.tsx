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
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  POPULAR_IMAGES,
  imageSearchQuery,
  imageTagsQuery,
} from "../../domains/add-service/docker-hub";
import type { ImageSuggestion } from "../../domains/add-service/docker-hub";
import { parseImageRef } from "../../domains/add-service/image-ref";

const pulls = new Intl.NumberFormat("en", { notation: "compact" });

/**
 * The image input. Suggests popular images when empty, Docker Hub repositories while typing a name, and
 * that repository's tags after a `:`. Any image works, including other registries we can't search.
 */
export function ImageField(props: { onPick?: (image: string) => void }) {
  const field = useFieldContext<string>();
  const control = useFieldControl();
  const typed = field.state.value.trim();
  const query = useDebouncedValue(typed, 250);
  const { registry, repository, tag } = parseImageRef(query);

  const searchingTags = registry === null && tag !== null && repository !== "";
  const search = useQuery({
    ...imageSearchQuery(repository),
    enabled: registry === null && !searchingTags && repository.length >= 2,
  });
  const tags = useQuery({ ...imageTagsQuery(repository, tag ?? ""), enabled: searchingTags });

  let items: ImageSuggestion[] = [];
  if (!typed) items = POPULAR_IMAGES;
  else if (searchingTags)
    items = (tags.data ?? []).map((t) => ({
      ref: `${repository}:${t}`,
      description: null,
      official: false,
      pulls: null,
    }));
  else if (registry === null) items = search.data ?? [];

  const loading = search.isFetching || tags.isFetching;
  let empty = "";
  if (registry !== null) empty = `${registry} can't be searched, but any image there works.`;
  else if (typed && !loading) empty = "Nothing on Docker Hub matches. Any image name works.";

  return (
    <FormField
      label="Image"
      description="Type : after the name to pick a tag. Without one, Railway uses latest."
    >
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
          {loading && <Spinner className="text-muted-foreground" />}
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

function useDebouncedValue<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timeout);
  }, [value, ms]);
  return debounced;
}
