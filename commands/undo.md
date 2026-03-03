---
name: kodo:undo
description: Restore last git snapshot
---

Safety rollback:
1. Show the last 3 git commits with diffs summary
2. Ask which commit to reset to
3. Create a backup branch before reset
4. Perform git reset to the selected commit
5. Log the undo event to audit
