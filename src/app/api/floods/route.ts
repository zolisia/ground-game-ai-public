import { NextResponse } from "next/server";
import { isInsideConstituency } from "@/lib/geo";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// Environment Agency Flood Monitoring API — free, no auth required
// Real-time flood warnings, river levels, and rainfall for constituency area
// Docs: https://environment.data.gov.uk/flood-monitoring/doc/reference

const EA_API = "https://environment.data.gov.uk/flood-monitoring";

// Braintree constituency center and search radius (km)
// Actual extent: lat 51.829–52.087, lng 0.308–0.782
// Center shifted north to account for full extent
const CENTER_LAT = 51.96;
const CENTER_LNG = 0.55;
const RADIUS_KM = 20;

interface FloodWarning {
  id: string;
  description: string;
  severity: string;
  severityLevel: number;
  message: string;
  timeRaised: string;
  area: string;
}

interface MonitoringStation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  river: string;
  type: string;
  latestValue: number | null;
  latestDate: string | null;
  unit: string;
}

export async function GET() {
  try {
    // Fetch flood warnings and nearby monitoring stations in parallel
    const [warningsRes, stationsRes] = await Promise.allSettled([
      fetch(`${EA_API}/id/floods?lat=${CENTER_LAT}&long=${CENTER_LNG}&dist=${RADIUS_KM}`, {
        next: { revalidate: 900 }, // 15 min cache
        headers: { Accept: "application/json" },
      }),
      fetch(`${EA_API}/id/stations?lat=${CENTER_LAT}&long=${CENTER_LNG}&dist=${RADIUS_KM}&_limit=20`, {
        next: { revalidate: 1800 }, // 30 min cache
        headers: { Accept: "application/json" },
      }),
    ]);

    const warnings: FloodWarning[] = [];
    const stations: MonitoringStation[] = [];

    // Process flood warnings
    if (warningsRes.status === "fulfilled" && warningsRes.value.ok) {
      const data = await warningsRes.value.json();
      const items = data.items || [];
      for (const item of items) {
        warnings.push({
          id: item["@id"] || "",
          description: item.description || "",
          severity: item.severityLevel
            ? ["", "Severe", "Warning", "Alert", "No Longer"][item.severityLevel] || "Unknown"
            : "Unknown",
          severityLevel: item.severityLevel || 0,
          message: item.message || "",
          timeRaised: item.timeRaised || "",
          area: item.floodArea?.label || item.eaAreaName || "",
        });
      }
    }

    // Process monitoring stations
    if (stationsRes.status === "fulfilled" && stationsRes.value.ok) {
      const data = await stationsRes.value.json();
      const items = data.items || [];
      for (const item of items) {
        stations.push({
          id: item["@id"] || "",
          label: item.label || "",
          lat: item.lat || 0,
          lng: item.long || 0,
          river: item.riverName || "",
          type: item.measures?.[0]?.parameterName || "Level",
          latestValue: item.measures?.[0]?.latestReading?.value ?? null,
          latestDate: item.measures?.[0]?.latestReading?.dateTime ?? null,
          unit: item.measures?.[0]?.unitName || "m",
        });
      }
    }

    // Filter stations to constituency boundary
    const filteredStations = stations
      .filter(s => s.lat !== 0)
      .filter(s => isInsideConstituency(s.lng, s.lat));

    return NextResponse.json({
      warnings,
      stations: filteredStations,
      activeWarnings: warnings.filter(w => w.severityLevel <= 3).length,
      source: "Environment Agency",
    });
  } catch (err) {
    console.error("Flood monitoring error:", err);
    return NextResponse.json(
      { warnings: [], stations: [], activeWarnings: 0, error: "Failed to fetch flood data" },
      { status: 500 }
    );
  }
}
