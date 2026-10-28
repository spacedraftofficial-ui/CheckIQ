import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, FileText, Check, CheckCircle2, AlertCircle } from "lucide-react";
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
            <ShieldCheck className="h-7 w-7 text-indigo-600" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-900 sm:text-4xl">
              Declaration and consent
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-white/80 px-3 py-1 font-semibold text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-200">
                Version {consent.version}
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-fuchsia-700 shadow-sm ring-1 ring-inset ring-fuchsia-200">
                effective from{" "}
                {new Date(consent.effectiveFrom).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            </p>
          </div>
        </div>
      </header>

      {consent.accepted ? (
        <div
          className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 p-5 pl-16 shadow-sm sm:p-6 sm:pl-20"
          role="status"
        >
          <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-emerald-400 to-teal-500" aria-hidden="true" />
          <div className="absolute -left-6 -top-8 h-28 w-28 rounded-full bg-emerald-300/40 blur-2xl" aria-hidden="true" />
          <span className="absolute left-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 ring-1 ring-inset ring-emerald-300 sm:left-6 sm:top-6">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </span>
          <p className="text-base font-bold text-emerald-900">You have accepted this version</p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-800">
            Accepted on{" "}
            {consent.acceptedAt
              ? new Date(consent.acceptedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "a previous visit"}
            . If the wording changes, you will be asked to accept the new version before
            you can submit.
          </p>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm ring-1 ring-indigo-100 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-fuchsia-100 ring-1 ring-inset ring-indigo-200">
            <FileText className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-bold text-ink-900">{consent.title}</h2>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-2xl bg-white/80 shadow-inner ring-1 ring-inset ring-indigo-100">
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-indigo-500 via-fuchsia-500 to-amber-400" aria-hidden="true" />
          <div className="max-h-96 overflow-y-auto p-5 pl-6 pr-4 sm:p-6 sm:pl-7">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-700">
              {consent.body}
            </pre>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/90 to-transparent" aria-hidden="true" />
        </div>

        {!consent.accepted ? (
          <div className="mt-6 space-y-5 border-t border-indigo-100 pt-6">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-indigo-50/70 p-4 text-sm font-medium text-ink-800 ring-1 ring-inset ring-indigo-100 transition hover:bg-indigo-50 has-[:checked]:bg-gradient-to-r has-[:checked]:from-indigo-50 has-[:checked]:to-fuchsia-50 has-[:checked]:ring-indigo-300">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I have read and agree to the declaration and consent wording above.
              </span>
            </label>

            {error ? (
              <div
                className="flex items-start gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 text-sm text-red-700 shadow-sm"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-auto"
              disabled={!confirmed || accept.isPending}
              onClick={() => accept.mutate(consent.id)}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {accept.isPending ? "Recording…" : "Accept and continue"}
            </button>
          </div>
        ) : (
          <div className="mt-6 border-t border-indigo-100 pt-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Accepted
            </div>
          </div>
        )}

        <InlineError message={null} />
      </section>  
    </div>
  );
}