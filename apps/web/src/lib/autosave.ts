import type { Artwork } from "@packaging/schema";

export type SaveState = "saved" | "dirty" | "saving" | "error";
type SaveFn = (art: Artwork) => Promise<{ ok: true } | { ok: false; message: string }>;

/**
 * Debounced, strictly sequential saving: at most one request in flight, and
 * the newest state always wins. Failed saves keep the state for a retry.
 */
export class AutoSaver {
  private pending: Artwork | null = null;
  private saving = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Last save attempt was rejected or failed. */
  private failed = false;

  constructor(
    private readonly save: SaveFn,
    private readonly onState: (s: SaveState, error?: string) => void,
    private readonly delayMs = 1200,
    private readonly retryMs = 5000,
  ) {}

  get unsaved() {
    return this.pending !== null || this.saving;
  }

  schedule(art: Artwork) {
    this.pending = art;
    this.onState("dirty");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Save now; `current` is used when nothing is pending (manual save). */
  async flush(current?: Artwork) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.pending && current) this.pending = current;
    if (this.saving || !this.pending) return;
    const art = this.pending;
    this.pending = null;
    this.saving = true;
    this.onState("saving");
    let reachedServer = false;
    try {
      const r = await this.save(art);
      reachedServer = true;
      this.failed = !r.ok;
      if (r.ok) this.onState(this.pending ? "dirty" : "saved");
      else this.onState("error", r.message); // rejected data is not retried as-is
    } catch {
      this.failed = true;
      this.pending ??= art;
      this.onState("error", "Could not save. Check your connection; changes are kept in this tab.");
    } finally {
      this.saving = false;
    }
    if (!this.pending) return;
    // Newer changes arrived: save them now. Network failure: retry later, not in a tight loop.
    if (reachedServer) void this.flush();
    else this.timer = setTimeout(() => void this.flush(), this.retryMs);
  }

  /**
   * Save now and wait until everything is stored (for exports, which read the
   * saved project). Throws if it cannot be saved within `timeoutMs`.
   */
  async settle(current?: Artwork, timeoutMs = 15_000) {
    const until = Date.now() + timeoutMs;
    await this.flush(current);
    while (this.saving || this.pending) {
      if (Date.now() > until) throw new Error("Could not save the latest changes; export cancelled.");
      await new Promise((r) => setTimeout(r, 50));
      if (!this.saving && this.pending) await this.flush();
    }
    if (this.failed) throw new Error("The latest changes could not be saved; export cancelled.");
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
