import type { ReactNode } from "react";
import { clsx } from "clsx";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

/** Consistent loading, empty, success and failure states. */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-600" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="card p-8">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="h-8 w-8 text-ink-400" aria-hidden="true" />
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-500">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="card flex flex-col items-start gap-2 border-red-200 bg-red-50 p-6"
      role="alert"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        {title}
      </div>
      {message ? <p className="text-sm text-red-700">{message}</p> : null}
      {onRetry ? (
        <button type="button" className="btn-secondary mt-2" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="error-text" role="alert">
      {message}
    </p>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-ink-100 text-ink-700",
    info: "bg-brand-100 text-brand-800",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-900",
    danger: "bg-red-100 text-red-800",
  };
  return <span className={clsx("badge", tones[tone])}>{children}</span>;
}
