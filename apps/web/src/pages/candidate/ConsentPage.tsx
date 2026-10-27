import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, FileText, Check, CheckCircle2 } from "lucide-react";
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
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-ink-900">Declaration and consent</h1>
        </div>
        <p className="mt-1.5 text-sm text-ink-600">
          Version {consent.version} · effective from{" "}
          {new Date(consent.effectiveFrom).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </header>

      {consent.accepted ? (
        <div
          className="relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 p-5 pl-14"
          role="status"
        >
          <div className="absolute left-4 top-5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-emerald-900">You have accepted this version</p>
          <p className="mt-1 text-sm text-emerald-800">
            Accepted on{" "}
            {consent.acceptedAt
              ? new Date(consent.acceptedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
              : "a previous visit"}
            . If the wording changes, you will be asked to accept the new version before
            you can submit.
          </p>
        </div>
      ) : null}

      <section className="card p-5 sm:p-7">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-5 w-5 text-ink-700" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-ink-900">{consent.title}</h2>
        </div>
        <div className="relative rounded-lg border border-ink-200 bg-ink-50 p-5">
          <div className="max-h-96 overflow-y-auto">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-700">
              {consent.body}
            </pre>
          </div>
        </div>

        {!consent.accepted ? (
          <div className="mt-5 space-y-3">
            <label className="flex items-start gap-2.5 text-sm text-ink-800">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-ink-300"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I have read and agree to the declaration and consent wording above.
              </span>
            </label>

            {error ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <button
              type="button"
              className="btn-primary"
              disabled={!confirmed || accept.isPending}
              onClick={() => accept.mutate(consent.id)}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {accept.isPending ? "Recording…" : "Accept and continue"}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="inline-flex items-center gap-1.5 text-sm text-emerald-800">
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
