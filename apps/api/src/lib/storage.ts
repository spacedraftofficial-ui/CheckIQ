import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { getConfig } from "../config.js";
import { uploadRejected } from "./errors.js";
import { getLogger } from "./logger.js";

/**
 * Private document storage.
 *
 * Documents are never written to a publicly served directory. Each file is
 * stored under an opaque key derived from a UUID, so a storage key cannot be
 * guessed or derived from the original filename. Access is always through an
 * authenticated, authorised API route.
 *
 * Uploads are written to a temporary file and then atomically renamed into
 * place, so an interrupted upload never leaves a half-written "valid" file
 * behind.
 */

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export interface StoredObject {
  storageKey: string;
  sizeBytes: number;
  checksumSha256: string;
  mimeType: string;
}

const logger = getLogger();

/**
 * Resolves the storage root directory.
 *
 * On Hostinger (or any platform that wipes the project directory on redeploy),
 * a relative STORAGE_DIR like `./storage` is lost on every deploy. When we
 * detect the Hostinger deploy marker and a relative STORAGE_DIR, we
 * transparently relocate storage to a sibling directory of HOME
 * (`~/checkiq-storage`) so uploaded files survive redeployments without any
 * manual environment configuration.
 */
export function storageRoot(): string {
  const configured = getConfig().STORAGE_DIR;
  const resolved = resolve(process.cwd(), configured);

  if (process.env.HOSTINGER_SOURCE_DIR && process.env.HOME) {
    const persistentRoot = resolve(process.env.HOME, "checkiq-storage");
    if (isAbsolute(configured)) return resolved;
    if (persistentRoot !== resolved) {
      logger.info(
        { configured, persistent: persistentRoot },
        "Relocating document storage to persistent path (relative STORAGE_DIR on Hostinger)",
      );
      return persistentRoot;
    }
  }
  return resolved;
}

function tempRoot(): string {
  return join(storageRoot(), ".tmp");
}

/**
 * Moves an already-validated temporary file into permanent storage.
 * `tempPath` is removed on failure so interrupted uploads leave no residue.
 */
export async function storeUploadedFile(
  tempPath: string,
  mimeType: string,
): Promise<StoredObject> {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) {
    await rm(tempPath, { force: true });
    throw uploadRejected("Unsupported file type");
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${year}/${month}/${crypto.randomUUID()}${extension}`;
  const destination = join(storageRoot(), key);

  await mkdir(dirname(destination), { recursive: true });
  try {
    await rename(tempPath, destination);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  const { sizeBytes, checksumSha256 } = await describeFile(destination);
  return { storageKey: key, sizeBytes, checksumSha256, mimeType };
}

/** Reads the size and SHA-256 checksum of a stored file. */
export async function describeFile(filePath: string): Promise<{
  sizeBytes: number;
  checksumSha256: string;
}> {
  const hash = createHash("sha256");
  let sizeBytes = 0;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
      sizeBytes += chunk.length;
    });
    stream.on("error", rejectPromise);
    stream.on("end", () => resolvePromise());
  });

  return { sizeBytes, checksumSha256: hash.digest("hex") };
}

/** Resolves a storage key to an absolute path, refusing anything that escapes the root. */
export function resolveStoragePath(storageKey: string): string {
  const root = storageRoot();
  const target = resolve(root, storageKey);
  // `relative` handles the platform separator, so the comparison works on
  // both Windows and POSIX.
  const relativePath = relative(root, target);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw uploadRejected("Invalid storage reference");
  }
  return target;
}

/** Creates the storage directories at boot. */
export async function ensureStorageDirectories(): Promise<void> {
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  await mkdir(tempRoot(), { recursive: true });
}

export function temporaryDirectory(): string {
  return tempRoot();
}
