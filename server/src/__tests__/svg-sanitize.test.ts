import { describe, expect, it } from "vitest";
import { sanitizeSvgBuffer } from "../svg-sanitize.js";

describe("sanitizeSvgBuffer", () => {
  it("removes script tags and inline event handlers", () => {
    const dirty = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10" onclick="alert(2)"/></svg>',
      "utf8",
    );

    const sanitized = sanitizeSvgBuffer(dirty);

    expect(sanitized).not.toBeNull();
    const output = sanitized!.toString("utf8");
    expect(output).not.toContain("<script");
    expect(output).not.toContain("onclick=");
    expect(output).toContain("<rect");
  });

  it("returns null for non-svg input", () => {
    expect(sanitizeSvgBuffer(Buffer.from("<html></html>", "utf8"))).toBeNull();
  });
});
