// Point-in-polygon utility for filtering API results to constituency boundary
// Uses ray-casting algorithm

import { readFileSync } from "fs";
import { join } from "path";

let _polygon: [number, number][] | null = null;

function getPolygon(): [number, number][] {
  if (!_polygon) {
    try {
      const filePath = join(process.cwd(), "public", "geojson", "braintree-constituency.geojson");
      const raw = readFileSync(filePath, "utf-8");
      const geojson = JSON.parse(raw);
      _polygon = geojson.features[0].geometry.coordinates[0] as [number, number][];
    } catch {
      // Fallback: use bounding box as a rough polygon
      _polygon = [
        [0.308, 51.829], [0.782, 51.829], [0.782, 52.087], [0.308, 52.087], [0.308, 51.829],
      ];
    }
  }
  return _polygon;
}

/**
 * Ray-casting point-in-polygon test
 * @param lng Longitude of the point
 * @param lat Latitude of the point
 * @returns true if the point is inside the Braintree constituency boundary
 */
export function isInsideConstituency(lng: number, lat: number): boolean {
  const polygon = getPolygon();
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Filter an array of items to only those inside the constituency
 */
export function filterToConstituency<T>(
  items: T[],
  getLng: (item: T) => number,
  getLat: (item: T) => number,
): T[] {
  return items.filter((item) => isInsideConstituency(getLng(item), getLat(item)));
}
