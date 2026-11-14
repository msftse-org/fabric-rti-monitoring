export function LogoGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="6" fill="#0d2438" />
      <path d="M12 19v-7" stroke="#59d99b" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M12 12c0-3.2-2.2-5-5.5-5 0 3.2 2.2 5 5.5 5Z" fill="#59d99b" />
      <path d="M12 14c0-2.6 1.8-4.2 4.6-4.2 0 2.6-1.8 4.2-4.6 4.2Z" fill="#8be8bd" />
      <path d="M6 19.5h12" stroke="#59d99b" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoGlyph />
      <span className="wordmark__text">groundcover</span>
      <span className="wordmark__tag">mock</span>
    </span>
  );
}
