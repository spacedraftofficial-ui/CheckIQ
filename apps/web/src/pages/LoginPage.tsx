import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { homeRouteFor, useAuth } from "../lib/auth-context";
import { InlineError } from "../components/States";
import { AuthLayout } from "../components/Footer";

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
      <div className="relative isolate bg-gradient-to-br from-ink-50 via-brand-50 to-indigo-50">
        <div
          className="decorative-blob top-16 -right-8 h-40 w-40 bg-brand-200"
          aria-hidden="true"
        />
        <div
          className="decorative-blob bottom-20 -left-10 h-36 w-36 bg-indigo-200"
          aria-hidden="true"
        />
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12">
          <div className="surface-solid animate-fade-in-up">
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white shadow-lg shadow-brand-600/20">
                  C
                </span>
              </div>

              <h1 className="text-center text-2xl font-bold text-ink-900">Sign in</h1>
              <p className="mt-1 text-center text-sm text-ink-500">
                Enter your email address and password.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
                <div>
                  <label className="label" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="input-premium"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    className="input-premium"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>

                {error ? (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}
                <InlineError message={null} />

                <button type="submit" className="btn-primary w-full" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-ink-600">
                Need to start a new verification?{" "}
                <Link to="/" className="font-semibold text-brand-700 underline">
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
