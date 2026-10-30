import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, History, ShieldCheck, X, CheckCircle } from "lucide-react";
import { ApiError, apiBlob, request } from "../../lib/api";
import { EmptyState, ErrorState, LoadingBlock, StatusBadge } from "../../components/States";

interface CaseDetail {
  id: string;
  caseNumber: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  company: string | null;
  department: string | null;
  position: string | null;
  packageName: string;
  status: string;
  assignedVerifierName: string | null;
  assignedReviewerName: string | null;
  submittedAt: string | null;
  score: number | null;
  scoreOutcome: string | null;
  eligibilityResult: string | null;
  openClarificationCount: number;
  profileCompletion: { completed: number; total: number; percentage: number };
  documentCompletion: { completed: number; total: number; percentage: number };
  submissionReady: boolean;
  version: number;
}

interface HistoryRow {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  createdAt: string;
}

interface CheckRow {
  id: string;
  label: string;
  checkTypeCode: string;
  isMandatory: boolean;
  status: string;
  outcomeCode: string | null;
  verifierName: string | null;
  remarks: string | null;
  evidenceReference: string | null;
  completedAt: string | null;
}

interface DocumentRow {
  id: string;
  label: string;
  status: string;
  versionCount: number;
  currentVersion: {
    id: string;
    originalFilename: string;
    sizeBytes: number;
    uploadedAt: string;
    uploadedBy: string;
    mimeType: string;
    malwareScanStatus: string;
  } | null;
}

interface DocumentVersion {
  id: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string | null;
  isCurrent: boolean;
  malwareScanStatus: string;
}

