// src/rag/cache.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BM25Index } from "../memory/bm25";

interface CacheEntry {
  query: string;
  answer: string;
  mode: string;
  cachedAt: number; // epoch ms
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SIMILARITY_THRESHOLD = 0.5;

export class RAGCache {
  private entries: CacheEntry[] = [];
  private index: BM25Index = new BM25Index();
  private filePath: string;

  private constructor(filePath: string) {
    this.filePath = filePath;
  }

  static async load(dir: string): Promise<RAGCache> {
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, "queries.json");
    const cache = new RAGCache(filePath);
    try {
      const raw = await readFile(filePath, "utf-8");
      cache.entries = JSON.parse(raw);
      cache.rebuildIndex();
      cache.purgeExpired();
    } catch {
      // No cache yet
    }
    return cache;
  }

  async put(query: string, answer: string, mode: string): Promise<void> {
    const entry: CacheEntry = { query, answer, mode, cachedAt: Date.now() };
    this.entries.push(entry);
    const id = `${this.entries.length - 1}`;
    this.index.add(id, `${mode} ${query}`);
    await this.save();
  }

  async get(query: string, mode: string): Promise<string | null> {
    // Exact match first
    const exact = this.entries.find((e) => e.query === query && e.mode === mode);
    if (exact) return exact.answer;

    // BM25 fuzzy match
    const results = this.index.search(`${mode} ${query}`, 3);
    for (const r of results) {
      const idx = parseInt(r.id);
      const entry = this.entries[idx];
      if (entry && entry.mode === mode && r.score > SIMILARITY_THRESHOLD) {
        return entry.answer;
      }
    }

    return null;
  }

  /** Force-expire all entries (for testing) */
  expireAll(): void {
    this.entries = [];
    this.index = new BM25Index();
  }

  private purgeExpired(): void {
    const cutoff = Date.now() - TTL_MS;
    this.entries = this.entries.filter((e) => e.cachedAt > cutoff);
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    this.index = new BM25Index();
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      this.index.add(`${i}`, `${e.mode} ${e.query}`);
    }
  }

  private async save(): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(this.entries, null, 2), "utf-8");
  }
}
