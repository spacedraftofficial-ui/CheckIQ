import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Lock, Mail } from "lucide-react";
import { ApiError } from "../lib/api";
import { homeRouteFor, useAuth } from "../lib/auth-context";
import { InlineError } from "../components/States";
import { AuthLayout } from "../components/Footer";

const highlights = [
  "Upload your documents securely",
  "Track every step of your verification",
  "Get notified the moment something is needed",
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const sessionUser = await login(email, password);
      if (sessionUser.mustChangePassword) {
        navigate("/change-password", { replace: true });
      } else {
        navigate(homeRouteFor(sessionUser), { replace: true });
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We could not sign you in. Please try again.",
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

        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center px-4 py-10 sm:px-6 sm:py-14">
          <div className="grid w-full overflow-hidden rounded-3xl bg-white shadow-2xl shadow-blue-200/50 ring-1 ring-slate-200 lg:grid-cols-2">
            {/* Brand panel */}
            <div className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
              <div
                className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
                aria-hidden="true"
              />
              <div
                className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-violet-300/20 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative flex items-center gap-3">
                <img src="/logos/checkiq-icon.png" className="h-11 w-11 shrink-0" alt="CheckIQ" aria-hidden="true" />
                <span className="text-xl font-extrabold tracking-tight">CheckIQ</span>
              </div>

              <div className="relative">
                <h2 className="text-3xl font-extrabold leading-tight tracking-tight xl:text-4xl">
                  Background verification, made simple.
                </h2>
                <ul className="mt-8 space-y-4">
                  {highlights.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-blue-50">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                        <CheckCircle2 className="h-4 w-4 text-white" aria-hidden="true" />
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="relative text-xs text-blue-100">
                Your information is used only for your verification.
              </p>
            </div>

            {/* Form panel */}
            <div className="p-6 sm:p-10">
              <div className="mb-6 flex items-center gap-3 lg:hidden">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 text-lg font-extrabold text-white shadow-lg shadow-blue-500/30">
                  C
                </span>
                <span className="text-xl font-extrabold tracking-tight text-slate-900">CheckIQ</span>
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Sign in</h1>
              <p className="mt-2 text-sm text-slate-500">
                Enter your email address and password.
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
                      autoComplete="username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      type="password"
                      className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-3.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
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
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
                </form>

                <p className="mt-4 text-right">
                  <Link
                    to="/forgot-password"
                    className="text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 transition hover:text-violet-700"
                  >
                    Forgot your password?
                  </Link>
                </p>

                <p className="mt-8 rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm text-slate-600 ring-1 ring-inset ring-blue-100">
                  Need to start a new verification?{" "}
                  <Link
                    to="/"
                    className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 transition hover:text-violet-700"
                  >
                    Enter your Candidate ID
                  </Link>
                </p>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}