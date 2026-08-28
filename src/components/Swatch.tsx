/**
 * Stand-in product imagery.
 *
 * Real photography will replace this wholesale — the contract is just
 * `key` in, filled box out — but until then a flat grey box makes the
 * whole grid read as broken. These are deterministic per key so the
 * catalogue looks composed rather than randomised.
 *
 * Tuned for the warm light storefront: pale grounds that sit on a white
 * card without turning the grid into a wall of dark rectangles. Every
 * imported product falls back to `cement`, so that one carries most of
 * the page and is the most neutral of the set.
 */

type SwatchKey =
  | "marble"
  | "paint"
  | "pendant"
  | "helmet"
  | "cement"
  | "steel"
  | "brick"
  | "switch"
  | "bulb"
  | "basin"
  | "faucet"
  | "sofa"
  | "rug";

const TONE: Record<SwatchKey, [string, string]> = {
  marble: ["#f5f3ef", "#d9d4cb"],
  paint: ["#e0e5ef", "#b4bdcd"],
  pendant: ["#f0e8dc", "#ccbaa0"],
  helmet: ["#fbe7ca", "#e4bf85"],
  cement: ["#efebe5", "#d0c9c0"],
  steel: ["#e9ebed", "#c3c8cd"],
  brick: ["#f0d4c5", "#d09677"],
  switch: ["#f4f2ee", "#d4d0c9"],
  bulb: ["#fbefd2", "#e3c58b"],
  basin: ["#f3f2ef", "#d5d2cc"],
  faucet: ["#eaedef", "#c4cacf"],
  sofa: ["#eaddca", "#c5a989"],
  rug: ["#eedccc", "#caa687"],
};

export function Swatch({
  swatchKey,
  className = "",
  label,
}: {
  swatchKey: string;
  className?: string;
  /** Announced to screen readers in place of the missing photograph. */
  label: string;
}) {
  const key = (swatchKey in TONE ? swatchKey : "cement") as SwatchKey;
  const [from, to] = TONE[key];
  const gid = `sw-${key}`;

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${gid})`} />
      <Motif kind={key} />
    </svg>
  );
}

/** Per-material line work drawn over the gradient. */
function Motif({ kind }: { kind: SwatchKey }) {
  const ink = "rgba(63,42,28,0.22)";
  const light = "rgba(255,255,255,0.65)";

  switch (kind) {
    case "marble":
      return (
        <g stroke={ink} fill="none" strokeLinecap="round">
          <path d="M-5 34c22 6 30-10 52-4s34 20 78 10" strokeWidth="1.6" />
          <path d="M-5 62c26 10 36-8 60 2s30 16 70 8" strokeWidth="1" opacity=".7" />
          <path d="M10 96c18-8 28 6 44-2s26-14 48-6" strokeWidth="1.2" opacity=".55" />
          <path d="M40 0c6 16-8 22 0 38" strokeWidth=".8" opacity=".5" />
        </g>
      );
    case "paint":
      return (
        <g>
          <rect x="34" y="44" width="52" height="52" rx="4" fill={light} opacity=".55" />
          <rect x="34" y="44" width="52" height="13" fill="#c8a45c" opacity=".85" />
          <path d="M40 44a20 12 0 0 1 40 0" fill="none" stroke={light} strokeWidth="2.5" />
          <rect x="44" y="64" width="32" height="22" rx="2" fill="#0b0b0b" opacity=".35" />
        </g>
      );
    case "pendant":
      return (
        <g>
          <path d="M60 8v26" stroke={light} strokeWidth="1.5" />
          <path d="M34 74c0-16 12-28 26-28s26 12 26 28z" fill="#0a0a0a" opacity=".75" />
          <rect x="34" y="72" width="52" height="5" rx="2.5" fill="#c8a45c" />
          <ellipse cx="60" cy="86" rx="15" ry="7" fill="#c8a45c" opacity=".35" />
        </g>
      );
    case "helmet":
      return (
        <g fill="none" stroke="#e8c98a" strokeWidth="2.5" strokeLinecap="round">
          <path d="M28 68a32 32 0 0 1 64 0" />
          <path d="M22 68h76v6a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" />
          {/* Crown ribs — without them the dome reads as a serving cloche. */}
          <path d="M50 68V40a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v28" />
          <path d="M56 35v-5M64 35v-5" />
        </g>
      );
    case "bulb":
      return (
        <g fill="none" stroke={light} strokeWidth="2.5">
          <circle cx="60" cy="52" r="20" />
          <path d="M52 76h16M54 84h12" />
        </g>
      );
    case "basin":
      return (
        <g>
          <ellipse cx="60" cy="64" rx="38" ry="16" fill={light} opacity=".7" />
          <path d="M22 64c0 14 17 24 38 24s38-10 38-24" fill="none" stroke={ink} strokeWidth="2" />
        </g>
      );
    case "faucet":
      return (
        <g fill="none" stroke={light} strokeWidth="4" strokeLinecap="round">
          <path d="M44 92V52a16 16 0 0 1 32 0v12" />
          <path d="M32 92h24" />
        </g>
      );
    case "brick":
      return (
        <g stroke={ink} strokeWidth="1.5" fill="none">
          {[26, 50, 74, 98].map((y, i) => (
            <g key={y}>
              <path d={`M0 ${y}h120`} />
              <path d={`M${i % 2 ? 20 : 44} ${y}v-24`} />
              <path d={`M${i % 2 ? 76 : 100} ${y}v-24`} />
            </g>
          ))}
        </g>
      );
    case "steel":
      return (
        <g stroke={light} strokeWidth="2" fill="none">
          {[30, 46, 62, 78].map((y) => (
            <path key={y} d={`M12 ${y}h96`} />
          ))}
        </g>
      );
    case "switch":
      return (
        <g>
          <rect x="36" y="28" width="48" height="64" rx="6" fill={light} opacity=".8" />
          <rect x="50" y="44" width="20" height="32" rx="3" fill={ink} opacity=".5" />
        </g>
      );
    case "rug":
      return (
        <g stroke={light} strokeWidth="1.5" fill="none" opacity=".6">
          <rect x="16" y="28" width="88" height="64" rx="3" />
          <rect x="26" y="38" width="68" height="44" rx="2" />
          <path d="M36 48h48M36 60h48M36 72h48" />
        </g>
      );
    case "sofa":
      return (
        <g fill={light} opacity=".65">
          <rect x="22" y="52" width="76" height="20" rx="6" />
          <rect x="16" y="62" width="14" height="24" rx="6" />
          <rect x="90" y="62" width="14" height="24" rx="6" />
          <rect x="28" y="70" width="64" height="16" rx="4" />
        </g>
      );
    default:
      return (
        <g fill={light} opacity=".5">
          <rect x="30" y="40" width="60" height="44" rx="4" />
          <path d="M30 56h60" stroke={ink} strokeWidth="1.5" />
        </g>
      );
  }
}
