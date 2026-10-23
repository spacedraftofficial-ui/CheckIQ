import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { BgvReport } from "@checkiq/contracts";
import { request } from "../../lib/api";
import { ErrorState, LoadingBlock, StatusBadge } from "../../components/States";

/**
 * The internal BGV report.
 *
 * It shows the verification results, the score with its configuration version
 * and the people involved. It contains no more personal data than the report's
 * purpose requires, and it is never available to a candidate.
 */
export function ReportPage() {
  const { caseId } = useParams<{ caseId: string }>();

  const query = useQuery({
    queryKey: ["ops", "case", caseId, "report"],
    queryFn: () => request<BgvReport>(`/cases/${caseId}/report`),
    enabled: Boolean(caseId),
  });

  if (query.isLoading) return <LoadingBlock label="Building the report" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We could not build the report"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const report = query.data;
  if (!report) return <LoadingBlock label="Building the report" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">
            <Link to={`/ops/cases/${caseId}`} className="font-semibold text-brand-700 underline">
              Back to the case
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">Background verification report</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="font-mono">{report.reportNumber}</span> · case{" "}
            <span className="font-mono">{report.caseNumber}</span> · generated{" "}
            {new Date(report.generatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print
        </button>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Candidate</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Candidate ID" value={report.candidateId} mono />
          <Field label="Name" value={report.candidateName} />
          <Field label="Position" value={report.position ?? "—"} />
          <Field label="Company" value={report.company ?? "—"} />
          <Field label="Department" value={report.department ?? "—"} />
          <Field label="Package" value={report.packageName} />
        </dl>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Timeline</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Initiated" value={formatDate(report.initiatedAt)} />
          <Field label="Submitted" value={formatDate(report.submittedAt)} />
          <Field label="Completed" value={formatDate(report.completedAt)} />
        </dl>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Verification results</h2>
        {report.verificationResults.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No verification results have been recorded.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Individual verification results</caption>
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Check</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Outcome</th>
                  <th scope="col" className="px-3 py-2">Verifier</th>
                  <th scope="col" className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {report.verificationResults.map((result) => (
                  <tr key={`${result.checkTypeCode}-${result.label}`}>
                    <td className="px-3 py-2 font-medium text-ink-900">{result.label}</td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        tone={
                          result.status === "VERIFIED"
                            ? "success"
                            : result.status === "DISCREPANCY_FOUND" || result.status === "REJECTED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {result.status.replace(/_/g, " ").toLowerCase()}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-ink-700">{result.outcomeCode ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-700">{result.verifierName ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-600">{result.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {report.discrepancies.length > 0 ? (
        <section className="card border-amber-300 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-amber-900">Discrepancies</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {report.discrepancies.map((discrepancy) => (
              <li key={discrepancy}>{discrepancy}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Outcome</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Final score"
            value={report.finalScore === null ? "Not scored" : `${report.finalScore.toFixed(2)}%`}
          />
          <Field
            label="Scoring configuration"
            value={
              report.scoringConfigVersion === null ? "—" : `Version ${report.scoringConfigVersion}`
            }
          />
          <Field label="Eligibility" value={report.eligibilityResult ?? "Pending"} />
          <Field label="Verifier" value={report.verifierName ?? "—"} />
          <Field label="Reviewer" value={report.reviewerName ?? "—"} />
          <Field label="Approver" value={report.approverName ?? "—"} />
        </dl>
        {report.approvalTimestamp ? (
          <p className="mt-4 text-sm text-ink-600">
            Approved on {new Date(report.approvalTimestamp).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={`mt-1 text-sm text-ink-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
