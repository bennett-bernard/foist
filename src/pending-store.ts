import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { PendingFoist, PendingFoistInput } from "./types.js";

const pendingFoistSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  channelId: z.string().min(1),
  sourceText: z.string().min(1),
  likelyPrompt: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

const storeSchema = z.object({
  version: z.literal(1),
  entries: z.array(pendingFoistSchema),
});

const maximumTimerDelayMs = 2_147_483_647;
const cleanupRetryDelayMs = 1_000;

export class PendingFoistStore {
  private readonly entries = new Map<string, PendingFoist>();
  private loadPromise: Promise<void> | undefined;
  private mutationChain = Promise.resolve();
  private cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  private persistenceDirty = false;

  constructor(
    private readonly path: string,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async init(): Promise<void> {
    await this.ensureLoaded();
  }

  async put(input: PendingFoistInput): Promise<PendingFoist> {
    await this.ensureLoaded();
    return this.enqueue(async () => {
      this.removeExpired();
      const createdAt = this.now();
      const entry: PendingFoist = {
        ...input,
        id: randomUUID(),
        createdAt,
        expiresAt: createdAt + this.ttlMs,
      };
      this.entries.set(entry.id, entry);
      await this.persist();
      this.persistenceDirty = false;
      this.scheduleNextCleanup();
      return entry;
    });
  }

  async getByIdForUser(id: string, userId: string): Promise<PendingFoist | null> {
    await this.ensureLoaded();
    return this.enqueue(async () => {
      await this.purgeExpiredFromDisk();
      this.scheduleNextCleanup();
      const entry = this.entries.get(id);
      return entry?.userId === userId ? entry : null;
    });
  }

  async getLatestForUser(userId: string): Promise<PendingFoist | null> {
    await this.ensureLoaded();
    return this.enqueue(async () => {
      await this.purgeExpiredFromDisk();
      this.scheduleNextCleanup();
      let latest: PendingFoist | null = null;
      for (const entry of this.entries.values()) {
        if (entry.userId === userId && (!latest || entry.createdAt > latest.createdAt)) {
          latest = entry;
        }
      }
      return latest;
    });
  }

  async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    await this.enqueue(async () => {
      const removedExpired = this.removeExpired();
      if (!this.entries.delete(id) && !removedExpired) return;
      await this.persist();
      this.persistenceDirty = false;
      this.scheduleNextCleanup();
    });
  }

  private async ensureLoaded(): Promise<void> {
    this.loadPromise ??= this.load();
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    try {
      const contents = await readFile(this.path, "utf8");
      const parsed = storeSchema.parse(JSON.parse(contents));
      for (const entry of parsed.entries) this.entries.set(entry.id, entry);
      await this.purgeExpiredFromDisk();
      this.scheduleNextCleanup();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw new Error(`Could not load pending Foist data at ${this.path}`, { cause: error });
    }
  }

  private removeExpired(): boolean {
    const now = this.now();
    let removed = false;
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        removed = true;
      }
    }
    return removed;
  }

  private async purgeExpiredFromDisk(): Promise<void> {
    if (this.removeExpired()) this.persistenceDirty = true;
    if (!this.persistenceDirty) return;

    await this.persist();
    this.persistenceDirty = false;
  }

  private scheduleNextCleanup(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = undefined;

    let nextExpiry: number | undefined;
    for (const entry of this.entries.values()) {
      if (nextExpiry === undefined || entry.expiresAt < nextExpiry) {
        nextExpiry = entry.expiresAt;
      }
    }
    if (nextExpiry === undefined) return;

    this.armCleanup(Math.max(0, nextExpiry - this.now()));
  }

  private armCleanup(delayMs: number): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    const boundedDelay = Math.min(delayMs, maximumTimerDelayMs);
    this.cleanupTimer = setTimeout(() => this.runScheduledCleanup(), boundedDelay);
    this.cleanupTimer.unref();
  }

  private runScheduledCleanup(): void {
    this.cleanupTimer = undefined;
    void this.enqueue(async () => {
      await this.purgeExpiredFromDisk();
      this.scheduleNextCleanup();
    }).catch((error: unknown) => {
      console.error("Could not remove expired pending Foist data; retrying.", error);
      this.armCleanup(cleanupRetryDelayMs);
    });
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    const payload = JSON.stringify(
      { version: 1, entries: [...this.entries.values()] },
      null,
      2,
    );
    await writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.path);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationChain.then(operation, operation);
    this.mutationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
