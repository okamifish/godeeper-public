import { describe, expect, it } from "vitest";
import { fitImageSize, isImageFile } from "@/lib/image-import";

function fakeFile(name: string, type: string) {
  return new File(["x"], name, { type });
}

describe("fitImageSize", () => {
  it("scales landscape images by the longest edge", () => {
    expect(fitImageSize(2000, 1200, 1280)).toEqual({ width: 1280, height: 768 });
  });

  it("scales portrait images by the longest edge", () => {
    expect(fitImageSize(1200, 2000, 1280)).toEqual({ width: 768, height: 1280 });
  });

  it("does not upscale small images", () => {
    expect(fitImageSize(320, 240, 1280)).toEqual({ width: 320, height: 240 });
  });

  it("returns zero for invalid dimensions", () => {
    expect(fitImageSize(0, 0, 1280)).toEqual({ width: 0, height: 0 });
  });
});

describe("isImageFile", () => {
  it("recognizes image mime types and extensions", () => {
    expect(isImageFile(fakeFile("photo", "image/png"))).toBe(true);
    expect(isImageFile(fakeFile("photo.jpg", ""))).toBe(true);
    expect(isImageFile(fakeFile("notes.md", "text/markdown"))).toBe(false);
    expect(isImageFile(fakeFile("archive.zip", "application/zip"))).toBe(false);
  });
});
