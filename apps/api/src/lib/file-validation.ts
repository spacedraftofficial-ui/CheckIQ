import { fileTypeFromFile } from "file-type";
import { extname } from "node:path";
import { getConfig } from "../config.js";
import { uploadRejected } from "./errors.js";

/**
 * Upload validation.
 *
 * The browser-supplied filename and content type are treated as untrusted
 * hints only. Acceptance is decided from the file's actual content signature,
 * the file's real size and the extension — all checked server-side.
 */

export interface UploadValidationRules {
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
}

export interface ValidatedUpload {
  mimeType: string;
  sizeBytes: number;
}

/** Reads the effective upload rules from configuration, with safe defaults. */
export async function loadUploadRules(): Promise<UploadValidationRules> {
  const config = getConfig();
  return {
    maxFileSizeBytes: config.UPLOAD_MAX_FILE_BYTES,
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    allowedExtensions: [".pdf", ".jpg", ".jpeg", ".png"],
  };
}

/**
 * Validates a temporary upload.
 *
 * Rejects empty files, unsupported extensions, size-limit violations, files
 * whose real content type is not allowed, and files whose content does not
 * match their extension.
 */
export async function validateUpload(
  tempPath: string,
  originalFilename: string,
  declaredMimeType: string,
  sizeBytes: number,
  rules: UploadValidationRules,
): Promise<ValidatedUpload> {
  if (sizeBytes <= 0) {
    throw uploadRejected("The uploaded file is empty");
  }
  if (sizeBytes > rules.maxFileSizeBytes) {
    throw uploadRejected(
      `The file exceeds the maximum allowed size of ${Math.floor(rules.maxFileSizeBytes / (1024 * 1024))} MB`,
    );
  }

  const extension = extname(originalFilename).toLowerCase();
  if (!rules.allowedExtensions.includes(extension)) {
    throw uploadRejected(
      `Unsupported file type "${extension || "unknown"}". Allowed formats: ${rules.allowedExtensions.join(", ")}`,
    );
  }

  // The declared content type is never trusted on its own.
  const detected = await fileTypeFromFile(tempPath);
  if (!detected) {
    throw uploadRejected("The file could not be identified. Upload a PDF, JPG or PNG file.");
  }
  if (!rules.allowedMimeTypes.includes(detected.mime)) {
    throw uploadRejected(
      `The file content is ${detected.mime}, which is not accepted. Allowed formats: PDF, JPG, PNG.`,
    );
  }

  const extensionMatchesContent =
    (extension === ".pdf" && detected.mime === "application/pdf") ||
    (extension === ".jpg" || extension === ".jpeg"
      ? detected.mime === "image/jpeg"
      : detected.mime === "image/png");
  if (!extensionMatchesContent) {
    throw uploadRejected(
      "The file extension does not match its actual content. Rename the file or upload the correct document.",
    );
  }

  if (
    declaredMimeType &&
    declaredMimeType !== "application/octet-stream" &&
    declaredMimeType !== detected.mime
  ) {
    // Not fatal on its own — the content signature is authoritative — but it is
    // worth recording that the two disagreed.
    return { mimeType: detected.mime, sizeBytes };
  }

  return { mimeType: detected.mime, sizeBytes };
}
