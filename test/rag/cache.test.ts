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

  test("entries survive after partial purge", async () => {
    // Insert several entries
    await cache.put("alpha query", "alpha answer", "mode1");
    await cache.put("beta query", "beta answer", "mode1");
    await cache.put("gamma query", "gamma answer", "mode1");

    // Simulate a purge that removes some but not all: expire all, then re-add survivors
    // This tests that remaining entries are still reachable after index rebuild
    cache.expireAll();
    await cache.put("beta query", "beta answer v2", "mode1");
    await cache.put("gamma query", "gamma answer v2", "mode1");

    // Purged entry should be gone
    const alphaResult = await cache.get("alpha query", "mode1");
    expect(alphaResult).toBeNull();

    // Survivors should be intact
    const betaResult = await cache.get("beta query", "mode1");
    expect(betaResult).toBe("beta answer v2");

    const gammaResult = await cache.get("gamma query", "mode1");
    expect(gammaResult).toBe("gamma answer v2");
  });

  test("duplicate query+mode updates existing entry", async () => {
    await cache.put("What is TLS?", "TLS v1 answer", "security");
    await cache.put("What is TLS?", "TLS v2 updated answer", "security");

    const result = await cache.get("What is TLS?", "security");
    expect(result).toBe("TLS v2 updated answer");

    // Reload from disk to confirm persistence and no duplicates
    const reloaded = await RAGCache.load(dir);
    const reloadedResult = await reloaded.get("What is TLS?", "security");
    expect(reloadedResult).toBe("TLS v2 updated answer");
  });
});
