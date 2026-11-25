import { describe, expect, it } from "vitest";
import { computeDragPosition, computePanelWidth } from "@/lib/floating-drag";

const base = {
  startX: 100,
  startY: 100,
  originX: 400,
  originY: 88,
  width: 40,
  height: 40,
  viewportWidth: 1440,
  viewportHeight: 900,
  minLeft: 8,
  minTop: 56,
  threshold: 4,
};

describe("computeDragPosition", () => {
  it("ignores movement below the threshold", () => {
    expect(computeDragPosition({ ...base, clientX: 102, clientY: 101 })).toEqual({
      x: 400,
      y: 88,
      moved: false,
    });
  });

  it("follows the pointer delta exactly inside the viewport", () => {
    expect(computeDragPosition({ ...base, clientX: 160, clientY: 150 })).toEqual({
      x: 460,
      y: 138,
      moved: true,
    });
  });

  it("clamps to the left and top bounds", () => {
    expect(computeDragPosition({ ...base, clientX: -400, clientY: -400 })).toEqual({
      x: 8,
      y: 56,
      moved: true,
    });
  });

  it("clamps to the right and bottom bounds using the element size", () => {
    expect(computeDragPosition({ ...base, clientX: 5000, clientY: 5000 })).toEqual({
      x: 1400,
      y: 860,
      moved: true,
    });
  });

  it("never returns negative bounds when the viewport is smaller than the element", () => {
    expect(
      computeDragPosition({
        ...base,
        viewportWidth: 20,
        viewportHeight: 40,
        clientX: 0,
        clientY: 0,
      }),
    ).toEqual({ x: 8, y: 56, moved: true });
  });
});

describe("computePanelWidth", () => {
  it("grows when dragging left and shrinks when dragging right", () => {
    expect(
      computePanelWidth({ startX: 1000, startWidth: 380, clientX: 900, minWidth: 320, maxWidth: 560 }),
    ).toBe(480);
    expect(
      computePanelWidth({ startX: 1000, startWidth: 380, clientX: 1060, minWidth: 320, maxWidth: 560 }),
    ).toBe(320);
  });

  it("clamps to the min and max width", () => {
    expect(
      computePanelWidth({ startX: 1000, startWidth: 380, clientX: 400, minWidth: 320, maxWidth: 560 }),
    ).toBe(560);
    expect(
      computePanelWidth({ startX: 1000, startWidth: 380, clientX: 1400, minWidth: 320, maxWidth: 560 }),
    ).toBe(320);
  });
});
