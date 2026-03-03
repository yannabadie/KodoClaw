import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consolidate, loadMemScenes, type MemScene } from "../../src/memory/memscene";
import type { MemCell } from "../../src/memory/memcell";

const makeCell = (id: string, tags: string[], facts: string[]): MemCell => ({
  id, episode: `Episode ${id}`, facts, tags, timestamp: new Date().toISOString(),
});

describe("MemScene", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "kodo-scenes-")); });
  afterEach(async () => { await rm(dir, { recursive: true }); });

  test("creates new scene from first cell", async () => {
    const cell = makeCell("mc_1", ["auth", "jwt"], ["Uses JWT tokens"]);
    await consolidate(dir, cell, []);
    const scenes = await loadMemScenes(dir);
    expect(scenes.length).toBe(1);
    expect(scenes[0]!.cells).toContain("mc_1");
  });

  test("assimilates similar cell into existing scene", async () => {
    const cell1 = makeCell("mc_1", ["auth", "jwt"], ["Uses JWT"]);
    await consolidate(dir, cell1, []);
    const scenes1 = await loadMemScenes(dir);
    const cell2 = makeCell("mc_2", ["auth", "session"], ["Added session auth"]);
    await consolidate(dir, cell2, scenes1);
    const scenes2 = await loadMemScenes(dir);
    expect(scenes2.length).toBe(1);
    expect(scenes2[0]!.cells).toContain("mc_1");
    expect(scenes2[0]!.cells).toContain("mc_2");
  });

  test("creates separate scene for unrelated cell", async () => {
    const cell1 = makeCell("mc_1", ["auth", "jwt"], ["Uses JWT"]);
    await consolidate(dir, cell1, []);
    const scenes1 = await loadMemScenes(dir);
    const cell2 = makeCell("mc_2", ["database", "postgresql"], ["Uses PostgreSQL"]);
    await consolidate(dir, cell2, scenes1);
    const scenes2 = await loadMemScenes(dir);
    expect(scenes2.length).toBe(2);
  });
});
