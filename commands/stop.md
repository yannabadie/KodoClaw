---
name: kodo:stop
description: Emergency kill-switch — halt all autonomous operations
---

Immediately:
1. Set autonomy to "guarded" (require confirmation for everything)
2. Cancel any pending scheduled tasks
3. Log the stop event to audit
4. Display confirmation that all autonomous operations are halted

This is the EU AI Act Article 14 compliant kill-switch.
