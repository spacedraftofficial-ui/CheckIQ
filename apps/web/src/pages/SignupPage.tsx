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

export function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signup } = useAuth();
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [emailForVerification, setEmailForVerification] = useState("");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

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
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">
            Your Candidate ID is used to identify your background verification case. It is not
            a password.
          </p>

          {duplicateMessage ? (
            <div
              className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
              role="alert"
            >
              <p className="font-semibold">We could not create this account</p>
              <p className="mt-1">{duplicateMessage}</p>
              <p className="mt-2">
                If you already have an account,{" "}
                <Link to="/login" className="font-semibold underline">
                  sign in instead
                </Link>
                .
              </p>
            </div>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <div>
              <label className="label" htmlFor="candidateId">
                Candidate ID
              </label>
              <input
                id="candidateId"
                className="input font-mono"
                autoComplete="off"
                spellCheck={false}
                aria-describedby={errors.candidateId ? "candidateId-error" : undefined}
                {...register("candidateId")}
              />
              <InlineError message={errors.candidateId?.message} />
            </div>

            <div>
              <label className="label" htmlFor="fullName">
                Full name
              </label>
              <input id="fullName" className="input" autoComplete="name" {...register("fullName")} />
              <InlineError message={errors.fullName?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  {...register("email")}
                />
                <InlineError message={errors.email?.message} />
              </div>
              <div>
                <label className="label" htmlFor="mobile">
                  Mobile number
                </label>
                <input
                  id="mobile"
                  type="tel"
                  className="input"
                  autoComplete="tel"
                  placeholder="+91 98123 45678"
                  {...register("mobile")}
                />
                <InlineError message={errors.mobile?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  {...register("password")}
                />
                <p className="hint">
                  At least 10 characters with upper and lower case, a digit and a symbol.
                </p>
                <InlineError message={errors.password?.message} />
              </div>
              <div>
                <label className="label" htmlFor="confirmPassword">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                />
                <InlineError message={errors.confirmPassword?.message} />
              </div>
            </div>

            <fieldset className="rounded-lg border border-ink-200 p-4">
              <legend className="px-1 text-sm font-semibold text-ink-700">
                Role details (optional)
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="company">
                    Company
                  </label>
                  <input id="company" className="input" {...register("company")} />
                </div>
                <div>
                  <label className="label" htmlFor="department">
                    Department
                  </label>
                  <input id="department" className="input" {...register("department")} />
                </div>
                <div>
                  <label className="label" htmlFor="position">
                    Position
                  </label>
                  <input id="position" className="input" {...register("position")} />
                </div>
              </div>
            </fieldset>

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating your account…" : "Create account"}
            </button>
          </form>

          {verificationSent ? (
            <div
              className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"
              role="status"
            >
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
                className="btn-secondary mt-2"
                disabled={resending}
                onClick={resendVerification}
              >
                {resending ? "Resending…" : "Resend verification email"}
              </button>
            </div>
          ) : null}

          {!verificationSent ? (
            <p className="mt-6 text-sm text-ink-600">
              Already registered?{" "}
              <Link to="/login" className="font-semibold text-brand-700 underline">
                Sign in
              </Link>
            </p>
          ) : (
            <p className="mt-6 text-sm text-ink-600">
              <Link to="/login" className="font-semibold text-brand-700 underline">
                Back to sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
