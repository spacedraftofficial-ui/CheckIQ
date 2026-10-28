import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Send, ClipboardCheck, AlertCircle } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { ErrorState, InlineError, LoadingBlock } from "../../components/States";

interface Readiness {
  ready: boolean;
  missing: {
    profileFields: string[];
    documents: { requirementId: string; label: string; status: string; isMandatory: boolean }[];
    consent: { required: boolean; currentVersionId: string | null; accepted: boolean };
    openClarifications: { id: string; issueSummary: string; dueDate: string | null }[];
  };
}

interface SubmitResult {
  caseId: string;
  caseNumber: string;
  status: string;
  submittedAt: string;
  alreadySubmitted: boolean;
}

export function SubmitPage() {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const readiness = useQuery({
    queryKey: ["candidate", "readiness"],
    queryFn: async () => {
      const dashboard = await request<{ caseId: string }>("/dashboard");
      return request<Readiness>("/cases/" + dashboard.caseId + "/readiness");
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const dashboard = await request<{ caseId: string }>("/dashboard");
      const key = idempotencyKey(dashboard.caseId);
      return request<SubmitResult>("/cases/" + dashboard.caseId + "/submit", {
        method: "POST",
        body: { idempotencyKey: key, confirmDeclaration: true },
      });
    },
    onSuccess: (data) => {
      setSubmitError(null);
      setResult(data);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setSubmitError(error.message);
        return;
      }
      setSubmitError("We could not submit your verification. Please try again.");
    },
  });

  if (readiness.isLoading) return <LoadingBlock label="Checking your submission" />;
  if (readiness.isError) {
    return (
      <ErrorState
        title="We could not check your submission"
        message={readiness.error instanceof Error ? readiness.error.message : undefined}
        onRetry={() => void readiness.refetch()}
      />
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 px-5 py-10 text-center shadow-xl shadow-emerald-200/60 ring-1 ring-white/70 sm:px-10 sm:py-12">
          <div className="absolute -top-16 -left-10 -z-10 h-60 w-60 rounded-full bg-emerald-300/50 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-20 right-0 -z-10 h-64 w-64 rounded-full bg-cyan-300/50 blur-3xl" aria-hidden="true" />
          <div className="absolute top-1/2 left-1/2 -z-10 h-48 w-48 rounded-full bg-amber-200/60 blur-3xl" aria-hidden="true" />
          <div
            className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(#10b981_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"
            aria-hidden="true"
          />
          <div className="mb-4 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 shadow-lg shadow-emerald-300/60 ring-4 ring-emerald-200/70">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-emerald-900 sm:text-4xl">
            {result.alreadySubmitted ? "Already submitted" : "Submission received"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-emerald-800">
            Case <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono font-semibold text-emerald-900">{result.caseNumber}</span> was submitted on{" "}
            {new Date(result.submittedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . You will be notified if anything further is required.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:shadow-xl hover:shadow-cyan-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:w-auto"
            onClick={() => navigate("/dashboard", { replace: true })}
          >
            Back to overview
          </button>
        </div>
      </div>
    );
  }

  const data = readiness.data;
  if (!data) return <LoadingBlock label="Checking your submission" />;
  const items: { label: string; done: boolean; detail?: string; to?: string }[] = [
    {
      label: "Profile complete",
      done: data.missing.profileFields.length === 0,
      detail:
        data.missing.profileFields.length > 0
          ? "Still required: " + data.missing.profileFields.join(", ")
          : undefined,
      to: "/profile",
    },
    {
      label: "Declaration accepted",
      done: !data.missing.consent.required || data.missing.consent.accepted,
      detail:
        data.missing.consent.required && !data.missing.consent.accepted
          ? "Accept the current declaration wording"
          : undefined,
      to: "/consent",
    },
    {
      label: "Required documents uploaded",
      done: data.missing.documents.length === 0,
      detail:
        data.missing.documents.length > 0
          ? data.missing.documents.map((doc) => doc.label).join(", ")
          : undefined,
      to: "/documents",
    },
    {
      label: "No open clarification requests",
      done: data.missing.openClarifications.length === 0,
      detail:
        data.missing.openClarifications.length > 0
          ? data.missing.openClarifications.length + " request(s) awaiting your response"
          : undefined,
      to: "/clarifications",
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const percent = Math.round((doneCount / items.length) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Hero header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-200 via-fuchsia-100 to-amber-100 px-5 py-8 shadow-xl shadow-indigo-200/60 ring-1 ring-white/70 sm:px-10 sm:py-10">
        <div className="absolute -top-16 -left-10 -z-10 h-60 w-60 rounded-full bg-cyan-300/50 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 right-0 -z-10 h-64 w-64 rounded-full bg-fuchsia-300/50 blur-3xl" aria-hidden="true" />
        <div className="absolute top-1/2 left-1/2 -z-10 h-48 w-48 rounded-full bg-amber-200/70 blur-3xl" aria-hidden="true" />
        <div
          className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(#6366f1_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-lg shadow-indigo-300/50 ring-1 ring-inset ring-white backdrop-blur">
            <ClipboardCheck className="h-7 w-7 text-indigo-600" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-900 sm:text-4xl">Submit for verification</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-indigo-800/80">
              Review the checklist, then confirm. You will not be able to edit submitted
              information unless the verifier asks for a clarification.
            </p>
          </div>
        </div>
      </header>

      {/* Checklist */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm ring-1 ring-indigo-100 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-fuchsia-100 ring-1 ring-inset ring-indigo-200">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-ink-900">Submission checklist</h2>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tabular-nums text-indigo-700 ring-1 ring-inset ring-indigo-100">
            {doneCount} of {items.length} done
          </span>
        </div>
        <div className="mt-5 mb-7 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 shadow-[0_0_12px_rgba(99,102,241,0.55)] transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <ul className="relative">
          {items.map((item, index) => {
            const Icon = item.done ? CheckCircle2 : CircleDashed;
            const iconColor = item.done ? "text-emerald-600" : "text-ink-400";
            const dotSurface = item.done
              ? "bg-emerald-50 ring-emerald-300 shadow-emerald-200"
              : "bg-slate-50 ring-slate-300 shadow-slate-200";
            const isLast = index === items.length - 1;
            return (
              <li key={item.label} className="relative flex items-start gap-4 pb-5 last:pb-0">
                {!isLast ? (
                  <span
                    className={`absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded-full ${
                      item.done ? "bg-gradient-to-b from-emerald-400 to-emerald-200" : "bg-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 shadow-md ${dotSurface}`}
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <Icon className={"h-4 w-4 " + iconColor} aria-hidden="true" />
                </span>
                <div
                  className={`flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset transition ${
                    item.done
                      ? "bg-emerald-50/60 ring-emerald-100"
                      : "bg-amber-50/60 ring-amber-100 hover:bg-white hover:shadow-md"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{item.label}</p>
                    {item.detail ? (
                      <p className="mt-0.5 break-words text-sm text-ink-500">{item.detail}</p>
                    ) : null}
                  </div>
                  {!item.done && item.to ? (
                    <Link
                      to={item.to}
                      className="inline-flex items-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:shadow-lg hover:shadow-indigo-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                      Fix
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Declaration */}
      <section className="relative rounded-3xl bg-gradient-to-br from-fuchsia-50 via-white to-indigo-50 p-5 pt-8 shadow-lg shadow-indigo-200/40 ring-2 ring-indigo-200 sm:p-8 sm:pt-9">
        <div className="absolute -top-3.5 left-5 rounded-full bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-3.5 py-1 text-xs font-bold text-white shadow-md sm:left-8">
          Declaration
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white/80 p-4 text-sm font-medium text-ink-800 ring-1 ring-inset ring-indigo-100 transition hover:bg-white has-[:checked]:bg-gradient-to-r has-[:checked]:from-indigo-50 has-[:checked]:to-fuchsia-50 has-[:checked]:ring-indigo-300">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I confirm that the information and documents I have provided are true and
            complete to the best of my knowledge.
          </span>
        </label>

        {submitError ? (
          <div
            className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 text-sm text-red-700 shadow-sm"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <div>
              <p className="font-semibold">Your submission was not accepted</p>
              <p className="mt-1">{submitError}</p>
            </div>
          </div>
        ) : null}

        <InlineError message={null} />

        <button
          type="button"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          disabled={!data.ready || !confirmed || submit.isPending}
          onClick={() => submit.mutate()}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {submit.isPending ? "Submitting…" : "Submit for verification"}
        </button>

        {!data.ready ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            Complete every item in the checklist before you can submit.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function idempotencyKey(caseId: string): string {
  const storageKey = "checkiq.idempotency." + caseId;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = "submit-" + caseId + "-" + crypto.randomUUID();
  sessionStorage.setItem(storageKey, generated);
  return generated;
}