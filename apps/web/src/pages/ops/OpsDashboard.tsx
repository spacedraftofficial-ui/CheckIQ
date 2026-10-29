import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, AlertTriangle } from "lucide-react";
import { request, requestPage, toQueryString } from "../../lib/api";
import { toggleCaseDisable, fetchCaseHistory } from "../../lib/api";
import { EmptyState, ErrorState, InlineError, LoadingBlock, StatusBadge } from "../../components/States";

interface CaseListItem {
  id: string;
  caseNumber: string;
  candidateId: string;
  candidateName: string;
  company: string | null;
  department: string | null;
  position: string | null;
  status: string;
  disabledAt: string | null;
  disabled: boolean;
  assignedVerifierName: string | null;
  score: number | null;
  scoreOutcome: string | null;
  documentCompletion: number;
  submittedAt: string | null;
  updatedAt: string;
}

interface QueueCounts {
  total: number;
  byStatus: Record<string, number>;
  awaitingClarification: number;
  belowThreshold: number;
}

const statusTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  BGV_INVITED: "neutral",
  REGISTRATION_PENDING: "neutral",
  DOCUMENT_UPLOAD_IN_PROGRESS: "warning",
  SUBMITTED: "info",
  VERIFICATION_IN_PROGRESS: "info",
  CLARIFICATION_REQUIRED: "warning",
  VERIFICATION_COMPLETED: "info",
  BGV_SCORE_GENERATED: "info",
  BGV_REVIEW_REQUIRED: "warning",
  BELOW_BGV_ELIGIBILITY_THRESHOLD: "danger",
  BGV_APPROVED: "success",
  ELIGIBLE_FOR_FINAL_INTERVIEW: "success",
  CLOSED: "neutral",
};

const queueGroups: { key: string; label: string }[] = [
  { key: "SUBMITTED", label: "Newly submitted" },
  { key: "VERIFICATION_IN_PROGRESS", label: "Verification in progress" },
  { key: "CLARIFICATION_REQUIRED", label: "Clarification required" },
  { key: "VERIFICATION_COMPLETED", label: "Verification completed" },
  { key: "BGV_REVIEW_REQUIRED", label: "Review required" },
  { key: "BELOW_BGV_ELIGIBILITY_THRESHOLD", label: "Below threshold" },
  { key: "BGV_APPROVED", label: "Approved" },
  { key: "CLOSED", label: "Closed" },
];

