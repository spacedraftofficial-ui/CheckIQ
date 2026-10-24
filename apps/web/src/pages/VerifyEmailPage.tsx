import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CheckCircle, XCircle, Mail, RefreshCw } from "lucide-react";
import { request, ApiError } from "../lib/api";
import { InlineError } from "../components/States";
import { AuthLayout } from "../components/Footer";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-digit-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`otp-digit-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = code.join("");
    if (otpCode.length !== 6) return;

    setStatus("verifying");
    setError(null);
    try {
      await request("/auth/verify-email", {
        method: "POST",
        body: { code: otpCode },
        auth: false,
      });
      setStatus("success");
      sessionStorage.removeItem("dev_verify_otp");
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2500);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof ApiError
          ? err.message
          : "The verification code is incorrect or has expired.",
      );
      setCode(["", "", "", "", "", ""]);
      const firstInput = document.getElementById("otp-digit-0");
      firstInput?.focus();
    }
  };

  const handleResend = async () => {
    if (!resendEmail) return;
    setResending(true);
    setResendMessage(null);
    try {
      const result = await request<{ sent: boolean; message: string }>("/auth/resend-verification", {
        method: "POST",
        body: { email: resendEmail },
        auth: false,
      });
      setResendMessage(result.message);
      if (result.sent) {
        setResendEmail("");
      }
    } catch {
      setResendMessage("Could not send a verification email. Please try again later or contact support.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <div className="bg-gradient-to-br from-ink-50 to-brand-50">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12">
          <div className="card border border-ink-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6 justify-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                C
              </span>
              <span className="text-lg font-bold text-ink-900">CheckIQ</span>
            </div>

            <div className="text-center">
              {status === "verifying" && (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                    <RefreshCw className="h-6 w-6 animate-spin text-brand-600" aria-hidden={true} />
                  </div>
                  <h2 className="text-xl font-semibold text-ink-900">Verifying your code…</h2>
                  <p className="mt-2 text-sm text-ink-600">
                    Please wait while we confirm your verification code.
                  </p>
                </>
              )}

              {status === "success" && (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <CheckCircle className="h-7 w-7 text-emerald-600" aria-hidden={true} />
                  </div>
                  <h2 className="text-xl font-semibold text-ink-900">Email verified!</h2>
                  <p className="mt-2 text-sm text-ink-600">
                    Your email address has been confirmed. Redirecting you to the sign-in page…
                  </p>
                </>
              )}

              {status === "error" && (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <XCircle className="h-7 w-7 text-red-600" aria-hidden={true} />
                  </div>
                  <h2 className="text-xl font-semibold text-ink-900">Verification failed</h2>
                  {error && <InlineError message={error} />}
                </>
              )}

              {(status === "idle" || status === "error") && (
                <>
                  <h2 className="text-lg font-semibold text-ink-900">Enter your verification code</h2>
                  <p className="mt-2 text-sm text-ink-600">
                    We sent a 6-digit code to the email address you provided during signup.
                  </p>

                  <form
                    className="mt-6"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleVerify();
                    }}
                  >
                    <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
                      {code.map((digit, index) => (
                        <input
                          key={index}
                          id={`otp-digit-${index}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          className="h-12 w-10 rounded-lg border border-ink-300 bg-white text-center text-xl font-semibold text-ink-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                          value={digit}
                          onChange={(e) => handleCodeChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          autoComplete="one-time-code"
                        />
                      ))}
                    </div>

                    <button
                      type="submit"
                      className="btn-primary mt-6 w-full"
                      disabled={code.join("").length !== 6}
                    >
                      Verify
                    </button>
                  </form>
                </>
              )}
            </div>

            {(status !== "success") && (
              <div className="mt-6 space-y-4">
                <p className="text-center text-sm text-ink-600">
                  Didn't receive the code? Enter your email to get a new one.
                </p>
                <div>
                  <label className="label" htmlFor="resend-email">
                    Email address
                  </label>
                  <input
                    id="resend-email"
                    type="email"
                    className="input"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary w-full"
                  disabled={resending || !resendEmail}
                  onClick={handleResend}
                >
                  {resending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden={true} />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" aria-hidden={true} />
                      Resend verification code
                    </>
                  )}
                </button>
                {resendMessage && (
                  <p
                    className={`text-center text-sm ${
                      resendMessage.toLowerCase().includes("sent") ||
                      resendMessage.toLowerCase().includes("exists") ||
                      resendMessage.toLowerCase().includes("already")
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {resendMessage}
                  </p>
                )}
              </div>
            )}

            {(status === "success" || status === "error") && (
              <div className="mt-6 border-t border-ink-200 pt-4 text-center">
                <Link
                  to="/login"
                  className="text-sm font-semibold text-brand-700 underline hover:text-brand-800"
                >
                  Back to sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
