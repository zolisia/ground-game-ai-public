import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { db } from "@/lib/firebase";

export const dynamic = "force-dynamic";

const EA_API = "https://environment.data.gov.uk/flood-monitoring";
const CENTER_LAT = 51.96;
const CENTER_LNG = 0.55;
const RADIUS_KM = 20;

const cacheDoc = doc(db, "flood_cache", "braintree");

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

async function fetchAndUpdateCache() {
  try {
    const [warningsRes, stationsRes] = await Promise.allSettled([
      fetch(`${EA_API}/id/floods?lat=${CENTER_LAT}&long=${CENTER_LNG}&dist=${RADIUS_KM}`, {
        headers: { Accept: "application/json" },
      }),
      fetch(`${EA_API}/id/stations?lat=${CENTER_LAT}&long=${CENTER_LNG}&dist=${RADIUS_KM}&_limit=20`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    const warnings: FloodWarning[] = [];
    const stations: MonitoringStation[] = [];

    if (warningsRes.status === "fulfilled" && warningsRes.value.ok) {
      const data = await warningsRes.value.json();
      for (const item of data.items || []) {
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

    if (stationsRes.status === "fulfilled" && stationsRes.value.ok) {
      const data = await stationsRes.value.json();
      for (const item of data.items || []) {
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

    const filteredStations = stations
      .filter(s => s.lat !== 0)
      .filter(s => isInsideConstituency(s.lng, s.lat));

    const freshData = {
      warnings,
      stations: filteredStations,
      activeWarnings: warnings.filter(w => w.severityLevel <= 3).length,
      source: "Environment Agency",
    };

    const existing = await getDoc(cacheDoc);
    const existingData = existing.exists() ? existing.data().data : null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(freshData)) {
      return;
    }

    await setDoc(cacheDoc, {
      data: freshData,
      updated_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Background cache update failed:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    const snap = await getDoc(cacheDoc);
    const cached = snap.exists() ? snap.data() : null;

    if (cached && !forceRefresh) {
      fetchAndUpdateCache();
      return NextResponse.json({ ...cached.data, source: "cache" });
    }

    const [warningsRes, stationsRes] = await Promise.allSettled([
      fetch(`${EA_API}/id/floods?lat=${CENTER_LAT}&long=${CENTER_LNG}&dist=${RADIUS_KM}`, {
        headers: { Accept: "application/json" },
      }),
      fetch(`${EA_API}/id/stations?lat=${CENTER_LAT}&long=${CENTER_LNG}&dist=${RADIUS_KM}&_limit=20`, {
        headers: { Accept: "application/json" },
      }),
    ]);

    const warnings: FloodWarning[] = [];
    const stations: MonitoringStation[] = [];

    if (warningsRes.status === "fulfilled" && warningsRes.value.ok) {
      const data = await warningsRes.value.json();
      for (const item of data.items || []) {
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

    if (stationsRes.status === "fulfilled" && stationsRes.value.ok) {
      const data = await stationsRes.value.json();
      for (const item of data.items || []) {
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

    const filteredStations = stations
      .filter(s => s.lat !== 0)
      .filter(s => isInsideConstituency(s.lng, s.lat));

    const freshData = {
      warnings,
      stations: filteredStations,
      activeWarnings: warnings.filter(w => w.severityLevel <= 3).length,
      source: "Environment Agency",
    };

    await setDoc(cacheDoc, {
      data: freshData,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json(freshData);

  } catch (err) {
    console.error("Flood monitoring error:", err);
    return NextResponse.json(
      { warnings: [], stations: [], activeWarnings: 0, error: "Failed to fetch flood data" },
      { status: 500 }
    );
  }
}