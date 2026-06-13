import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { isInsideConstituency } from "@/lib/geo";
import { adminDb } from "@/lib/firebase-admin";
import { getFullData } from "@/data";

export const dynamic = "force-dynamic";

const TTL_MS = 15 * 60 * 1000;

const EA_API = "https://environment.data.gov.uk/flood-monitoring";
// TODO: derive RADIUS_KM from constituency bbox size — fixed 20km may
// over-fetch for tiny urban constituencies and under-fetch for huge rural
// ones. Post-filter via isInsideConstituency keeps results correct either
// way; only efficiency is affected.
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

interface FloodData {
  warnings: FloodWarning[];
  stations: MonitoringStation[];
  activeWarnings: number;
  source: string;
}

async function generateFreshData(
  centerLat: number,
  centerLng: number,
  constituencySlug: string
): Promise<FloodData> {
  const [warningsRes, stationsRes] = await Promise.allSettled([
    fetch(`${EA_API}/id/floods?lat=${centerLat}&long=${centerLng}&dist=${RADIUS_KM}`, {
      headers: { Accept: "application/json" },
    }),
    fetch(`${EA_API}/id/stations?lat=${centerLat}&long=${centerLng}&dist=${RADIUS_KM}&_limit=20`, {
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
    .filter(s => isInsideConstituency(s.lng, s.lat, constituencySlug));

  return {
    warnings,
    stations: filteredStations,
    activeWarnings: warnings.filter(w => w.severityLevel <= 3).length,
    source: "Environment Agency",
  };
}

async function fetchAndUpdateCache(
  centerLat: number,
  centerLng: number,
  constituencySlug: string,
  cacheDocRef: DocumentReference
) {
  try {
    const freshData = await generateFreshData(centerLat, centerLng, constituencySlug);

    const existing = await cacheDocRef.get();
    const existingData = existing.data()?.data ?? null;

    if (existingData && JSON.stringify(existingData) === JSON.stringify(freshData)) {
      return;
    }

    await cacheDocRef.set({
      data: freshData,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Background cache update failed:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const constituencySlug = searchParams.get("constituency") || "braintree";
  const constituencyData = getFullData(constituencySlug);

  if (!constituencyData) {
    return Response.json(
      { error: "Invalid constituency slug" },
      { status: 400 }
    );
  }

  const CENTER_LAT = constituencyData.geo?.lat;
  const CENTER_LNG = constituencyData.geo?.lng;

  if (CENTER_LAT == null || CENTER_LNG == null) {
    return Response.json(
      {
        error: "Floods data not available",
        message: "Geographic center not yet sourced for this constituency",
        constituency: constituencySlug,
      },
      { status: 400 }
    );
  }

  const cacheDocRef = adminDb.collection("flood_cache").doc(constituencySlug);

  type CacheDoc = { data: { warnings: unknown[]; stations: unknown[]; activeWarnings: number }; updated_at: string };
  let cached: CacheDoc | null = null;
  try {
    const snap = await cacheDocRef.get();
    if (snap.exists) {
      cached = snap.data() as CacheDoc;
    }
  } catch (err) {
    console.warn("Flood cache read failed (continuing without cache):", err);
  }

  if (cached && !force) {
    const cacheAge = Date.now() - new Date(cached.updated_at).getTime();
    if (cacheAge > TTL_MS) {
      fetchAndUpdateCache(CENTER_LAT, CENTER_LNG, constituencySlug, cacheDocRef)
        .catch(err => console.warn("Floods background refresh failed:", err));
    }
    return NextResponse.json({ ...cached.data, source: "cache", _cachedAt: new Date(cached.updated_at).getTime() });
  }

  try {
    const freshData = await generateFreshData(CENTER_LAT, CENTER_LNG, constituencySlug);

    const cachedAt = Date.now();
    try {
      await cacheDocRef.set({
        data: freshData,
        updated_at: new Date(cachedAt).toISOString(),
      });
    } catch (err) {
      console.warn("Flood cache write failed (returning fresh anyway):", err);
    }

    return NextResponse.json({ ...freshData, _cachedAt: cachedAt });
  } catch (err) {
    console.error("Flood monitoring error:", err);
    return NextResponse.json(
      { warnings: [], stations: [], activeWarnings: 0, error: "Failed to fetch flood data" },
      { status: 500 }
    );
  }
}