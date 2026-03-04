---
name: kodo:agent
description: Create and manage dynamic agents with knowledge bindings
args: <create|list|remove> [options]
---

Manage dynamic Kodo agents:

- `create <name> --template <slug> [--store <id>] [--notebook <id>]`
  Create a new agent instance from a template with optional knowledge binding.
  Templates: code, architect, debug, review, security-audit

- `list` — Show all active agent instances with their bindings and TTL

- `remove <name>` — Remove an agent instance

Created agents appear in the `/agents` menu and can be selected as the active agent.
