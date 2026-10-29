import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, History, X, FileText, AlertCircle, FileImage, File, Download, Eye } from "lucide-react";
import { ApiError, downloadDocument, request, viewDocument } from "../../lib/api";
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

/* ---------- visual helpers (styling only) ---------- */
function accentFor(status: string, uploaded: boolean) {
  switch (status) {
    case "ACCEPTED":
      return {
        bar: "from-emerald-400 to-teal-500",
        hover: "hover:shadow-emerald-100",
        tile: "from-emerald-400 to-teal-500 shadow-emerald-500/25",
      };
    case "REJECTED":
    case "MISSING":
      return {
        bar: "from-rose-400 to-red-500",
        hover: "hover:shadow-rose-100",
        tile: "from-rose-400 to-red-500 shadow-rose-500/25",
      };
    case "CLARIFICATION_REQUIRED":
      return {
        bar: "from-amber-400 to-orange-500",
        hover: "hover:shadow-orange-100",
        tile: "from-amber-400 to-orange-500 shadow-orange-500/25",
      };
    default:
      return uploaded
        ? {
            bar: "from-blue-600 to-violet-500",
            hover: "hover:shadow-blue-100",
            tile: "from-blue-500 to-violet-500 shadow-blue-500/25",
          }
        : {
            bar: "from-slate-300 to-slate-200",
            hover: "hover:shadow-slate-200",
            tile: "from-slate-300 to-slate-400 shadow-slate-400/25",
          };
  }
}

function FileIconFor({ status, uploaded }: { status: string; uploaded: boolean }) {
  if (uploaded) {
    if (status === "ACCEPTED") return <FileText className="h-5 w-5 text-white" />;
    if (status === "REJECTED") return <FileText className="h-5 w-5 text-white" />;
    if (status === "CLARIFICATION_REQUIRED") return <FileImage className="h-5 w-5 text-white" />;
    return <File className="h-5 w-5 text-white" />;
  }
  return <FileText className="h-5 w-5 text-white" />;
}

function DotToneFor(status: string, uploaded: boolean): string {
  switch (status) {
    case "ACCEPTED":
      return "bg-emerald-500";
    case "REJECTED":
    case "MISSING":
      return "bg-red-500";
    case "CLARIFICATION_REQUIRED":
      return "bg-amber-500";
    default:
      return uploaded ? "bg-blue-500" : "bg-slate-400";
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
    <div className="space-y-6 sm:space-y-8">
      {/* Page header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-violet-50 px-5 py-8 shadow-sm ring-1 ring-blue-100 sm:px-10 sm:py-10">
        <div className="absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-blue-200/50 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 left-1/4 -z-10 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl" aria-hidden="true" />
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 shadow-lg shadow-blue-500/30">
            <FileText className="h-7 w-7 text-white" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Documents</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              Upload each required document. If you replace a document, the earlier version is
              kept for verification records.
            </p>
          </div>
        </div>
      </header>

      {uploadError ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
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
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100">
            <FileText className="h-7 w-7 text-blue-500" aria-hidden="true" />
          </span>
          <EmptyState
            title="No documents are required for this package"
            description="Your background verification package does not require any document uploads."
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {documents.data.map((document) => {
            const uploaded = !!document.currentVersion;
            const currentVersion = document.currentVersion;
            const isUploading = uploadingFor === document.id;
            const dotClass = DotToneFor(document.status, uploaded);
            const accent = accentFor(document.status, uploaded);
            return (
              <li
                key={document.id}
                className={`flex min-w-0 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-xl ${accent.hover}`}
              >
                <div className={`h-1.5 bg-gradient-to-r ${accent.bar}`} aria-hidden="true" />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ${accent.tile}`}>
                        <FileIconFor status={document.status} uploaded={uploaded} />
                      </span>
                      <h2 className="min-w-0 text-sm font-bold text-slate-900">
                        {document.label}
                      </h2>
                    </div>
                    <StatusBadge tone={documentStatusTone[document.status] ?? "neutral"}>
                      {document.status.replace(/_/g, " ").toLowerCase()}
                    </StatusBadge>
                  </div>

                  {document.description ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-500">{document.description}</p>
                  ) : null}

                  {document.currentVersion ? (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {document.currentVersion.originalFilename}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(document.currentVersion.sizeBytes)} · v
                          {document.currentVersion.versionNumber}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          onClick={async () => {
                            try {
                              await viewDocument(document.id, currentVersion!.id);
                            } catch (caught) {
                              setUploadError(
                                caught instanceof ApiError
                                  ? caught.message
                                  : "We could not open this document.",
                              );
                            }
                          }}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          View
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                          onClick={async () => {
                            try {
                              await downloadDocument(document.id, currentVersion!.id);
                            } catch (caught) {
                              setUploadError(
                                caught instanceof ApiError
                                  ? caught.message
                                  : "We could not download this document.",
                              );
                            }
                          }}
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          Download
                        </button>
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                      <p className="text-sm text-slate-500">Not yet uploaded</p>
                    </div>
                  )}

                  {document.reviewerRemarks ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
                      <p className="font-semibold">Reviewer remarks</p>
                      <p className="mt-0.5 text-amber-800">{document.reviewerRemarks}</p>
                    </div>
                  ) : null}

                  <div className="mt-5 space-y-3">
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor={"file-" + document.id}>
                      {document.currentVersion ? "Replace this document" : "Upload this document"}
                    </label>
                    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-4 py-3.5 text-sm font-medium text-slate-700 transition hover:border-violet-400 hover:bg-violet-50/50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-300">
                      <input
                        id={"file-" + document.id}
                        type="file"
                        accept={ACCEPT_TYPES}
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            setSelectedFiles((prev) => ({ ...prev, [document.id]: file }));
                          }
                        }}
                      />
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-blue-100">
                          <Upload className="h-4 w-4 text-blue-600" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 truncate">
                          {selectedFiles[document.id]?.name ??
                            (document.currentVersion ? "Click to replace file" : "Click to choose a file")}
                        </span>
                      </span>
                    </label>
                    <p className="text-xs text-slate-500">{MAX_SIZE_TEXT}</p>

                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
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
                      className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      onClick={() => setVersionsFor(document.id)}
                    >
                      <History className="h-4 w-4" aria-hidden="true" />
                      View {document.versionCount} version(s)
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {versionsFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="versions-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-2xl shadow-blue-900/20 ring-1 ring-slate-200">
            <div className="h-1.5 bg-gradient-to-r from-blue-600 to-violet-500" aria-hidden="true" />
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 id="versions-title" className="text-lg font-bold text-slate-900">
                  Version history
                </h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 transition hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                <ul className="mt-4 space-y-2.5">
                  {(versions.data ?? []).map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200"
                    >
                      <span className="rounded-full bg-gradient-to-r from-blue-600 to-violet-500 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                        v{version.versionNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {version.originalFilename}
                        </span>
                        <span className="text-xs text-slate-500">
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
        </div>
      ) : null}
    </div>
  );
}