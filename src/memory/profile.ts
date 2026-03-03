import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * A temporary state entry with an expiration date.
 */
export interface TemporaryState {
  value: string;
  expires: string; // ISO date string (YYYY-MM-DD)
}

/**
 * The on-disk shape of the profile JSON file.
 */
interface ProfileData {
  stableTraits: Record<string, string>;
  temporaryStates: Record<string, TemporaryState>;
}

/**
 * UserProfile manages stable user traits (e.g. preferred stack, coding style)
 * and temporary states with expiry dates (e.g. current focus area).
 *
 * Data is persisted to a JSON file and loaded on construction via the
 * static `load` factory method.
 */
export class UserProfile {
  private stableTraits: Record<string, string>;
  private temporaryStates: Record<string, TemporaryState>;
  private filePath: string;

  private constructor(
    filePath: string,
    data: ProfileData,
  ) {
    this.filePath = filePath;
    this.stableTraits = data.stableTraits;
    this.temporaryStates = data.temporaryStates;
  }

  /**
   * Load a UserProfile from a JSON file, or create an empty one if the file
   * does not exist.
   */
  static async load(filePath: string): Promise<UserProfile> {
    try {
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw) as ProfileData;
      return new UserProfile(filePath, {
        stableTraits: data.stableTraits ?? {},
        temporaryStates: data.temporaryStates ?? {},
      });
    } catch {
      return new UserProfile(filePath, {
        stableTraits: {},
        temporaryStates: {},
      });
    }
  }

  /**
   * Return a shallow copy of all stable traits.
   */
  getStableTraits(): Record<string, string> {
    return { ...this.stableTraits };
  }

  /**
   * Return a shallow copy of all non-expired temporary states.
   */
  getTemporaryStates(): Record<string, TemporaryState> {
    return { ...this.temporaryStates };
  }

  /**
   * Set a stable trait and persist to disk.
   * Can be called without await for in-memory use; the returned promise
   * resolves once the file is written.
   */
  setTrait(key: string, value: string): Promise<void> {
    this.stableTraits[key] = value;
    return this.save();
  }

  /**
   * Set a temporary state with an expiry date (ISO YYYY-MM-DD) and persist.
   */
  setTemporary(key: string, value: string, expires: string): Promise<void> {
    this.temporaryStates[key] = { value, expires };
    return this.save();
  }

  /**
   * Remove all temporary states whose expiry date is in the past.
   */
  purgeExpired(): void {
    const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    for (const key of Object.keys(this.temporaryStates)) {
      const state = this.temporaryStates[key];
      if (state && state.expires <= now) {
        delete this.temporaryStates[key];
      }
    }
  }

  /**
   * Render the profile as a human-readable bullet-pointed context string
   * suitable for inclusion in a prompt.
   */
  renderContext(): string {
    const lines: string[] = [];

    const traitKeys = Object.keys(this.stableTraits);
    if (traitKeys.length > 0) {
      lines.push("Stable Traits:");
      for (const key of traitKeys) {
        lines.push(`- ${key}: ${this.stableTraits[key]}`);
      }
    }

    this.purgeExpired();
    const tempKeys = Object.keys(this.temporaryStates);
    if (tempKeys.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("Temporary States:");
      for (const key of tempKeys) {
        const state = this.temporaryStates[key]!;
        lines.push(`- ${key}: ${state.value} (expires ${state.expires})`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Persist current state to the JSON file.
   */
  private async save(): Promise<void> {
    const data: ProfileData = {
      stableTraits: this.stableTraits,
      temporaryStates: this.temporaryStates,
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
