// test/ui/routes.test.ts
import { describe, expect, test } from "bun:test";
import { handleRoute, type AppState } from "../../src/ui/routes";

const mockState: AppState = {
  mode: "code",
  autonomy: "trusted",
  memoryCount: 10,
  planProgress: { done: 2, total: 5 },
  sessionCost: 0.05,
  dailyCost: 1.20,
  auditEntries: [],
};

describe("handleRoute", () => {
  test("GET /api/status returns current state", () => {
    const res = handleRoute("GET", "/api/status", mockState);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.mode).toBe("code");
    expect(body.autonomy).toBe("trusted");
  });

  test("GET /api/cost returns cost info", () => {
    const res = handleRoute("GET", "/api/cost", mockState);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionCost).toBe(0.05);
  });

  test("unknown route returns 404", () => {
    const res = handleRoute("GET", "/api/unknown", mockState);
    expect(res.status).toBe(404);
  });
});
