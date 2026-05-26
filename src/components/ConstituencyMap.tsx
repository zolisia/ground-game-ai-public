"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { constituencyGeo, wardData, wardElectoralCalc as fallbackWardElectoralCalc } from "@/data/braintree";
import { Layers, ChevronDown, ChevronUp } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { getFullData, WARD_DEPRIVATION } from "@/data";

// Layer definitions — World Monitor style
interface LayerDef {
  id: string;
  label: string;
  emoji: string;
  description: string;
  default: boolean;
}

const LAYER_DEFS: LayerDef[] = [
  { id: "boundary", label: "Boundary", emoji: "🗺️", description: "Constituency outline", default: true },
  { id: "wards-vote", label: "2024 Vote Share", emoji: "🗳️", description: "Ward-level CON vote choropleth", default: true },
  { id: "wards-prediction", label: "MRP Prediction", emoji: "📊", description: "EC predicted winner per ward", default: false },
  { id: "wards-deprivation", label: "Deprivation", emoji: "📉", description: "Ward deprivation levels", default: false },
  { id: "crime", label: "Crime Reports", emoji: "🔴", description: "Recent crime data (Police API)", default: false },
  { id: "fixmystreet", label: "Community Issues", emoji: "⚠️", description: "FixMyStreet reports", default: false },
  { id: "planning", label: "Planning Apps", emoji: "🏗️", description: "Recent planning applications", default: false },
  { id: "worship", label: "Places of Worship", emoji: "⛪", description: "Religious buildings (OSM)", default: false },
  { id: "floods", label: "Flood Monitoring", emoji: "🌊", description: "EA flood stations & alerts", default: false },
  { id: "census", label: "Census Overlay", emoji: "📊", description: "ONS Census 2021 data", default: false },
  { id: "ward-labels", label: "Ward Names", emoji: "🏷️", description: "Ward name labels", default: true },
];

interface BoundaryFeature {
  type: "Feature";
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: { PCON24CD: string; PCON24NM: string };
}
interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

// Module-scope cache for the full 650-constituency GeoJSON so we don't
// re-fetch + re-parse 21 MB on every slug switch. Returns a FeatureCollection
// containing just the requested constituency, or null if not found.
let allBoundariesPromise: Promise<BoundaryCollection> | null = null;
function loadAllBoundaries(): Promise<BoundaryCollection> {
  if (!allBoundariesPromise) {
    allBoundariesPromise = fetch("/geojson/constituencies-all.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`constituencies-all.geojson: ${res.status}`);
        return res.json();
      });
  }
  return allBoundariesPromise;
}
async function loadConstituencyBoundary(onsCode: string): Promise<BoundaryCollection | null> {
  try {
    const all = await loadAllBoundaries();
    const feature = all.features.find((f) => f.properties?.PCON24CD === onsCode);
    if (!feature) return null;
    return { type: "FeatureCollection", features: [feature] };
  } catch (err) {
    console.error("Failed to load constituency boundary:", err);
    return null;
  }
}

// Per-constituency ward GeoJSON. Each file is a FeatureCollection of the
// constituency's wards (WD24CD/WD24NM properties, 4326 geometry, sourced from
// ONS WD_MAY_2024_UK_BGC). For slugs not listed here the ward layers don't
// render — boundary still does, via constituencies-all.geojson.
const WARDS_GEOJSON_PATHS: Record<string, string> = {
  braintree: "/geojson/braintree-wards.geojson",
  clacton: "/geojson/clacton-wards.geojson",
  walthamstow: "/geojson/walthamstow-wards.geojson",
  "sheffield-central": "/geojson/sheffield-central-wards.geojson",
  "leeds-central-and-headingley": "/geojson/leeds-central-and-headingley-wards.geojson",
  "south-basildon-and-east-thurrock": "/geojson/south-basildon-and-east-thurrock-wards.geojson",
  "great-yarmouth": "/geojson/great-yarmouth-wards.geojson",
  "streatham-and-croydon-north": "/geojson/streatham-and-croydon-north-wards.geojson",
  "lewisham-east": "/geojson/lewisham-east-wards.geojson",
};

interface FMSIssue {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  url: string;
}

interface PlanningApp {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  status: string;
  url: string;
}

