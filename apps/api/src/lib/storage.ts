import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../config.js";
import { uploadRejected } from "./errors.js";

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

/**
 * Repository root, derived from this module's location.
 * Source: apps/api/src/lib/storage.ts — compiled: apps/api/dist/lib/storage.js.
 * Either way the repository root is four levels up.
 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * The hosting account's home directory, used as a persistent location that a
 * git redeploy does not replace.
 *
 * Hostinger does not always set HOME for the Node.js process, so the account
 * home is also derived from HOSTINGER_SOURCE_DIR:
 *   /home/u123456789/domains/example.com/public_html  ->  /home/u123456789
 */
function persistentHome(): string | undefined {
  // HOME first: files uploaded by earlier releases live under $HOME/.checkiq.
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) return home;
  const sourceDir = process.env.HOSTINGER_SOURCE_DIR;
  if (sourceDir) {
    const parts = sourceDir.split("/").filter(Boolean);
    const homeIdx = parts.indexOf("home");
    if (homeIdx >= 0 && parts[homeIdx + 1]) {
      return "/" + parts.slice(0, homeIdx + 2).join("/");
    }
  }
  return undefined;
}

let resolvedRoot: string | undefined;

/**
 * Resolves the storage root directory.
 *
 * Uploaded files are NOT in git, and Hostinger replaces the project directory
 * on every git deploy, so in production the storage root must live outside the
 * project directory or every upload is lost on the next push.
 *
 * - An absolute STORAGE_DIR is always used as-is (recommended in production).
 * - In development and test, a relative STORAGE_DIR resolves against the
 *   working directory, as you would expect locally.
 * - In production (or on Hostinger), a relative STORAGE_DIR is relocated to
 *   `<account home>/.checkiq/storage`.
 *
 * In production the server refuses to use a storage root inside the project
 * directory — see `assertStorageIsPersistent`.
 */
export function storageRoot(): string {
  if (resolvedRoot) return resolvedRoot;
  const config = getConfig();
  const configured = config.STORAGE_DIR;

  if (isAbsolute(configured)) {
    resolvedRoot = configured;
  } else if (config.NODE_ENV === "production" || process.env.HOSTINGER_SOURCE_DIR) {
    const home = persistentHome();
    resolvedRoot = home
      ? join(home, ".checkiq", "storage")
      : resolve(process.cwd(), configured);
  } else {
    resolvedRoot = resolve(process.cwd(), configured);
  }
  return resolvedRoot;
}

/** Directories a redeploy replaces. Storage must not live in any of them. */
function redeployedDirectories(): string[] {
  const dirs = [PROJECT_ROOT, process.cwd()];
  if (process.env.HOSTINGER_SOURCE_DIR) dirs.push(process.env.HOSTINGER_SOURCE_DIR);
  return dirs;
}

/**
 * Fails fast in production when uploaded files would be written somewhere a
 * redeploy wipes. Losing documents silently is worse than a failed start with
 * a clear message.
 */
export function assertStorageIsPersistent(): void {
  if (getConfig().NODE_ENV !== "production") return;
  const root = storageRoot();
  const offending = redeployedDirectories().find((dir) => isInside(dir, root));
  if (offending) {
    throw new Error(
      `Document storage (${root}) is inside the deployed project directory (${offending}) ` +
        "and would be wiped on the next deploy. Set STORAGE_DIR to an absolute path " +
        "outside the project, e.g. /home/<account>/checkiq-storage.",
    );
  }
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
  assertStorageIsPersistent();
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  await mkdir(tempRoot(), { recursive: true });
}

export function temporaryDirectory(): string {
  return tempRoot();
}
