# Memory System

Kodo's memory engine gives Claude persistent, cross-session memory using a 4-phase lifecycle inspired by human episodic memory.

## Overview

```
   ENCODE              CONSOLIDATE           DECAY              RECALL
┌──────────┐       ┌───────────────┐    ┌──────────┐      ┌─────────────┐
│createMemCell()   │ consolidate() │    │ decay.ts │      │ BM25 search │
│                  │               │    │          │      │ TF-IDF      │
│• SHA-256 hash    │• Jaccard sim  │    │• e^(-t/S)│      │ Cosine sim  │
│• Injection scan  │  (≥0.3)       │    │• β=0.8   │      │ RRF (k=60)  │
│• Importance      │• Scene cluster│    │• Prune   │      │ × retention │
│  (default 1.0)   │• Summary merge│    │  <10%    │      │             │
│• Type guard      │               │    │          │      │             │
└──────────┘       └───────────────┘    └──────────┘      └─────────────┘
```

## MemCell

A MemCell is the atomic unit of episodic memory.

### Structure

```typescript
interface MemCell {
  id: string;             // UUID v4
  episode: string;        // Natural language description of what happened
  facts: string[];        // Key facts extracted from the episode
  tags: string[];         // Categorical tags for clustering
  timestamp: string;      // ISO 8601 creation time
  foresight?: Foresight;  // Predictive note with expiry date
  checksum: string;       // SHA-256 of canonical form
  importance?: number;    // 0.0-1.0+, default 1.0, affects decay rate
}
```

### Security

- **Checksum**: SHA-256 computed over `{ episode, facts (sorted), tags (sorted), importance? }`. Detects tampering via `verifyChecksum()`.
- **Injection scanning**: Every write is scanned by the Aho-Corasick scanner. Writes with injection score >= 4 are **blocked**.
- **Type guard**: `isMemCell()` validates JSON from disk before loading. Invalid files are silently skipped by `loadMemCells()`.

### Source

`src/memory/memcell.ts` — exports `createMemCell()`, `loadMemCells()`, `computeChecksum()`, `verifyChecksum()`, `isMemCell()`

## Consolidation

MemCells are grouped into **MemScenes** using tag-based similarity.

### Jaccard Similarity

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

Where A and B are the tag sets of two MemCells.

- **Threshold**: J >= 0.3 → add to existing scene
- **Below threshold** → create new scene
- **Scene IDs**: Generated with `crypto.randomUUID()` (collision-resistant)
- **Summary**: Facts from all cells in a scene are accumulated (appended, never replaced)

### Example

```
MemCell A: tags = ["auth", "jwt", "security"]
MemCell B: tags = ["auth", "jwt", "testing"]

J(A, B) = |{auth, jwt}| / |{auth, jwt, security, testing}| = 2/4 = 0.5

0.5 >= 0.3 → Same scene
```

### Source

`src/memory/memscene.ts` — exports `consolidate()`, `loadMemScenes()`

## Decay

Memory retention follows a FadeMem-inspired Ebbinghaus curve with importance weighting.

### Formula

```
retention(t) = e^(-(t/S)^β)

Where:
  t = elapsed time since creation
  S = importance × BASE_STABILITY (7 days)
  β = 0.8 (sub-linear, gentler than pure exponential)
```

### Importance Effects

| importance | Effective S | Approximate half-life | Use case |
|------------|------------|----------------------|----------|
| 0.5 | 3.5 days | ~2.4 days | Transient context, temporary notes |
| 1.0 (default) | 7 days | ~4.8 days | Standard facts and decisions |
| 1.5 | 10.5 days | ~7.2 days | Important architectural decisions |
| 2.0 | 14 days | ~9.7 days | Critical choices, user preferences |
| Infinity | Infinite | Never decays | Permanent architectural decisions, immutable agreements |

### Pruning

Cells with retention below **10%** are permanently removed by `pruneDecayed()`.

For a cell with importance=1.0, this occurs at approximately **16 days** after creation.

### Permanent Memories

Setting `importance: Infinity` on a MemCell makes it immune to decay. The retention function always returns 1.0, and `pruneDecayed()` never removes it. Use this for:

- Architectural decisions that must never be forgotten
- Immutable agreements or constraints
- Project invariants (e.g., "never bind to 0.0.0.0", "max 2 runtime deps")

Permanent memories still participate in BM25 search and RRF ranking normally -- they simply never lose relevance due to age.

