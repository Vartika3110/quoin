import type { Metadata, Viewport } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Quoin",
  },
};

export const viewport: Viewport = {
  /* Tints the browser chrome to match the ground the page is painted on.
     One value cannot serve both palettes, and #000000 served neither. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#16110e" },
  ],
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
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
