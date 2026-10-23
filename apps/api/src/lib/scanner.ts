/**
 * Malware scanning integration point.
 *
 * The MVP ships a no-op scanner so the workflow is exercisable, but every
 * upload is recorded with a scan status so the organisation can see exactly
 * which files were scanned by a real scanner and which were not.
 *
 * Replacing this with ClamAV (or a hosted scanning service) is a single-file
 * change: implement `ScannerPort` and register it in `createScanner`.
 */

export type MalwareScanStatus = "PENDING" | "CLEAN" | "INFECTED" | "SKIPPED" | "ERROR";

export interface ScanResult {
  status: MalwareScanStatus;
  detail?: string;
}

export interface ScannerPort {
  readonly name: string;
  scan(filePath: string): Promise<ScanResult>;
}

/**
 * Default scanner. It does not scan and reports `SKIPPED` so that the
 * distinction between "not scanned" and "scanned and clean" is visible in the
 * data model and in the UI.
 */
export class NoopScanner implements ScannerPort {
  readonly name = "noop";

  async scan(): Promise<ScanResult> {
    return { status: "SKIPPED", detail: "No malware scanner is configured for this deployment." };
  }
}

/**
 * ClamAV scanner placeholder.
 *
 * Implement against a clamd TCP service (INSTREAM protocol) and register it in
 * `createScanner` once the deployment has a scanner available.
 */
export class ClamAvScanner implements ScannerPort {
  readonly name = "clamav";

  constructor(
    private readonly options: { host: string; port: number; timeoutMs?: number },
  ) {}

  async scan(filePath: string): Promise<ScanResult> {
    // Intentionally not implemented: a half-working scanner is worse than an
    // explicit "not configured" state. See docs/07-security-design.md.
    void filePath;
    void this.options;
    return {
      status: "ERROR",
      detail: "ClamAV integration is not implemented in this build.",
    };
  }
}

export function createScanner(): ScannerPort {
  return new NoopScanner();
}
