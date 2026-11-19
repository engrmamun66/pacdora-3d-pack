"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, X } from "lucide-react";

export interface SearchOption {
  value: string;
  label: string;
  /** Extra text that is searched but not shown (an ID, for example). */
  hint?: string;
}

/**
 * A select box you can type in (like select2): type to narrow the list, arrows and Enter to pick, Escape to close.
 * `value` is the picked option's value ("" for none); `onChange` gets the new value ("" when cleared).
 * Built on Base UI's Combobox (accessible, free), so it works the same in a WebView-based mobile app.
 */
export function SearchSelect({ id, value, options, onChange, placeholder = "Any", emptyText = "Nothing matches.", className = "" }: { id?: string; value: string; options: SearchOption[]; onChange: (value: string) => void; placeholder?: string; emptyText?: string; className?: string }) {
  const picked = options.find((o) => o.value === value) ?? null;
  return (
    <Combobox.Root<SearchOption>
      items={options}
      value={picked}
      onValueChange={(o) => onChange(o?.value ?? "")}
      itemToStringLabel={(o) => o.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      filter={(o, query) => {
        const q = query.trim().toLowerCase();
        return q === "" || o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q);
      }}
    >
      <div className={`relative ${className}`}>
        <Combobox.Input id={id} placeholder={placeholder} className="h-9 w-full rounded-lg border border-input bg-card pr-14 pl-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50" />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {value ? (
            <Combobox.Clear aria-label="Clear" className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-3.5" aria-hidden />
            </Combobox.Clear>
          ) : null}
          <Combobox.Trigger aria-label="Show the list" className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <ChevronDown className="size-4" aria-hidden />
          </Combobox.Trigger>
        </div>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-50">
          <Combobox.Popup className="max-h-72 w-[var(--anchor-width)] min-w-56 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            <Combobox.Empty className="px-2.5 py-2 text-sm text-muted-foreground empty:hidden">{emptyText}</Combobox.Empty>
            <Combobox.List>
              {(o: SearchOption) => (
                <Combobox.Item key={o.value} value={o} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-muted">
                  <span className="grid size-4 shrink-0 place-items-center"><Combobox.ItemIndicator><Check className="size-3.5" aria-hidden /></Combobox.ItemIndicator></span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="max-w-32 shrink-0 truncate font-mono text-[11px] text-muted-foreground">{o.hint}</span> : null}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
