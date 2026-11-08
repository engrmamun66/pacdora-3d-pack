import { describe, expect, it, vi } from "vitest";
import { AutoSaver, type SaveState } from "./autosave";

const art = (n: number) => ({ objects: [{ id: String(n) }] }) as never;

function setup(result: () => Promise<{ ok: true } | { ok: false; message: string }> = async () => ({ ok: true })) {
  const saved: unknown[] = [];
  const states: SaveState[] = [];
  const save = vi.fn(async (a: unknown) => {
    saved.push(a);
    return result();
  });
  const s = new AutoSaver(save, (st) => states.push(st), 100);
  return { s, save, saved, states };
}

describe("AutoSaver", () => {
  it("debounces bursts into one save of the newest state", async () => {
    vi.useFakeTimers();
    const { s, save, saved, states } = setup();
    s.schedule(art(1));
    s.schedule(art(2));
    s.schedule(art(3));
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(saved).toEqual([art(3)]);
    expect(states.at(-1)).toBe("saved");
    expect(s.unsaved).toBe(false);
    vi.useRealTimers();
  });

  it("never runs two saves at once; a change during a save is saved afterwards", async () => {
    let release!: () => void;
    let first = true;
    const { s, saved } = setup(() =>
      first
        ? new Promise((r) => {
            first = false;
            release = () => r({ ok: true });
          })
        : Promise.resolve({ ok: true }),
    );
    const p = s.flush(art(1));
    s.schedule(art(2));
    await s.flush(); // in flight: does nothing yet
    expect(saved).toEqual([art(1)]);
    release();
    await p;
    await new Promise((r) => setTimeout(r, 0));
    expect(saved).toEqual([art(1), art(2)]);
  });

  it("reports a server rejection as error", async () => {
    const { s, states } = setup(async () => ({ ok: false, message: "nope" }));
    await s.flush(art(1));
    expect(states.at(-1)).toBe("error");
  });

  it("keeps the state after a network failure so it can be retried", async () => {
    let fail = true;
    const { s, saved, states } = setup(async () => {
      if (fail) throw new Error("offline");
      return { ok: true };
    });
    vi.useFakeTimers();
    await s.flush(art(1));
    expect(states.at(-1)).toBe("error");
    expect(s.unsaved).toBe(true);
    expect(saved).toHaveLength(1); // no tight retry loop
    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(saved).toEqual([art(1), art(1)]);
    expect(states.at(-1)).toBe("saved");
    vi.useRealTimers();
  });
});