interface Clarification {
  id: string;
  checkId: string | null;
  documentId: string | null;
  issueSummary: string;
  requiredAction: string;
  remarks: string | null;
  dueDate: string | null;
  status: "OPEN" | "RESPONDED" | "CLOSED" | "CANCELLED";
  requestedById: string;
  requestedByName: string | null;
  requestedAt: string;
  respondedAt: string | null;
  responseText: string | null;
  closedAt: string | null;
  closeReason: string | null;
  isOverdue: boolean;
}

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const queryClient = useQueryClient();
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const viewDocument = async (documentId: string, versionId: string) => {
    setDocError(null);
    try {
      const blob = await apiBlob(`/documents/${documentId}/versions/${versionId}/view`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setDocError(err instanceof ApiError ? err.message : "Failed to open document");
    }
  };

  const downloadDocument = async (documentId: string, versionId: string, filename: string) => {
    setDocError(null);
    try {
      const blob = await apiBlob(`/documents/${documentId}/versions/${versionId}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDocError(err instanceof ApiError ? err.message : "Failed to download document");
    }
  };

  const detail = useQuery({
    queryKey: ["ops", "case", caseId],
    queryFn: () => request<CaseDetail>(`/cases/${caseId}`),
    enabled: Boolean(caseId),
    refetchInterval: 30_000,
  });

  const checks = useQuery({
    queryKey: ["ops", "case", caseId, "checks"],
    queryFn: () => request<CheckRow[]>(`/cases/${caseId}/checks`),
    enabled: Boolean(caseId),
  });

   const documents = useQuery({
    queryKey: ["ops", "case", caseId, "documents"],
    queryFn: () => request<DocumentRow[]>(`/cases/${caseId}/documents`),
    enabled: Boolean(caseId),
  });

  const clarifications = useQuery({
    queryKey: ["ops", "case", caseId, "clarifications"],
    queryFn: () =>
      request<Clarification[]>(`/cases/${caseId}/clarifications`),
    enabled: Boolean(caseId),
  });

  const versions = useQuery({
    queryKey: ["ops", "document-versions", versionsFor],
    queryFn: () => request<DocumentVersion[]>(`/documents/${versionsFor}/versions`),
    enabled: Boolean(versionsFor),
  });

  const history = useQuery({
    queryKey: ["ops", "case", caseId, "history"],
    queryFn: () => request<HistoryRow[]>(`/cases/${caseId}/history`),
    enabled: Boolean(caseId),
  });

  const clarify = useMutation({
    mutationFn: (input: { issueSummary: string; requiredAction: string; checkId?: string }) =>
      request(`/cases/${caseId}/clarifications`, { method: "POST", body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ops", "case", caseId] });
    },
  });

  if (detail.isLoading) return <LoadingBlock label="Loading case" />;
  if (detail.isError) {
    return (
      <ErrorState
        title="We could not load this case"
        message={detail.error instanceof Error ? detail.error.message : undefined}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const data = detail.data;
  if (!data) return <LoadingBlock label="Loading case" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">
            <Link to="/ops" className="font-semibold text-brand-700 underline">
              All cases
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">{data.candidateName}</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="font-mono">{data.caseNumber}</span> ·{" "}
            <span className="font-mono">{data.candidateId}</span> · {data.packageName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={data.status === "BGV_APPROVED" ? "success" : "info"}>
            {data.status.replace(/_/g, " ").toLowerCase()}
          </StatusBadge>
          <Link className="btn-secondary" to={`/ops/cases/${data.id}/report`}>
            <Download className="h-4 w-4" aria-hidden={true} />
            View report
          </Link>
          <Link to={`/ops/cases/${data.id}/verification`} className="btn-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Verification
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Position" value={data.position ?? "—"} />
        <Detail label="Company" value={data.company ?? "—"} />
        <Detail label="Department" value={data.department ?? "—"} />
        <Detail
          label="Score"
          value={data.score === null ? "Not scored" : `${data.score.toFixed(2)}%`}
        />
        <Detail label="Verifier" value={data.assignedVerifierName ?? "Unassigned"} />
        <Detail label="Reviewer" value={data.assignedReviewerName ?? "Unassigned"} />
        <Detail
          label="Submitted"
          value={data.submittedAt ? new Date(data.submittedAt).toLocaleDateString() : "Not submitted"}
        />
        <Detail label="Eligibility" value={data.eligibilityResult ?? "Pending"} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink-900">Profile completion</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${data.profileCompletion.percentage}%` }}
              />
            </div>
            <span className="text-sm font-medium text-ink-900">
              {data.profileCompletion.completed}/{data.profileCompletion.total} ({data.profileCompletion.percentage}%)
            </span>
          </div>
        </div>
        <div className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink-900">Document completion</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${Math.round(data.documentCompletion.percentage)}%` }}
              />
            </div>
              <span className="text-sm font-medium text-ink-900">
                {data.documentCompletion.completed}/{data.documentCompletion.total} ({Math.round(data.documentCompletion.percentage)}%)
              </span>
          </div>
        </div>
      </section>

      {data.submissionReady ? null : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <div className="mt-0.5">
              <CheckCircle className="h-4 w-4 text-amber-600" aria-hidden={true} />
            </div>
            <div>
              <p className="font-semibold">Submission blocked</p>
              <p>
                The candidate has not completed all required profile fields
                ({data.profileCompletion.total - data.profileCompletion.completed} missing)
                and/or documents ({data.documentCompletion.total - data.documentCompletion.completed} missing).
              </p>
            </div>
          </div>
        </div>
      )}

      {data.openClarificationCount > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">{data.openClarificationCount} open clarification(s) pending candidate response</p>
        </div>
      ) : null}

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Verification checks</h2>
        {checks.isLoading ? (
          <div className="mt-4">
            <LoadingBlock label="Loading checks" />
          </div>
        ) : (checks.data ?? []).length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No checks have been created for this case" />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-200">
            {(checks.data ?? []).map((check) => (
              <li key={check.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {check.label}
                    {check.isMandatory ? (
                      <span className="ml-2 text-xs font-normal text-ink-500">Required</span>
                    ) : null}
                  </p>
                  {check.remarks ? (
                    <p className="mt-0.5 text-sm text-ink-600">{check.remarks}</p>
                  ) : null}
                  {check.evidenceReference ? (
                    <p className="mt-0.5 text-xs text-ink-500">
                      Reference: {check.evidenceReference}
                    </p>
                  ) : null}
                  {check.verifierName ? (
                    <p className="mt-0.5 text-xs text-ink-500">Verified by {check.verifierName}</p>
                  ) : null}
                </div>
                <StatusBadge
                  tone={
                    check.status === "VERIFIED"
                      ? "success"
                      : check.status === "DISCREPANCY_FOUND" || check.status === "REJECTED"
                        ? "danger"
                        : check.status === "CLARIFICATION_REQUIRED"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {check.status.replace(/_/g, " ").toLowerCase()}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-900">Documents</h2>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => documents.refetch()}
              disabled={documents.isFetching}
            >
              Refresh
            </button>
          </div>
          {docError ? (
            <p className="mt-4 text-sm text-red-600">{docError}</p>
          ) : null}
        {documents.isLoading ? (
          <div className="mt-4">
            <LoadingBlock label="Loading documents" />
          </div>
        ) : (documents.data ?? []).length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No documents uploaded yet" />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-200">
            {(documents.data ?? []).map((document) => (
              <li key={document.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{document.label}</p>
                  {document.currentVersion ? (
                    <>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {document.currentVersion.originalFilename} · v{document.versionCount} ·{" "}
                        {formatBytes(document.currentVersion.sizeBytes)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        Uploaded {new Date(document.currentVersion.uploadedAt).toLocaleString()}
                        {document.currentVersion.malwareScanStatus === "CLEAN" ? (
                          <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                            Scan OK
                          </span>
                        ) : document.currentVersion.malwareScanStatus === "INFECTED" ? (
                          <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                            Malware detected
                          </span>
                        ) : null}
                      </p>
                    </>
                  ) : (
                    <p className="mt-0.5 text-xs text-ink-500">Not uploaded</p>
                  )}
                </div>
                <StatusBadge tone={document.status === "ACCEPTED" ? "success" : "info"}>
                  {document.status.replace(/_/g, " ").toLowerCase()}
                </StatusBadge>
                {document.currentVersion ? (
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => setVersionsFor(document.id)}
                  >
                    <History className="h-4 w-4" aria-hidden={true} />
                    {document.versionCount} version(s)
                  </button>
                ) : null}
                {document.currentVersion ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => viewDocument(document.id, document.currentVersion!.id)}
                    >
                      <Eye className="h-4 w-4" aria-hidden={true} />
                      View
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() =>
                        downloadDocument(document.id, document.currentVersion!.id, document.currentVersion!.originalFilename)
                      }
                    >
                      <Download className="h-4 w-4" aria-hidden={true} />
                      Download
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {versionsFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Document version history"
        >
          <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink-900">Document version history</h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setVersionsFor(null)}
              >
                <X className="h-4 w-4" aria-hidden={true} />
              </button>
            </div>
            {versions.isLoading ? (
              <div className="mt-4">
                <LoadingBlock label="Loading versions" />
              </div>
            ) : (versions.data ?? []).length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">No versions available.</p>
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
                      {new Date(version.uploadedAt).toLocaleDateString()}
                    </span>
                    {version.malwareScanStatus === "CLEAN" ? (
                      <span className="text-xs font-medium text-emerald-700">Scan OK</span>
                    ) : version.malwareScanStatus === "INFECTED" ? (
                      <span className="text-xs font-medium text-red-700">Malware</span>
                    ) : null}
                    {version.isCurrent && (
                      <span className="text-xs font-medium text-brand-700">Current</span>
                    )}
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => viewDocument(versionsFor, version.id)}
                    >
                      <Eye className="h-4 w-4" aria-hidden={true} />
                      View
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() =>
                        downloadDocument(versionsFor, version.id, version.originalFilename)
                      }
                    >
                      <Download className="h-4 w-4" aria-hidden={true} />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {clarifications.data && clarifications.data.length > 0 ? (
        <section className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink-900">Clarification thread</h2>
          <p className="mt-1 text-sm text-ink-600">
            History of clarification requests and candidate responses for this case.
          </p>
          <div className="mt-4 space-y-4">
            {clarifications.data.map((clarification) => (
              <div key={clarification.id} className="border-l-2 border-ink-200 pl-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      {clarification.requestedByName ?? "System"} asked:
                    </p>
                    <p className="mt-0.5 text-sm text-ink-700">{clarification.issueSummary}</p>
                    {clarification.requiredAction ? (
                      <p className="mt-1 text-sm text-ink-600">
                        <span className="font-medium">Action required:</span> {clarification.requiredAction}
                      </p>
                    ) : null}
                    {clarification.remarks ? (
                      <p className="mt-1 text-sm text-ink-600">{clarification.remarks}</p>
                    ) : null}
                    {clarification.dueDate ? (
                      <p className="mt-1 text-xs text-ink-500">
                        Due: {new Date(clarification.dueDate).toLocaleDateString()}
                        {clarification.isOverdue ? " (overdue)" : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs text-ink-500">
                    {new Date(clarification.requestedAt).toLocaleString()}
                  </span>
                </div>

                {clarification.responseText ? (
                  <div className="rounded-lg bg-ink-50 p-3">
                    <p className="text-sm font-semibold text-ink-900">Candidate responded:</p>
                    <p className="mt-1 text-sm text-ink-800">{clarification.responseText}</p>
                    {clarification.respondedAt ? (
                      <p className="mt-1 text-xs text-ink-500">
                        Responded {new Date(clarification.respondedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-ink-500 italic">Awaiting candidate response</p>
                )}

                {clarification.closedAt ? (
                  <div className="mt-2 text-xs text-ink-500">
                    Closed: {clarification.closeReason ?? ""} (
                    {new Date(clarification.closedAt).toLocaleString()})
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Request clarification</h2>
        <p className="mt-1 text-sm text-ink-500">
          Ask the candidate for a specific item. The request is recorded against the case and
          the candidate is notified.
        </p>
        <ClarificationForm
          onSubmit={(input) => clarify.mutate(input)}
          pending={clarify.isPending}
          error={
            clarify.error instanceof ApiError
              ? clarify.error.message
              : clarify.isError
                ? "The clarification request could not be created."
                : null
          }
        />
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Case history</h2>
        {history.isLoading ? (
          <div className="mt-4">
            <LoadingBlock label="Loading history" />
          </div>
        ) : (
          <ol className="mt-4 space-y-3 border-l border-ink-200 pl-4">
            {(history.data ?? []).map((entry) => (
              <li key={entry.id}>
                <p className="text-sm font-medium text-ink-900">
                  {entry.fromStatus ? `${entry.fromStatus} → ` : ""}
                  {entry.toStatus.replace(/_/g, " ").toLowerCase()}
                </p>
                <p className="text-xs text-ink-500">
                  {entry.actorName ?? "System"}
                  {entry.actorRole ? ` (${entry.actorRole})` : ""} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
                {entry.reason ? <p className="mt-0.5 text-sm text-ink-600">{entry.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function ClarificationForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (input: { issueSummary: string; requiredAction: string }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [issueSummary, setIssueSummary] = useState("");
  const [requiredAction, setRequiredAction] = useState("");

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ issueSummary, requiredAction });
        setIssueSummary("");
        setRequiredAction("");
      }}
    >
      <div>
        <label className="label" htmlFor="issueSummary">
          Issue
        </label>
        <input
          id="issueSummary"
          className="input"
          placeholder="Address proof is not legible"
          value={issueSummary}
          onChange={(event) => setIssueSummary(event.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="requiredAction">
          Required action
        </label>
        <textarea
          id="requiredAction"
          className="input min-h-20"
          placeholder="Upload a clearer scan of the utility bill showing the address and the last three months."
          value={requiredAction}
          onChange={(event) => setRequiredAction(event.target.value)}
          required
        />
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Request clarification"}
      </button>
    </form>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
