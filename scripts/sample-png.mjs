/**
 * A minimal 1x1 PNG used by the smoke test to exercise the upload path.
 * Base64 of a valid PNG signature header plus an empty IDAT is not enough for
 * `file-type`, so a real (tiny) PNG is embedded here.
 */
export const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
