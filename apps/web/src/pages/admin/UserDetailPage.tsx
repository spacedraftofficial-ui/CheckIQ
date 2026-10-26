import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, ArrowLeft, Mail, ShieldCheck, ToggleLeft, ToggleRight } from "lucide-react";
import { ApiError, request } from "../../lib/api";
import { ErrorState, InlineError, LoadingBlock, StatusBadge } from "../../components/States";

interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  mobile: string;
  isActive: boolean;
  deletedAt: string | null;
  isEmailVerified: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: string[];
  revokedRoles: { code: string; revokedAt: string }[];
  associatedCases: {
    id: string;
    caseNumber: string;
    status: string;
    submittedAt: string | null;
    createdAt: string;
  }[];
  auditTrail: {
    id: string;
    action: string;
    actorId: string | null;
    actorName: string | null;
    actorRole: string | null;
    entityType: string;
    entityId: string | null;
    caseId: string | null;
    candidateId: string | null;
    previousValue: unknown;
    newValue: unknown;
    reason: string | null;
    ipAddress: string | null;
    requestId: string | null;
    createdAt: string;
  }[];
}

const roleLabels: Record<string, string> = {
  CANDIDATE: "Candidate",
  BGV_EXECUTIVE: "BGV Executive",
  BGV_REVIEWER: "BGV Reviewer / Manager",
  HR_RECRUITMENT: "HR / Recruitment",
  ADMINISTRATOR: "Administrator",
  SUPER_ADMINISTRATOR: "Super Administrator",
};

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const user = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => request<UserDetail>(`/admin/users/${id}`),
    enabled: Boolean(id),
  });

  const deactivate = useMutation({
    mutationFn: (isActive: boolean) =>
      request(`/admin/users/${id}`, {
        method: "PATCH",
        body: { isActive, reason: isActive ? "Reactivated" : "Deactivated" },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const verifyEmail = useMutation({
    mutationFn: () => request(`/admin/users/${id}/verify-email`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (reason: string | undefined) =>
      request(`/admin/users/${id}`, {
        method: "DELETE",
        body: { reason },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "user", id] });
    },
  });

  if (!id) return <ErrorState title="No user ID provided" message="The user ID is missing from the URL." />;
  if (user.isLoading) return <LoadingBlock label="Loading user" />;
  if (user.isError) {
    return (
      <ErrorState
        title="We could not load this user"
        message={user.error instanceof Error ? user.error.message : undefined}
        onRetry={() => void user.refetch()}
      />
    );
  }

  const data = user.data;
  if (!data) return <LoadingBlock label="Loading user" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/users" className="flex items-center gap-1 text-sm font-semibold text-brand-700 underline">
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Back to users
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-ink-900">{data.fullName}</h1>
          <p className="mt-1 text-sm text-ink-600 break-all">{data.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={data.isActive ? "success" : "danger"}>
            {data.isActive ? "Active" : "Disabled"}
          </StatusBadge>
          <button
            type="button"
            className={data.isActive ? "btn-warning" : "btn-secondary"}
            onClick={() => deactivate.mutate(!data.isActive)}
          >
            {data.isActive ? (
              <>
                <ToggleLeft className="h-4 w-4" aria-hidden={true} />
                Disable
              </>
             ) : (
               <>
                 <ToggleRight className="h-4 w-4" aria-hidden={true} />
                 Activate
               </>
             )}
           </button>
           {!data.deletedAt && (
             <button
               type="button"
               className="btn-danger"
               onClick={() => {
                 const reason = window.prompt(
                   "Delete this user? Enter a reason (or leave blank):",
                   "",
                 );
                 if (reason === null) return;
                 void deleteUser.mutate(reason || undefined);
               }}
             >
               <Trash2 className="h-4 w-4" aria-hidden={true} />
               Delete
             </button>
           )}
        </div>
      </header>

      {deactivate.isError && deactivate.error instanceof ApiError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {deactivate.error.message}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Candidate ID" value={data.email} />
        <Detail label="Email verified" value={data.isEmailVerified ? "Yes" : "No"} />
        <Detail label="Last signed in" value={data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString() : "Never"} />
        <Detail label="Account created" value={new Date(data.createdAt).toLocaleDateString()} />

        <Detail label="Must change password" value={data.mustChangePassword ? "Yes" : "No"} />
        <Detail label="Failed login attempts" value={String(data.failedLoginAttempts)} />
        <Detail label="Account locked" value={data.lockedUntil ? `Until ${new Date(data.lockedUntil).toLocaleTimeString()}` : "No"} />
        <Detail label="Mobile" value={data.mobile} />

        <Detail
          label="Roles"
          value={data.roles.length > 0 ? data.roles.map((r) => roleLabels[r] ?? r).join(", ") : "No roles"}
        />
        {data.revokedRoles.length > 0 ? (
          <Detail
            label="Revoked roles"
            value={data.revokedRoles.map((r) => `${roleLabels[r.code] ?? r.code} (${new Date(r.revokedAt).toLocaleDateString()})`).join(", ")}
          />
        ) : null}
        <Detail label="Profile last updated" value={new Date(data.updatedAt).toLocaleString()} />
      </section>

      {!data.isEmailVerified && (
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Email not verified</h2>
              <p className="mt-1 text-sm text-ink-600">
                This user's email address has not been confirmed. You can manually verify it here.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={verifyEmail.isPending}
              onClick={() => verifyEmail.mutate()}
            >
              <Mail className="h-4 w-4" aria-hidden={true} />
              {verifyEmail.isPending ? "Verifying…" : "Verify email now"}
            </button>
          </div>
          {verifyEmail.isError && verifyEmail.error instanceof ApiError ? (
            <InlineError message={verifyEmail.error.message} />
          ) : null}
          {verifyEmail.isSuccess ? (
            <p className="mt-2 text-sm text-emerald-700" role="status">
              Email verification recorded.
            </p>
          ) : null}
        </section>
      )}

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Roles</h2>
        {data.roles.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">This user has no roles assigned.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.roles.map((role) => (
              <StatusBadge key={role} tone="info">
                {roleLabels[role] ?? role}
              </StatusBadge>
            ))}
          </div>
        )}
        {data.revokedRoles.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink-700">Previously revoked roles</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.revokedRoles.map((r) => (
                <span key={r.code} className="text-xs text-ink-500">
                  {roleLabels[r.code] ?? r.code} · revoked {new Date(r.revokedAt).toLocaleDateString()}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-ink-900">Associated cases</h2>
        {data.associatedCases.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">
            This user has no associated background verification cases.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Case</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Submitted</th>
                  <th scope="col" className="px-3 py-2">Created</th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {data.associatedCases.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-semibold text-brand-700">{c.caseNumber}</span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone="neutral">{c.status.replace(/_/g, " ").toLowerCase()}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-ink-600">
                      {c.submittedAt ? new Date(c.submittedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-500">
                      {new Date(c.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/ops/cases/${c.id}`}
                        className="text-xs font-semibold text-brand-700 underline"
                      >
                        View case
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">Audit trail</h2>
          <span className="text-xs text-ink-500">{data.auditTrail.length} event(s)</span>
        </div>
        {data.auditTrail.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No audit events found for this user.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l border-ink-200 pl-4">
            {data.auditTrail.map((event) => (
              <li key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">
                    <ShieldCheck className="inline h-3 w-3 text-ink-400" aria-hidden={true} />{" "}
                    {event.action}
                  </p>
                  <span className="text-xs text-ink-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {event.actorName ?? "System"}
                  {event.actorRole ? ` (${event.actorRole})` : ""}
                </p>
                {event.reason ? (
                  <p className="mt-1 text-sm text-ink-600">{event.reason}</p>
                ) : null}
                {event.ipAddress ? (
                  <p className="mt-1 text-xs text-ink-500">IP: {event.ipAddress}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900 break-words">{value}</p>
    </div>
  );
}
