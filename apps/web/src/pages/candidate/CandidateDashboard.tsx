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
    <div className="space-y-8">
      {/* Hero header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-200 via-fuchsia-100 to-amber-100 px-5 py-8 shadow-xl shadow-indigo-200/60 ring-1 ring-white/70 sm:px-10 sm:py-12">
        {/* colour blobs */}
        <div className="absolute -top-16 -left-10 -z-10 h-64 w-64 rounded-full bg-cyan-300/50 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 right-0 -z-10 h-72 w-72 rounded-full bg-fuchsia-300/50 blur-3xl" aria-hidden="true" />
        <div className="absolute top-1/2 left-1/2 -z-10 h-52 w-52 rounded-full bg-amber-200/70 blur-3xl" aria-hidden="true" />
        {/* soft dot texture */}
        <div
          className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(#6366f1_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"
          aria-hidden="true"
        />

        <div className="relative flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 max-w-xl">
            <StatusBadge tone={data.actionRequired ? "warning" : submitted ? "success" : "info"}>
              {data.statusLabel}
            </StatusBadge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-indigo-900 sm:text-4xl">
              Your background verification
            </h1>
            <div className="mt-5 flex flex-wrap gap-2.5 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-200 backdrop-blur">
                Candidate ID
                <span className="break-all font-mono font-semibold text-indigo-900">{data.candidateId}</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-fuchsia-700 shadow-sm ring-1 ring-inset ring-fuchsia-200 backdrop-blur">
                Case
                <span className="break-all font-mono font-semibold text-fuchsia-900">{data.caseNumber}</span>
              </span>
            </div>
          </div>

          {/* progress seal */}
          <div
            className="relative flex h-36 w-36 shrink-0 items-center justify-center self-center sm:self-auto"
            role="img"
            aria-label={`${percent}% of verification steps complete`}
          >
            <div className="absolute inset-2 rounded-full bg-white/70 shadow-lg shadow-indigo-300/50 backdrop-blur" aria-hidden="true" />
            <svg viewBox="0 0 100 100" className="relative h-full w-full -rotate-90" aria-hidden="true">
              <defs>
                <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#d946ef" />
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
              <span className="bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-3xl font-extrabold tabular-nums text-transparent">
                {percent}%
              </span>
              <span className="text-xs font-medium text-indigo-700">complete</span>
            </div>
          </div>
        </div>
      </header>

      {/* Insight cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-5 shadow-sm ring-1 ring-indigo-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-200/60">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-cyan-400" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl text-brand-700">
              {data.documents.length}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-ink-500">Documents required</p>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-sm ring-1 ring-amber-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-200/60">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100">
              <FileClock className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl text-amber-700">
              {needAttention}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-ink-500">Need attention</p>
        </div>

        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-200/60">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl text-emerald-700">
              {accepted}
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-ink-500">Documents accepted</p>
        </div>
      </div>

      {/* Action required banner */}
      {data.actionRequired ? (
        <div
          className="relative overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-5 pl-16 shadow-sm sm:p-6 sm:pl-20"
          role="alert"
        >
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" aria-hidden="true" />
          <div className="absolute -left-6 -top-8 h-28 w-28 rounded-full bg-amber-300/40 blur-2xl" aria-hidden="true" />
          <span className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 ring-1 ring-inset ring-amber-300 sm:left-6 sm:top-6">
            <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
          </span>
          <p className="text-base font-bold text-amber-900">Action required</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-amber-800">
            {data.clarifications.filter((c) => c.status !== "CLOSED").length > 0
              ? "The verifier has asked for more information. Please respond to the clarification request."
              : "Some required items are still outstanding. Please complete them and submit."}
          </p>
          <Link
            to="/clarifications"
            className="group/link mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-900 px-3.5 py-2 text-sm font-semibold text-amber-50 shadow-sm transition hover:bg-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
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
      <section className="rounded-3xl bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm ring-1 ring-indigo-100 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink-900">Your progress</h2>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tabular-nums text-indigo-700 ring-1 ring-inset ring-indigo-100">
            {steps.filter((s) => s.done).length} of {steps.length} steps done
          </span>
        </div>
        <div className="mt-4 mb-8 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 shadow-[0_0_12px_rgba(99,102,241,0.55)] transition-all duration-1000 ease-out"
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
                  : "text-ink-400";
            const dotSurface =
              stepTone === "step-dot-complete"
                ? "bg-emerald-50 ring-emerald-300 shadow-emerald-200"
                : stepTone === "step-dot-problem"
                  ? "bg-red-50 ring-red-300 shadow-red-200"
                  : "bg-slate-50 ring-slate-300 shadow-slate-200";
            const Icon = step.done ? CheckCircle2 : CircleDashed;
            const isLast = index === steps.length - 1;
            return (
              <li key={step.key} className="relative flex items-start gap-4 pb-6 last:pb-0">
                {!isLast ? (
                  <span
                    className={`absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded-full ${
                      step.done ? "bg-gradient-to-b from-emerald-400 to-emerald-200" : "bg-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 shadow-md ${dotSurface} ${
                    step.done ? "animate-bounce-in" : ""
                  }`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
                </span>
                <div
                  className={`flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset transition ${
                    step.done
                      ? "bg-emerald-50/50 ring-emerald-100"
                      : "bg-slate-50/70 ring-slate-200/70 hover:bg-white hover:shadow-md"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{step.label}</p>
                    {step.detail ? (
                      <p
                        className={`mt-0.5 text-sm ${step.done ? "text-emerald-800" : "text-ink-500"}`}
                      >
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                  {!step.done && !submitted ? (
                    <Link
                      to={step.to}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg hover:shadow-indigo-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
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
      <section className="rounded-3xl bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm ring-1 ring-indigo-100 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink-900">Documents</h2>
          <Link
            to="/documents"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-indigo-100 transition hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
                  className="group flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50/70 px-4 py-3.5 ring-1 ring-inset ring-slate-200/70 transition hover:bg-white hover:shadow-md"
                >
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ring-4 ring-white shadow ${dotTone}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{document.label}</p>
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
        <p className="text-center text-xs text-ink-500">
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
      return uploaded ? "bg-indigo-500" : "bg-slate-400";
  }
}