import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { ApiError, request } from "../lib/api";
import { InlineError } from "../components/States";
import { useAuth } from "../lib/auth-context";
import { AuthLayout } from "../components/Footer";

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
      <AuthLayout>
        <div className="bg-gradient-to-br from-ink-50 to-brand-50">
          <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12">
            <div className="card border border-emerald-200 bg-emerald-50 p-6 sm:p-8 text-center shadow-sm">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Lock className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-emerald-900">Password changed</h2>
              <p className="mt-2 text-sm text-emerald-800">
                Your password has been updated successfully. You will be signed out and need to
                sign in again.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-semibold text-emerald-700 underline"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="bg-gradient-to-br from-ink-50 to-brand-50">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12">
          <div className="card border border-ink-200 p-6 sm:p-8 shadow-sm">
            <div className="mb-5 flex justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
                C
              </span>
            </div>

            <h1 className="text-center text-2xl font-bold text-ink-900">Change password</h1>
            <p className="mt-1 text-center text-sm text-ink-500">
              {isForcedReset
                ? "Enter a new password. Your previous password has been reset by an administrator."
                : "Enter your current password and a new password."}
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {!isForcedReset ? (
                <div>
                  <label className="label" htmlFor="currentPassword">
                    Current password
                  </label>
                  <input
                    id="currentPassword"
                    type="password"
                    className="input"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
              ) : null}
              <div>
                <label className="label" htmlFor="newPassword">
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <p className="hint">
                  At least 10 characters with a lowercase letter, uppercase letter, digit and
                  symbol.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="confirmPassword">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {newPassword !== confirmPassword ? (
                  <p className="mt-1 text-sm text-red-600">Passwords do not match</p>
                ) : null}
              </div>

              {changePassword.isError && changePassword.error instanceof ApiError ? (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {changePassword.error.message}
                </div>
              ) : null}
              <InlineError message={null} />

              <button
                type="submit"
                className="btn-primary w-full"
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
        </div>
      </div>
    </AuthLayout>
  );
}