export function OpsDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [confirmCaseId, setConfirmCaseId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"disable" | "enable">("disable");
  const [view, setView] = useState<"active" | "history">("active");

  const disableCase = useMutation({
    mutationKey: ["disable-case"],
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) =>
      toggleCaseDisable(id, disabled),
    onSuccess: async () => {
      setConfirmCaseId(null);
      await queryClient.invalidateQueries({ queryKey: ["ops", "cases"] });
    },
  });

  const counts = useQuery({
    queryKey: ["ops", "counts"],
    queryFn: () => request<QueueCounts>("/cases/queue-counts"),
  });

  const cases = useQuery({
    queryKey: ["ops", "cases", view, search, status, page],
    queryFn: () =>
      (view === "history"
        ? fetchCaseHistory({ page, pageSize: 25, search, status })
        : requestPage<CaseListItem>(
            `/cases${toQueryString({
              search: search || undefined,
              status: status || undefined,
              page,
              pageSize: 25,
            })}`,
          )) as Promise<{
        data: CaseListItem[];
        meta: { page: number; pageSize: number; total: number; totalPages: number };
      }>,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Background verification cases</h1>
        <p className="mt-1 text-sm text-ink-600">
          Only cases you are permitted to see are listed.
        </p>
      </header>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView("active")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === "active" ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-700 hover:bg-ink-100"}`}
        >
          Active cases
        </button>
        <button
          type="button"
          onClick={() => setView("history")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === "history" ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-700 hover:bg-ink-100"}`}
        >
          Case history (disabled)
        </button>
      </div>

      {view === "active" && (
        <section aria-label="Queue counts" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {counts.isLoading ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <LoadingBlock label="Loading queue counts" />
          </div>
        ) : (
          queueGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => {
                setStatus(group.key);
                setPage(1);
              }}
              className={`card p-4 text-left transition-colors hover:border-brand-300 ${
                status === group.key ? "border-brand-400 ring-1 ring-brand-200" : ""
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                {group.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-ink-900">
                {counts.data?.byStatus[group.key] ?? 0}
              </p>
            </button>
          ))
        )}
      </section>
      )}

      <section className="card p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
          }}
        >
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="search">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <input
                id="search"
                className="input pl-9"
                placeholder="Candidate ID, name or case number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              className="input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {queueGroups.map((group) => (
                <option key={group.key} value={group.key}>
                  {group.label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn-secondary">
            Apply
          </button>
        </form>
      </section>

      {cases.isLoading ? (
        <LoadingBlock label="Loading cases" />
      ) : cases.isError ? (
        <ErrorState
          title="We could not load the case list"
          message={cases.error instanceof Error ? cases.error.message : undefined}
          onRetry={() => void cases.refetch()}
        />
      ) : (cases.data?.data ?? []).length === 0 ? (
        <EmptyState
          title="No cases match these filters"
          description="Try a different status or clear the search."
          action={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch("");
                setStatus("");
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[54rem] text-left text-sm">
              <caption className="sr-only">Background verification cases</caption>
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Case</th>
                  <th scope="col" className="px-4 py-3">Candidate</th>
                  <th scope="col" className="px-4 py-3">Position</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Verifier</th>
                   <th scope="col" className="px-4 py-3">Score (%)</th>
                   <th scope="col" className="px-4 py-3">Documents</th>
                  <th scope="col" className="px-4 py-3">Updated</th>
                  <th scope="col" className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {(cases.data?.data ?? []).map((item: CaseListItem) => (
                  <tr key={item.id} className="hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/ops/cases/${item.id}`}
                        className="font-mono text-xs font-semibold text-brand-700 underline"
                      >
                        {item.caseNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{item.candidateName}</p>
                      <p className="font-mono text-xs text-ink-500">{item.candidateId}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {item.position ?? "—"}
                      {item.company ? (
                        <p className="text-xs text-ink-500">{item.company}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone[item.status] ?? "neutral"}>
                        {item.status.replace(/_/g, " ").toLowerCase()}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {item.assignedVerifierName ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {item.score === null ? "—" : `${item.score.toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.documentCompletion}%</span>
                        <div className="w-12 h-2 bg-ink-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-600 rounded-full transition-all"
                            style={{ width: `${item.documentCompletion}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        disabled={disableCase.isPending}
                        onClick={() => {
                          setConfirmCaseId(item.id);
                          setConfirmAction(item.disabled ? "enable" : "disable");
                        }}
                      >
                        {item.disabled ? "Enable" : "Disable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav
            className="flex items-center justify-between text-sm text-ink-600"
            aria-label="Pagination"
          >
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span>
              Page {(cases.data?.meta.page ?? page)} of {(cases.data?.meta.totalPages ?? 1)} ·{" "}
              {(cases.data?.meta.total ?? 0)} case(s)
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= (cases.data?.meta.totalPages ?? 1)}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
      {confirmCaseId && (
        <ConfirmDialog
          isOpen={true}
          title={confirmAction === "disable" ? "Disable this case?" : "Enable this case?"}
          message={
            confirmAction === "disable"
              ? "This will exclude the case from the active verification queue. It will appear in case history instead."
              : "This will return the case to the active verification queue."
          }
          actionLabel={confirmAction === "disable" ? "Disable case" : "Enable case"}
          actionTone="danger"
          onClose={() => setConfirmCaseId(null)}
          onConfirm={async () => {
            const target = itemById(cases.data?.data, confirmCaseId);
            if (target) {
              await disableCase.mutateAsync({ id: target.id, disabled: confirmAction === "disable" });
            }
          }}
        />
      )}
    </div>
  );
}

function itemById(casesData: CaseListItem[] | undefined, id: string): { id: string; disabled: boolean } | undefined {
  return (casesData ?? []).find((c: CaseListItem) => c.id === id);
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  actionLabel,
  actionTone = "danger",
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "warning" | "primary";
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toneClasses = {
    danger: "btn-danger",
    warning: "btn-secondary",
    primary: "btn-primary",
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "An error occurred.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h3 id="confirm-title" className="text-lg font-semibold text-ink-900">
              {title}
            </h3>
            <p className="mt-1 text-sm text-ink-600">{message}</p>
          </div>
        </div>

        {error && <InlineError message={error} />}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={confirming} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={toneClasses[actionTone]} disabled={confirming} onClick={handleConfirm}>
            {confirming ? "Processing…" : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
