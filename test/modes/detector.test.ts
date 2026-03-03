// test/modes/detector.test.ts
import { describe, expect, test } from "bun:test";
import { detectMode } from "../../src/modes/detector";

describe("detectMode", () => {
  test("detects ask mode", () => {
    expect(detectMode("Why does this function return null?")).toBe("ask");
    expect(detectMode("Explain the auth flow")).toBe("ask");
    expect(detectMode("What is dependency injection?")).toBe("ask");
  });

  test("detects debug mode", () => {
    expect(detectMode("There's a bug in the login")).toBe("debug");
    expect(detectMode("Error: cannot read property of undefined")).toBe("debug");
    expect(detectMode("The app crashes on startup")).toBe("debug");
  });

  test("detects code mode", () => {
    expect(detectMode("Add a logout button")).toBe("code");
    expect(detectMode("Implement the payment flow")).toBe("code");
    expect(detectMode("Refactor the auth module")).toBe("code");
  });

  test("detects architect mode", () => {
    expect(detectMode("How should I structure the database?")).toBe("architect");
    expect(detectMode("Design the microservices architecture")).toBe("architect");
  });

  test("detects review mode", () => {
    expect(detectMode("Review this pull request")).toBe("review");
    expect(detectMode("Audit the security of auth.ts")).toBe("review");
  });

  test("defaults to code mode", () => {
    expect(detectMode("hello")).toBe("code");
    expect(detectMode("do stuff")).toBe("code");
  });
});
