import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, History } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { EmptyState, ErrorState, LoadingBlock, StatusBadge } from "../../components/States";

interface DocumentVersion {
  id: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  isCurrent: boolean;
  malwareScanStatus: string;
  uploaderName: string | null;
}

interface DocumentRow {
  id: string;
  requirementId: string;
  label: string;
  status: string;
  currentVersion: DocumentVersion | null;
  versionCount: number;
  reviewerRemarks: string | null;
}

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dashboard = useQuery({
    queryKey: ["candidate", "dashboard"],
    queryFn: () => request<{ caseId: string }>("/dashboard"),
  });

  const resolvedCaseId = dashboard.data?.caseId ?? null;

  const documents = useQuery({
    queryKey: ["candidate", "documents", resolvedCaseId],
    queryFn: () => request<DocumentRow[]>(`/cases/${resolvedCaseId}/documents`),
    enabled: Boolean(resolvedCaseId),
  });

  const versions = useQuery({
    queryKey: ["candidate", "document-versions", versionsFor],
    queryFn: () => request<DocumentVersion[]>(`/documents/${versionsFor}/versions`),
    enabled: Boolean(versionsFor),
  });

  const upload = useMutation({
    mutationFn: async ({ requirementId, file }: { requirementId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return request<unknown>(
        `/cases/${resolvedCaseId}/documents/${requirementId}/upload`,
        { method: "POST", body: form, raw: true },
      );
    },
    onSuccess: async () => {
      setSelectedFile(null);
      setUploadError(null);
      if (inputRef.current) inputRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
    onError: (error) => {
      setUploadError(
        error instanceof ApiError ? error.message : "The upload could not be completed.",
      );
    },
  });

  if (dashboard.isLoading) return <LoadingBlock label="Loading your documents" />;
  if (dashboard.isError) {
    if (!documents.data) return <LoadingBlock label="Loading documents" />;

  return (
      <ErrorState
        title="We could not load your documents"
        message={dashboard.error instanceof Error ? dashboard.error.message : undefined}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  if (!documents.data) return <LoadingBlock label="Loading documents" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Documents</h1>
        <p className="mt-1 text-sm text-ink-600">
          Upload each required document. If you replace a document, the earlier version is
          kept for verification records.
        </p>
      </header>

      {uploadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {uploadError}
        </div>
      ) : null}

      {documents.isLoading ? (
        <LoadingBlock label="Loading documents" />
      ) : documents.isError ? (
        <ErrorState
          title="We could not load your documents"
          message={documents.error instanceof Error ? documents.error.message : undefined}
          onRetry={() => void documents.refetch()}
        />
      ) : documents.data.length === 0 ? (
        <EmptyState
          title="No documents are required for this package"
          description="Your background verification package does not require any document uploads."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {documents.data.map((document) => (
            <li key={document.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink-900">{document.label}</h2>
                <StatusBadge tone={toneFor(document.status)}>
                  {document.status.replace(/_/g, " ").toLowerCase()}
                </StatusBadge>
              </div>

              {document.currentVersion ? (
                <p className="mt-2 text-sm text-ink-600">
                  {document.currentVersion.originalFilename} ·{" "}
                  {formatBytes(document.currentVersion.sizeBytes)} · v
                  {document.currentVersion.versionNumber}
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-500">Nothing uploaded yet</p>
              )}

              {document.reviewerRemarks ? (
                <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
                  {document.reviewerRemarks}
                </p>
              ) : null}

              <div className="mt-4">
                <label className="label" htmlFor={`file-${document.id}`}>
                  {document.currentVersion ? "Replace this document" : "Upload this document"}
                </label>
                <input
                  id={`file-${document.id}`}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <p className="hint">PDF, JPG or PNG. Maximum 10 MB per file.</p>

                <button
                  type="button"
                  className="btn-primary mt-3"
                  disabled={!selectedFile || upload.isPending}
                  onClick={() =>
                    selectedFile &&
                    upload.mutate({ requirementId: document.requirementId, file: selectedFile })
                  }
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {upload.isPending ? "Uploading…" : "Upload"}
                </button>
              </div>

              {document.versionCount > 0 ? (
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline"
                  onClick={() => setVersionsFor(document.id)}
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                  View {document.versionCount} version(s)
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {versionsFor ? (
        <div
          className="card p-5 sm:p-6"
          role="region"
          aria-label="Document version history"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-900">Version history</h2>
            <button type="button" className="btn-ghost" onClick={() => setVersionsFor(null)}>
              Close
            </button>
          </div>
          {versions.isLoading ? (
            <div className="mt-4">
              <LoadingBlock label="Loading versions" />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-ink-200">
              {(versions.data ?? []).map((version) => (
                <li key={version.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="font-mono text-sm text-ink-700">v{version.versionNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                    {version.originalFilename}
                  </span>
                  <span className="text-xs text-ink-500">
                    {formatBytes(version.sizeBytes)} ·{" "}
                    {new Date(version.uploadedAt).toLocaleString()}
                  </span>
                  {version.isCurrent ? <StatusBadge tone="success">current</StatusBadge> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

    </div>
  );
}

function toneFor(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "ACCEPTED":
      return "success";
    case "MISSING":
    case "REJECTED":
      return "danger";
    case "CLARIFICATION_REQUIRED":
      return "warning";
    case "SUPERSEDED":
      return "neutral";
    default:
      return "info";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
