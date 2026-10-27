import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, History, X, FileText, AlertCircle, FileImage, File } from "lucide-react";
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
}

interface DocumentRow {
  id: string;
  requirementId: string;
  label: string;
  description: string | null;
  status: string;
  currentVersion: DocumentVersion | null;
  versionCount: number;
  reviewerRemarks: string | null;
}

const documentStatusTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  MISSING: "danger",
  UPLOADED: "info",
  UNDER_REVIEW: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  CLARIFICATION_REQUIRED: "warning",
  SUPERSEDED: "neutral",
};

const ACCEPT_TYPES = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE_TEXT = "Maximum 10 MB per file";

function FileIconFor({ status, uploaded }: { status: string; uploaded: boolean }) {
  if (uploaded) {
    if (status === "ACCEPTED") return <FileText className="h-5 w-5 text-emerald-600" />;
    if (status === "REJECTED") return <FileText className="h-5 w-5 text-red-600" />;
    if (status === "CLARIFICATION_REQUIRED") return <FileImage className="h-5 w-5 text-amber-600" />;
    return <File className="h-5 w-5 text-brand-600" />;
  }
  return <FileText className="h-5 w-5 text-ink-400" />;
}

function DotToneFor(status: string, uploaded: boolean): string {
  switch (status) {
    case "ACCEPTED":
      return "status-dot-complete";
    case "REJECTED":
    case "MISSING":
      return "status-dot-problem";
    case "CLARIFICATION_REQUIRED":
      return "status-dot-pending";
    default:
      return uploaded ? "status-dot-in-progress" : "status-dot-pending";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);

  const dashboard = useQuery({
    queryKey: ["candidate", "dashboard"],
    queryFn: () => request<{ caseId: string }>("/dashboard"),
  });

  const resolvedCaseId = dashboard.data?.caseId ?? null;

  const documents = useQuery({
    queryKey: ["candidate", "documents", resolvedCaseId],
    queryFn: () => request<DocumentRow[]>("/cases/" + resolvedCaseId + "/documents"),
    enabled: Boolean(resolvedCaseId),
  });

  const versions = useQuery({
    queryKey: ["candidate", "document-versions", versionsFor],
    queryFn: () => request<DocumentVersion[]>("/documents/" + versionsFor + "/versions"),
    enabled: Boolean(versionsFor),
  });

  const upload = useMutation({
    mutationFn: async ({ requirementId, file }: { requirementId: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return request<unknown>("/cases/" + resolvedCaseId + "/documents/" + requirementId + "/upload", {
        method: "POST",
        body: form,
        raw: true,
      });
    },
    onSuccess: async () => {
      setSelectedFiles({});
      setUploadError(null);
      setUploadingFor(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
    onError: (error) => {
      setUploadError(
        error instanceof ApiError ? error.message : "The upload could not be completed.",
      );
      setUploadingFor(null);
    },
  });

  const handleUpload = (document: DocumentRow) => {
    const file = selectedFiles[document.id];
    if (!file) return;
    setUploadingFor(document.id);
    void upload.mutate({ requirementId: document.requirementId, file });
  };

  if (dashboard.isLoading) return <LoadingBlock label="Loading your documents" />;
  if (dashboard.isError) {
    return (
      <ErrorState
        title="We could not load your verification"
        message={dashboard.error instanceof Error ? dashboard.error.message : undefined}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  if (!documents.data) return <LoadingBlock label="Loading documents" />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Documents</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Upload each required document. If you replace a document, the earlier version is
          kept for verification records.
        </p>
      </header>

      {uploadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{uploadError}</span>
          </div>
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
        <div className="card p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-ink-300" aria-hidden="true" />
          <EmptyState
            title="No documents are required for this package"
            description="Your background verification package does not require any document uploads."
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {documents.data.map((document) => {
            const uploaded = !!document.currentVersion;
            const isUploading = uploadingFor === document.id;
            const dotClass = DotToneFor(document.status, uploaded);
            return (
              <li key={document.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileIconFor status={document.status} uploaded={uploaded} />
                    <h2 className="text-sm font-semibold text-ink-900">
                      {document.label}
                    </h2>
                  </div>
                  <StatusBadge tone={documentStatusTone[document.status] ?? "neutral"}>
                    {document.status.replace(/_/g, " ").toLowerCase()}
                  </StatusBadge>
                </div>

                {document.description ? (
                  <p className="mt-1.5 text-sm text-ink-500">{document.description}</p>
                ) : null}

                {document.currentVersion ? (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-600 truncate">
                        {document.currentVersion.originalFilename}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatBytes(document.currentVersion.sizeBytes)} · v
                        {document.currentVersion.versionNumber}
                      </p>
                    </div>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full status-dot-pending" aria-hidden="true" />
                    <p className="text-sm text-ink-500">Not yet uploaded</p>
                  </div>
                )}

                {document.reviewerRemarks ? (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-semibold">Reviewer remarks</p>
                    <p className="mt-0.5 text-amber-800">{document.reviewerRemarks}</p>
                  </div>
                ) : null}

                <div className="mt-4 space-y-3">
                  <label className="label" htmlFor={"file-" + document.id}>
                    {document.currentVersion ? "Replace this document" : "Upload this document"}
                  </label>
                  <input
                    id={"file-" + document.id}
                    type="file"
                    accept={ACCEPT_TYPES}
                    className="block w-full cursor-pointer text-sm text-ink-700 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setSelectedFiles((prev) => ({ ...prev, [document.id]: file }));
                      }
                    }}
                  />
                  <p className="hint">{MAX_SIZE_TEXT}</p>

                  <button
                    type="button"
                    className="btn-primary btn-sm w-full"
                    disabled={isUploading || !selectedFiles[document.id]}
                    onClick={() => handleUpload(document)}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {isUploading ? "Uploading…" : document.currentVersion ? "Replace" : "Upload"}
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
            );
          })}
        </ul>
      )}

      {versionsFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="versions-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="versions-title" className="text-base font-semibold text-ink-900">
                Version history
              </h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setVersionsFor(null)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
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
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm text-ink-800 truncate">
                        {version.originalFilename}
                      </span>
                      <span className="text-xs text-ink-500">
                        {formatBytes(version.sizeBytes)} ·{" "}
                        {new Date(version.uploadedAt).toLocaleString()}
                      </span>
                    </div>
                    {version.isCurrent ? (
                      <StatusBadge tone="success">current</StatusBadge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
