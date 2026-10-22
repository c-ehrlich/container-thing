import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { useState } from "react";

/**
 * Dismissed insights, remembered in a cookie so the server renders the overview without them (no
 * flash of a dismissed card on reload). Insight keys change when their situation does, so a new
 * failure shows up again even after the last one was dismissed.
 */
const COOKIE = "dismissed_insights";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Old entries fall off; their insights have long been replaced by new keys anyway. */
const MAX_ENTRIES = 100;

/** Insight keys hold deployment IDs; a short hash keeps 100 of them well under the cookie limit. */
function hash(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function parse(value: string | undefined) {
  return value ? value.split(".").filter(Boolean) : [];
}

export const getDismissedFn = createServerFn({ method: "GET" }).handler(() =>
  parse(getCookie(COOKIE)),
);

export function useDismissed(initial: string[]) {
  const [hashes, setHashes] = useState(initial);

  const save = (next: string[]) => {
    const kept = next.slice(-MAX_ENTRIES);
    setHashes(kept);
    document.cookie = `${COOKIE}=${kept.join(".")}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  };

  return {
    isDismissed: (key: string) => hashes.includes(hash(key)),
    dismiss: (key: string) => save([...hashes.filter((h) => h !== hash(key)), hash(key)]),
    restore: (keys: string[]) => {
      const restored = new Set(keys.map(hash));
      save(hashes.filter((h) => !restored.has(h)));
    },
  };
}
