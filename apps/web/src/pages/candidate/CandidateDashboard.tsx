import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { request } from "../../lib/api";
import { EmptyState, ErrorState, LoadingBlock, StatusBadge } from "../../components/States";
import { useAuth } from "../../lib/auth-context";

interface DashboardData {
  caseId: string;
  candidateId: string;
  caseNumber: string;
  status: string;
  statusLabel: string;
  submittedAt: string | null;
  actionRequired: boolean;
  readiness: {
    ready: boolean;
    missingProfileFields: string[];
    missingDocuments: { requirementId: string; label: string; status: string; isMandatory: boolean }[];
    consent: { required: boolean; currentVersionId: string | null; accepted: boolean };
    openClarifications: { id: string; issueSummary: string; dueDate: string | null }[];
  };
  documents: {
    id: string;
    requirementId: string;
    label: string;
    status: string;
    isMandatory: boolean;
    uploaded: boolean;
    reviewerRemarks: string | null;
  }[];
  clarifications: {
    id: string;
    issueSummary: string;
    requiredAction: string;
    status: string;
    dueDate: string | null;
    isOverdue: boolean;
  }[];
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

export function CandidateDashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["candidate", "dashboard"],
    queryFn: () => request<DashboardData>("/dashboard"),
  });

  if (query.isLoading) return <LoadingBlock label="Loading your verification" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We could not load your verification"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return <LoadingBlock label="Loading your verification" />;
  const submitted = data.submittedAt !== null;
  const steps = [
    {
      key: "profile",
      label: "Complete your profile",
      done: data.readiness.missingProfileFields.length === 0,
      to: "/profile",
      detail:
        data.readiness.missingProfileFields.length > 0
          ? `${data.readiness.missingProfileFields.length} field(s) still required`
          : undefined,
    },
    {
      key: "consent",
      label: "Accept the declaration",
      done: !data.readiness.consent.required || data.readiness.consent.accepted,
      to: "/consent",
      detail:
        data.readiness.consent.required && !data.readiness.consent.accepted
          ? "The current declaration has not been accepted"
          : undefined,
    },
    {
      key: "documents",
      label: "Upload your documents",
      done: data.readiness.missingDocuments.length === 0,
      to: "/documents",
      detail:
        data.readiness.missingDocuments.length > 0
          ? `${data.readiness.missingDocuments.length} document(s) outstanding`
          : undefined,
    },
    {
      key: "submit",
      label: "Submit for verification",
      done: submitted,
      to: "/submit",
      detail: submitted ? `Submitted on ${formatDate(data.submittedAt!)}` : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 via-brand-100/50 to-ink-50 px-6 py-8 sm:px-8 sm:py-10">
        <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-brand-200/30 blur-2xl" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Your background verification</h1>
            <p className="mt-1.5 text-sm text-ink-600">
              Candidate ID <span className="font-mono">{data.candidateId}</span> · Case{" "}
              <span className="font-mono">{data.caseNumber}</span>
            </p>
        </div>
        <StatusBadge
          tone={data.actionRequired ? "warning" : submitted ? "success" : "info"}
        >
          {data.statusLabel}
        </StatusBadge>
        </div>
      </header>

      {/* Action required banner */}
      {data.actionRequired ? (
        <div
          className="relative overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-4 pl-12 sm:p-5 sm:pl-14"
          role="alert"
        >
          <AlertTriangle
            className="absolute left-4 top-4 h-5 w-5 text-amber-700 sm:left-5"
            aria-hidden="true"
          />
          <p className="text-sm font-semibold text-amber-900">Action required</p>
          <p className="mt-1 text-sm text-amber-800">
            {data.clarifications.filter((c) => c.status !== "CLOSED").length > 0
              ? "The verifier has asked for more information. Please respond to the clarification request."
              : "Some required items are still outstanding. Please complete them and submit."}
          </p>
          <Link
            to="/clarifications"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 underline"
          >
            View what is needed <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {/* Progress steps */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Your progress</h2>
        <ul className="step-list mt-4">
          {steps.map((step) => {
            const stepTone = step.done
              ? "step-dot-complete"
              : data.actionRequired
                ? "step-dot-problem"
                : "step-dot-pending";
            const iconColor = stepTone === "step-dot-complete"
              ? "text-emerald-600"
              : stepTone === "step-dot-problem"
                ? "text-red-600"
                : "text-ink-400";
            const Icon = stepTone === "step-dot-complete" ? CheckCircle2 : CircleDashed;
            return (
              <li key={step.key} className="step-item">
                <span className={`step-dot ${stepTone} ${step.done ? "animate-bounce-in" : ""}`}>
                  <Icon className={`h-3 w-3 ${iconColor}`} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{step.label}</p>
                  {step.detail ? (
                    <p
                      className={`mt-0.5 text-sm ${step.done ? "text-emerald-800" : "text-ink-500"}`}
                    >
                      {step.detail}
                    </p>
                  ) : null}
                </div>
                {!step.done && !submitted ? (
                  <Link to={step.to} className="btn-secondary btn-sm">
                    Open
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Documents summary */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink-900">Documents</h2>
          <Link to="/documents" className="text-sm font-semibold text-brand-700 underline">
            Manage documents
          </Link>
        </div>

        {data.documents.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No documents are required for this package yet" />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-200">
            {data.documents.map((document) => {
              const dotTone = dotFor(document.status, !!document.uploaded);
              return (
                <li key={document.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotTone}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900">
                      {document.label}</p>
                    {document.reviewerRemarks ? (
                      <p className="mt-0.5 text-sm text-amber-800">{document.reviewerRemarks}</p>
                    ) : null}
                  </div>
                  <StatusBadge tone={documentStatusTone[document.status] ?? "neutral"}>
                    {document.status.replace(/_/g, " ").toLowerCase()}
                  </StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {user?.candidateId ? (
        <p className="text-xs text-ink-500">
          You are signed in as {user.fullName} ({user.email}).
        </p>
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function dotFor(status: string, uploaded: boolean): string {
  switch (status) {
    case "ACCEPTED":
      return "status-dot-complete";
    case "MISSING":
      return "status-dot-problem";
    case "REJECTED":
      return "status-dot-problem";
    case "CLARIFICATION_REQUIRED":
      return "status-dot-pending";
    default:
      return uploaded ? "status-dot-in-progress" : "status-dot-pending";
  }
}


