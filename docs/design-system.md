# The Quoin design system

Everything visual in the storefront comes from one place: the tokens in
[`src/app/globals.css`](../src/app/globals.css) and the primitives in
[`src/components/ui/`](../src/components/ui). If a page sets a colour, a
radius or a shadow by hand, that is a bug — it is how two screens start
disagreeing about what a "card" is.

## Tokens

`globals.css` is ordered: palette → scale → theme map → base → utilities.
Only the palette section holds raw values; everything else refers to it.

### Colour

Three families, and no more. A fourth is how a design system starts
looking like a template.

| Family | Token prefix | What it means |
| --- | --- | --- |
| Terracotta | `accent` | "Act on this." Prices, primary CTAs, active states |
| Espresso | `deep` | Dark bands, scrims, secondary CTAs |
| Gold | `pro` | Quoin Pro, and nothing else, ever |

Plus a neutral ramp (`bg`, `sunk`, `surface`, `raised`, `hover`, `active`),
four type steps (`ink`, `muted`, `faint`, and the `on-*` pairs), four line
weights (`line-hair` → `line-strong`) and the status colours.

Two tokens exist for reasons that are not obvious:

- **`photo` / `photo-edge`.** Catalogue imagery is cut out on white, so the
  plate behind a product photograph is white in *both* palettes. Painting
  it with `surface` puts a glowing white rectangle inside a dark card.
- **`tile-1` … `tile-4`.** Flat tints, not gradients. Four gradients on the
  first screen reads as decoration.

Every palette value is declared three times — `:root`, `[data-theme="dark"]`
and the `prefers-color-scheme` media query — so an explicit choice always
beats the device and a visitor who has never chosen still gets the right
one. A colour defined only inside the dark block is a colour that does not
exist in light mode.

### Type

The scale is **semantic, not numeric**: `text-title` survives a decision to
make titles 22px, `text-xl` does not.

```
micro 11 · caption 12 · body-sm 13 · body 14 · body-lg 16
title-sm 17 · title 20 · title-lg 24
headline 28 · headline-lg 34
display-sm 40 · display 52 · display-lg 64
eyebrow 11, uppercase, +0.1em
```

Tailwind's own numeric sizes are left intact underneath for the rare
genuinely one-off measurement. `.nums` opts a block into tabular figures —
use it on anything that has to line up down a column: prices, quantities,
budgets, SKUs.

### Radius, elevation, motion

- **Radius.** `--radius-card` (12px) is the workhorse. `full` is for
  avatars, counters and genuinely round controls.
- **Elevation.** Five steps, each with a job: `xs` chips, `sm` resting
  cards, `md` card hover, `lg` popovers, `xl` drawers and modals. These
  override Tailwind's defaults on purpose — two shadow systems in one
  product is how shadows start looking cheap.
- **Motion.** Two curves: `ease-out-quart` for anything appearing,
  `ease-spring` for drawers and sheets. Durations are `--dur-fast` (150ms)
  through `--dur-slower` (480ms). Everything animated is decoration over a
  state change that already happened, so `prefers-reduced-motion` removes
  it all and nothing is lost.

## Primitives

| Component | Notes |
| --- | --- |
| `Button` | Seven variants, six sizes. Renders `<a>` when given `href` so a link that looks like a button is still a link |
| `Card` / `CardLink` | Five tones; `interactive` only when the whole card is one target |
| `Badge` / `Counter` / `Eyebrow` | Tones carry meaning, not decoration |
| `Input` / `Field` / `Select` / `Textarea` / `CheckRow` | 44px tall, 16px text on phones (iOS zooms anything smaller) |
| `Drawer` | Right panel, bottom sheet, or `responsive` — one component, because a filter panel on desktop and on a phone is the same object |
| `Modal` | Shares the drawer's keyboard contract: Escape, focus trap, focus return, page lock |
| `Toast` | Live region mounted once and permanently — a region inserted *with* its content announces nothing |
| `Tabs` | Real ARIA tabs: arrows move, Tab does not |
| `Accordion` | `<details>`/`<summary>`, so in-page find still expands it |
| `Skeleton` | Every skeleton mirrors a real component's measurements |
| `EmptyState` / `ErrorState` | "Nothing here yet" and "something broke" are opposite messages and stay separate components |
| `Progress` / `Steps` / `Rating` / `Stat` / `Breadcrumb` / `Tooltip` / `Spinner` | |

`Placeholder` is a fourth state again: "we have not built this". It is a
page to delete, not a page to keep.

## Layout

`AppShell` is a sticky header, one centred column capped at
`--container-shell` (1400px), a footer and — under `lg` — a fixed tab bar.
Section primitives in `ui/Section.tsx` own the gutter rule (`px-5 lg:px-0`)
and the vertical rhythm, so pages never restate either.

## Mobile

The phone is not the desktop layout shrunk. Where the two genuinely differ,
both trees are in the DOM and swapped with CSS, so the server renders once
and nothing reflows at hydration:

- **Categories** — a two-row rail of 76px thumbnails on a phone, six
  photographic tiles from `lg`.
- **Quick actions** — a four-across launcher row, growing a description
  line from `sm`.
- **Product actions** — `Add` becomes a `−/qty/+` stepper in place, on the
  same footprint, so the second unit is one tap.
- **Sticky bars** — `StickyBar` pins a page's action above the tab bar;
  `CartBar` floats the basket total and stands down whenever a page mounts
  its own. Offsets use `env(safe-area-inset-bottom)`.
- **Sheets** — filters and sort open as bottom sheets under `lg` and as a
  sidebar and popover above it.

> **The `calc()` trap.** Tailwind forbids literal spaces inside `[...]`,
> and `calc()` *requires* whitespace around `+`. Write `_` for the space:
> `bottom-[max(3.75rem,calc(3.25rem_+_env(safe-area-inset-bottom)))]`.
> Without it the declaration is invalid, the browser drops it silently, and
> the bar sits on top of the tab bar. It did.

## Client state

`src/lib/store/` holds the cart, wishlist, projects and recently-viewed —
all browser-local until accounts own them, all shaped so that is an
implementation change rather than a rewrite.

They are built on `useSyncExternalStore` via `createPersistentStore`, not
`useState` plus an effect. That avoids a cascading render on every mount,
gives cross-tab sync for free, and satisfies React 19's
`set-state-in-effect` rule. `useHydrated()` is the matching primitive for
"has the client taken over yet".

## What the system deliberately does not draw

There is no data behind these, so no component invents one:

- **Star ratings.** `Rating` renders nothing when `value` is null.
- **Review counts and reviewer names.**
- **Professional profiles** on service pages.
- **Discount flashes** unless the sell price is genuinely under MRP.
- **Order history** — there is no `Order` table yet.

A fabricated number next to a real catalogue does not add polish. It makes
every other number on the page suspect.
