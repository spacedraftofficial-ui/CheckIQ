import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { ApiError } from "../lib/api";
import { resetPassword } from "../lib/api";
import { InlineError } from "../components/States";
import { AuthLayout } from "../components/Footer";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(code, newPassword);
      setReset(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not reset your password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

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

        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-10 sm:px-6 sm:py-14">
          {reset ? (
            <div className="surface-solid animate-fade-in-up p-6 sm:p-8 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Lock className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">
                Password reset
              </h1>
              <p className="mt-2 text-sm text-ink-600">
                Your password has been changed. All existing sessions have been
                signed out.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                Sign in with your new password
              </Link>
            </div>
          ) : (
            <div className="surface-solid animate-fade-in-up p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 text-lg font-extrabold text-white shadow-lg shadow-blue-500/30">
                  C
                </span>
                <span className="text-xl font-extrabold tracking-tight text-slate-900">
                  CheckIQ
                </span>
              </div>

              <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">
                Reset your password
              </h1>
              <p className="mt-2 text-sm text-ink-600">
                Enter the 6-digit code sent to <strong>{email}</strong>, then
                choose a new password.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="code">
                    Reset code
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-3.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="newPassword">
                    New password
                  </label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="newPassword"
                      type="password"
                      className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-3.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                    />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    At least 10 characters with upper and lower case, a digit and
                    a symbol.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="confirmPassword">
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-3.5 pr-3.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                  {!passwordsMatch && confirmPassword.length > 0 ? (
                    <p className="mt-1 text-xs text-rose-600">Passwords do not match</p>
                  ) : null}
                </div>

                {error ? (
                  <div
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}
                <InlineError message={null} />

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  disabled={submitting || code.length !== 6 || !passwordsMatch}
                >
                  {submitting ? "Resetting…" : "Reset password"}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-ink-600">
                Remember your password?{" "}
                <Link to="/login" className="font-semibold text-blue-700 underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
