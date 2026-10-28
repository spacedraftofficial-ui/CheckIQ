import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError, request } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type { SignupResponse } from "../lib/auth-context";
import { InlineError } from "../components/States";
import { AuthLayout } from "../components/Footer";
import { AlertCircle, Check, MailCheck, X } from "lucide-react";

const signupSchema = z
  .object({
    candidateId: z
      .string()
      .trim()
      .min(3, "Enter the Candidate ID issued to you")
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/, "Use letters, numbers, dot, underscore or hyphen only"),
    fullName: z.string().trim().min(2, "Enter your full name").max(160),
    email: z.email("Enter a valid email address"),
    mobile: z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,19}$/, "Enter a valid mobile number"),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(128)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/[0-9]/, "Include a digit")
      .regex(/[^A-Za-z0-9]/, "Include a symbol"),
    confirmPassword: z.string(),
    company: z.string().trim().max(160).optional(),
    department: z.string().trim().max(160).optional(),
    position: z.string().trim().max(160).optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "The passwords do not match",
    path: ["confirmPassword"],
  });

type SignupForm = z.infer<typeof signupSchema>;

/* ---------- shared look (visual only) ---------- */
const labelCls = "mb-1.5 block text-sm font-semibold text-slate-800";
const inputCls =
  "block w-full rounded-xl border-0 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition placeholder:text-slate-400 hover:bg-white hover:ring-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signup } = useAuth();
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [emailForVerification, setEmailForVerification] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");

  const passwordChecks = [
    { label: "At least 10 characters", passed: passwordValue.length >= 10 },
    { label: "Uppercase letter", passed: /[A-Z]/.test(passwordValue) },
    { label: "Lowercase letter", passed: /[a-z]/.test(passwordValue) },
    { label: "Digit", passed: /\d/.test(passwordValue) },
    { label: "Symbol", passed: /[^A-Za-z0-9]/.test(passwordValue) },
  ];

  const resendVerification = async () => {
    setResending(true);
    setResendMessage(null);
    try {
      await request("/auth/resend-verification", {
        method: "POST",
        body: { email: emailForVerification },
        auth: false,
      });
      setResendMessage("A new verification email has been sent.");
    } catch {
      setResendMessage("Could not send verification email. Please try again later.");
    } finally {
      setResending(false);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      candidateId: searchParams.get("candidateId") ?? "",
      company: searchParams.get("company") ?? "",
      department: searchParams.get("department") ?? "",
      position: searchParams.get("position") ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setDuplicateMessage(null);
    setVerificationSent(false);
    try {
      const response: SignupResponse | null = await signup(values);
      setEmailForVerification(values.email);
      if (response?.verificationCode) {
        sessionStorage.setItem("dev_verify_otp", response.verificationCode);
      }
      navigate("/verify-email", { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "CANDIDATE_ID_ALREADY_IN_USE") {
        setDuplicateMessage(error.message);
        return;
      }
      if (error instanceof ApiError) {
        setDuplicateMessage(error.message);
        return;
      }
      setDuplicateMessage("We could not complete your signup. Please try again.");
    }
  });

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

        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-blue-200/50 ring-1 ring-slate-200">
            <div className="h-1.5 bg-gradient-to-r from-blue-600 to-violet-500" aria-hidden="true" />
            <div className="p-6 sm:p-10">
              <div className="flex items-center gap-3">
                <img src="/logos/checkiq-icon.png" className="h-12 w-12 shrink-0" alt="CheckIQ" aria-hidden="true" />
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                    Create your account
                  </h1>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                Your Candidate ID is used to identify your background verification case. It is not
                a password.
              </p>

              {duplicateMessage ? (
                <div
                  className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">We could not create this account</p>
                    <p className="mt-1">{duplicateMessage}</p>
                    <p className="mt-2">
                      If you already have an account,{" "}
                      <Link to="/login" className="font-semibold text-blue-700 underline underline-offset-2">
                        sign in instead
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              ) : null}

              <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
                <div>
                  <label className={labelCls} htmlFor="candidateId">
                    Candidate ID
                  </label>
                  <input
                    id="candidateId"
                    className={inputCls + " font-mono"}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby={errors.candidateId ? "candidateId-error" : undefined}
                    {...register("candidateId")}
                  />
                  <InlineError message={errors.candidateId?.message} />
                </div>

                <div>
                  <label className={labelCls} htmlFor="fullName">
                    Full name
                  </label>
                  <input id="fullName" className={inputCls} autoComplete="name" {...register("fullName")} />
                  <InlineError message={errors.fullName?.message} />
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="email">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      className={inputCls}
                      autoComplete="email"
                      {...register("email")}
                    />
                    <InlineError message={errors.email?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="mobile">
                      Mobile number
                    </label>
                    <input
                      id="mobile"
                      type="tel"
                      className={inputCls}
                      autoComplete="tel"
                      placeholder="+91 98123 45678"
                      {...register("mobile")}
                    />
                    <InlineError message={errors.mobile?.message} />
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      className={inputCls}
                      autoComplete="new-password"
                      {...register("password")}
                      onChange={(e) => setPasswordValue(e.target.value)}
                    />
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      At least 10 characters with upper and lower case, a digit and a symbol.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                      {passwordChecks.map((check) => (
                        <div key={check.label} className="flex items-center gap-2 text-xs">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                              check.passed ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                            }`}
                          >
                            {check.passed ? (
                              <Check className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <X className="h-3 w-3" aria-hidden="true" />
                            )}
                          </span>
                          <span className={check.passed ? "font-medium text-emerald-700" : "text-slate-500"}>
                            {check.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <InlineError message={errors.password?.message} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="confirmPassword">
                      Confirm password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      className={inputCls}
                      autoComplete="new-password"
                      {...register("confirmPassword")}
                    />
                    <InlineError message={errors.confirmPassword?.message} />
                  </div>
                </div>

                <fieldset className="rounded-2xl bg-blue-50/50 p-4 ring-1 ring-inset ring-blue-100 sm:p-5">
                  <legend className="rounded-full bg-white px-3 py-0.5 text-sm font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                    Role details (optional)
                  </legend>
                  <div className="mt-1 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={labelCls} htmlFor="company">
                        Company
                      </label>
                      <input id="company" className={inputCls + " bg-white"} {...register("company")} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="department">
                        Department
                      </label>
                      <input id="department" className={inputCls + " bg-white"} {...register("department")} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="position">
                        Position
                      </label>
                      <input id="position" className={inputCls + " bg-white"} {...register("position")} />
                    </div>
                  </div>
                </fieldset>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-violet-600 hover:shadow-xl hover:shadow-blue-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating your account…" : "Create account"}
                </button>
              </form>

              {verificationSent ? (
                <div
                  className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                  role="status"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm">
                    <MailCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">Check your email</p>
                    <p className="mt-1">
                      A 6-digit verification code has been sent to your inbox. Enter the code to verify your
                      email address before signing in.
                    </p>
                    {resendMessage ? (
                      <p className={`mt-2 ${resendMessage.includes("sent") ? "text-emerald-700" : "text-amber-700"}`}>
                        {resendMessage}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-emerald-800 shadow-sm ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={resending}
                      onClick={resendVerification}
                    >
                      {resending ? "Resending…" : "Resend verification email"}
                    </button>
                  </div>
                </div>
              ) : null}

              {!verificationSent ? (
                <p className="mt-8 border-t border-slate-100 pt-5 text-sm text-slate-600">
                  Already registered?{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 transition hover:text-violet-700"
                  >
                    Sign in
                  </Link>
                </p>
              ) : (
                <p className="mt-8 border-t border-slate-100 pt-5 text-sm text-slate-600">
                  <Link
                    to="/login"
                    className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 transition hover:text-violet-700"
                  >
                    Back to sign in
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}