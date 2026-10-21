import { Kbd } from "@repo/ui/primitives/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/primitives/tooltip";
import type { ReactElement } from "react";

/** A tooltip naming what the control does and the keyboard shortcut that does the same. */
export function ShortcutTooltip(props: {
  label: string;
  shortcut: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipContent side="bottom">
        {props.label}
        <Kbd>{props.shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
