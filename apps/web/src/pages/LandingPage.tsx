import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileCheck2, Hash, Lock, ShieldCheck } from "lucide-react";
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
      <div className="relative isolate overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div
          className="absolute -right-24 top-0 -z-10 h-80 w-80 rounded-full bg-blue-200/50 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -left-24 bottom-0 -z-10 h-80 w-80 rounded-full bg-violet-200/50 blur-3xl"
          aria-hidden="true"
        />

        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            {/* Intro */}
            <div>
              <div className="flex items-center gap-3">
              <img src="/logos/checkiq-icon.png" className="h-11 w-11 shrink-0" alt="CheckIQ" aria-hidden="true" />
              <span className="text-xl font-extrabold tracking-tight text-slate-900">CheckIQ</span>
            </div>

              <span className="mt-8 inline-flex items-center rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-inset ring-blue-100">
                Candidate verification portal
              </span>

              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
                Complete your
                <span className="block bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent">
                  background verification.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                Enter the Candidate ID issued to you, create your account and upload the
                documents required for verification. You will be able to track exactly what is
                outstanding at any point.
              </p>

              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-violet-500/25">
                    <Lock className="h-5 w-5" aria-hidden={true} />
                  </span>
                  <span className="text-sm leading-relaxed text-slate-600">
                    Your information is stored privately and is only visible to authorised verification staff.
                  </span>
                </li>
                <li className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md shadow-emerald-500/25">
                    <FileCheck2 className="h-5 w-5" aria-hidden={true} />
                  </span>
                  <span className="text-sm leading-relaxed text-slate-600">
                    If anything needs clarification, you will be told exactly what to provide.
                  </span>
                </li>
              </ul>
            </div>

            {/* Candidate ID card */}
            <div className="relative">
              <div
                className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-blue-200/60 to-violet-200/60 blur-2xl"
                aria-hidden="true"
              />
              <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-blue-200/60 ring-1 ring-slate-200">
                <div className="h-1.5 bg-gradient-to-r from-blue-600 to-violet-500" aria-hidden="true" />
                <div className="p-6 sm:p-8">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-500 text-white shadow-lg shadow-blue-500/30">
                    <ShieldCheck className="h-6 w-6" aria-hidden={true} />
                  </span>
                  <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900">
                    Enter your Candidate ID
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Your Candidate ID looks like{" "}
                    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono font-semibold text-blue-700">
                      CIQ-2026-000001
                    </span>
                    .
                  </p>

                  <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-800" htmlFor="candidateId">
                        Candidate ID
                      </label>
                      <div className="relative">
                        <Hash
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden={true}
                        />
                        <input
                          id="candidateId"
                          name="candidateId"
                          className="block w-full rounded-xl border-0 bg-slate-50 py-3 pl-10 pr-3.5 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:font-sans placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={candidateId}
                          onChange={(event) => setCandidateId(event.target.value)}
                          placeholder="CIQ-2026-000001"
                          autoComplete="off"
                          spellCheck={false}
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      Continue
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden={true}
                      />
                    </button>
                  </form>

                  <p className="mt-7 border-t border-slate-100 pt-5 text-sm text-slate-600">
                    Already registered?{" "}
                    <a
                      href="/login"
                      className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 transition hover:text-violet-700"
                    >
                      Sign in
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}