### Integration with Recall

`applyDecayToScores()` multiplies BM25 search scores by the retention factor. This means:

- Recent, important memories rank highest
- Old memories naturally fade from search results
- Explicitly important memories resist decay

### Source

`src/memory/decay.ts` — exports `computeRetention()`, `applyDecay()`, `pruneDecayed()`

## BM25 Search

Full-text search over MemCell episodes and facts using the BM25 ranking algorithm.

### Parameters

- **k1** = 1.5 (term frequency saturation)
- **b** = 0.75 (document length normalization)

### Tokenization Pipeline

```
Input: "The automation system handles user sessions"
    │
    ▼ lowercase
"the automation system handles user sessions"
    │
    ▼ split on \W+ (non-word characters)
["the", "automation", "system", "handles", "user", "sessions"]
    │
    ▼ filter 88 English stop words ("the" removed)
["automation", "system", "handles", "user", "sessions"]
    │
    ▼ Porter stemming (14 suffix rules)
["automate", "system", "handl", "user", "session"]
```

### Stemmer Rules

14 suffix rules applied in order (more specific first):

- `-ation` → `-ate` (e.g., "automation" → "automate") — before `-tion`
- `-tion` → `-t` (e.g., "action" → "act")
- `-ment` → `` (e.g., "development" → "develop")
- `-ness` → `` (e.g., "darkness" → "dark")
- `-ing` → `` (e.g., "running" → "runn")
- `-ed` → `` (e.g., "handled" → "handl")
- `-ly` → `` (e.g., "quickly" → "quick")
- `-er` → `` (e.g., "reader" → "read")
- `-est` → `` (e.g., "fastest" → "fast")
- `-ful` → `` (e.g., "helpful" → "help")
- `-less` → `` (e.g., "helpless" → "help")
- `-able` → `` (e.g., "readable" → "read")
- `-ible` → `` (e.g., "visible" → "vis")
- `-s` → `` (e.g., "sessions" → "session")

Rule order matters: `-ation` must precede `-tion` to correctly stem "automation" to "automate" (not "automa").

### Source

`src/memory/bm25.ts` — `BM25Index` class (serializable to/from JSON)
`src/memory/stemmer.ts` — `stem()`, `isStopWord()`

## Recall Pipeline

The recall pipeline is orchestrated by `buildMemoryContext()` in `src/memory/builder.ts`, which is called from the SessionStart hook. It loads all MemCells, builds a BM25 index, applies decay-weighted scoring, and returns formatted markdown context for Claude's system prompt.

When Claude needs to remember something, the recall pipeline fuses two search strategies:

```
Query
  │
  ├──► BM25 search (with stemming + stop words)
  │       │
  │       ├──► Ranked list A (term frequency + document length)
  │
  ├──► TF-IDF + Cosine similarity
  │       │
  │       ├──► Ranked list B (vector space model)
  │
  └──► Reciprocal Rank Fusion (k=60)
          │
          ▼
      Fused ranking
          │
          ▼
      × retention score (decay weighting)
          │
          ▼
      Final ranking (most relevant + recent + important first)
```

### Reciprocal Rank Fusion (RRF)

```
RRF_score(d) = Σ 1/(k + rank_i(d))

Where:
  k = 60 (smoothing constant)
  rank_i(d) = rank of document d in ranked list i
```

RRF combines multiple ranking signals without requiring score normalization.

### Source

`src/memory/recall.ts` — exports `recall()`, `applyDecayToScores()`

## User Profile

Persistent user information that doesn't decay.

### Structure

```yaml
stableTraits:
  stack: "TypeScript, Bun"
  style: "TDD, small commits"
  preferences: "no default exports, named exports only"

temporaryStates:
  focus:
    value: "refactoring auth module"
    expires: "2026-03-10"   # auto-filtered after expiry
  deadline:
    value: "demo on Friday"
    expires: "2026-03-07"
```

### Behavior

- **Stable traits**: Persist indefinitely. Key-value pairs describing the user.
- **Temporary states**: Have ISO 8601 expiry dates. `getTemporaryStates()` filters expired entries automatically (non-mutating — does not modify the stored profile).
- **`renderContext()`**: Generates a human-readable summary for the system prompt. Non-mutating (does not call `purgeExpired()`).

### Source

`src/memory/profile.ts` — exports `UserProfile` class
