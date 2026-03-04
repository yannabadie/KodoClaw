# v0.4.1 Expert Feedback Design

**Date**: 2026-03-04
**Trigger**: Expert review identified 5 gaps between ambition and implementation

## 1. Hierarchical Planning (DAG model)

**Problem**: `planner.ts` is a flat milestone list. No sub-objectives, no dependencies, no replanning.

**Design**: Add `subtasks`, `blockedBy`, and `priority` to the Milestone model.

```
Plan
  └─ Milestone[]
       ├─ id, goal, status, priority (1-5)
       ├─ blockedBy: number[]     ← dependency DAG
       └─ subtasks: Subtask[]     ← decomposition
            └─ id, label, done
```

New functions:
- `addSubtask(plan, milestoneId, label)` — add sub-step to a milestone
- `completeSubtask(plan, milestoneId, subtaskId)` — mark sub-step done
- `getUnblockedMilestones(plan)` — return milestones whose blockedBy are all completed
- `replan(plan, changes)` — reorder, add/remove milestones, auto-update blocked status

Library enhancement: replace word-overlap similarity with TF-IDF scoring.

**Files**: `src/planning/planner.ts`, `src/planning/library.ts`, `src/planning/hints.ts`
**Tests**: `test/planning/planner.test.ts`, `test/planning/library.test.ts`, `test/planning/hints.test.ts`

## 2. Task-Driven Memory Recall

**Problem**: `session-start.ts` uses hardcoded query `"recent project context"` for BM25 recall.

**Design**: Persist last user prompt in `UserPromptSubmit` hook, use it as BM25 query on next `SessionStart`.

Flow:
1. `UserPromptSubmit` → write prompt to `memory/last-prompt.txt` (before injection check)
2. `SessionStart` → read `memory/last-prompt.txt` → use as `buildMemoryContext()` query
3. Fallback to `"recent project context"` if file missing (first launch)

**Files**: `src/hooks/user-prompt-submit.ts`, `src/hooks/session-start.ts`
**Tests**: `test/hooks/user-prompt-submit.test.ts`, `test/hooks/session-start.test.ts`

## 3. Unified kodo.yaml Config

**Problem**: `loadRAGConfig()` claims "env vars > config.yaml > defaults" but never reads config.yaml.

**Design**: Single `kodo.yaml` at plugin root for all user config.

```yaml
rag:
  primary: mcp
  fallback: api
  mcp_server: notebooklm-mcp
  gemini_stores:
    code: "store-code-123"
    architect: "store-arch-456"

cost:
  budget_usd: 25
  input_cost_per_m: 3
  output_cost_per_m: 15
```

New module: `src/config/loader.ts`
- `loadKodoConfig(baseDir)` — read + validate `kodo.yaml`, merge with env vars
- Priority: env vars > kodo.yaml > defaults
- Type-safe validation with explicit error messages

`loadRAGConfig()` and cost tracker constructor delegate to `loadKodoConfig()`.

**Files**: `src/config/loader.ts` (new), `src/rag/config.ts` (refactor), `src/security/cost-tracker.ts` (wire)
**Tests**: `test/config/loader.test.ts` (new), update `test/rag/config.test.ts`

## 4. Cost Tracker Wiring

**Problem**: CostConfig interface exists but is never fed from config file.

**Design**: Solved by Section 3. `loadKodoConfig()` returns `cost` section which is passed to `CostTracker` constructor. No additional code changes needed beyond the config loader wiring.

## 5. GitHub Release v0.4.1

**Problem**: No published GitHub release despite mature plugin surface.

**Design**: After all code changes land:
1. Bump version to 0.4.1 in `package.json`, `src/index.ts`, `.claude-plugin/plugin.json`
2. Add CHANGELOG entry for v0.4.1
3. `git tag v0.4.1 && git push origin v0.4.1`
4. `gh release create v0.4.1` with release notes from CHANGELOG

## Summary

| Section | Scope | New files | Modified files |
|---------|-------|-----------|----------------|
| 1. Planning | Major | 0 | 3 src + 3 test |
| 2. Memory recall | Surgical | 0 | 2 src + 2 test |
| 3. Config loader | Medium | 1 src + 1 test | 2 src + 1 test |
| 4. Cost wiring | Minimal | 0 | 0 (covered by 3) |
| 5. Release | Ops | 0 | 3 metadata + CHANGELOG |
