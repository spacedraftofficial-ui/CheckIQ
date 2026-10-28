import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, FileText, Check, CheckCircle2, AlertCircle, CalendarDays } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { ErrorState, InlineError, LoadingBlock } from "../../components/States";

interface ConsentData {
  id: string;
  version: string;
  title: string;
  body: string;
  effectiveFrom: string;
  accepted: boolean;
  acceptedAt: string | null;
}

export function ConsentPage() {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["candidate", "consent"],
    queryFn: () => request<ConsentData>("/consent/current"),
  });

  const accept = useMutation({
    mutationFn: (consentVersionId: string) =>
      request<{ accepted: boolean; version: string }>("/consent/accept", {
        method: "POST",
        body: { consentVersionId, accepted: true },
      }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not record your acceptance. Please try again.",
      );
    },
  });

  if (query.isLoading) return <LoadingBlock label="Loading the declaration" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We could not load the declaration"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const consent = query.data;
  if (!consent) return <LoadingBlock label="Loading the declaration" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      {/* Page header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-violet-50 px-5 py-8 shadow-sm ring-1 ring-blue-100 sm:px-10 sm:py-10">
        <div
          className="absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-blue-200/50 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 left-1/4 -z-10 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl"
          aria-hidden="true"
        />
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 shadow-lg shadow-blue-500/30">
            <ShieldCheck className="h-7 w-7 text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Declaration and consent
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-blue-700 shadow-sm ring-1 ring-inset ring-blue-200">
                Version {consent.version}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-medium text-slate-600 shadow-sm ring-1 ring-inset ring-slate-200">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Effective from{" "}
                {new Date(consent.effectiveFrom).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            </p>
          </div>
        </div>
      </header>

      {/* Accepted banner */}
      {consent.accepted ? (
        <div
          className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6"
          role="status"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/30">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold text-emerald-900">You have accepted this version</p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-800">
              Accepted on{" "}
              {consent.acceptedAt
                ? new Date(consent.acceptedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                : "a previous visit"}
              . If the wording changes, you will be asked to accept the new version before
              you can submit.
            </p>
          </div>
        </div>
      ) : null}

      {/* Declaration card */}
      <section className="relative overflow-hidden rounded-3xl bg-white shadow-md shadow-slate-200/60 ring-1 ring-slate-200">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 to-violet-500" aria-hidden="true" />
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-8 sm:py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-md shadow-violet-500/25">
            <FileText className="h-5 w-5 text-white" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-bold text-slate-900">{consent.title}</h2>
        </div>

        <div className="p-5 sm:p-8">
          {/* Reading surface */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-50/80 ring-1 ring-inset ring-slate-200">
            <div className="max-h-96 overflow-y-auto p-5 sm:p-7">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-700">
                {consent.body}
              </pre>
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-50 to-transparent"
              aria-hidden="true"
            />
          </div>

          {!consent.accepted ? (
            <div className="mt-6 space-y-5 border-t border-slate-100 pt-6">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-200 transition hover:bg-blue-50/60 has-[:checked]:bg-blue-50 has-[:checked]:ring-blue-400">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I have read and agree to the declaration and consent wording above.
                </span>
              </label>

              {error ? (
                <div
                  className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : null}

              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none sm:w-auto"
                disabled={!confirmed || accept.isPending}
                onClick={() => accept.mutate(consent.id)}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {accept.isPending ? "Recording…" : "Accept and continue"}
              </button>
            </div>
          ) : (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Accepted
              </div>
            </div>
          )}

          <InlineError message={null} />
        </div>
      </section>
    </div>
  );
}