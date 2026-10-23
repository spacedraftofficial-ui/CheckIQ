import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { ErrorState, InlineError, LoadingBlock } from "../../components/States";

interface ConfigRow {
  key: string;
  value: string;
  valueType: string;
  category: string;
  description: string | null;
  isSecret: boolean;
}

interface ScoringConfig {
  id: string;
  version: number;
  name: string;
  threshold: number;
  status: string;
  isApproved: boolean;
  notes: string | null;
  components: { checkTypeCodes: string[]; label: string; weight: number }[];
}

export function AdminConfigPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = useQuery({
    queryKey: ["admin", "config"],
    queryFn: () => request<ConfigRow[]>("/admin/config"),
  });

  const scoring = useQuery({
    queryKey: ["admin", "scoring-configs"],
    queryFn: () => request<ScoringConfig[]>("/admin/scoring-configs"),
  });

  const update = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      request(`/admin/config/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: { value, reason: "Updated from the administration console" },
      }),
    onSuccess: async () => {
      setError(null);
      setMessage("Configuration updated.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "config"] });
    },
    onError: (caught) => {
      setMessage(null);
      setError(caught instanceof ApiError ? caught.message : "The value could not be saved.");
    },
  });

  const approve = useMutation({
    mutationFn: (id: string) => request(`/admin/scoring-configs/${id}/approve`, { method: "POST", body: {} }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "scoring-configs"] });
    },
  });

  const activate = useMutation({
    mutationFn: (id: string) => request(`/admin/scoring-configs/${id}/activate`, { method: "POST", body: {} }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "scoring-configs"] });
    },
  });

  if (config.isLoading) return <LoadingBlock label="Loading configuration" />;
  if (config.isError) {
    return (
      <ErrorState
        title="We could not load the configuration"
        message={config.error instanceof Error ? config.error.message : undefined}
        onRetry={() => void config.refetch()}
      />
    );
  }

  const rows = config.data ?? [];
  const categories = new Map<string, ConfigRow[]>();
  for (const row of rows) {
    const list = categories.get(row.category) ?? [];
    list.push(row);
    categories.set(row.category, list);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Configuration</h1>
        <p className="mt-1 text-sm text-ink-600">
          Runtime configuration. Every change is recorded in the audit trail.
        </p>
      </header>

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {[...categories.entries()].map(([category, rows]) => (
        <section key={category} className="card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink-900">{category}</h2>
          <div className="mt-4 space-y-4">
            {rows.map((row) => (
              <ConfigField
                key={row.key}
                row={row}
                pending={update.isPending}
                onSave={(value) => update.mutate({ key: row.key, value })}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Scoring configurations</h2>
        <p className="mt-1 text-sm text-ink-500">
          A configuration must be approved before it can be activated and used to score a case.
          The weights below are illustrative until the organisation confirms them.
        </p>

        {scoring.isLoading ? (
          <div className="mt-4">
            <LoadingBlock label="Loading scoring configurations" />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {(scoring.data ?? []).map((entry) => (
              <li key={entry.id} className="rounded-lg border border-ink-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      v{entry.version} — {entry.name}
                    </p>
                    <p className="text-xs text-ink-500">
                      threshold {entry.threshold}% · status {entry.status.toLowerCase()} ·{" "}
                      {entry.isApproved ? "approved" : "not approved"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!entry.isApproved ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(entry.id)}
                      >
                        Approve
                      </button>
                    ) : null}
                    {entry.isApproved && entry.status !== "ACTIVE" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={activate.isPending}
                        onClick={() => activate.mutate(entry.id)}
                      >
                        Activate
                      </button>
                    ) : null}
                  </div>
                </div>

                <ul className="mt-3 flex flex-wrap gap-2 text-xs text-ink-600">
                  {entry.components.map((component) => (
                    <li key={component.label} className="rounded bg-ink-100 px-2 py-1">
                      {component.label} {component.weight}%
                    </li>
                  ))}
                </ul>
                {entry.notes ? (
                  <p className="mt-2 text-xs italic text-ink-500">{entry.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConfigField({
  row,
  onSave,
  pending,
}: {
  row: ConfigRow;
  onSave: (value: string) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState(row.value);

  return (
    <div>
      <label className="label" htmlFor={`config-${row.key}`}>
        <span className="font-mono text-xs text-ink-600">{row.key}</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`config-${row.key}`}
          className="input max-w-md flex-1"
          value={value}
          disabled={row.isSecret}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          type="button"
          className="btn-secondary"
          disabled={pending || row.isSecret || value === row.value}
          onClick={() => onSave(value)}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save
        </button>
      </div>
      {row.description ? <p className="hint">{row.description}</p> : null}
      <InlineError message={null} />
    </div>
  );
}
