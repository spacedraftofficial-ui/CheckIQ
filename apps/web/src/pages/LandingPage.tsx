import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AuthLayout } from "../components/Footer";

/**
 * The landing screen.
 *
 * The candidate enters a Candidate ID and continues. Nothing about the ID is
 * validated here — the server decides whether it can be registered, and a
 * duplicate is reported clearly during signup.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const [candidateId, setCandidateId] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = candidateId.trim();
    if (!trimmed) return;
    navigate(`/signup?candidateId=${encodeURIComponent(trimmed)}`);
  };

  return (
    <AuthLayout>
      <div className="relative isolate mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center px-4 py-12 sm:px-6">
        <div
          className="decorative-blob top-8 -left-6 h-32 w-32 bg-brand-200"
          aria-hidden="true"
        />
        <div
          className="decorative-blob bottom-12 right-4 h-28 w-28 bg-indigo-200"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="hero-overlay" aria-hidden="true" />
        </div>

        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-lg shadow-brand-600/20">
                C
              </span>
              <span className="text-xl font-bold text-ink-900">CheckIQ</span>
            </div>

            <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Complete your background verification
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink-600">
              Enter the Candidate ID issued to you, create your account and upload the
              documents required for verification. You will be able to track exactly what is
              outstanding at any point.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-ink-600">
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden={true} />
                <span>Your information is stored privately and is only visible to authorised verification staff.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden={true} />
                <span>If anything needs clarification, you will be told exactly what to provide.</span>
              </li>
            </ul>
          </div>

          <div className="surface-solid animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <div className="p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-ink-900">Enter your Candidate ID</h2>
              <p className="mt-1 text-sm text-ink-500">
                Your Candidate ID looks like <span className="font-mono">CIQ-2026-000001</span>.
              </p>

              <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="label" htmlFor="candidateId">
                    Candidate ID
                  </label>
                  <input
                    id="candidateId"
                    name="candidateId"
                    className="input-premium"
                    value={candidateId}
                    onChange={(event) => setCandidateId(event.target.value)}
                    placeholder="CIQ-2026-000001"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary w-full">
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden={true} />
                </button>
              </form>

              <p className="mt-6 border-t border-ink-200 pt-4 text-sm text-ink-600">
                Already registered?{" "}
                <a href="/login" className="font-semibold text-brand-700 underline">
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
