// src/ui/server.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifySessionToken } from "./auth";
import { handleRoute, type AppState } from "./routes";

export interface ServerConfig {
  port: number;
  secret: string;
  getState: () => AppState;
}

export function startServer(config: ServerConfig) {
  return Bun.serve({
    hostname: "127.0.0.1", // HARDCODED — never 0.0.0.0
    port: config.port,
    fetch(req) {
      const url = new URL(req.url);

      // Serve embedded SPA for root
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(getIndexHtml(), { headers: { "content-type": "text/html" } });
      }

      // Auth check for API routes
      if (url.pathname.startsWith("/api/")) {
        const auth = req.headers.get("authorization");
        const token = auth?.replace("Bearer ", "") ?? "";
        if (!verifySessionToken(token, config.secret)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = handleRoute(req.method, url.pathname, config.getState());
        return new Response(result.body, {
          status: result.status,
          headers: { "content-type": result.contentType ?? "application/json" },
        });
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });
}

function getIndexHtml(): string {
	try {
		return readFileSync(join(import.meta.dir, "assets", "index.html"), "utf-8");
	} catch {
		return "<html><body><h1>Kodo Dashboard</h1><p>Assets not found</p></body></html>";
	}
}
