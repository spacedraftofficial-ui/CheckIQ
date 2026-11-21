import { Fragment } from "react";

/** The CheckIQ tagline, as on the brand sheet. */
export const TAGLINE_WORDS = ["Verify", "Validate", "Enable trust"] as const;
export const TAGLINE_TEXT = TAGLINE_WORDS.join(" | ");

type Tone = "light" | "dark";

/** "Check" in navy, "IQ" in brand blue — on dark backgrounds, white and sky. */
export function Wordmark({ tone = "light", className = "text-xl" }: { tone?: Tone; className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className={tone === "dark" ? "text-white" : "text-[#0b1530]"}>Check</span>
      <span
        className={
          tone === "dark"
            ? "text-sky-300"
            : "bg-gradient-to-r from-blue-700 to-sky-500 bg-clip-text text-transparent"
        }
      >
        IQ
      </span>
    </span>
  );
}

/** VERIFY | VALIDATE | ENABLE TRUST, with the brand's green dividers. */
export function Tagline({ tone = "light", className = "" }: { tone?: Tone; className?: string }) {
  return (
    <p
      className={`text-[0.7rem] font-medium uppercase tracking-[0.1em] sm:tracking-[0.18em] ${
        tone === "dark" ? "text-blue-100" : "text-slate-500"
      } ${className}`}
    >
      <span className="sr-only">{TAGLINE_TEXT}</span>
      <span aria-hidden="true">
        {TAGLINE_WORDS.map((word, index) => (
          <Fragment key={word}>
            {index > 0 && (
              <span className={`mx-1.5 sm:mx-2 ${tone === "dark" ? "text-emerald-300" : "text-emerald-500"}`}>|</span>
            )}
            <span className="whitespace-nowrap">{word}</span>
          </Fragment>
        ))}
      </span>
    </p>
  );
}

const ICON_SIZES = { sm: "h-8 w-8", md: "h-11 w-11", lg: "h-12 w-12" } as const;
const WORD_SIZES = { sm: "text-base", md: "text-xl", lg: "text-2xl" } as const;

/** Icon + wordmark, with the tagline underneath when asked. */
export function BrandLockup({
  size = "md",
  tone = "light",
  showTagline = false,
  className = "",
}: {
  size?: keyof typeof ICON_SIZES;
  tone?: Tone;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {tone === "dark" ? (
        // A blue shield on a blue panel disappears: sit it on a white tile, like the app icon.
        <span className={`${ICON_SIZES[size]} flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-md`}>
          <img src="/logos/checkiq-icon.png" className="h-full w-full" alt="" aria-hidden="true" />
        </span>
      ) : (
        <img src="/logos/checkiq-icon.png" className={`${ICON_SIZES[size]} shrink-0`} alt="" aria-hidden="true" />
      )}
      <div className="leading-tight">
        <Wordmark tone={tone} className={`block ${WORD_SIZES[size]}`} />
        {showTagline && <Tagline tone={tone} className="mt-1" />}
      </div>
    </div>
  );
}
