import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { ApiError } from "../lib/api";
import { forgotPassword } from "../lib/api";
import { InlineError } from "../components/States";
import { AuthLayout } from "../components/Footer";

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not send a reset code. Please try again.",
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
          {sent ? (
            <div className="surface-solid animate-fade-in-up p-6 sm:p-8 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Mail className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">
                Reset code sent
              </h1>
              <p className="mt-2 text-sm text-ink-600">
                If an account exists for <strong>{email}</strong>, a 6-digit code
                has been sent to your inbox.
              </p>
              <Link
                to={"/reset-password?email=" + encodeURIComponent(email)}
                className="mt-6 inline-flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                I have the code <span aria-hidden="true">→</span>
              </Link>
              <p className="mt-6 text-sm text-ink-600">
                Didn't receive it?{" "}
                <button
                  type="button"
                  className="font-semibold text-blue-700 underline"
                  onClick={() => setSent(false)}
                >
                  Request another code
                </button>
              </p>
              <p className="mt-3 text-sm text-ink-600">
                Remember your password?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-blue-700 underline"
                >
                  Sign in
                </Link>
              </p>
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
                Forgot your password?
              </h1>
              <p className="mt-2 text-sm text-ink-600">
                Enter your email address and we will send a 6-digit reset code to
                your inbox.
              </p>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="email"
                      type="email"
                      className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-3.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
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
                  disabled={submitting}
                >
                  {submitting ? "Sending code…" : "Send reset code"}
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
