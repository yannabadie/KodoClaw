---
name: kodo:health
description: Run health checks on all Kodo subsystems
---

Check and report status of each subsystem:
1. Memory engine — MemCells readable, BM25 index valid
2. Vault — Key exists, encryption/decryption working
3. Audit log — Writable, recent entries parseable
4. Mode engine — Current mode loaded, built-in modes available
5. Planning — Library accessible
6. RAG — NotebookLM connector status
7. Web UI — Server status and port availability

Report pass/fail for each with details on any failures.
