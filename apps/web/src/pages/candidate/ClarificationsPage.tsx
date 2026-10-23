import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, MessageSquare } from "lucide-react";
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
      return request<Clarification[]>(`/cases/${dashboard.caseId}/clarifications`);
    },
  });

  const respond = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      request<{ id: string; status: string; isLate: boolean }>(`/clarifications/${id}/respond`, {
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Clarifications</h1>
        <p className="mt-1 text-sm text-ink-600">
          If the verifier needs more information, your request appears here with exactly
          what is needed.
        </p>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {open.length === 0 && closed.length === 0 ? (
        <EmptyState
          title="Nothing to respond to"
          description="You have no outstanding clarification requests."
        />
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-ink-900">Awaiting your response</h2>
          {open.map((clarification) => (
            <article key={clarification.id} className="card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-900">
                  {clarification.issueSummary}
                </h3>
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

              <div className="mt-3 rounded-lg bg-ink-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                  What is required
                </p>
                <p className="mt-1 text-sm text-ink-800">{clarification.requiredAction}</p>
                {clarification.remarks ? (
                  <p className="mt-2 text-sm text-ink-600">{clarification.remarks}</p>
                ) : null}
                {clarification.dueDate ? (
                  <p className="mt-2 text-xs text-ink-500">
                    Please respond by {new Date(clarification.dueDate).toLocaleDateString()}
                  </p>
                ) : null}
              </div>

              {clarification.status === "OPEN" ? (
                <div className="mt-4">
                  <label className="label" htmlFor={`response-${clarification.id}`}>
                    Your response
                  </label>
                  <textarea
                    id={`response-${clarification.id}`}
                    className="input min-h-28"
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
                    className="btn-primary mt-3"
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
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Your response
                  </p>
                  <p className="mt-1 text-sm text-emerald-900">{clarification.responseText}</p>
                </div>
              )}
            </article>
          ))}
        </section>
      ) : null}

      {closed.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-ink-900">Closed requests</h2>
          {closed.map((clarification) => (
            <article key={clarification.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-800">
                  {clarification.issueSummary}
                </p>
                <StatusBadge tone="neutral">closed</StatusBadge>
              </div>
              {clarification.closeReason ? (
                <p className="mt-1 text-sm text-ink-500">{clarification.closeReason}</p>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {open.length === 0 && closed.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          All of your clarification requests are closed.
        </p>
      ) : null}
    </div>
  );
}
