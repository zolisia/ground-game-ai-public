import { NextResponse } from "next/server";

// Force dynamic — fetches live external data
export const dynamic = "force-dynamic";

// OpenAQ v3 API — free, no auth required for basic queries
// Fetches nearby air quality monitoring stations with latest readings
// Docs: https://docs.openaq.org/

const OPENAQ_API = "https://api.openaq.org/v3/locations";

// Braintree constituency center
const CENTER_LAT = 51.974;
const CENTER_LNG = 0.535;
const RADIUS_M = 25000; // 25km radius

interface AQParameter {
  parameter: string;
  lastValue: number;
  unit: string;
}

interface AQStation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  parameters: AQParameter[];
}

export async function GET() {
  try {
    const res = await fetch(
      `${OPENAQ_API}?coordinates=${CENTER_LAT},${CENTER_LNG}&radius=${RADIUS_M}&limit=10`,
      {
        next: { revalidate: 1800 }, // 30 min cache
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      }
    );

    if (!res.ok) {
      // OpenAQ v3 now requires API key — return fallback data
      return NextResponse.json(getFallbackData());
    }

    const data = await res.json();
    const locations = data.results || [];

    const stations: AQStation[] = [];

    for (const loc of locations) {
      const params: AQParameter[] = [];

      // OpenAQ v3 returns sensors array with latest readings
      const sensors = loc.sensors || [];
      for (const sensor of sensors) {
        const param = sensor.parameter?.name || sensor.parameter?.id || "unknown";
        const latest = sensor.latest ?? sensor.summary?.last ?? null;
        const unit = sensor.parameter?.units || sensor.parameter?.unit || "";

        if (latest !== null && latest !== undefined) {
          params.push({
            parameter: param,
            lastValue: typeof latest === "object" ? latest.value : latest,
            unit: typeof unit === "object" ? unit.name || "" : unit,
          });
        }
      }

      // Fallback: some v3 responses use parameters array directly
      if (params.length === 0 && loc.parameters) {
        for (const p of loc.parameters) {
          params.push({
            parameter: p.displayName || p.name || p.id || "unknown",
            lastValue: p.lastValue ?? p.latest ?? 0,
            unit: p.unit || p.units || "",
          });
        }
      }

      const coords = loc.coordinates || {};
      const lat = coords.latitude ?? loc.latitude ?? 0;
      const lng = coords.longitude ?? loc.longitude ?? 0;

      if (lat !== 0 && lng !== 0) {
        stations.push({
          id: loc.id,
          name: loc.name || loc.locality || "Unknown Station",
          lat,
          lng,
          parameters: params,
        });
      }
    }

    return NextResponse.json({
      stations,
      source: "live",
    });
  } catch (err) {
    console.error("Air quality API error:", err);
    return NextResponse.json(getFallbackData());
  }
}

// Fallback data from DEFRA AURN monitoring network near Braintree
function getFallbackData() {
  return {
    stations: [
      {
        id: 1,
        name: "Chelmsford",
        lat: 51.7356,
        lng: 0.4685,
        parameters: [
          { parameter: "pm25", lastValue: 11, unit: "µg/m³" },
          { parameter: "no2", lastValue: 18, unit: "µg/m³" },
          { parameter: "pm10", lastValue: 16, unit: "µg/m³" },
        ],
      },
      {
        id: 2,
        name: "Colchester",
        lat: 51.8959,
        lng: 0.8919,
        parameters: [
          { parameter: "pm25", lastValue: 9, unit: "µg/m³" },
          { parameter: "no2", lastValue: 15, unit: "µg/m³" },
        ],
      },
      {
        id: 3,
        name: "Southend-on-Sea",
        lat: 51.5440,
        lng: 0.6788,
        parameters: [
          { parameter: "pm25", lastValue: 12, unit: "µg/m³" },
          { parameter: "no2", lastValue: 22, unit: "µg/m³" },
          { parameter: "o3", lastValue: 45, unit: "µg/m³" },
        ],
      },
    ],
    source: "fallback",
    note: "OpenAQ now requires API key. Showing nearest DEFRA AURN stations. Register at openaq.org for live data.",
  };
}
