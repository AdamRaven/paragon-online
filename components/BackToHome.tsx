import Link from "next/link";

/** A consistent "back to the landing page" link for the Arena/Campaign
 * pre-game screens, styled to match the landing page's look. */
export function BackToHome() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 font-section-label text-section-label uppercase tracking-widest text-on-surface-variant hover:text-mana-glow transition-colors"
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Back
    </Link>
  );
}
