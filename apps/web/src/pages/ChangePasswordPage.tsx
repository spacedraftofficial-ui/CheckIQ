import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { ApiError, request } from "../lib/api";
import { InlineError } from "../components/States";
import { useAuth } from "../lib/auth-context";
import { AuthLayout } from "../components/Footer";

/* ---------- shared look (visual only) ---------- */
const labelCls = "mb-1.5 block text-sm font-semibold text-slate-800";
const inputCls =
  "block w-full rounded-xl border-0 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthLayout>
      <div className="relative isolate overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div
          className="absolute -right-20 top-10 -z-10 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -left-20 bottom-10 -z-10 h-72 w-72 rounded-full bg-violet-200/50 blur-3xl"
          aria-hidden="true"
        />
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-10 sm:py-14">
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-blue-200/50 ring-1 ring-slate-200">
            <div className="h-1.5 bg-gradient-to-r from-blue-600 to-violet-500" aria-hidden="true" />
            {children}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const { user } = useAuth();
  const isForcedReset = user?.mustChangePassword ?? false;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = useMutation({
    mutationFn: () =>
      request("/auth/change-password", {
        method: "POST",
        body: isForcedReset ? { newPassword } : { currentPassword, newPassword },
      }),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      return;
    }
    void changePassword.mutate();
  };

  if (changePassword.isSuccess) {
    return (
      <PageShell>
        <div className="p-6 text-center sm:p-10">
          <div className="mb-5 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/30 ring-8 ring-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Password changed</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Your password has been updated successfully. You will be signed out and need to
            sign in again.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="p-6 sm:p-10">
        <div className="mb-5 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 ring-1 ring-inset ring-blue-100">
            <img src="/logos/checkiq-icon.png" className="h-9 w-9" alt="CheckIQ" aria-hidden="true" />
          </span>
        </div>

        <h1 className="text-center text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Change password
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
          {isForcedReset
            ? "Enter a new password. Your previous password has been reset by an administrator."
            : "Enter your current password and a new password."}
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          {!isForcedReset ? (
            <div>
              <label className={labelCls} htmlFor="currentPassword">
                Current password
              </label>
              <input
                id="currentPassword"
                type="password"
                className={inputCls}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
          ) : null}
          <div>
            <label className={labelCls} htmlFor="newPassword">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              className={inputCls}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              At least 10 characters with a lowercase letter, uppercase letter, digit and
              symbol.
            </p>
          </div>
          <div>
            <label className={labelCls} htmlFor="confirmPassword">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className={inputCls}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {newPassword !== confirmPassword ? (
              <p className="mt-1.5 text-sm font-medium text-rose-600">Passwords do not match</p>
            ) : null}
          </div>

          {changePassword.isError && changePassword.error instanceof ApiError ? (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800"
              role="alert"
            >
              {changePassword.error.message}
            </div>
          ) : null}
          <InlineError message={null} />

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
            disabled={
              changePassword.isPending ||
              newPassword !== confirmPassword ||
              (!isForcedReset && !currentPassword)
            }
          >
            {changePassword.isPending ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>
    </PageShell>
  );
}