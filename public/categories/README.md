# Category photography

Commissioned group shots, one per category, keyed by slug and wired up in
`src/lib/category-photos.ts`.

Derived from the delivered masters with:

    sharp(source)
      .resize(600, 450, { fit: "cover", position: "centre" })   // 4:3
      .webp({ quality: 82 })

`bathware-plumbing` was additionally cropped to the top 1131px of its
1254px master first, to remove a burnt-in "Bathware & plumbing" caption —
the card renders that title itself, so the two collided.

No build script: the masters are not in this repo, so anything here would
only run on the machine that happened to hold them. Re-cut by hand with the
settings above if a master is replaced.

`waterproofing`, `tiling-adhesives`, `plywood-laminates`, `paints-finishes`
and `cement-steel` were replaced with owner-supplied renders (1536x1024
masters, cut to 4:3 with the settings above). They are generated pictures
of product groups, not photographs of catalogue SKUs, and they show
third-party brand marks — keep them to category cards, never a product page.
