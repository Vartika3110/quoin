import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Photography pulled out of manufacturer catalogues, not yet attached to
 * anything.
 *
 * Most manufacturers do not publish a priced grid with one photograph per
 * code — Häfele lists five finish article numbers against a table row,
 * Simonswerk outlines its text as artwork. So these arrive knowing only
 * which page they came from, and a person decides what each one is.
 *
 * They live outside `public/` on purpose. An unattached image is not
 * something the storefront should serve; it becomes public at the moment
 * someone assigns it to a product, and not before.
 */
const HARVEST_ROOT = path.join("research", "data", "catalogues");

/** Filenames and directories are `p0057-04.jpg` and `hafele-architectural`. */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Rejects anything that is not a plain single path segment.
 *
 * These values arrive from a query string and are joined onto a
 * filesystem path. Without this, `..%2f..%2f.env` reads whatever the
 * process can read.
 */
function safeSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value) || value.includes("..")) {
    throw new Error(`Unsafe path segment: ${value}`);
  }
  return value;
}

export interface HarvestSource {
  name: string;
  count: number;
}

/** Every catalogue with unattached images, and how many each still has. */
export async function listHarvestSources(): Promise<HarvestSource[]> {
  let dirs: string[];
  try {
    dirs = await readdir(HARVEST_ROOT);
  } catch {
    return [];
  }

  const sources: HarvestSource[] = [];
  for (const name of dirs) {
    try {
      const images = path.join(HARVEST_ROOT, safeSegment(name), "images");
      const files = (await readdir(images)).filter((f) => f.endsWith(".jpg"));
      if (files.length) sources.push({ name, count: files.length });
    } catch {
      /* Not a harvest directory, or no images in it. */
    }
  }
  return sources.sort((a, b) => b.count - a.count);
}

export interface HarvestImage {
  source: string;
  file: string;
  /** The catalogue page it was lifted from — the only provenance there is. */
  page: number | null;
}

export async function listHarvestImages(
  source: string,
  page = 1,
  pageSize = 60,
): Promise<{ items: HarvestImage[]; total: number; totalPages: number }> {
  const dir = path.join(HARVEST_ROOT, safeSegment(source), "images");

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  } catch {
    return { items: [], total: 0, totalPages: 1 };
  }

  const start = (Math.max(1, page) - 1) * pageSize;
  const items = files.slice(start, start + pageSize).map((file) => ({
    source,
    file,
    /* Harvested names carry their page: p0057-04.jpg. */
    page: Number(file.match(/^p(\d+)-/)?.[1]) || null,
  }));

  return {
    items,
    total: files.length,
    totalPages: Math.max(1, Math.ceil(files.length / pageSize)),
  };
}

/** Absolute path of one harvested image, or null when it is not there. */
export async function harvestImagePath(
  source: string,
  file: string,
): Promise<string | null> {
  const full = path.join(HARVEST_ROOT, safeSegment(source), "images", safeSegment(file));
  try {
    return (await stat(full)).isFile() ? full : null;
  } catch {
    return null;
  }
}

export async function readHarvestImage(source: string, file: string) {
  const full = await harvestImagePath(source, file);
  return full ? readFile(full) : null;
}
