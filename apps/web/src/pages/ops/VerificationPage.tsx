import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Download, Gavel, XCircle } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { ErrorState, InlineError, LoadingBlock, StatusBadge } from "../../components/States";

interface CheckRow {
  id: string;
  label: string;
  checkTypeCode: string;
  isMandatory: boolean;
  status: string;
  remarks: string | null;
  evidenceReference: string | null;
  verifierName: string | null;
  completedAt: string | null;
}

interface ScoreRecord {
  id: string;
  totalScore: number;
  threshold: number;
  outcome: string;
  isProvisional: boolean;
  scoringConfigVersion: number;
  generatedAt: string;
  components: { label: string; weight: number; ratio: number }[];
}

const outcomes = [
  { value: "VERIFIED", label: "Verified" },
  { value: "PARTIALLY_VERIFIED", label: "Partially verified" },
  { value: "UNABLE_TO_VERIFY", label: "Unable to verify" },
  { value: "DISCREPANCY_FOUND", label: "Discrepancy found" },
  { value: "REJECTED", label: "Rejected" },
];

export function VerificationPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const queryClient = useQueryClient();

  const checks = useQuery({
    queryKey: ["ops", "case", caseId, "checks"],
    queryFn: () => request<CheckRow[]>(`/cases/${caseId}/checks`),
    enabled: Boolean(caseId),
  });

  const score = useQuery({
    queryKey: ["ops", "case", caseId, "score"],
    queryFn: () => request<ScoreRecord>(`/cases/${caseId}/score`),
    enabled: Boolean(caseId),
    retry: false,
  });

  const record = useMutation({
    mutationFn: (input: { checkId: string; status: string; remarks?: string; evidenceReference?: string }) =>
      request(`/cases/${caseId}/checks/${input.checkId}/result`, {
        method: "POST",
        body: {
          status: input.status,
          remarks: input.remarks ?? null,
          evidenceReference: input.evidenceReference ?? null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ops", "case", caseId] });
    },
  });

  const generateScore = useMutation({
    mutationFn: () => request(`/cases/${caseId}/score/generate`, { method: "POST", body: {} }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ops", "case", caseId] });
    },
  });

  const approve = useMutation({
    mutationFn: (decision: "APPROVED" | "ROUTED_FOR_REVIEW") =>
      request(`/cases/${caseId}/approval`, {
        method: "POST",
        body: { decision, remarks: null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ops", "case", caseId] });
    },
  });

  const review = useMutation({
    mutationFn: (input: { decision: "APPROVE" | "RETURN_FOR_WORK"; returnReason?: string }) =>
      request(`/cases/${caseId}/review`, {
        method: "POST",
        body: { decision: input.decision, remarks: null, returnReason: input.returnReason ?? null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ops", "case", caseId] });
    },
  });

  if (checks.isLoading) return <LoadingBlock label="Loading verification" />;
  if (checks.isError) {
    return (
      <ErrorState
        title="We could not load the verification checks"
        message={checks.error instanceof Error ? checks.error.message : undefined}
        onRetry={() => void checks.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-ink-500">
          <Link to="/ops" className="font-semibold text-brand-700 underline">
            All cases
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">Verification</h1>
        <p className="mt-1 text-sm text-ink-600">
          Record each check independently. A case is never verified because one check passed.
        </p>
      </header>

      {(checks.data ?? []).length === 0 ? (
        <p className="card p-6 text-sm text-ink-600">No checks are configured for this case.</p>
      ) : (
        <ul className="space-y-4">
          {(checks.data ?? []).map((check) => (
            <li key={check.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink-900">
                  {check.label}
                  {check.isMandatory ? (
                    <span className="ml-2 text-xs font-normal text-ink-500">Required</span>
                  ) : null}
                </h2>
                <StatusBadge
                  tone={
                    check.status === "VERIFIED"
                      ? "success"
                      : check.status === "DISCREPANCY_FOUND" || check.status === "REJECTED"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {check.status.replace(/_/g, " ").toLowerCase()}
                </StatusBadge>
              </div>

              {check.remarks ? (
                <p className="mt-2 text-sm text-ink-700">{check.remarks}</p>
              ) : null}
              {check.evidenceReference ? (
                <p className="mt-1 text-xs text-ink-500">Reference: {check.evidenceReference}</p>
              ) : null}

              <CheckResultForm
                pending={record.isPending}
                error={record.error instanceof ApiError ? record.error.message : null}
                onSubmit={(input) => record.mutate({ checkId: check.id, ...input })}
              />
            </li>
          ))}
        </ul>
      )}

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink-900">Score</h2>
          <button
            type="button"
            className="btn-primary"
            disabled={generateScore.isPending}
            onClick={() => generateScore.mutate()}
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            {generateScore.isPending ? "Calculating…" : "Generate score"}
          </button>
        </div>

        {generateScore.isError ? (
          <div
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            role="alert"
          >
            {generateScore.error instanceof ApiError
              ? generateScore.error.message
              : "The score could not be generated."}
          </div>
        ) : null}

        {score.isSuccess ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-3xl font-bold text-ink-900">
                {score.data.totalScore.toFixed(2)}%
              </p>
              <p className="text-sm text-ink-600">
                threshold {score.data.threshold.toFixed(2)}% · configuration v
                {score.data.scoringConfigVersion} · {score.data.outcome.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
            {score.data.components.length > 0 ? (
              <ul className="divide-y divide-ink-200 text-sm">
                {score.data.components.map((component) => (
                  <li key={component.label} className="flex items-center justify-between py-2">
                    <span className="text-ink-700">{component.label}</span>
                    <span className="text-ink-500">
                      weight {component.weight}% · ratio {(component.ratio * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-500">
            No score has been generated for this case yet.
          </p>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Review and approval</h2>
        <p className="mt-1 text-sm text-ink-500">
          Maker-checker rules apply: the person who recorded the deciding result cannot also
          approve the case.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={review.isPending}
            onClick={() => review.mutate({ decision: "APPROVE" })}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Record review approval
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={review.isPending}
            onClick={() =>
              review.mutate({
                decision: "RETURN_FOR_WORK",
                returnReason: "Returned for further verification work",
              })
            }
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Return for further work
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={approve.isPending}
            onClick={() => approve.mutate("APPROVED")}
          >
            <Gavel className="h-4 w-4" aria-hidden="true" />
            Approve case
          </button>
          <Link className="btn-secondary" to={`/ops/cases/${caseId}/report`}>
            <Download className="h-4 w-4" aria-hidden="true" />
            View report
          </Link>
        </div>

        {review.isError || approve.isError ? (
          <p className="error-text" role="alert">
            {review.error instanceof ApiError
              ? review.error.message
              : approve.error instanceof ApiError
                ? approve.error.message
                : "The decision could not be recorded."}
          </p>
        ) : null}
        <InlineError message={null} />
      </section>
    </div>
  );
}

function CheckResultForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (input: { status: string; remarks?: string; evidenceReference?: string }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [status, setStatus] = useState("VERIFIED");
  const [remarks, setRemarks] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");

  return (
    <form
      className="mt-4 space-y-3 border-t border-ink-200 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ status, remarks, evidenceReference });
        setRemarks("");
        setEvidenceReference("");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor={`status-${status}`}>
            Outcome
          </label>
          <select
            id={`status-${status}`}
            className="input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {outcomes.map((outcome) => (
              <option key={outcome.value} value={outcome.value}>
                {outcome.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`evidence-${status}`}>
            Evidence reference
          </label>
          <input
            id={`evidence-${status}`}
            className="input"
            placeholder="Confirmation ref 12345"
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`remarks-${status}`}>
          Remarks
        </label>
        <textarea
          id={`remarks-${status}`}
          className="input min-h-20"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Required for a discrepancy, rejection or unable-to-verify outcome"
        />
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Recording…" : "Record result"}
      </button>
    </form>
  );
}
