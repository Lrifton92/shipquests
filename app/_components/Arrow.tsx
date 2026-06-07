// Single inline-SVG arrow used across buttons/links. Replaces unicode glyphs
// (↗ → ‹) which render inconsistently across fonts. Inherits color via
// currentColor so it follows the host button/link state (hover, etc.).
type Variant = "diag" | "right" | "left";

const PATHS: Record<Variant, string> = {
  // ↗ up-right diagonal (external / open)
  diag: "M8 16 16 8M9.5 8H16v6.5",
  // → straight right
  right: "M5 12h13m-5.5-5.5L18 12l-5.5 5.5",
  // ‹ back chevron (left)
  left: "M14.5 5.5 8 12l6.5 6.5",
};

export function Arrow({
  variant = "right",
  size = 15,
}: {
  variant?: Variant;
  size?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <path
        d={PATHS[variant]}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
