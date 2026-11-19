"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import { formatDay, parseDay, showDay } from "@/lib/day";

/**
 * Date pickers built on react-day-picker (free, MIT, touch friendly, keyboard and screen reader ready).
 * Both write plain "YYYY-MM-DD" text into hidden inputs, so they work inside an ordinary <form> (a page address)
 * and in a WebView-based mobile app the same way.
 */
// The calendar sets its own colours on its root, so these go on the calendar itself (black, with a light grey band for a range).
const calendarVars = {
  "--rdp-accent-color": "#18181b",
  "--rdp-accent-background-color": "#e4e4e7",
  "--rdp-range_middle-background-color": "#f4f4f5",
  "--rdp-range_middle-color": "#18181b",
  "--rdp-day_button-height": "2.25rem",
  "--rdp-day_button-width": "2.25rem",
  "--rdp-day-height": "2.25rem",
  "--rdp-day-width": "2.25rem",
  fontSize: "0.875rem",
} as React.CSSProperties;

const trigger = "inline-flex h-9 min-w-44 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-left text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const popup = "z-50 max-w-[calc(100vw-1rem)] rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg outline-none";
const link = "rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** One day. Writes it to a hidden input called `name` ("" when none). */
export function DatePicker({ name, value, label, placeholder = "Any date" }: { name: string; value?: string; label: string; placeholder?: string }) {
  const [day, setDay] = useState<Date | undefined>(parseDay(value));
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={day ? formatDay(day) : ""} />
      <Popover.Trigger className={trigger} aria-label={label}>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className={day ? "" : "text-muted-foreground"}>{day ? showDay(day) : placeholder}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup className={popup} aria-label={label}>
            <DayPicker
              mode="single"
              style={calendarVars}
              selected={day}
              {...(day ? { defaultMonth: day } : {})}
              onSelect={(d) => {
                setDay(d);
                if (d) setOpen(false);
              }}
            />
            <div className="flex justify-end border-t pt-2">
              <button type="button" className={link} onClick={() => { setDay(undefined); setOpen(false); }}>Clear</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A range of days (two months side by side where there is room, one on a phone). Writes `fromName` and `toName` hidden inputs. */
export function DateRangePicker({ fromName, toName, from, to, label, placeholder = "Any date", onChange }: { fromName: string; toName: string; from?: string; to?: string; label: string; placeholder?: string; /** Called with the new days ("" for none) when a range is finished, cleared or the picker is closed. */ onChange?: (from: string, to: string) => void }) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const f = parseDay(from);
    const t = parseDay(to);
    return f || t ? { from: f, to: t } : undefined;
  });
  const [open, setOpen] = useState(false);
  const tell = (r: DateRange | undefined) => onChange?.(r?.from ? formatDay(r.from) : "", r?.to ? formatDay(r.to) : "");
  const pick = (r: DateRange | undefined) => {
    setRange(r);
    if (!r?.from || r.to) tell(r); // finished or cleared; a half-picked range waits for its second day
  };
  const text = range?.from ? (range.to ? `${showDay(range.from)} – ${showDay(range.to)}` : `${showDay(range.from)} –`) : range?.to ? `– ${showDay(range.to)}` : "";
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) tell(range); }}>
      <input type="hidden" name={fromName} value={range?.from ? formatDay(range.from) : ""} />
      <input type="hidden" name={toName} value={range?.to ? formatDay(range.to) : ""} />
      <Popover.Trigger className={`${trigger} min-w-64`} aria-label={label}>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className={text ? "" : "text-muted-foreground"}>{text || placeholder}</span>
        {text ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear the dates"
            className="ml-auto grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); pick(undefined); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); pick(undefined); } }}
          >
            <X className="size-3" aria-hidden />
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup className={popup} aria-label={label}>
            <DayPicker
              mode="range"
              style={calendarVars}
              numberOfMonths={2}
              selected={range}
              {...(range?.from ? { defaultMonth: range.from } : {})}
              onSelect={pick}
              className="max-w-full overflow-x-auto"
            />
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <button type="button" className={link} onClick={() => pick(undefined)}>Clear</button>
              <button type="button" className="h-8 rounded-lg border border-black bg-black px-3 text-sm font-medium text-white hover:bg-neutral-800" onClick={() => setOpen(false)}>Done</button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
