// test/rag/cache.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RAGCache } from "../../src/rag/cache";

describe("RAGCache", () => {
  let dir: string;
  let cache: RAGCache;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "kodo-rag-"));
    cache = await RAGCache.load(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  test("stores and retrieves cached response", async () => {
    await cache.put("What is OAuth2?", "OAuth2 is an authorization framework...", "cybersec");
    const result = await cache.get("What is OAuth2?", "cybersec");
    expect(result).toContain("OAuth2 is an authorization framework");
  });

  test("returns null for cache miss", async () => {
    const result = await cache.get("unknown question", "mode1");
    expect(result).toBeNull();
  });

  test("finds similar cached query via BM25", async () => {
    await cache.put("What is OAuth2 authorization?", "It's a framework for delegated auth", "cybersec");
    const result = await cache.get("Tell me about OAuth2 auth", "cybersec");
    expect(result).toContain("framework");
  });

  test("respects mode scoping", async () => {
    await cache.put("What is OAuth2?", "Answer for cybersec", "cybersec");
    const wrong = await cache.get("What is OAuth2?", "other_mode");
    expect(wrong).toBeNull();
  });

  test("expires entries older than TTL", async () => {
    await cache.put("old question", "old answer", "test");
    // Manually expire by manipulating cache internals
    cache.expireAll();
    const result = await cache.get("old question", "test");
    expect(result).toBeNull();
  });
});
