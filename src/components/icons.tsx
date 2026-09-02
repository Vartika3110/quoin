import type { SVGProps } from "react";

/**
 * One stroke system for the whole storefront: 24px grid, 1.5 stroke,
 * round caps, `currentColor`. Icons never carry their own colour — the
 * consuming component sets it, which is what lets the same icon render
 * the accent colour when active and muted when not.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Grid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

/**
 * Hard hat. The two ribs over the crown are what separate this from a
 * serving cloche at 24px — without them the silhouette is ambiguous.
 */
export const Helmet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 15.5a8 8 0 0 1 16 0" />
    <path d="M2.5 15.5h19a1 1 0 0 1 1 1v1a1.5 1.5 0 0 1-1.5 1.5h-18A1.5 1.5 0 0 1 1.5 17.5v-1a1 1 0 0 1 1-1z" />
    <path d="M9.5 15.5V8a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 8v7.5" />
    <path d="M11 6.5V5.2M13 6.5V5.2" />
  </Svg>
);

/** Stacked bricks: three-two-two, offset like real coursing. */
export const Bricks = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="15" width="6" height="5" rx="0.8" />
    <rect x="9" y="15" width="6" height="5" rx="0.8" />
    <rect x="15.5" y="15" width="6" height="5" rx="0.8" />
    <rect x="5.75" y="9.5" width="6" height="5" rx="0.8" />
    <rect x="12.25" y="9.5" width="6" height="5" rx="0.8" />
    <rect x="9" y="4" width="6" height="5" rx="0.8" />
  </Svg>
);

export const Crown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7l3.5 3L12 4l5.5 6L21 7l-1.8 11H4.8z" />
    <path d="M4.8 18h14.4" />
  </Svg>
);

export const Sofa = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" />
    <path d="M2 13a2 2 0 0 1 4 0v3h12v-3a2 2 0 0 1 4 0v5H2z" />
    <path d="M6 16h12" />
  </Svg>
);

export const Lamp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v3" />
    <path d="M5 14l7-8 7 8z" />
    <path d="M9.5 14a2.5 2.5 0 0 0 5 0" />
  </Svg>
);

export const Search = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const Mic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Svg>
);

export const Pin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);

export const Chevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
);

export const Wallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2" />
    <rect x="3" y="8" width="18" height="11" rx="2" />
    <circle cx="16.5" cy="13.5" r="1.25" />
  </Svg>
);

export const User = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </Svg>
);

export const Heart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20z" />
  </Svg>
);

export const Cart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.55L20.5 8H6" />
    <circle cx="10" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
  </Svg>
);

export const Home = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M10 20v-5h4v5" />
  </Svg>
);

export const Box = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 4 7v10l8 4 8-4V7z" />
    <path d="m4 7 8 4 8-4" />
    <path d="M12 11v10" />
  </Svg>
);

export const Headset = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="2" y="13" width="4" height="6" rx="1.5" />
    <rect x="18" y="13" width="4" height="6" rx="1.5" />
    <path d="M20 19a3 3 0 0 1-3 3h-2" />
  </Svg>
);

/** The Quoin monogram used in the bottom nav's Studio slot. */
export const QMark = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="m14.5 14.5 3 3" />
  </Svg>
);

export const Sparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9z" />
  </Svg>
);

export const Clock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const Truck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h11v9H3z" />
    <path d="M14 9h4l3 3v3h-7z" />
    <circle cx="7" cy="18" r="1.5" />
    <circle cx="17" cy="18" r="1.5" />
  </Svg>
);

export const Calendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

export const Ruler = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="8" width="20" height="8" rx="1.5" />
    <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
  </Svg>
);

export const Plus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Minus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const Check = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);

export const Info = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const Shield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.8-7 9.5-4.1-1.7-7-5.3-7-9.5V6z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const Back = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

/** Maps the `icon` string on a CatalogTab to its component. */
export const TAB_ICONS = {
  grid: Grid,
  helmet: Helmet,
  bricks: Bricks,
  crown: Crown,
  sofa: Sofa,
  lamp: Lamp,
} as const;

/** Tower block — the design-platform tile. Windows read at 24px; a plain
    outlined rectangle would be indistinguishable from a card icon. */
export const Building = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V6.5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13 6.5V21" />
    <path d="M13 21V11h5.5A1.5 1.5 0 0 1 20 12.5V21" />
    <path d="M2.5 21h19" />
    <path d="M6.5 9h1.5M9.5 9H11M6.5 12.5h1.5M9.5 12.5H11M6.5 16h1.5M9.5 16H11M16 14.5h1.5M16 18h1.5" />
  </Svg>
);

/** Screen with a play mark — video consultation. */
export const Video = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
    <path d="m10.5 8.5 4 2.5-4 2.5z" />
  </Svg>
);

/** Two figures — industry partners. */
export const Partners = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8.5" cy="8" r="3" />
    <path d="M2.5 19a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.8" />
    <path d="M17.5 13.6A6 6 0 0 1 21.5 19" />
  </Svg>
);

/** Price tag — the deals tab. */
export const Tag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 11.4V4.8a1.3 1.3 0 0 1 1.3-1.3h6.6a1.3 1.3 0 0 1 .92.38l8 8a1.3 1.3 0 0 1 0 1.84l-6.6 6.6a1.3 1.3 0 0 1-1.84 0l-8-8a1.3 1.3 0 0 1-.38-.92z" />
    <circle cx="7.75" cy="7.75" r="1.25" />
  </Svg>
);

/** Handset — the call back a consultation request earns. */
export const Phone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
  </Svg>
);

/** Tray with an arrow out — uploading a document. */
export const Upload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M3 14v4a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4" />
  </Svg>
);

/** Tap head and spout — bathware. */
export const Tap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 21h8" />
    <path d="M12 21v-7" />
    <path d="M5 14h14a7 7 0 0 0-14 0z" />
    <path d="M12 7V4.5A1.5 1.5 0 0 1 13.5 3H17" />
  </Svg>
);

/** Claw hammer — hardware and fittings. */
export const Hammer = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5 19 10l-2.5 2.5L12 8z" />
    <path d="M12 8 4.5 15.5a2.1 2.1 0 0 0 3 3L15 11" />
    <path d="M14.5 5.5a4 4 0 0 1 5 0" />
  </Svg>
);

/** Stacked boards — plywood and laminates. */
export const Boards = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 8.5 12 4l9.5 4.5L12 13z" />
    <path d="m2.5 12.5 9.5 4.5 9.5-4.5" />
    <path d="m2.5 16.5 9.5 4.5 9.5-4.5" />
  </Svg>
);
