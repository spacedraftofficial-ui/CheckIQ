import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Search, AlertTriangle, X } from "lucide-react";
import { ApiError, request, requestPage, toQueryString } from "../../lib/api";
import { EmptyState, ErrorState, InlineError, LoadingBlock, StatusBadge } from "../../components/States";

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  isEmailVerified: boolean;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  CANDIDATE: "Candidate",
  BGV_EXECUTIVE: "BGV Executive",
  BGV_REVIEWER: "BGV Reviewer / Manager",
  HR_RECRUITMENT: "HR / Recruitment",
  ADMINISTRATOR: "Administrator",
  SUPER_ADMINISTRATOR: "Super Administrator",
};

const VERIFICATION_FILTERS = [
  { value: "", label: "All users" },
  { value: "verified", label: "Verified email" },
  { value: "unverified", label: "Unverified email" },
] as const;

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "true", label: "Active" },
  { value: "false", label: "Disabled" },
] as const;

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [verificationFilter, setVerificationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"activate" | "deactivate">("deactivate");
  const pageSize = 50;

  const searchParams = useMemo(() => {
    const params: Record<string, unknown> = { page: page.toString(), pageSize: pageSize.toString() };
    if (search) params.search = search;
    if (verificationFilter) {
      if (verificationFilter === "verified") params.isEmailVerified = "true";
      if (verificationFilter === "unverified") params.isEmailVerified = "false";
    }
    if (statusFilter) params.isActive = statusFilter;
    return params;
  }, [page, search, verificationFilter, statusFilter]);

  const users = useQuery({
    queryKey: ["admin", "users", page, search, verificationFilter, statusFilter],
    queryFn: () => requestPage<AdminUser>(`/admin/users${toQueryString(searchParams)}`),
  });

  const usersData = users.data;

  const deactivate = useMutation({
    mutationKey: ["deactivate-user"],
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      request(`/admin/users/${id}`, {
        method: "PATCH",
        body: { isActive, reason: isActive ? "Reactivated by an administrator" : "Deactivated by an administrator" },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const verifyEmail = useMutation({
    mutationKey: ["verify-user-email"],
    mutationFn: ({ id }: { id: string }) =>
      request(`/admin/users/${id}/verify-email`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (caught) => {
      console.error("Failed to verify email:", caught);
    },
  });

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(1);
  };

  const clearFilters = () => {
    setVerificationFilter("");
    setStatusFilter("");
    setSearch("");
    setPage(1);
  };

  const hasActiveFilters = verificationFilter !== "" || statusFilter !== "" || search !== "";

  if (!usersData) return <LoadingBlock label="Loading users" />;

  const total = usersData.meta.total;
  const totalPages = usersData.meta.totalPages;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Users</h1>
          <p className="mt-1 text-sm text-ink-600">
            Staff accounts, their roles and their access to the platform.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary whitespace-nowrap"
          onClick={() => setShowForm((value) => !value)}
        >
          <UserPlus className="h-4 w-4" aria-hidden={true} />
          {showForm ? "Cancel" : "Add a user"}
        </button>
      </header>

      <div className="flex flex-col gap-4 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="relative max-w-md w-full sm:w-auto" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Search by name or email..."
            className="input pl-10 w-full"
            value={search}
            onChange={handleSearchChange}
            aria-label="Search users"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden={true} />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input text-sm"
            value={verificationFilter}
            onChange={(e) => {
              setVerificationFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by email verification"
          >
            {VERIFICATION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            className="input text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by account status"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={clearFilters}
              aria-label="Clear all filters"
            >
              <X className="h-4 w-4" aria-hidden={true} />
              Clear
            </button>
          )}
        </div>

        <p className="text-sm text-ink-600 whitespace-nowrap">
          Showing {Math.min((page - 1) * pageSize + 1, total)}-{Math.min(page * pageSize, total)} of {total} users
        </p>
      </div>

      {showForm ? (
        <CreateUserForm
          onCreated={async () => {
            setShowForm(false);
            await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      ) : null}

      {users.isLoading ? (
        <LoadingBlock label="Loading users" />
      ) : users.isError ? (
        <ErrorState
          title="We could not load the user list"
          message={users.error instanceof Error ? users.error.message : undefined}
          onRetry={() => void users.refetch()}
        />
      ) : usersData.data.length === 0 ? (
        <EmptyState title="No users found" description={hasActiveFilters ? "Try clearing the filters." : undefined} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">Platform users</caption>
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Roles</th>
                <th scope="col" className="px-4 py-3">Email verification</th>
                <th scope="col" className="px-4 py-3">Account status</th>
                <th scope="col" className="px-4 py-3">Last sign-in</th>
                <th scope="col" className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {usersData.data.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">{user.fullName}</td>
                  <td className="px-4 py-3 text-ink-700 break-all">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <StatusBadge key={role} tone="info">
                          {roleLabels[role] ?? role}
                        </StatusBadge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={user.isEmailVerified ? "success" : "warning"}>
                        {user.isEmailVerified ? "Verified" : "Unverified"}
                      </StatusBadge>
                      {!user.isEmailVerified && (
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
                          disabled={verifyEmail.isPending}
                          onClick={() => verifyEmail.mutate({ id: user.id })}
                        >
                          Verify now
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={user.isActive ? "success" : "danger"}>
                      {user.isActive ? "Active" : "Disabled"}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="btn-secondary text-sm"
                      disabled={deactivate.isPending}
                      onClick={() => {
                        setConfirmUserId(user.id);
                        setConfirmAction(user.isActive ? "deactivate" : "activate");
                      }}
                    >
                      {user.isActive ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-ink-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {confirmUserId && (
        <ConfirmDialog
          isOpen={true}
          title={confirmAction === "deactivate" ? "Disable this user?" : "Enable this user?"}
          message={
            confirmAction === "deactivate"
              ? "This will immediately revoke all active sessions for this user. They will not be able to sign in until re-enabled."
              : "This will allow the user to sign in to their account."
          }
          actionLabel={confirmAction === "deactivate" ? "Disable user" : "Enable user"}
          actionTone="danger"
          onClose={() => setConfirmUserId(null)}
          onConfirm={async () => {
            const user = (await queryClient.fetchQuery({
              queryKey: ["admin", "users", page, search, verificationFilter, statusFilter],
            })) as { data: AdminUser[] } | undefined;
            const target = user?.data.find((u) => u.id === confirmUserId);
            if (target) {
              await deactivate.mutateAsync({ id: target.id, isActive: !target.isActive });
            }
            setConfirmUserId(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  actionLabel,
  actionTone = "danger",
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "warning" | "primary";
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toneClasses = {
    danger: "btn-danger",
    warning: "btn-secondary",
    primary: "btn-primary",
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "An error occurred.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden={true} />
          <div>
            <h3 id="confirm-title" className="text-lg font-semibold text-ink-900">
              {title}
            </h3>
            <p className="mt-1 text-sm text-ink-600">{message}</p>
          </div>
        </div>

        {error && <InlineError message={error} />}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={confirming} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={toneClasses[actionTone]} disabled={confirming} onClick={handleConfirm}>
            {confirming ? "Processing…" : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("BGV_EXECUTIVE");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      request("/admin/users", {
        method: "POST",
        body: { email, fullName, roles: [role], temporaryPassword },
      }),
    onSuccess: async () => {
      setError(null);
      setEmail("");
      setFullName("");
      setTemporaryPassword("");
      setRole("BGV_EXECUTIVE");
      await onCreated();
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiError ? caught.message : "The user could not be created.",
      );
    },
  });

  const passwordValid = temporaryPassword.length >= 10;
  const canSubmit = email.length > 0 && fullName.length > 0 && passwordValid && !create.isPending;

  return (
    <form
      className="card space-y-4 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="text-base font-semibold text-ink-900">Create a staff account</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-fullName">
            Full name
          </label>
          <input
            id="new-fullName"
            className="input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="new-email">
            Email address
          </label>
          <input
            id="new-email"
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="new-role">
            Role
          </label>
          <select
            id="new-role"
            className="input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {Object.entries(roleLabels)
              .filter(([code]) => code !== "CANDIDATE")
              .map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="new-password">
            Temporary password
          </label>
          <input
            id="new-password"
            type="password"
            className="input"
            autoComplete="new-password"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            required
            minLength={10}
          />
          <p className="hint">
            At least 10 characters with upper and lower case, a digit and a symbol. The user
            must change this on first sign-in.
          </p>
        </div>
      </div>
      <InlineError message={error} />
      <button type="submit" className="btn-primary" disabled={!canSubmit}>
        {create.isPending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}