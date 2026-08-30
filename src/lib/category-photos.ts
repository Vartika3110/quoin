/**
 * Photographs for the category cards.
 *
 * Commissioned art, not catalogue stock: each frame is a styled group shot
 * of what the category actually contains, which is the thing a swatch
 * gradient could never say. They live in `public/categories/`, keyed by
 * the category slug.
 *
 * Every category has one today, so nothing currently falls through — but
 * `CategoryCards` still falls back to the generated swatches rather than
 * assuming a file exists, because a new category added to the database
 * tomorrow would otherwise render a broken image on the home page.
 *
 * Keyed by slug rather than position for the same reason `ENTRY_PHOTOS`
 * is: the home page shows `categories.slice(0, 4)`, and that ordering is
 * a database sort nobody here controls. Keying by index would hand
 * "Cement & steel" a picture of a bathroom the first time a merchandiser
 * changed `position`.
 */
export const CATEGORY_PHOTOS: Record<string, string> = {
  "bathware-plumbing": "/categories/bathware-plumbing.webp",
  "cement-steel": "/categories/cement-steel.webp",
  "electricals-lighting": "/categories/electricals-lighting.webp",
  "gypsum-false-ceiling": "/categories/gypsum-false-ceiling.webp",
  "hardware-locks": "/categories/hardware-locks.webp",
  "home-appliances-security": "/categories/home-appliances-security.webp",
  "kitchen-wardrobe-fittings": "/categories/kitchen-wardrobe-fittings.webp",
  "kitchen-sinks-faucets": "/categories/kitchen-sinks-faucets.webp",
  "paints-finishes": "/categories/paints-finishes.webp",
  "plywood-laminates": "/categories/plywood-laminates.webp",
  services: "/categories/services.webp",
  "tiling-adhesives": "/categories/tiling-adhesives.webp",
  "tools-safety": "/categories/tools-safety.webp",
  waterproofing: "/categories/waterproofing.webp",
};
