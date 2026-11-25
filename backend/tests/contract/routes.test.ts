import { describe, expect, it } from "vitest";
import { app } from "../../src/app";

describe("route contract", () => {
  it("keeps the public route surface stable", () => {
    const routes = app.routes
      .map((route) => `${route.method} ${route.path}`)
      .filter((route) => !route.includes("/*"))
      .sort();

    expect(routes).toMatchSnapshot();
  });

  it("keeps experimental knowledge routes disabled by default", () => {
    const hasKnowledge = app.routes.some((route) => route.path.startsWith("/knowledge"));
    expect(hasKnowledge).toBe(false);
  });
});
