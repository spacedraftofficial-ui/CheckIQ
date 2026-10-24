import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { request } from "../lib/api";
import { InlineError } from "../components/States";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenValue = token ?? null;
    void startVerification(tokenValue);

    async function startVerification(tokenVal: string | null) {
      if (!tokenVal) {
        setStatus("error");
        setError("Verification token is missing.");
        return;
      }

      setStatus("verifying");
      try {
        await request("/auth/verify-email", {
          method: "POST",
          body: { token: tokenVal },
          auth: false,
        });
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Verification failed.");
      }
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <div className="card p-6 sm:p-8 text-center">
          {status === "verifying" && (
            <>
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
              <p className="text-ink-600">Verifying your email address…</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-ink-900">Email verified!</h2>
              <p className="mt-2 text-sm text-ink-600">
                You can now sign in to your account.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-ink-900">Verification failed</h2>
              {error && <InlineError message={error} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
