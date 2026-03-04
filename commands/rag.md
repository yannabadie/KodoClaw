---
name: kodo:rag
description: RAG configuration status and setup guide
---

Show current RAG (Retrieval-Augmented Generation) configuration:

1. **Primary strategy**: NotebookLM MCP status (connected/auth expired/not installed)
2. **Fallback strategy**: Gemini File Search status (API key configured/missing)
3. **Per-mode notebooks**: Which custom modes have notebook_id bindings

If authentication has expired, provide reconnection instructions:
- "Run `notebooklm login` in your terminal to re-authenticate"
- "Kodo will auto-recover on next query attempt"

If Gemini is not configured:
- "Add GOOGLE_API_KEY=your_key to your .env file for reliable RAG fallback"

Show current circuit breaker states and cache statistics if available.
