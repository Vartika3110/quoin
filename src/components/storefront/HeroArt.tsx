/**
 * The hero illustration.
 *
 * Drawn rather than sourced. The reference carries a photograph of a
 * building under renovation, and the honest options for a real one are
 * Quoin's own photography or a licensed image — a competitor's or a
 * stock site's picture is not Quoin's to publish. This is original work
 * in the brand palette, and it occupies the same box a photograph will,
 * so swapping one in later costs no layout.
 *
 * Decorative: hidden from assistive technology, since the headline beside
 * it already says what the section is.
 */
export function HeroArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 260"
      className={className}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="qa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6e7d4" />
          <stop offset="100%" stopColor="#eed9be" />
        </linearGradient>
        <linearGradient id="qa-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fdfaf6" />
          <stop offset="100%" stopColor="#e9dcc9" />
        </linearGradient>
        <linearGradient id="qa-face-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d9c6ac" />
          <stop offset="100%" stopColor="#c4ad8f" />
        </linearGradient>
        <linearGradient id="qa-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7c98a" />
          <stop offset="100%" stopColor="#e9a45e" />
        </linearGradient>
      </defs>

      <rect width="320" height="260" fill="url(#qa-sky)" />

      {/* Sun, low and warm — the palette's own accent, dimmed right down. */}
      <circle cx="248" cy="58" r="26" fill="#f3b878" opacity="0.35" />

      {/* Back block, pushed away by lower contrast rather than by blur. */}
      <g opacity="0.55">
        <rect x="18" y="96" width="66" height="164" rx="3" fill="#d9c6ac" />
        {[0, 1, 2, 3, 4].map((r) =>
          [0, 1, 2].map((c) => (
            <rect
              key={`b-${r}-${c}`}
              x={27 + c * 18}
              y={107 + r * 26}
              width="11"
              height="15"
              rx="1.5"
              fill="#f2e6d5"
            />
          )),
        )}
      </g>

      {/* Main tower */}
      <rect x="92" y="52" width="132" height="208" rx="4" fill="url(#qa-face)" />
      <rect x="224" y="66" width="30" height="194" rx="3" fill="url(#qa-face-side)" />

      {/* Balcony bands. The slabs are what read as "building" at this size —
          windows alone look like a spreadsheet. */}
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <g key={`f-${r}`}>
          <rect
            x="92"
            y={78 + r * 30}
            width="132"
            height="4"
            fill="#c9b193"
            opacity="0.7"
          />
          {[0, 1, 2, 3].map((c) => (
            <rect
              key={`w-${r}-${c}`}
              x={102 + c * 30}
              y={86 + r * 30}
              width="20"
              height="17"
              rx="2"
              fill={r === 1 && c === 2 ? "url(#qa-glow)" : r === 3 && c === 0 ? "url(#qa-glow)" : "#e7d9c4"}
            />
          ))}
        </g>
      ))}

      {/* Scaffolding — the "under renovation" half of the promise. */}
      <g stroke="#b08a5e" strokeWidth="2.5" strokeLinecap="round" opacity="0.9">
        <path d="M88 60v200M148 60v200M208 60v200" />
        <path d="M84 96h128M84 156h128M84 216h128" />
      </g>
      <g stroke="#c9a271" strokeWidth="1.6" opacity="0.75">
        <path d="M88 96l60 60M148 156l60 60M148 96l60 60M88 156l60 60" />
      </g>

      {/* Safety mesh over the lower bays */}
      <rect
        x="88"
        y="156"
        width="120"
        height="60"
        fill="#e08b4a"
        opacity="0.12"
      />

      {/* Ground line and planting */}
      <rect x="0" y="248" width="320" height="12" fill="#cbb392" opacity="0.6" />
      <g fill="#a8845c" opacity="0.55">
        <ellipse cx="272" cy="240" rx="16" ry="20" />
        <rect x="270" y="238" width="3" height="14" />
        <ellipse cx="40" cy="246" rx="12" ry="15" />
        <rect x="38.5" y="244" width="2.5" height="10" />
      </g>
    </svg>
  );
}
