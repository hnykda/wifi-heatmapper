/**
 * The mark: a survey point with two signal arcs, drawn in the current text
 * colour so it works on both themes. The dot picks up the brand colour.
 */
export function BrandMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 12.5a9 9 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 16a4.5 4.5 0 0 1 8 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="19.5" r="2" fill="hsl(var(--brand))" />
    </svg>
  );
}
