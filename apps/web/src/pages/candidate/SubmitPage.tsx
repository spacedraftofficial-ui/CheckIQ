import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Send } from "lucide-react";
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
      return request<Readiness>(`/cases/${dashboard.caseId}/readiness`);
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const dashboard = await request<{ caseId: string }>("/dashboard");
      // The idempotency key is generated once per page load so that a retry
      // after a network error does not create a second submission.
      const key = idempotencyKey(dashboard.caseId);
      return request<SubmitResult>(`/cases/${dashboard.caseId}/submit`, {
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
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
          <h1 className="text-xl font-bold text-ink-900">
            {result.alreadySubmitted ? "Already submitted" : "Submission received"}
          </h1>
          <p className="text-sm text-ink-600">
            Case <span className="font-mono">{result.caseNumber}</span> was submitted on{" "}
            {new Date(result.submittedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . You will be notified if anything further is required.
          </p>
          <button
            type="button"
            className="btn-primary"
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
          ? `Still required: ${data.missing.profileFields.join(", ")}`
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
          ? `${data.missing.documents.map((doc) => doc.label).join(", ")}`
          : undefined,
      to: "/documents",
    },
    {
      label: "No open clarification requests",
      done: data.missing.openClarifications.length === 0,
      detail:
        data.missing.openClarifications.length > 0
          ? `${data.missing.openClarifications.length} request(s) awaiting your response`
          : undefined,
      to: "/clarifications",
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Submit for verification</h1>
        <p className="mt-1 text-sm text-ink-600">
          Review the checklist, then confirm. You will not be able to edit submitted
          information unless the verifier asks for a clarification.
        </p>
      </header>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Submission checklist</h2>
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{item.label}</p>
                {item.detail ? <p className="text-sm text-ink-500">{item.detail}</p> : null}
              </div>
              {!item.done && item.to ? (
                <Link to={item.to} className="btn-secondary">
                  Fix
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5 sm:p-6">
        <label className="flex items-start gap-2 text-sm text-ink-800">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-ink-300"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm that the information and documents I have provided are true and complete.
        </label>

        {submitError ? (
          <div
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            <p className="font-semibold">Your submission was not accepted</p>
            <p className="mt-1">{submitError}</p>
          </div>
        ) : null}

        <InlineError message={null} />

        <button
          type="button"
          className="btn-primary mt-4"
          disabled={!data.ready || !confirmed || submit.isPending}
          onClick={() => submit.mutate()}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {submit.isPending ? "Submitting…" : "Submit for verification"}
        </button>
        {!data.ready ? (
          <p className="hint">Complete every item in the checklist before you can submit.</p>
        ) : null}
      </section>
    </div>
  );
}

/**
 * A stable idempotency key for this page load. Repeating the request with the
 * same key returns the original result instead of creating a second
 * submission.
 */
function idempotencyKey(caseId: string): string {
  const storageKey = `checkiq.idempotency.${caseId}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = `submit-${caseId}-${crypto.randomUUID()}`;
  sessionStorage.setItem(storageKey, generated);
  return generated;
}
