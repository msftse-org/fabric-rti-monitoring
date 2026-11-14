export function LogoGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false">
      <circle cx="14" cy="14" r="11" fill="none" stroke="var(--accent-bright)" strokeWidth="4" />
      <circle cx="14" cy="14" r="4" fill="var(--accent-bright)" />
    </svg>
  );
}
