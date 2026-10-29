import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200/80 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <div className="flex items-center gap-2.5">
          <img src="/logos/checkiq-icon.png" className="h-7 w-7 shrink-0" alt="CheckIQ" aria-hidden="true" />
          <span className="text-sm font-bold tracking-tight text-slate-900">CheckIQ</span>
          <span className="text-xs text-slate-500">background verification</span>
        </div>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500 sm:items-center">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500 sm:mt-0" aria-hidden="true" />
          <span>Candidate and verification data is handled as sensitive personal information.</span>
        </p>
      </div>
    </footer>
  );
}

/**
 * Layout that gives auth pages (Landing, Login, Signup, VerifyEmail) a
 * sticky footer so the footer text is always visible and consistent across
 * the entire application, not just authenticated routes.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  );
}