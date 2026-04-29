import sharp from "sharp";
import { HttpError, unprocessable } from "./errors.js";

export const MAX_OPERATOR_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_OPERATOR_AVATAR_DIMENSION = 512;
const MAX_AVATAR_INPUT_PIXELS = 16_000_000;

const AVATAR_CONTENT_TYPE_BY_SHARP_FORMAT = new Map<string, string>([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

const SHARP_FORMAT_BY_AVATAR_CONTENT_TYPE = new Map<string, string>([
  ["image/jpeg", "jpeg"],
  ["image/jpg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const ALLOWED_OPERATOR_AVATAR_CONTENT_TYPES = new Set(
  SHARP_FORMAT_BY_AVATAR_CONTENT_TYPE.keys(),
);

export type SanitizedImage = {
  body: Buffer;
  contentType: string;
  originalFormat: string;
};

function normalizeImageContentType(value: string) {
  return value.trim().toLowerCase();
}

function assertSupportedAvatarContentType(contentType: string) {
  const normalized = normalizeImageContentType(contentType);
  const expectedFormat = SHARP_FORMAT_BY_AVATAR_CONTENT_TYPE.get(normalized);
  if (!expectedFormat) {
    throw unprocessable(`Unsupported image type: ${normalized || "unknown"}`);
  }
  return {
    contentType: normalized === "image/jpg" ? "image/jpeg" : normalized,
    expectedFormat,
  };
}

export async function sanitizeOperatorAvatarImage(input: {
  body: Buffer;
  contentType: string;
}): Promise<SanitizedImage> {
  if (input.body.length <= 0) {
    throw unprocessable("Image is empty");
  }

  const { expectedFormat } = assertSupportedAvatarContentType(input.contentType);
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input.body, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_AVATAR_INPUT_PIXELS,
    }).metadata();
  } catch {
    throw unprocessable("Image could not be decoded");
  }

  if (!metadata.format || metadata.format !== expectedFormat) {
    const detected = metadata.format
      ? AVATAR_CONTENT_TYPE_BY_SHARP_FORMAT.get(metadata.format) ?? metadata.format
      : "unknown";
    throw unprocessable(`Image content does not match declared type: ${detected}`);
  }

  try {
    const body = await sharp(input.body, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_AVATAR_INPUT_PIXELS,
    })
      .rotate()
      .resize(MAX_OPERATOR_AVATAR_DIMENSION, MAX_OPERATOR_AVATAR_DIMENSION, {
        fit: "cover",
        position: "entropy",
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();

    if (body.length <= 0) {
      throw unprocessable("Image is empty after sanitization");
    }

    return {
      body,
      contentType: "image/png",
      originalFormat: metadata.format,
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw unprocessable("Image could not be sanitized");
  }
}
