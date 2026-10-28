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
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      {/* Page header */}
      <header className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-violet-50 px-5 py-8 shadow-sm ring-1 ring-blue-100 sm:px-10 sm:py-10">
        <div className="absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-blue-200/50 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-24 left-1/4 -z-10 h-56 w-56 rounded-full bg-violet-200/50 blur-3xl" aria-hidden="true" />
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 shadow-lg shadow-blue-500/30">
            <MessageSquare className="h-7 w-7 text-white" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Clarifications</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              If the verifier needs more information, your request appears here with exactly
              what is needed.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {open.length === 0 && closed.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100">
            <MessageSquare className="h-7 w-7 text-blue-500" aria-hidden="true" />
          </span>
          <EmptyState
            title="Nothing to respond to"
            description="You have no outstanding clarification requests."
          />
        </div>
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/25">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Awaiting your response ({open.length})
            </h2>
          </div>
          {open.map((clarification) => (
            <article
              key={clarification.id}
              className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:shadow-lg hover:shadow-blue-100"
            >
              <div
                className={`h-1.5 bg-gradient-to-r ${
                  clarification.isOverdue ? "from-rose-500 to-orange-500" : "from-blue-600 to-violet-500"
                }`}
                aria-hidden="true"
              />
              <div className="p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${
                        clarification.isOverdue ? "bg-red-500" : "bg-amber-400"
                      }`}
                      aria-hidden="true"
                    />
                    <h3 className="min-w-0 break-words text-base font-bold text-slate-900">
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

                <div className="mt-4 rounded-2xl bg-blue-50/60 p-4 ring-1 ring-inset ring-blue-100 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-blue-700">What is required</p>
                      <p className="mt-1 break-words text-sm font-medium leading-relaxed text-slate-800">
                        {clarification.requiredAction}
                      </p>
                      {clarification.remarks ? (
                        <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{clarification.remarks}</p>
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
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor={"response-" + clarification.id}>
                      Your response
                    </label>
                    <textarea
                      id={"response-" + clarification.id}
                      className="block min-h-28 w-full rounded-xl border-0 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none sm:w-auto"
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
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-emerald-800">Your response</p>
                        <p className="mt-1 break-words text-sm leading-relaxed text-emerald-900">
                          {clarification.responseText}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">
            Closed requests ({closed.length})
          </h2>
          {closed.map((clarification) => (
            <article
              key={clarification.id}
              className="relative overflow-hidden rounded-2xl bg-white p-4 pl-5 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md sm:p-5 sm:pl-6"
            >
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-slate-300 to-blue-300" aria-hidden="true" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold text-slate-800">
                  {clarification.issueSummary}
                </p>
                <StatusBadge tone="neutral">closed</StatusBadge>
              </div>
              {clarification.closeReason ? (
                <p className="mt-1 break-words text-sm text-slate-500">{clarification.closeReason}</p>
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