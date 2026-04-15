"use client";

import { constituencyProfile } from "@/data/braintree";
import { MapPin, User, Building2, Users } from "lucide-react";

export default function ConstituencyProfile() {
  const p = constituencyProfile;

  const stats = [
    { icon: <User className="h-3.5 w-3.5" />, label: "MP", value: p.mp },
    { icon: <Building2 className="h-3.5 w-3.5" />, label: "Party", value: p.party },
    { icon: <Users className="h-3.5 w-3.5" />, label: "Population", value: p.population.toLocaleString() },
    { icon: <MapPin className="h-3.5 w-3.5" />, label: "Electorate", value: p.electorate.toLocaleString() },
  ];

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-zinc-800/40 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
              {s.icon}
              <span className="text-[11px] uppercase tracking-wide">{s.label}</span>
            </div>
            <div className="text-sm font-medium text-zinc-200">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.localAuthorities.map((la) => (
          <span
            key={la}
            className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full"
          >
            {la}
          </span>
        ))}
        <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
          {p.region}
        </span>
        <span className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
          {p.area}
        </span>
      </div>
    </div>
  );
}
