import { describe, expect, it } from "vitest";
import { app, createApp } from "../../src/app";
import { app as runtimeApp } from "../../src/index";

function routeKeys(target: { routes: Array<{ method: string; path: string }> }): string[] {
  return target.routes
    .map((route) => `${route.method} ${route.path}`)
    .filter((route) => !route.includes("/*"))
    .sort();
}

describe("runtime entry", () => {
  it("uses the same app as the test entry", () => {
    expect(routeKeys(runtimeApp)).toEqual(routeKeys(app));
  });

  it("creates a fresh app with the same route surface", () => {
    expect(routeKeys(createApp())).toEqual(routeKeys(app));
  });
});
