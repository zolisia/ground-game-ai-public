"use client";

import { User, Building2, Users } from "lucide-react";
import { useConstituency } from "@/hooks/useConstituency";
import { getFullData } from "@/data";
export default function ConstituencyProfile() {
  const { slug } = useConstituency();
  const data = getFullData(slug);

  if (!data) {
    return (
      <div className="p-4 text-[11px] text-zinc-500">
        Constituency data not available.
      </div>
    );
  }

  const mpName = data.mp?.name ?? data.constituency.mp;
  const party = data.constituency.party;
  const population = data.constituency.population ?? null;

  const localAuthorities = (data.areas?.lads ?? []).map((lad) => lad.name);
  const region = data.constituency.region;
  const county = data.constituency.county;

  const stats = [
    { icon: <User className="h-3.5 w-3.5" />, label: "MP", value: mpName },
    { icon: <Building2 className="h-3.5 w-3.5" />, label: "Party", value: party },
    // Population shown only when sourced — electorate is already visible in
    // ElectoralIntel directly below this panel so we don't repeat it here.
    ...(population != null
      ? [{ icon: <Users className="h-3.5 w-3.5" />, label: "Population", value: population.toLocaleString() }]
      : []),
  ];

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
              {s.icon}
              <span className="text-[11px] uppercase tracking-wide">{s.label}</span>
            </div>
            <div className="text-sm font-medium text-zinc-200">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {localAuthorities.map((la) => (
          <span
            key={la}
            className="text-[11px] bg-muted text-zinc-400 px-2 py-0.5 rounded-full"
          >
            {la}
          </span>
        ))}
        {region && (
          <span className="text-[11px] bg-muted text-zinc-400 px-2 py-0.5 rounded-full">
            {region}
          </span>
        )}
        {county && (
          <span className="text-[11px] bg-muted text-zinc-400 px-2 py-0.5 rounded-full">
            {county}
          </span>
        )}
      </div>
    </div>
  );
}
