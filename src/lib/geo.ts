// Point-in-polygon utility for filtering API results to a constituency
// boundary. Uses the ray-casting algorithm.
//
// Loads public/geojson/constituencies-all.geojson once (21 MB, ~650 features
// from the ONS PCON24 boundary dataset) and caches both the parsed JSON and
// per-slug polygon arrays. Per-slug lookup uses the data layer's
// `constituency.onsCode` to match against the GeoJSON's `PCON24CD` property.
//
// Backward compatibility: `slug` is optional and defaults to "braintree" so
// existing callers `isInsideConstituency(lng, lat)` continue to work
// unchanged. Each dependent route (crime, fixmystreet, planning, floods,
// worship, schools, …) can be migrated to pass an explicit `slug` as a
// separate, one-line change.

import { readFileSync } from "fs";
import { join } from "path";
import { getFullData } from "@/data";

type PolygonRing = [number, number][];

interface GeoFeature {
  properties: { PCON24CD: string; PCON24NM: string };
  geometry:
    | { type: "Polygon"; coordinates: PolygonRing[] }
    | { type: "MultiPolygon"; coordinates: PolygonRing[][] };
}

interface AllGeoJson {
  features: GeoFeature[];
}

// Module-level caches — populated once per serverless instance lifetime.
let _allGeojson: AllGeoJson | null = null;
const _polygonCache = new Map<string, PolygonRing[] | null>();

// Last-resort bounding box for Braintree if both the all-650 file and the
// single Braintree file fail to load. Matches the previous behaviour exactly.
const BRAINTREE_BBOX_FALLBACK: PolygonRing = [
  [0.308, 51.829],
  [0.782, 51.829],
  [0.782, 52.087],
  [0.308, 52.087],
  [0.308, 51.829],
];

function loadAllGeojson(): AllGeoJson {
  if (_allGeojson) return _allGeojson;
  try {
    const filePath = join(
      process.cwd(),
      "public",
      "geojson",
      "constituencies-all.geojson"
    );
    const raw = readFileSync(filePath, "utf-8");
    _allGeojson = JSON.parse(raw) as AllGeoJson;
  } catch {
    _allGeojson = { features: [] };
  }
  return _allGeojson;
}

// Extract outer-ring polygons from a feature. Handles both Polygon (single
// ring) and MultiPolygon (multiple rings, e.g. coastal constituencies with
// islands). Holes are ignored — they have negligible impact on UK
// constituency boundaries.
function extractPolygons(feature: GeoFeature): PolygonRing[] {
  if (feature.geometry.type === "Polygon") {
    return [feature.geometry.coordinates[0]];
  }
  if (feature.geometry.type === "MultiPolygon") {
    return feature.geometry.coordinates.map((poly) => poly[0]);
  }
  return [];
}

function getPolygonsForSlug(slug: string): PolygonRing[] | null {
  if (_polygonCache.has(slug)) {
    return _polygonCache.get(slug) ?? null;
  }

  const data = getFullData(slug);
  if (!data) {
    _polygonCache.set(slug, null);
    return null;
  }

  const onsCode = data.constituency.onsCode;
  const geo = loadAllGeojson();
  const feature = geo.features.find((f) => f.properties.PCON24CD === onsCode);

  if (!feature) {
    _polygonCache.set(slug, null);
    return null;
  }

  const polygons = extractPolygons(feature);
  _polygonCache.set(slug, polygons);
  return polygons;
}

// Braintree-specific fallback: the old single-file GeoJSON. Only used if the
// new all-650 file is unavailable or doesn't contain the Braintree feature.
function loadBraintreeFromSingleFile(): PolygonRing[] | null {
  try {
    const filePath = join(
      process.cwd(),
      "public",
      "geojson",
      "braintree-constituency.geojson"
    );
    const raw = readFileSync(filePath, "utf-8");
    const geojson = JSON.parse(raw);
    return [geojson.features[0].geometry.coordinates[0] as PolygonRing];
  } catch {
    return null;
  }
}

function pointInPolygon(
  lng: number,
  lat: number,
  polygon: PolygonRing
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Ray-casting point-in-polygon test against a constituency boundary.
 *
 * @param lng Longitude of the point
 * @param lat Latitude of the point
 * @param constituencySlug Constituency slug — defaults to "braintree" for
 *   backward compatibility. Existing callers do not need to change.
 * @returns true if the point is inside the constituency boundary; false on
 *   miss, invalid slug, or any lookup failure
 */
export function isInsideConstituency(
  lng: number,
  lat: number,
  constituencySlug: string = "braintree"
): boolean {
  let polygons = getPolygonsForSlug(constituencySlug);

  // Braintree-only graceful degradation: if the all-650 file is missing or
  // doesn't contain Braintree, fall back to the single Braintree file, then
  // to the bounding box. Preserves the route's prior behaviour exactly even
  // if the new GeoJSON isn't there.
  if (!polygons && constituencySlug === "braintree") {
    polygons = loadBraintreeFromSingleFile() ?? [BRAINTREE_BBOX_FALLBACK];
  }

  if (!polygons || polygons.length === 0) return false;

  // Point is inside if it falls in ANY of the polygons (handles MultiPolygon
  // geometries — coastal constituencies, constituencies with detached areas).
  return polygons.some((poly) => pointInPolygon(lng, lat, poly));
}

/**
 * Filter an array of items to only those inside the given constituency.
 *
 * @param constituencySlug Defaults to "braintree" for backward compatibility.
 */
export function filterToConstituency<T>(
  items: T[],
  getLng: (item: T) => number,
  getLat: (item: T) => number,
  constituencySlug: string = "braintree"
): T[] {
  return items.filter((item) =>
    isInsideConstituency(getLng(item), getLat(item), constituencySlug)
  );
}
