---
name: kodo:mode
description: Switch the active Kodo mode
args: <slug>
---

Switch the active mode to the specified slug. Valid built-in modes:
- code (default) — Full coding with trusted autonomy
- architect — Design-focused, read-only tools
- ask — Question answering, guarded autonomy
- debug — Debugging with crash/error pattern focus
- plan — Planning mode, read-only with agent tool
- review — Code review, guarded autonomy

Custom modes from ~/.kodo/modes/*.yaml are also available.
Show confirmation of the mode switch with the new mode's description.
