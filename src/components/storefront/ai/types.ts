import type { Product } from "@/lib/types/catalog";
/* `import type`, which is erased at compile time — this file is imported
   by client components and `services.ts` reaches the database. */
import type { ServiceIcon } from "@/lib/data/services";


/**
 * The wire shapes the two AI search routes answer with.
 *
 * Declared here rather than inferred from the route handlers because a
 * client component cannot import a route — and must not import anything
 * that reaches `env`. One file, two routes, so the sheet that renders
 * both answers cannot drift from either.
 */

/** One thing Quoin believes was in the photograph, or in the sentence. */
export interface AiMatch {
  label: string;
  detail: string | null;
  brand: string | null;
  /** Where to send somebody when `products` is empty. */
  department: { slug: string; name: string } | null;
  products: Product[];
}

export interface VisualSearchResult {
  summary: string;
  matches: AiMatch[];
  /** Set when the photograph held nothing Quoin sells. Not an error. */
  note: string | null;
}

export type AssistIntent = "product" | "service" | "both" | "unclear";

export interface AssistResult {
  reply: string;
  intent: AssistIntent;
  followUp: string | null;
  suggestConsult: boolean;
  matches: AiMatch[];
  services: { slug: string; name: string; summary: string; icon: ServiceIcon }[];
}
