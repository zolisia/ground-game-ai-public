"use client";

import { useSearchParams } from "next/navigation";
import { CONSTITUENCIES } from "@/data/constituencies";

export const SELECTABLE_CONSTITUENCIES = CONSTITUENCIES.map((c) => ({
  slug: c.slug,
  name: c.name,
}));

export type ConstituencySlug = string;

const DEFAULT_SLUG = "braintree";
const DEFAULT_NAME = "Braintree";

export function useConstituency(): { slug: ConstituencySlug; name: string } {
  const params = useSearchParams();
  const raw = params.get("constituency");
  const match = SELECTABLE_CONSTITUENCIES.find((c) => c.slug === raw);
  if (match) return { slug: match.slug, name: match.name };
  return { slug: DEFAULT_SLUG, name: DEFAULT_NAME };
}

export function withConstituency(path: string, slug: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}constituency=${encodeURIComponent(slug)}`;
}
