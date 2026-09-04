"use client";

/**
 * The last resort.
 *
 * Replaces the root layout entirely, which is why it renders its own
 * `<html>` and `<body>` and cannot use anything from the design system:
 * if this is showing, the layout that loads the stylesheet did not render.
 * So the styles here are inline, deliberately, and the palette is
 * hard-coded to the light ground rather than read from a token that may
 * never have been defined.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#faf7f3",
          color: "#241610",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "26rem", textAlign: "center" }}>
          <p
            style={{
              fontSize: "1.5rem",
              letterSpacing: "0.18em",
              margin: "0 0 1.5rem",
            }}
          >
            QUOIN
          </p>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
            Something went wrong.
          </h1>
          <p style={{ margin: "0 0 1.5rem", color: "#6f5749", lineHeight: 1.6 }}>
            The page could not be loaded at all. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              background: "#d95d24",
              color: "#fff",
              border: 0,
              borderRadius: "0.625rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.6875rem", color: "#9c8878" }}>
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
