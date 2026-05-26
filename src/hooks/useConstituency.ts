"use client";

import { useSearchParams } from "next/navigation";

// Constituencies currently exposed in the dashboard switcher. Adding more
// requires only appending to this list — every component reads from here.
export const SELECTABLE_CONSTITUENCIES = [
  { slug: "braintree", name: "Braintree" },
  { slug: "clacton", name: "Clacton" },
  { slug: "walthamstow", name: "Walthamstow" },
  { slug: "sheffield-central", name: "Sheffield Central" },
  { slug: "leeds-central-and-headingley", name: "Leeds Central and Headingley" },
  { slug: "south-basildon-and-east-thurrock", name: "South Basildon and East Thurrock" },
  { slug: "great-yarmouth", name: "Great Yarmouth" },
  { slug: "streatham-and-croydon-north", name: "Streatham and Croydon North" },
  { slug: "lewisham-east", name: "Lewisham East" },
] as const;

export type ConstituencySlug = typeof SELECTABLE_CONSTITUENCIES[number]["slug"];

const DEFAULT_SLUG: ConstituencySlug = "braintree";

export function useConstituency(): { slug: ConstituencySlug; name: string } {
  const params = useSearchParams();
  const raw = params.get("constituency");
  const match = SELECTABLE_CONSTITUENCIES.find((c) => c.slug === raw);
  if (match) return { slug: match.slug, name: match.name };
  return { slug: DEFAULT_SLUG, name: "Braintree" };
}

// Append `?constituency=<slug>` (or `&constituency=…` if the path already has
// a query) to a relative API path. Use this rather than hand-building the URL
// so the dedup of `?` vs `&` is consistent.
export function withConstituency(path: string, slug: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}constituency=${encodeURIComponent(slug)}`;
}
