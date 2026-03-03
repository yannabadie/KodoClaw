---
name: kodo:autonomy
description: Change the autonomy level
args: <level>
---

Set the autonomy level. Valid levels:
- **guarded** — All tool calls require confirmation
- **supervised** — Low-risk auto-approved, medium+ confirmed
- **trusted** (default) — Low+medium auto-approved, high+ confirmed
- **autonomous** — Everything auto-approved except critical

Show the updated policy matrix for the new level.
Log the autonomy change to audit.
