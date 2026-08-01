import type { SVGProps } from "react";

/**
 * One stroke system for the whole storefront: 24px grid, 1.5 stroke,
 * round caps, `currentColor`. Icons never carry their own colour — the
 * consuming component sets it, which is what lets the same icon render
 * gold when active and muted when not.
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

/** Maps the `icon` string on a CatalogTab to its component. */
export const TAB_ICONS = {
  grid: Grid,
  helmet: Helmet,
  bricks: Bricks,
  crown: Crown,
  sofa: Sofa,
  lamp: Lamp,
} as const;
