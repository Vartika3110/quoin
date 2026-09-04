import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Carries the wordmark and editorial headings only — never body copy. */
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quoin — Materials, Interiors & Expert Services",
  description:
    "Construction materials, premium interiors and verified expert services, delivered to your project.",
  manifest: "/manifest.webmanifest",
  /* iOS ignores the manifest entirely: installed appearance, the home
     screen icon and the status bar all come from these instead. */
  appleWebApp: {
    capable: true,
    /* `black-translucent` lets the page paint under the status bar, which
       is what makes an installed Quoin look like an app rather than a
       browser without its chrome. The safe-area insets the fixed bars use
       are what keep content out from under it. */
    statusBarStyle: "black-translucent",
    title: "Quoin",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  formatDetection: {
    /* Safari otherwise turns SKUs, PIN codes and quantities into blue
       "call this number" links, which on a catalogue of model codes is
       both wrong and unreadable. */
    telephone: false,
  },
};

export const viewport: Viewport = {
  /* Tints the browser chrome to match the ground the page is painted on.
     One value cannot serve both palettes, and #000000 served neither. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#14100d" },
  ],
  /* The page paints edge to edge and the fixed bars handle the insets
     themselves, which is the difference between an installed PWA that
     looks native and one with a white band under the home indicator. */
  viewportFit: "cover",
  /* The storefront is a fixed-chrome app shell, but zoom stays enabled to
     5x — disabling it outright fails WCAG 1.4.4. */
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cormorant.variable} h-full`}
      /* The script below sets data-theme before React hydrates, so the
         server's markup and the client's genuinely differ here — on
         purpose, and only on this element. */
      suppressHydrationWarning
    >
      <head>
        {/*
          Applies a saved theme before the first paint.

          The palette is CSS variables, so a class arriving after hydration
          repaints the page in front of the visitor — a white flash on
          every load for anyone who chose dark. This has to be inline and
          synchronous in the head to beat that, which is the one thing a
          component cannot do.

          Only an explicit choice is written here. With no attribute set,
          the stylesheet's prefers-color-scheme rule decides, so a visitor
          who has never chosen still gets the palette their device asked
          for and nothing has to run to give it to them.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("quoin-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
