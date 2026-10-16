import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import { AppProviders } from "@/components/providers/AppProviders";
import { getSession } from "@/lib/auth/session";
import { siteOrigin } from "@/lib/env";
import "./globals.css";

/**
 * Three families, and the reason each one is here.
 *
 * All three are variable fonts loaded without a `weight` list, so one
 * file per family covers every weight the app uses. Asking for four
 * static cuts instead would be four requests and four times the bytes
 * for the same result.
 */

/**
 * Everything a customer reads.
 *
 * IBM Plex Sans, which replaced Plus Jakarta Sans. Jakarta is a good face
 * and a fashionable one — it is on the short list of geometric sans
 * every product launched in the last three years reaches for, which is
 * part of why this storefront was read as generated rather than built.
 *
 * Plex was drawn for an engineering company and reads like it: a little
 * squarer, a little more mechanical, and far better at the two things
 * this catalogue does constantly — a SKU at 11px staying legible, and a
 * column of rupee figures lining up, which it does properly because the
 * numerals are tabular by design rather than by an opentype flag nobody
 * remembers to set.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  /* Plex is static on Google Fonts, not variable, so the weights have to
     be named. Four, matching what the type scale actually uses — body,
     medium, semibold, bold. A fifth would be bytes nothing renders. */
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/**
 * The display face: the wordmark, the hero and every section heading.
 *
 * **Fraunces, again.** It was here, was replaced by Plex's own serif on
 * the argument that a magazine serif on every section heading makes a
 * storefront read as a landing page rather than a place to buy a bag of
 * cement, and is now back at the owner's instruction, because it is
 * what the design reference sets. That argument was a good one and it
 * lost to a simpler fact: the reference *is* the brand the owner wants,
 * and a near-match reads as a mistake beside it.
 *
 * Loaded as the variable font rather than at named weights. Fraunces
 * carries a `wght` axis and `next/font` ships the whole range in one
 * file, so 400 through 700 costs what a single static weight would
 * have, and the type scale can use any of them. Italic is a separate
 * file and is requested because the hero's standfirst is set in it.
 *
 * Its other axes — the ones actually named SOFT and WONK — are left at
 * their defaults. Plainly set is the point: the reference's headings
 * are a serif, not a performance.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  /* Open Graph images and canonical links are written as paths on the
     pages that set them; this is what turns those into absolute URLs.
     Without it Next falls back to localhost, and a shared link previews a
     picture only the author's machine can load. */
  metadataBase: siteOrigin(),
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
    { media: "(prefers-color-scheme: light)", color: "#f7f1e6" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a08" },
  ],
  /* The page paints edge to edge and the fixed bars handle the insets
     themselves, which is the difference between an installed PWA that
     looks native and one with a white band under the home indicator. */
  viewportFit: "cover",
  /* The storefront is a fixed-chrome app shell, but zoom stays enabled to
     5x — disabling it outright fails WCAG 1.4.4. */
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* Read once, here, and handed to `AppProviders`. The session cookie is
     httpOnly, so the browser cannot see it — without this the projects
     store had to ask the server on every page just to be told it was
     signed out. Every route in this app is already dynamic, so reading a
     cookie in the root layout costs no prerendering. */
  const isSignedIn = Boolean(await getSession());
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${fraunces.variable} h-full`}
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
        {/*
          `next/script` with `beforeInteractive`, not a bare `<script>`.

          A raw script tag inside a component is only ever executed when
          the server rendered it. React says so itself, and says it in the
          console every time this subtree is rendered on the client
          instead — which happens on an error boundary's fallback, so the
          warning arrives attached to whatever actually went wrong and
          reads like a second fault.

          `beforeInteractive` is the one strategy Next guarantees runs in
          the document head before hydration, which is exactly the
          contract this needs: it has to beat the first paint or the flash
          it exists to prevent happens anyway.
        */}
        <Script id="quoin-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("quoin-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <AppProviders isSignedIn={isSignedIn}>{children}</AppProviders>
      </body>
    </html>
  );
}
