import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { ApiError, request, requestPage } from "../../lib/api";
import { EmptyState, ErrorState, InlineError, LoadingBlock, StatusBadge } from "../../components/States";

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  lastLoginAt: string | null;
}

const roleLabels: Record<string, string> = {
  CANDIDATE: "Candidate",
  BGV_EXECUTIVE: "BGV Executive",
  BGV_REVIEWER: "BGV Reviewer",
  HR_RECRUITMENT: "HR / Recruitment",
  ADMINISTRATOR: "Administrator",
  SUPER_ADMINISTRATOR: "Super Administrator",
};

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => requestPage<AdminUser>("/admin/users?pageSize=50"),
  });

  const usersData = users.data;
  const deactivate = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      request(`/admin/users/${id}`, {
        method: "PATCH",
        body: { isActive, reason: isActive ? "Reactivated by an administrator" : "Deactivated by an administrator" },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
  if (!usersData) return <LoadingBlock label="Loading users" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Users</h1>
          <p className="mt-1 text-sm text-ink-600">
            Staff accounts, their roles and their access to the platform.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm((value) => !value)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {showForm ? "Cancel" : "Add a user"}
        </button>
      </header>

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
        <EmptyState title="No users found" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="sr-only">Platform users</caption>
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Roles</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Last sign-in</th>
                <th scope="col" className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {usersData.data.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">{user.fullName}</td>
                  <td className="px-4 py-3 text-ink-700">{user.email}</td>
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
                      className="btn-secondary"
                      disabled={deactivate.isPending}
                      onClick={() => deactivate.mutate({ id: user.id, isActive: !user.isActive })}
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
      await onCreated();
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiError ? caught.message : "The user could not be created.",
      );
    },
  });
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
            type="text"
            className="input"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            required
            minLength={10}
          />
          <p className="hint">The user must change this at first sign-in.</p>
        </div>
      </div>
      <InlineError message={error} />
      <button type="submit" className="btn-primary" disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
