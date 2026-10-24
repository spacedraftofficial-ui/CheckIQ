import type { ReactNode } from "react";

export function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-ink-500 sm:px-6">
        CheckIQ — background verification. Candidate and verification data is handled
        as sensitive personal information.
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
    <div className="flex min-h-screen flex-col bg-ink-50">
      <div className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  );
}
