import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { EmptyState, ErrorState, InlineError, LoadingBlock, StatusBadge } from "../../components/States";

interface Clarification {
  id: string;
  issueSummary: string;
  requiredAction: string;
  remarks: string | null;
  dueDate: string | null;
  status: string;
  requestedAt: string;
  respondedAt: string | null;
  responseText: string | null;
  closeReason: string | null;
  isOverdue: boolean;
}

export function ClarificationsPage() {
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["candidate", "clarifications"],
    queryFn: async () => {
      const dashboard = await request<{ caseId: string }>("/dashboard");
      return request<Clarification[]>("/cases/" + dashboard.caseId + "/clarifications");
    },
  });

  const respond = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      request<{ id: string; status: string; isLate: boolean }>("/clarifications/" + id + "/respond", {
        method: "POST",
        body: { responseText: text },
      }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["candidate"] });
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiError ? caught.message : "We could not send your response.",
      );
    },
  });

  if (query.isLoading) return <LoadingBlock label="Loading your requests" />;
  if (query.isError) {
    return (
      <ErrorState
        title="We could not load your clarification requests"
        message={query.error instanceof Error ? query.error.message : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const rows = query.data ?? [];
  const open = rows.filter((item) => item.status === "OPEN" || item.status === "RESPONDED");
  const closed = rows.filter((item) => item.status === "CLOSED" || item.status === "CANCELLED");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
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
            <MessageSquare className="h-7 w-7 text-indigo-600" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-indigo-900 sm:text-4xl">Clarifications</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-indigo-800/80">
              If the verifier needs more information, your request appears here with exactly
              what is needed.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-4 text-sm text-red-700 shadow-sm"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {open.length === 0 && closed.length === 0 ? (
        <div className="rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 p-8 text-center shadow-sm ring-1 ring-indigo-100">
          <MessageSquare className="mx-auto h-10 w-10 text-indigo-300" aria-hidden="true" />
          <EmptyState
            title="Nothing to respond to"
            description="You have no outstanding clarification requests."
          />
        </div>
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 ring-1 ring-inset ring-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-ink-900">
              Awaiting your response ({open.length})
            </h2>
          </div>
          {open.map((clarification) => (
            <article
              key={clarification.id}
              className={`relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 shadow-sm ring-1 transition hover:shadow-xl sm:p-7 ${
                clarification.isOverdue
                  ? "from-rose-50 via-white to-orange-50 ring-rose-100 hover:shadow-rose-200/60"
                  : "from-amber-50 via-white to-fuchsia-50 ring-amber-100 hover:shadow-amber-200/60"
              }`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${
                  clarification.isOverdue ? "from-rose-500 to-orange-500" : "from-amber-400 via-orange-400 to-fuchsia-500"
                }`}
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${
                      clarification.isOverdue ? "bg-red-500" : "bg-amber-400"
                    }`}
                    aria-hidden="true"
                  />
                  <h3 className="min-w-0 break-words text-base font-bold text-ink-900">
                    {clarification.issueSummary}
                  </h3>
                </div>
                <StatusBadge tone={clarification.isOverdue ? "danger" : "warning"}>
                  {clarification.isOverdue ? (
                    <>
                      <Clock className="h-3 w-3" aria-hidden="true" /> Overdue
                    </>
                  ) : (
                    "Open"
                  )}
                </StatusBadge>
              </div>

              <div className="mt-4 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-inset ring-indigo-100 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-100 to-fuchsia-100">
                    <AlertTriangle className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                      What is required
                    </p>
                    <p className="mt-1 break-words text-sm font-medium leading-relaxed text-ink-800">
                      {clarification.requiredAction}
                    </p>
                    {clarification.remarks ? (
                      <p className="mt-2 break-words text-sm leading-relaxed text-ink-600">{clarification.remarks}</p>
                    ) : null}
                    {clarification.dueDate ? (
                      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Please respond by{" "}
                        {new Date(clarification.dueDate).toLocaleDateString(undefined, { dateStyle: "medium" })}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {clarification.status === "OPEN" ? (
                <div className="mt-5">
                  <label className="mb-1.5 block text-sm font-semibold text-ink-800" htmlFor={"response-" + clarification.id}>
                    Your response
                  </label>
                  <textarea
                    id={"response-" + clarification.id}
                    className="block min-h-28 w-full rounded-xl border-0 bg-white/80 px-3.5 py-3 text-sm text-ink-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Provide the requested information clearly and as completely as you can."
                    value={responses[clarification.id] ?? ""}
                    onChange={(event) =>
                      setResponses((current) => ({
                        ...current,
                        [clarification.id]: event.target.value,
                      }))
                    }
                  />
                  <InlineError message={null} />
                  <button
                    type="button"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:shadow-xl hover:shadow-fuchsia-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:w-auto"
                    disabled={
                      respond.isPending || (responses[clarification.id] ?? "").trim().length === 0
                    }
                    onClick={() =>
                      respond.mutate({
                        id: clarification.id,
                        text: responses[clarification.id] ?? "",
                      })
                    }
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    {respond.isPending ? "Sending…" : "Send response"}
                  </button>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 ring-1 ring-inset ring-emerald-200">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                        Your response
                      </p>
                      <p className="mt-1 break-words text-sm leading-relaxed text-emerald-900">
                        {clarification.responseText}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink-900">
            Closed requests ({closed.length})
          </h2>
          {closed.map((clarification) => (
            <article
              key={clarification.id}
              className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 p-4 pl-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md sm:p-5 sm:pl-6"
            >
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-slate-300 to-indigo-300" aria-hidden="true" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold text-ink-800">
                  {clarification.issueSummary}
                </p>
                <StatusBadge tone="neutral">closed</StatusBadge>
              </div>
              {clarification.closeReason ? (
                <p className="mt-1 break-words text-sm text-ink-500">{clarification.closeReason}</p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {open.length === 0 && closed.length > 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          All of your clarification requests are closed.
        </p>
      ) : null}
    </div>
  );
}