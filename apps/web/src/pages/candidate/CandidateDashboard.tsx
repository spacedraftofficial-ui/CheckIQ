import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  FileClock,
  FileText,
} from "lucide-react";
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

  const percent = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  const needAttention = data.documents.filter(
    (d) => d.status === "REJECTED" || d.status === "CLARIFICATION_REQUIRED",
  ).length;
  const accepted = data.documents.filter((d) => d.status === "ACCEPTED").length;

  // progress ring geometry
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-violet-50 px-5 py-8 shadow-sm ring-1 ring-blue-100 sm:px-10 sm:py-12">
        <div className="absolute -right-16 -top-20 -z-10 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 left-1/3 -z-10 h-60 w-60 rounded-full bg-violet-200/50 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 max-w-xl">
            <StatusBadge tone={data.actionRequired ? "warning" : submitted ? "success" : "info"}>
              {data.statusLabel}
            </StatusBadge>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Your background
              <span className="block bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">
                verification.
              </span>
            </h1>
            <div className="mt-5 flex flex-wrap gap-2.5 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-slate-500 shadow-sm ring-1 ring-inset ring-slate-200">
                Candidate ID
                <span className="break-all font-mono font-semibold text-slate-900">{data.candidateId}</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-slate-500 shadow-sm ring-1 ring-inset ring-slate-200">
                Case
                <span className="break-all font-mono font-semibold text-blue-700">{data.caseNumber}</span>
              </span>
            </div>
          </div>

          {/* progress seal */}
          <div
            className="relative flex h-36 w-36 shrink-0 items-center justify-center self-center sm:self-auto"
            role="img"
            aria-label={`${percent}% of verification steps complete`}
          >
            <div className="absolute inset-2 rounded-full bg-white shadow-lg shadow-blue-200/70 ring-1 ring-blue-100" aria-hidden="true" />
            <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="url(#ring-grad)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold tabular-nums text-slate-900">{percent}%</span>
              <span className="text-xs font-medium text-slate-500">complete</span>
            </div>
          </div>
        </div>
      </header>

      {/* Insight cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100">
          <div className="h-1.5 bg-gradient-to-r from-blue-600 to-violet-500" aria-hidden="true" />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-violet-500/25">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-3xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
                {data.documents.length}
              </span>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-500">Documents required</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-100">
          <div className="h-1.5 bg-gradient-to-r from-amber-400 to-orange-500" aria-hidden="true" />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/25">
                <FileClock className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-3xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
                {needAttention}
              </span>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-500">Need attention</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-100">
          <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500" aria-hidden="true" />
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/25">
                <FileCheck2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-3xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-4xl">
                {accepted}
              </span>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-500">Documents accepted</p>
          </div>
        </div>
      </div>

      {/* Action required banner */}
      {data.actionRequired ? (
        <div
          className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:p-6"
          role="alert"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/30">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-amber-900">Action required</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-amber-800">
              {data.clarifications.filter((c) => c.status !== "CLOSED").length > 0
                ? "The verifier has asked for more information. Please respond to the clarification request."
                : "Some required items are still outstanding. Please complete them and submit."}
            </p>
          </div>
          <Link
            to="/clarifications"
            className="group/link inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            View what is needed{" "}
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover/link:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      ) : null}

      {/* Journey tracker */}
      <section className="rounded-3xl bg-white p-5 shadow-md shadow-slate-200/60 ring-1 ring-slate-200 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Your progress</h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold tabular-nums text-blue-700 ring-1 ring-inset ring-blue-100">
            {steps.filter((s) => s.done).length} of {steps.length} steps done
          </span>
        </div>
        <div className="mb-8 mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500 transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
            aria-hidden="true"
          />
        </div>
        <ul className="relative">
          {steps.map((step, index) => {
            const stepTone = step.done
              ? "step-dot-complete"
              : data.actionRequired
                ? "step-dot-problem"
                : "step-dot-pending";
            const iconColor =
              stepTone === "step-dot-complete"
                ? "text-emerald-600"
                : stepTone === "step-dot-problem"
                  ? "text-red-600"
                  : "text-slate-400";
            const dotSurface =
              stepTone === "step-dot-complete"
                ? "bg-emerald-50 ring-emerald-300 shadow-emerald-100"
                : stepTone === "step-dot-problem"
                  ? "bg-red-50 ring-red-300 shadow-red-100"
                  : "bg-white ring-slate-300 shadow-slate-100";
            const Icon = step.done ? CheckCircle2 : CircleDashed;
            const isLast = index === steps.length - 1;
            return (
              <li key={step.key} className="relative flex items-start gap-3 pb-5 last:pb-0 sm:gap-4">
                {!isLast ? (
                  <span
                    className={`absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded-full ${
                      step.done ? "bg-gradient-to-b from-emerald-400 to-emerald-200" : "bg-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-md ring-2 ${dotSurface} ${
                    step.done ? "animate-bounce-in" : ""
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
                </span>
                <div
                  className={`flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset transition ${
                    step.done
                      ? "bg-emerald-50/60 ring-emerald-100"
                      : "bg-slate-50 ring-slate-200 hover:bg-white hover:shadow-md"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                    {step.detail ? (
                      <p className={`mt-0.5 text-sm ${step.done ? "text-emerald-800" : "text-slate-500"}`}>
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                  {!step.done && !submitted ? (
                    <Link
                      to={step.to}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-blue-600 to-violet-500 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-blue-500/25 transition hover:from-blue-700 hover:to-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Open
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Documents summary */}
      <section className="rounded-3xl bg-white p-5 shadow-md shadow-slate-200/60 ring-1 ring-slate-200 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Documents</h2>
          <Link
            to="/documents"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Manage documents
          </Link>
        </div>

        {data.documents.length === 0 ? (
          <div className="mt-5">
            <EmptyState title="No documents are required for this package yet" />
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {data.documents.map((document) => {
              const dotTone = dotFor(document.status, !!document.uploaded);
              return (
                <li
                  key={document.id}
                  className="group flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 px-4 py-3.5 ring-1 ring-inset ring-slate-200 transition hover:bg-white hover:shadow-md"
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full shadow ring-4 ring-white ${dotTone}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{document.label}</p>
                    {document.reviewerRemarks ? (
                      <p className="mt-1 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-200/70">
                        {document.reviewerRemarks}
                      </p>
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
        <p className="text-center text-xs text-slate-500">
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
      return "bg-emerald-500";
    case "MISSING":
      return "bg-red-500";
    case "REJECTED":
      return "bg-red-500";
    case "CLARIFICATION_REQUIRED":
      return "bg-amber-500";
    default:
      return uploaded ? "bg-blue-500" : "bg-slate-400";
  }
}