import { describe, expect, it } from "vitest";
import { boundingBox, findFreeSlot, type PlacementRect } from "@/lib/node-placement";

function overlaps(a: PlacementRect, b: PlacementRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("findFreeSlot", () => {
  it("places the new node to the right when there is room", () => {
    const slot = findFreeSlot({ x: 100, y: 100, width: 200, height: 120 }, 180, 100, [], { gap: 20 });
    expect(slot).toEqual({ x: 320, y: 110 });
  });

  it("moves down when the preferred side is blocked", () => {
    const blocker: PlacementRect = { x: 320, y: 80, width: 200, height: 160 };
    const slot = findFreeSlot({ x: 100, y: 100, width: 200, height: 120 }, 180, 100, [blocker], { gap: 20 });
    expect(overlaps({ ...slot, width: 180, height: 100 }, blocker)).toBe(false);
    expect(slot.y).toBeGreaterThan(blocker.y);
  });

  it("never overlaps any obstacle", () => {
    const obstacles: PlacementRect[] = [
      { x: 320, y: 80, width: 200, height: 160 },
      { x: 320, y: 260, width: 200, height: 160 },
      { x: 540, y: 80, width: 200, height: 340 },
    ];
    const slot = findFreeSlot({ x: 100, y: 100, width: 200, height: 120 }, 180, 100, obstacles, { gap: 20 });
    const placed = { ...slot, width: 180, height: 100 };
    expect(obstacles.some((obstacle) => overlaps(placed, obstacle))).toBe(false);
  });
});

describe("boundingBox", () => {
  it("returns the union of selected nodes", () => {
    const box = boundingBox([
      { x: 10, y: 20, width: 100, height: 50 },
      { x: 200, y: 80, width: 80, height: 60 },
    ]);
    expect(box).toEqual({ x: 10, y: 20, width: 270, height: 120 });
  });

  it("returns null for an empty selection", () => {
    expect(boundingBox([])).toBeNull();
  });
});
