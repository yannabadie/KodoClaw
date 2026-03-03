import { describe, expect, test } from "bun:test";
import { BM25Index } from "../../src/memory/bm25";

describe("BM25Index", () => {
  test("indexes and retrieves documents", () => {
    const idx = new BM25Index();
    idx.add("doc1", "typescript express authentication jwt");
    idx.add("doc2", "python flask database postgresql");
    idx.add("doc3", "typescript react frontend components");
    const results = idx.search("typescript authentication");
    expect(results[0]?.id).toBe("doc1");
  });

  test("returns empty for no match", () => {
    const idx = new BM25Index();
    idx.add("doc1", "hello world");
    expect(idx.search("zzzzzzzzz")).toEqual([]);
  });

  test("ranks by relevance", () => {
    const idx = new BM25Index();
    idx.add("doc1", "auth auth auth jwt jwt");
    idx.add("doc2", "auth once");
    const results = idx.search("auth jwt");
    expect(results[0]?.id).toBe("doc1");
  });

  test("removes documents", () => {
    const idx = new BM25Index();
    idx.add("doc1", "hello world");
    idx.remove("doc1");
    expect(idx.search("hello")).toEqual([]);
  });

  test("serializes and deserializes", () => {
    const idx = new BM25Index();
    idx.add("doc1", "typescript express");
    const json = idx.serialize();
    const idx2 = BM25Index.deserialize(json);
    const results = idx2.search("typescript");
    expect(results[0]?.id).toBe("doc1");
  });
});
