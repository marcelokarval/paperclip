import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  MAX_OPERATOR_AVATAR_DIMENSION,
  sanitizeOperatorAvatarImage,
} from "../image-sanitize.js";

describe("sanitizeOperatorAvatarImage", () => {
  it("re-encodes supported raster images to metadata-stripped PNG avatars", async () => {
    const input = await sharp({
      create: {
        width: 900,
        height: 600,
        channels: 3,
        background: "#0f766e",
      },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();

    const sanitized = await sanitizeOperatorAvatarImage({
      body: input,
      contentType: "image/jpeg",
    });

    const metadata = await sharp(sanitized.body).metadata();
    expect(sanitized.contentType).toBe("image/png");
    expect(sanitized.originalFormat).toBe("jpeg");
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(MAX_OPERATOR_AVATAR_DIMENSION);
    expect(metadata.height).toBe(MAX_OPERATOR_AVATAR_DIMENSION);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it("rejects content that does not match the declared image type", async () => {
    const input = await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: "#ffffff",
      },
    }).png().toBuffer();

    await expect(
      sanitizeOperatorAvatarImage({
        body: input,
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow("Image content does not match declared type");
  });

  it("rejects undecodable image payloads", async () => {
    await expect(
      sanitizeOperatorAvatarImage({
        body: Buffer.from("not an image"),
        contentType: "image/png",
      }),
    ).rejects.toThrow("Image could not be decoded");
  });
});
