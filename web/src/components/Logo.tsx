// LUTE mark — recreated as inline SVG from the mockups (not a redrawn brand). The block
// uses the current text color so it inverts with the theme; a green corner carries the
// AI-Green accent. Optional wordmark + tagline.

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" role="img">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeOpacity="0.18" />
      {/* bold "L" block */}
      <path d="M9 7h5.4v11.6H23V24H9V7Z" fill="currentColor" />
      {/* AI-green corner accent */}
      <path d="M9 7h5.4v5.4H9V7Z" fill="var(--accent-fill)" />
    </svg>
  );
}

export function Logo({ withTagline = true, size = 30 }: { withTagline?: boolean; size?: number }) {
  return (
    <span className="logo" aria-label="Lute">
      <LogoMark size={size} />
      <span className="logo__text">
        <span className="logo__word">Lute</span>
        {withTagline && <span className="logo__tag">Build Trusted AI</span>}
      </span>
    </span>
  );
}