export default function ConstituencyMap() {
  const { slug } = useConstituency();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const fmsMarkers = useRef<maplibregl.Marker[]>([]);
  const crimeMarkers = useRef<maplibregl.Marker[]>([]);
  const planningMarkers = useRef<maplibregl.Marker[]>([]);
  const worshipMarkers = useRef<maplibregl.Marker[]>([]);
  const floodMarkers = useRef<maplibregl.Marker[]>([]);
  const petitionMarkers = useRef<maplibregl.Marker[]>([]);
  const aqMarkers = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [layerPanel, setLayerPanel] = useState(true);
  const [censusTopic, setCensusTopic] = useState("age-under16");
  const [censusLabel, setCensusLabel] = useState("");
  const [censusAvg, setCensusAvg] = useState(0);
  const [layers, setLayers] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    LAYER_DEFS.forEach((l) => (initial[l.id] = l.default));
    return initial;
  });

  const toggleLayer = useCallback((id: string) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) {
      // Tear down on slug change so we can re-init with new constituency data
      for (const arr of [fmsMarkers, crimeMarkers, planningMarkers, worshipMarkers, floodMarkers, petitionMarkers, aqMarkers]) {
        arr.current.forEach((mk) => mk.remove());
        arr.current = [];
      }
      map.current.remove();
      map.current = null;
      setMapReady(false);
    }

    const data = getFullData(slug);
    const center: [number, number] =
      data?.geo ? [data.geo.lng, data.geo.lat] : constituencyGeo.center;
    const zoom = constituencyGeo.zoom;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center,
      zoom,
      minZoom: 9,
      maxZoom: 16,
    });

    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("error", (e) => console.error("MapLibre error:", e));

    m.on("load", async () => {
      try {
        // Fetch boundary, wards and live EC data in parallel.
        // Boundary works for any constituency — extracted from the cached
        // 21MB constituencies-all.geojson by ONS code. Ward layers render for
        // any constituency listed in WARDS_GEOJSON_PATHS; others get boundary
        // only.
        const onsCode = data?.constituency.onsCode;
        const wardsPath = WARDS_GEOJSON_PATHS[slug];
        const [constituencyData, wardsRes, ecRes] = await Promise.all([
          onsCode ? loadConstituencyBoundary(onsCode) : Promise.resolve(null),
          wardsPath ? fetch(wardsPath) : Promise.resolve(null),
          fetch(withConstituency("/api/electoral-calculus?type=seat", slug)).catch(() => null),
        ]);

        // Build live EC ward lookup, falling back to static data
        let wardElectoralCalc = fallbackWardElectoralCalc;
        try {
          if (ecRes && ecRes.ok) {
            const ecData = await ecRes.json();
            if (ecData.wards && ecData.wards.length > 0) {
              const liveWards: Record<string, { electorate: number; winner2024: string; predictedWinner: string }> = {};
              for (const w of ecData.wards as Array<{ ward: string; electorate: number; winner2024: string; predictedWinner: string }>) {
                if (w.ward) {
                  liveWards[w.ward] = {
                    electorate: w.electorate,
                    winner2024: w.winner2024,
                    predictedWinner: w.predictedWinner,
                  };
                }
              }
              if (Object.keys(liveWards).length > 0) {
                wardElectoralCalc = liveWards;
              }
            }
          }
        } catch {
          // Keep fallback wardElectoralCalc
        }

        // Boundary works for any constituency now. Wards still depend on the
        // Braintree-specific GeoJSON + static per-ward vote data — TODO when
        // per-constituency ward data is sourced.
        if (constituencyData) {
        // === BOUNDARY SOURCE + LAYERS (universal) ===
        m.addSource("constituency", { type: "geojson", data: constituencyData });
        m.addLayer({
          id: "boundary-fill",
          type: "fill",
          source: "constituency",
          paint: { "fill-color": "#10b981", "fill-opacity": 0.05 },
        });
        m.addLayer({
          id: "boundary-outline",
          type: "line",
          source: "constituency",
          paint: { "line-color": "#10b981", "line-width": 2.5, "line-dasharray": [3, 2] },
        });

        // === WARD SOURCE + LAYERS (Braintree-only for now) ===
        if (wardsRes) {
        const wardsData = await wardsRes.json();

        // Enrich ward features
        // Normalize ward names: GeoJSON uses "&" but EC/data may use "and" or vice versa
        const norm = (s: string) => s.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim();
        const wardLookup = new Map(wardData.map((w) => [norm(w.name), w]));
        // Build EC lookup with normalized keys
        const ecNorm: Record<string, typeof wardElectoralCalc[string]> = {};
        for (const [k, v] of Object.entries(wardElectoralCalc)) {
          ecNorm[norm(k)] = v;
        }
        // MHCLG IMD 2019 deprivation, keyed by WD24CD per constituency. Falls
        // through to Braintree's static name-keyed `wd.deprivation` below if
        // the slug isn't covered here yet.
        const depByCode = new Map(
          (WARD_DEPRIVATION[slug] ?? []).map((w) => [w.code, w.class])
        );
        for (const feature of wardsData.features) {
          const wardName = feature.properties.WD24NM;
          const wardCode = feature.properties.WD24CD;
          const key = norm(wardName);
          const wd = wardLookup.get(key);
          const ec = ecNorm[key];
          if (wd) {
            feature.properties.conVote = wd.conVote;
            feature.properties.refVote = wd.refVote;
            feature.properties.labVote = wd.labVote;
            feature.properties.ldVote = wd.ldVote;
            feature.properties.grnVote = wd.grnVote;
            feature.properties.population = wd.population;
            feature.properties.deprivation = wd.deprivation;
          }
          const dep = depByCode.get(wardCode);
          if (dep) feature.properties.deprivation = dep;
          if (ec) {
            feature.properties.predictedWinner = ec.predictedWinner;
            feature.properties.winner2024 = ec.winner2024;
            feature.properties.electorate = ec.electorate;
          }
          feature.properties.name = wardName;
        }

        m.addSource("wards", { type: "geojson", data: wardsData });

        // Party-colour expression shared between the 2024 Vote Share and MRP
        // Prediction layers. Driven by per-ward EC data attached during
        // enrichment (`winner2024` / `predictedWinner`). Both layers use the
        // same colour scheme so swaps between them are visually consistent.
        const partyColourBy = (field: string): maplibregl.ExpressionSpecification => [
          "match", ["get", field],
          "CON", "#0087DC",
          "LAB", "#DC241f",
          "Reform", "#12B6CF",
          "LIB", "#FAA61A",
          "Green", "#6AB023",
          "#666666",
        ];
        const predColorExpr = partyColourBy("predictedWinner");

        // === LAYER: Ward 2024 Vote Choropleth ===
        // Coloured by the EC-derived `winner2024` field rather than a static
        // Conservative-only vote-share gradient. Works for any constituency
        // that has EC ward data (currently Braintree + Clacton).
        m.addLayer({
          id: "wards-vote-fill",
          type: "fill",
          source: "wards",
          paint: {
            "fill-color": partyColourBy("winner2024"),
            "fill-opacity": 0.5,
          },
        });
        m.addLayer({
          id: "wards-vote-outline",
          type: "line",
          source: "wards",
          paint: { "line-color": "#e2e8f0", "line-width": 1, "line-opacity": 0.5 },
        });

        // === LAYER: MRP Prediction ===
        m.addLayer({
          id: "wards-prediction-fill",
          type: "fill",
          source: "wards",
          paint: { "fill-color": predColorExpr, "fill-opacity": 0.6 },
          layout: { visibility: "none" },
        });
        m.addLayer({
          id: "wards-prediction-outline",
          type: "line",
          source: "wards",
          paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.6 },
          layout: { visibility: "none" },
        });

        // === LAYER: Deprivation ===
        m.addLayer({
          id: "wards-deprivation-fill",
          type: "fill",
          source: "wards",
          paint: {
            "fill-color": [
              "match", ["get", "deprivation"],
              "Low", "#10b981",
              "Low-Medium", "#a3e635",
              "Medium", "#f59e0b",
              "Medium-High", "#ef4444",
              "High", "#991b1b",
              "#666666",
            ],
            "fill-opacity": 0.45,
          },
          layout: { visibility: "none" },
        });
        m.addLayer({
          id: "wards-deprivation-outline",
          type: "line",
          source: "wards",
          paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.4 },
          layout: { visibility: "none" },
        });

        // === LAYER: Ward Labels ===
        m.addLayer({
          id: "ward-labels",
          type: "symbol",
          source: "wards",
          layout: {
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-anchor": "center",
            "text-max-width": 8,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1.5,
          },
        });

        // === Ward click popup ===
        let currentPopup: maplibregl.Popup | null = null;
        const showWardPopup = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
          const props = e.features?.[0]?.properties;
          if (!props) return;
          if (currentPopup) currentPopup.remove();
          const changed = props.winner2024 && props.predictedWinner && props.winner2024 !== props.predictedWinner;
          const partyColor: Record<string, string> = { CON: "#0087DC", LAB: "#DC241f", Reform: "#12B6CF", LIB: "#FAA61A", Green: "#6AB023" };
          const predColor = partyColor[props.predictedWinner] ?? "#666";
          const prevColor = partyColor[props.winner2024] ?? "#666";
          const popupHtml = `
            <div style="font-family: system-ui; padding: 8px; min-width: 250px;">
              <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: #f1f5f9;">${props.name || props.WD24NM || 'Unknown ward'}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px; display: flex; gap: 12px;">
                ${props.population ? `<span>Pop: ${Number(props.population).toLocaleString()}</span>` : ""}
                ${props.electorate ? `<span>Electorate: ${Number(props.electorate).toLocaleString()}</span>` : ""}
                ${props.deprivation ? `<span>Deprivation: ${props.deprivation}</span>` : ""}
              </div>
              ${props.predictedWinner ? `
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <div style="flex:1; padding: 6px; border-radius: 6px; background: rgba(255,255,255,0.05); text-align: center;">
                  <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">2024 Result</div>
                  <div style="font-size: 14px; font-weight: 700; color: ${prevColor}; margin-top: 2px;">${props.winner2024}</div>
                </div>
                <div style="display: flex; align-items: center; color: ${changed ? "#ef4444" : "#94a3b8"}; font-size: 16px;">→</div>
                <div style="flex:1; padding: 6px; border-radius: 6px; background: ${changed ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)"}; text-align: center; border: 1px solid ${changed ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.2)"};">
                  <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">MRP Prediction</div>
                  <div style="font-size: 14px; font-weight: 700; color: ${predColor}; margin-top: 2px;">${props.predictedWinner}</div>
                  ${changed ? '<div style="font-size: 9px; color: #ef4444; margin-top: 2px;">⚡ SWING</div>' : ""}
                </div>
              </div>` : ""}
              ${props.conVote ? `
              <div style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">2024 Vote Share</div>
              <div style="display: flex; flex-direction: column; gap: 3px; font-size: 12px;">
                <div style="display:flex;justify-content:space-between;"><span style="color:#0087DC;">■ CON</span><strong style="color:#e2e8f0;">${props.conVote}%</strong></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#12B6CF;">■ REF</span><strong style="color:#e2e8f0;">${props.refVote}%</strong></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#DC241f;">■ LAB</span><strong style="color:#e2e8f0;">${props.labVote}%</strong></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#FAA61A;">■ LD</span><strong style="color:#e2e8f0;">${props.ldVote}%</strong></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#6AB023;">■ GRN</span><strong style="color:#e2e8f0;">${props.grnVote}%</strong></div>
              </div>` : ""}
            </div>
          `;
          currentPopup = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
            .setLngLat(e.lngLat)
            .setHTML(popupHtml)
            .addTo(m);
        };

        m.on("click", "wards-vote-fill", showWardPopup);
        m.on("click", "wards-prediction-fill", showWardPopup);
        m.on("click", "wards-deprivation-fill", showWardPopup);

        for (const layerId of ["wards-vote-fill", "wards-prediction-fill", "wards-deprivation-fill"]) {
          m.on("mouseenter", layerId, () => { m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", layerId, () => { m.getCanvas().style.cursor = ""; });
        }
        } // end if (wardsRes)

        // Fit to constituency bounds (works for any constituency)
        const geom = constituencyData.features?.[0]?.geometry;
        if (geom) {
          const bounds = new maplibregl.LngLatBounds();
          const coords = geom.type === "MultiPolygon" ? geom.coordinates.flat(2) : geom.coordinates.flat(1);
          for (const coord of coords) bounds.extend(coord as [number, number]);
          m.fitBounds(bounds, { padding: 40 });
        }
        } // end if (constituencyData)

        // Load FixMyStreet data for markers
        try {
          const fmsRes = await fetch(withConstituency("/api/fixmystreet", slug));
          const fmsData = await fmsRes.json();
          const issues: FMSIssue[] = fmsData.issues || [];
          for (const issue of issues.slice(0, 50)) {
            if (!issue.latitude || !issue.longitude) continue;
            const el = document.createElement("div");
            el.style.cssText = "width:12px;height:12px;background:#f59e0b;border:2px solid #fff;border-radius:50%;cursor:pointer;display:none;";
            el.className = "fms-marker";
            el.title = issue.title;
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([issue.longitude, issue.latitude])
              .setPopup(
                new maplibregl.Popup({ offset: 8, maxWidth: "220px" }).setHTML(
                  `<div style="font-family:system-ui;padding:4px;">
                    <div style="font-weight:600;font-size:12px;color:#f1f5f9;margin-bottom:2px;">⚠️ ${issue.title}</div>
                    <div style="font-size:11px;color:#94a3b8;">${issue.category}</div>
                    <a href="${issue.url || `https://www.fixmystreet.com/report/${issue.id}`}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6ee7b7;text-decoration:none;margin-top:4px;display:inline-block;">View report ↗</a>
                  </div>`
                )
              )
              .addTo(m);
            fmsMarkers.current.push(marker);
          }
        } catch {
          // FixMyStreet markers optional
        }

        // Load crime data
        try {
          const crimeRes = await fetch(withConstituency("/api/crime", slug));
          const crimeData = await crimeRes.json();
          interface CrimeItem { category: string; lat: number; lng: number; street: string; month: string; outcome: string | null; }
          const crimes: CrimeItem[] = crimeData.crimes || [];
          const crimeColors: Record<string, string> = {
            "Anti Social Behaviour": "#f59e0b",
            "Violence And Sexual Offences": "#ef4444",
            "Criminal Damage Arson": "#f97316",
            "Burglary": "#dc2626",
            "Vehicle Crime": "#a855f7",
            "Shoplifting": "#ec4899",
            "Public Order": "#f43f5e",
            "Drugs": "#6366f1",
            "Other Theft": "#8b5cf6",
          };
          for (const crime of crimes.slice(0, 300)) {
            if (!crime.lat || !crime.lng) continue;
            const color = crimeColors[crime.category] || "#ef4444";
            const el = document.createElement("div");
            el.style.cssText = `width:8px;height:8px;background:${color};border:1px solid rgba(255,255,255,0.4);border-radius:50%;cursor:pointer;display:none;opacity:0.7;`;
            el.className = "crime-marker";
            el.title = `${crime.category} — ${crime.street}`;
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([crime.lng, crime.lat])
              .setPopup(
                new maplibregl.Popup({ offset: 6, maxWidth: "200px" }).setHTML(
                  `<div style="font-family:system-ui;padding:4px;">
                    <div style="font-weight:600;font-size:12px;color:#f1f5f9;margin-bottom:2px;">🔴 ${crime.category}</div>
                    <div style="font-size:11px;color:#94a3b8;">${crime.street}</div>
                    ${crime.month ? `<div style="font-size:10px;color:#71717a;margin-top:2px;">${crime.month}</div>` : ""}
                    ${crime.outcome ? `<div style="font-size:10px;color:#a1a1aa;margin-top:1px;">Outcome: ${crime.outcome}</div>` : ""}
                    <a href="https://www.police.uk/pu/your-area/essex-police/braintree/?tab=CrimeMap" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6ee7b7;text-decoration:none;margin-top:4px;display:inline-block;">View area crime map ↗</a>
                  </div>`
                )
              )
              .addTo(m);
            crimeMarkers.current.push(marker);
          }
        } catch {
          // Crime markers optional
        }

        // Load planning applications
        try {
          const planRes = await fetch(withConstituency("/api/planning", slug));
          const planData = await planRes.json();
          const apps: PlanningApp[] = planData.applications || [];
          const planColors: Record<string, string> = {
            residential: "#3b82f6",
            commercial: "#f59e0b",
            infrastructure: "#ef4444",
            "change of use": "#a855f7",
            agricultural: "#22c55e",
            "trees/landscaping": "#10b981",
            other: "#6b7280",
          };
          for (const app of apps.slice(0, 30)) {
            if (!app.lat || !app.lng) continue;
            const color = planColors[app.type] || "#6b7280";
            const statusIcon = app.status === "approved" ? "✅" : app.status === "refused" ? "❌" : app.status === "pending" ? "⏳" : "📋";
            const el = document.createElement("div");
            el.style.cssText = `width:10px;height:10px;background:${color};border:2px solid rgba(255,255,255,0.6);border-radius:2px;cursor:pointer;display:none;`;
            el.className = "planning-marker";
            el.title = app.title;
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([app.lng, app.lat])
              .setPopup(
                new maplibregl.Popup({ offset: 8, maxWidth: "250px" }).setHTML(
                  `<div style="font-family:system-ui;padding:4px;">
                    <div style="font-weight:600;font-size:12px;color:#f1f5f9;margin-bottom:2px;">${statusIcon} ${app.type.charAt(0).toUpperCase() + app.type.slice(1)}</div>
                    <div style="font-size:11px;color:#e2e8f0;margin-bottom:3px;">${app.title.substring(0, 120)}${app.title.length > 120 ? "..." : ""}</div>
                    <div style="font-size:10px;color:#94a3b8;">${app.address}</div>
                    <a href="${app.url}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6ee7b7;text-decoration:none;margin-top:4px;display:inline-block;">View application ↗</a>
                  </div>`
                )
              )
              .addTo(m);
            planningMarkers.current.push(marker);
          }
        } catch {
          // Planning markers optional
        }

        // Load places of worship
        try {
          const worshipRes = await fetch(withConstituency("/api/worship", slug));
          const worshipData = await worshipRes.json();
          interface WorshipItem { id: number; name: string; religion: string; denomination: string; address: string; lat: number; lng: number; }
          const places: WorshipItem[] = worshipData.places || [];
          const worshipColors: Record<string, string> = {
            christian: "#3b82f6",
            muslim: "#10b981",
            jewish: "#f59e0b",
            hindu: "#ef4444",
            sikh: "#a855f7",
            buddhist: "#f97316",
          };
          const worshipEmoji: Record<string, string> = {
            christian: "\u26ea",
            muslim: "\ud83d\udd4c",
            jewish: "\ud83d\udd4d",
            hindu: "\ud83d\udd49\ufe0f",
            sikh: "\ud83d\udd49\ufe0f",
            buddhist: "\u2638\ufe0f",
          };
          for (const place of places) {
            if (!place.lat || !place.lng) continue;
            const color = worshipColors[place.religion] || "#6b7280";
            const emoji = worshipEmoji[place.religion] || "\ud83d\uded0";
            const el = document.createElement("div");
            el.style.cssText = `width:10px;height:10px;background:${color};border:2px solid rgba(255,255,255,0.6);border-radius:50%;cursor:pointer;display:none;`;
            el.className = "worship-marker";
            el.title = place.name;
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([place.lng, place.lat])
              .setPopup(
                new maplibregl.Popup({ offset: 8, maxWidth: "230px" }).setHTML(
                  `<div style="font-family:system-ui;padding:4px;">
                    <div style="font-weight:600;font-size:12px;color:#f1f5f9;margin-bottom:2px;">${emoji} ${place.name}</div>
                    <div style="font-size:11px;color:#94a3b8;text-transform:capitalize;">${place.religion}${place.denomination ? ` \u00b7 ${place.denomination}` : ""}</div>
                    ${place.address ? `<div style="font-size:10px;color:#71717a;margin-top:2px;">${place.address}</div>` : ""}
                  </div>`
                )
              )
              .addTo(m);
            worshipMarkers.current.push(marker);
          }
        } catch {
          // Worship markers optional
        }

        // Load flood monitoring stations
        try {
          const floodRes = await fetch(withConstituency("/api/floods", slug));
          const floodData = await floodRes.json();
          interface FloodStation { id: string; label: string; lat: number; lng: number; river: string; type: string; latestValue: number | null; unit: string; }
          const stns: FloodStation[] = floodData.stations || [];
          for (const stn of stns) {
            if (!stn.lat || !stn.lng) continue;
            const hasAlert = (floodData.warnings || []).length > 0;
            const el = document.createElement("div");
            el.style.cssText = `width:10px;height:10px;background:${hasAlert ? "#ef4444" : "#3b82f6"};border:2px solid rgba(255,255,255,0.7);border-radius:50%;cursor:pointer;display:none;`;
            el.className = "flood-marker";
            el.title = stn.label;
            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([stn.lng, stn.lat])
              .setPopup(
                new maplibregl.Popup({ offset: 8, maxWidth: "220px" }).setHTML(
                  `<div style="font-family:system-ui;padding:4px;">
                    <div style="font-weight:600;font-size:12px;color:#f1f5f9;margin-bottom:2px;">🌊 ${stn.label}</div>
                    <div style="font-size:11px;color:#94a3b8;">${stn.river || "Monitoring Station"}</div>
                    ${stn.latestValue !== null ? `<div style="font-size:11px;color:#60a5fa;margin-top:2px;">Latest: ${stn.latestValue} ${stn.unit}</div>` : ""}
                  </div>`
                )
              )
              .addTo(m);
            floodMarkers.current.push(marker);
          }

          // Show flood warnings if any
          for (const warning of (floodData.warnings || []).slice(0, 5)) {
            console.log("⚠️ Flood warning:", warning.description);
          }
        } catch {
          // Flood data optional
        }

        setMapReady(true);
      } catch (err) {
        console.error("Failed to load map data:", err);
        setMapReady(true);
      }
    });

    setTimeout(() => m.resize(), 100);
    setTimeout(() => m.resize(), 500);

    return () => {
      fmsMarkers.current.forEach((mk) => mk.remove());
      fmsMarkers.current = [];
      crimeMarkers.current.forEach((mk) => mk.remove());
      crimeMarkers.current = [];
      planningMarkers.current.forEach((mk) => mk.remove());
      planningMarkers.current = [];
      worshipMarkers.current.forEach((mk) => mk.remove());
      worshipMarkers.current = [];
      floodMarkers.current.forEach((mk) => mk.remove());
      floodMarkers.current = [];
      petitionMarkers.current.forEach((mk) => mk.remove());
      petitionMarkers.current = [];
      aqMarkers.current.forEach((mk) => mk.remove());
      aqMarkers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [slug]);

  // Sync layer visibility
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;

    const setVis = (id: string, visible: boolean) => {
      try { m.setLayoutProperty(id, "visibility", visible ? "visible" : "none"); } catch { /* */ }
    };

    // Boundary
    setVis("boundary-fill", layers["boundary"]);
    setVis("boundary-outline", layers["boundary"]);

    // Vote share (mutually exclusive with prediction & deprivation)
    setVis("wards-vote-fill", layers["wards-vote"]);
    setVis("wards-vote-outline", layers["wards-vote"]);

    // MRP Prediction
    setVis("wards-prediction-fill", layers["wards-prediction"]);
    setVis("wards-prediction-outline", layers["wards-prediction"]);

    // Deprivation
    setVis("wards-deprivation-fill", layers["wards-deprivation"]);
    setVis("wards-deprivation-outline", layers["wards-deprivation"]);

    // Ward labels
    setVis("ward-labels", layers["ward-labels"]);

    // FixMyStreet markers (DOM elements)
    fmsMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["fixmystreet"] ? "block" : "none";
    });

    // Crime markers (DOM elements)
    crimeMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["crime"] ? "block" : "none";
    });

    // Planning markers (DOM elements)
    planningMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["planning"] ? "block" : "none";
    });

    // Worship markers (DOM elements)
    worshipMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["worship"] ? "block" : "none";
    });

    // Flood markers (DOM elements)
    floodMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["floods"] ? "block" : "none";
    });

    // Petition markers (DOM elements)
    petitionMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["petitions"] ? "block" : "none";
    });

    // Air quality markers (DOM elements)
    aqMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      el.style.display = layers["air-quality"] ? "block" : "none";
    });

    // Census choropleth layer
    setVis("census-fill", layers["census"]);
    setVis("census-outline", layers["census"]);

    // Reset ward labels to just names when census is turned off
    if (!layers["census"]) {
      try {
        m.setLayoutProperty("ward-labels", "text-field", ["get", "name"]);
        m.setLayoutProperty("ward-labels", "text-size", 11);
      } catch { /* */ }
    }
  }, [layers, mapReady]);

  // Fetch census data when topic changes or census layer is turned on
  useEffect(() => {
    if (!layers["census"] || !mapReady || !map.current) return;

    const fetchCensus = async () => {
      try {
        const res = await fetch(withConstituency(`/api/census?topic=${censusTopic}`, slug));
        const data = await res.json();
        if (!data.wards) return;

        const wardValues: Record<string, number> = {};
        for (const w of data.wards) {
          wardValues[w.wardCode] = w.value;
        }
        setCensusLabel(data.topic?.primaryLabel || censusTopic);
        setCensusAvg(data.summary?.constituencyAverage || 0);

        // Update the wards source with census data
        const m = map.current;
        if (!m) return;
        const source = m.getSource("wards") as maplibregl.GeoJSONSource;
        if (!source) return;

        // Census recolour requires the per-ward GeoJSON. Listed slugs only —
        // for the rest the census API still returns data but there's nothing
        // to colour.
        const wardsPath = WARDS_GEOJSON_PATHS[slug];
        if (!wardsPath) {
          return;
        }

        // We need to get the current data and enrich it
        // Use the wards geojson URL since we can't read from source directly
        const wardsRes = await fetch(wardsPath);
        const wardsGeo = await wardsRes.json();
        for (const feature of wardsGeo.features) {
          const code = feature.properties.WD24CD;
          const val = wardValues[code] ?? 0;
          feature.properties.censusValue = val;
          // Add a label combining name + percentage for census overlay
          feature.properties.censusLabel = `${feature.properties.WD24NM}\n${val}%`;
        }
        source.setData(wardsGeo);

        // Update ward labels to show census percentages
        try {
          m.setLayoutProperty("ward-labels", "text-field", ["get", "censusLabel"]);
          m.setPaintProperty("ward-labels", "text-color", "#ffffff");
          m.setLayoutProperty("ward-labels", "text-size", 12);
        } catch { /* labels may not exist yet */ }

        // Make census layer clickable with popup (use a flag to avoid duplicate listeners)
        if (!(m as unknown as Record<string, boolean>)._censusClickAdded) {
          (m as unknown as Record<string, boolean>)._censusClickAdded = true;
          m.on("click", "census-fill", (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            const props = e.features?.[0]?.properties;
            if (!props) return;
            new maplibregl.Popup({ closeButton: true, maxWidth: "250px" })
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family:system-ui;padding:6px;">
                  <div style="font-weight:700;font-size:14px;color:#f1f5f9;margin-bottom:4px;">${props.name || props.WD24NM}</div>
                  <div style="font-size:12px;color:#60a5fa;margin-bottom:2px;">${props.censusValue ?? 0}%</div>
                  <div style="font-size:10px;color:#94a3b8;">ONS Census 2021</div>
                </div>
              `)
              .addTo(m);
          });
          m.on("mouseenter", "census-fill", () => { m.getCanvas().style.cursor = "pointer"; });
          m.on("mouseleave", "census-fill", () => { m.getCanvas().style.cursor = ""; });
        }

        // Add census layer if not exists
        if (!m.getLayer("census-fill")) {
          m.addLayer({
            id: "census-fill",
            type: "fill",
            source: "wards",
            paint: {
              "fill-color": [
                "interpolate", ["linear"], ["coalesce", ["get", "censusValue"], 0],
                0, "#0d1b2a",
                5, "#1b263b",
                10, "#415a77",
                20, "#2d6a4f",
                30, "#52b788",
                40, "#e9c46a",
                50, "#f4a261",
                60, "#e76f51",
                75, "#d62828",
                90, "#9d0208",
              ],
              "fill-opacity": 0.65,
            },
          }, "ward-labels");
          m.addLayer({
            id: "census-outline",
            type: "line",
            source: "wards",
            paint: { "line-color": "#ffffff", "line-width": 1.8, "line-opacity": 0.7 },
          }, "ward-labels");
        } else {
          // Trigger repaint by changing property
          m.setPaintProperty("census-fill", "fill-opacity", 0.55);
        }
      } catch (err) {
        console.error("Census fetch error:", err);
      }
    };

    fetchCensus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [censusTopic, layers, mapReady, slug]);

  // Fetch petitions when layer is toggled on
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;

    // Clean up existing markers when toggled off
    if (!layers["petitions"]) {
      petitionMarkers.current.forEach((mk) => mk.remove());
      petitionMarkers.current = [];
      return;
    }

    // Don't re-fetch if markers already exist
    if (petitionMarkers.current.length > 0) return;

    const fetchPetitions = async () => {
      try {
        const res = await fetch(withConstituency("/api/petitions", slug));
        const data = await res.json();
        interface PetitionItem { title: string; url: string; totalSignatures: number; localSignatures: number; salience: number; overIndexed: boolean; }
        const petitions: PetitionItem[] = data.petitions || [];
        const overIndexed = petitions.filter((p) => p.overIndexed);

        if (petitions.length === 0) return;

        // Show a single summary marker at constituency center
        const el = document.createElement("div");
        el.style.cssText = "width:16px;height:16px;background:#8b5cf6;border:2px solid rgba(255,255,255,0.8);border-radius:50%;cursor:pointer;box-shadow:0 0 6px rgba(139,92,246,0.5);";
        el.className = "petition-marker";
        el.title = `E-Petitions: ${overIndexed.length} over-indexed`;

        const topItems = petitions.slice(0, 8);
        const popupHtml = `
          <div style="font-family:system-ui;padding:6px;max-width:280px;">
            <div style="font-weight:700;font-size:13px;color:#f1f5f9;margin-bottom:4px;">📝 E-Petitions — Braintree</div>
            <div style="font-size:10px;color:#a78bfa;margin-bottom:6px;">${overIndexed.length} of ${petitions.length} petitions over-indexed locally</div>
            ${topItems.map((p) => `
              <div style="margin-bottom:5px;padding:4px;border-radius:3px;background:${p.overIndexed ? "rgba(139,92,246,0.12)" : "rgba(100,116,139,0.08)"};">
                <div style="font-size:11px;color:#e2e8f0;margin-bottom:2px;">${p.title.substring(0, 100)}${p.title.length > 100 ? "..." : ""}</div>
                <div style="font-size:10px;color:#94a3b8;">
                  ${p.localSignatures.toLocaleString()} local / ${p.totalSignatures.toLocaleString()} total
                  · <span style="color:${p.overIndexed ? "#a78bfa" : "#64748b"};">Salience: ${p.salience}x</span>
                  ${p.overIndexed ? ' <span style="color:#8b5cf6;">▲</span>' : ""}
                </div>
              </div>
            `).join("")}
            <a href="https://petition.parliament.uk/petitions?state=open" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6ee7b7;text-decoration:none;margin-top:4px;display:inline-block;">View all petitions ↗</a>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([0.534841, 51.974794])
          .setPopup(
            new maplibregl.Popup({ offset: 10, maxWidth: "320px" }).setHTML(popupHtml)
          )
          .addTo(m);
        petitionMarkers.current.push(marker);
      } catch {
        // Petitions markers optional
      }
    };

    fetchPetitions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers["petitions"], mapReady]);

  // Fetch air quality when layer is toggled on
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;

    // Clean up existing markers when toggled off
    if (!layers["air-quality"]) {
      aqMarkers.current.forEach((mk) => mk.remove());
      aqMarkers.current = [];
      return;
    }

    // Don't re-fetch if markers already exist
    if (aqMarkers.current.length > 0) return;

    const fetchAQ = async () => {
      try {
        const res = await fetch(withConstituency("/api/air-quality", slug));
        const data = await res.json();
        interface AQParam { parameter: string; lastValue: number; unit: string; }
        interface AQStation { id: number; name: string; lat: number; lng: number; parameters: AQParam[]; }
        const stations: AQStation[] = data.stations || [];

        for (const stn of stations) {
          if (!stn.lat || !stn.lng) continue;

          // Determine color based on PM2.5 or overall reading quality
          const pm25 = stn.parameters.find((p) => p.parameter.toLowerCase().includes("pm25") || p.parameter.toLowerCase().includes("pm2.5"));
          let markerColor = "#06b6d4"; // default teal/cyan
          if (pm25) {
            if (pm25.lastValue <= 12) markerColor = "#22c55e"; // good — green
            else if (pm25.lastValue <= 35) markerColor = "#f59e0b"; // moderate — yellow
            else if (pm25.lastValue <= 55) markerColor = "#f97316"; // unhealthy sensitive — orange
            else markerColor = "#ef4444"; // unhealthy — red
          }

          const el = document.createElement("div");
          el.style.cssText = `width:12px;height:12px;background:${markerColor};border:2px solid rgba(255,255,255,0.7);border-radius:50%;cursor:pointer;box-shadow:0 0 4px ${markerColor}40;`;
          el.className = "aq-marker";
          el.title = stn.name;

          const paramsHtml = stn.parameters.map((p) => `
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:1px;">
              <span style="color:#94a3b8;text-transform:uppercase;font-size:10px;">${p.parameter}</span>
              <strong style="color:#e2e8f0;">${p.lastValue} ${p.unit}</strong>
            </div>
          `).join("");

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([stn.lng, stn.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 8, maxWidth: "220px" }).setHTML(
                `<div style="font-family:system-ui;padding:4px;">
                  <div style="font-weight:600;font-size:12px;color:#f1f5f9;margin-bottom:4px;">🌬️ ${stn.name}</div>
                  ${paramsHtml || '<div style="font-size:11px;color:#64748b;">No recent readings</div>'}
                  <a href="https://openaq.org/locations/${stn.id}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#6ee7b7;text-decoration:none;margin-top:4px;display:inline-block;">View on OpenAQ ↗</a>
                </div>`
              )
            )
            .addTo(m);
          aqMarkers.current.push(marker);
        }
      } catch {
        // Air quality markers optional
      }
    };

    fetchAQ();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers["air-quality"], mapReady]);

  // Dynamic legend based on active choropleth
  const activeChoropleth = layers["census"]
    ? "census" as const
    : layers["wards-prediction"]
    ? "prediction" as const
    : layers["wards-deprivation"]
    ? "deprivation" as const
    : layers["wards-vote"]
    ? "vote" as const
    : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "500px" }}>
      <div ref={mapContainer} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }} />

      {/* Layer Toggle Panel — World Monitor style */}
      <div className="absolute top-3 left-3 z-10 w-52">
        <button
          onClick={() => setLayerPanel(!layerPanel)}
          className="w-full flex items-center justify-between bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 font-medium hover:bg-zinc-800/95 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            Layers
          </span>
          {layerPanel ? <ChevronUp className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />}
        </button>

        {layerPanel && (
          <div className="mt-1 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-lg overflow-hidden">
            {LAYER_DEFS.map((layer) => (
              <div key={layer.id}>
                <label
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={layers[layer.id] || false}
                    onChange={() => toggleLayer(layer.id)}
                    className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 accent-emerald-500"
                  />
                  <span className="text-sm">{layer.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-zinc-300">{layer.label}</div>
                  </div>
                </label>
                {/* Census topic selector dropdown */}
                {layer.id === "census" && layers["census"] && (
                  <div className="px-3 pb-2">
                    <select
                      value={censusTopic}
                      onChange={(e) => setCensusTopic(e.target.value)}
                      className="w-full text-[10px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="age-under16">Age: Under 16</option>
                      <option value="age-over65">Age: Over 65</option>
                      <option value="ethnicity">Ethnicity: Non-White British</option>
                      <option value="religion">Religion: No Religion</option>
                      <option value="health-bad">Health: Bad/Very Bad</option>
                      <option value="qualifications">Education: Degree+</option>
                      <option value="tenure-owned">Housing: Owner Occupied</option>
                      <option value="tenure-rented">Housing: Social Rented</option>
                      <option value="cars-none">No Car/Van</option>
                      <option value="economic-unemployed">Economically Inactive</option>
                      <option value="deprivation">Household Deprivation</option>
                      <option value="country-born-uk">Born Outside UK</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Crime source link */}
      {layers["crime"] && (
        <div className="absolute bottom-3 left-3 bg-zinc-900/95 backdrop-blur rounded-lg p-2 border border-zinc-700 z-10">
          <div className="text-[10px] text-zinc-400 mb-1 font-medium">Crime Reports</div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {[
              { cat: "ASB", color: "#f59e0b" },
              { cat: "Violence", color: "#ef4444" },
              { cat: "Burglary", color: "#dc2626" },
              { cat: "Vehicle", color: "#a855f7" },
              { cat: "Drugs", color: "#6366f1" },
              { cat: "Other", color: "#f97316" },
            ].map((c) => (
              <div key={c.cat} className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <span className="text-[9px] text-zinc-500">{c.cat}</span>
              </div>
            ))}
          </div>
          <a href="https://data.police.uk/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-emerald-400 hover:text-emerald-300">
            Source: data.police.uk ↗
          </a>
        </div>
      )}

      {/* Dynamic Legend */}
      {activeChoropleth && (
        <div className="absolute bottom-3 right-3 bg-zinc-900/95 backdrop-blur rounded-lg p-3 border border-zinc-700 z-10">
          {activeChoropleth === "vote" && (
            <>
              <div className="text-xs text-zinc-400 mb-2 font-medium">CON Vote Share (2024)</div>
              <div className="flex items-center gap-0.5">
                <div className="h-3 w-5 rounded-sm" style={{ background: "#e74c3c" }} />
                <div className="h-3 w-5 rounded-sm" style={{ background: "#f39c12" }} />
                <div className="h-3 w-5 rounded-sm" style={{ background: "#3498db" }} />
                <div className="h-3 w-5 rounded-sm" style={{ background: "#2471a3" }} />
                <div className="h-3 w-5 rounded-sm" style={{ background: "#1a5276" }} />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>30%</span><span>40%</span><span>50%</span>
              </div>
            </>
          )}
          {activeChoropleth === "prediction" && (
            <>
              <div className="text-xs text-zinc-400 mb-2 font-medium">MRP Predicted Winner</div>
              <div className="space-y-1">
                {[
                  { party: "CON", color: "#0087DC" },
                  { party: "Reform", color: "#12B6CF" },
                  { party: "LAB", color: "#DC241f" },
                ].map((p) => (
                  <div key={p.party} className="flex items-center gap-1.5">
                    <div className="h-3 w-4 rounded-sm" style={{ background: p.color }} />
                    <span className="text-[11px] text-zinc-400">{p.party}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {activeChoropleth === "deprivation" && (
            <>
              <div className="text-xs text-zinc-400 mb-2 font-medium">Deprivation Level</div>
              <div className="space-y-1">
                {[
                  { level: "Low", color: "#10b981" },
                  { level: "Medium", color: "#f59e0b" },
                  { level: "High", color: "#ef4444" },
                ].map((d) => (
                  <div key={d.level} className="flex items-center gap-1.5">
                    <div className="h-3 w-4 rounded-sm" style={{ background: d.color }} />
                    <span className="text-[11px] text-zinc-400">{d.level}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {activeChoropleth === "census" && (
            <>
              <div className="text-xs text-zinc-400 mb-1 font-medium">Census 2021</div>
              <div className="text-[10px] text-zinc-300 mb-2">{censusLabel}</div>
              <div className="flex items-center gap-0.5">
                <div className="h-3 w-4 rounded-sm" style={{ background: "#1b263b" }} />
                <div className="h-3 w-4 rounded-sm" style={{ background: "#415a77" }} />
                <div className="h-3 w-4 rounded-sm" style={{ background: "#2d6a4f" }} />
                <div className="h-3 w-4 rounded-sm" style={{ background: "#e9c46a" }} />
                <div className="h-3 w-4 rounded-sm" style={{ background: "#f4a261" }} />
                <div className="h-3 w-4 rounded-sm" style={{ background: "#e76f51" }} />
                <div className="h-3 w-4 rounded-sm" style={{ background: "#d62828" }} />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>Low</span><span>Avg: {censusAvg}%</span><span>High</span>
              </div>
              <div className="text-[9px] text-zinc-600 mt-1.5">Source: ONS Census 2021</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
