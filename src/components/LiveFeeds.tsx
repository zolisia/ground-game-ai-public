"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Play, Tv } from "lucide-react";

interface Channel {
  name: string;
  shortName: string;
  type: "youtube" | "iplayer";
  youtubeVideoId?: string;
  directUrl: string;
  color: string;
  textColor: string;
  description: string;
}

// Known live stream video IDs (these are long-running 24/7 streams)
// Sky News: 9Auq9mYxFEE — GB News: various, check channel
// If a video ID stops working, the component falls back to a direct link
const CHANNELS: Channel[] = [
  // Live video IDs rotate. The /embed/live_stream?channel= form returns Error 153 (verified May 2026), so we hardcode and update manually when the embed breaks.
  {
    name: "Sky News",
    shortName: "SKY",
    type: "youtube",
    youtubeVideoId: "11Bog8oUYFk",
    directUrl: "https://www.youtube.com/@SkyNews/live",
    color: "bg-sky-600/20",
    textColor: "text-sky-400",
    description: "24/7 live stream on YouTube",
  },
  {
    name: "GB News",
    shortName: "GB",
    type: "youtube",
    youtubeVideoId: "QliL4CGc7iY",
    directUrl: "https://www.youtube.com/@GBNews/live",
    color: "bg-red-600/20",
    textColor: "text-red-400",
    description: "24/7 live stream on YouTube",
  },
  {
    name: "BBC News",
    shortName: "BBC",
    type: "iplayer",
    directUrl: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    color: "bg-red-700/20",
    textColor: "text-red-300",
    description: "BBC iPlayer (UK only)",
  },
  {
    name: "BBC Parliament",
    shortName: "PARL",
    type: "iplayer",
    directUrl: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
    color: "bg-purple-600/20",
    textColor: "text-purple-400",
    description: "BBC iPlayer (UK only)",
  },
  {
    name: "Times Radio",
    shortName: "TIMES",
    type: "youtube",
    youtubeVideoId: "eTIATpVxKbI",
    directUrl: "https://www.youtube.com/@ListenToTimesRadio/live",
    color: "bg-blue-700/20",
    textColor: "text-blue-300",
    description: "24/7 live talk radio from News UK",
  },
];

export default function LiveFeeds() {
  const [activeChannel, setActiveChannel] = useState(0);
  const [embedFailed, setEmbedFailed] = useState<Record<number, boolean>>({});
  const channel = CHANNELS[activeChannel];

  // Reset embed failure state when switching channels
  useEffect(() => {
    // Give embed 5 seconds to load, then mark as potentially failed
    const timer = setTimeout(() => {
      // We don't auto-mark as failed; only the error event does that
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeChannel]);

  const showEmbed = channel.type === "youtube" && channel.youtubeVideoId && !embedFailed[activeChannel];

  return (
    <div>
      {/* Channel selector strip */}
      <div className="flex items-center border-b border-border/50">
        {CHANNELS.map((ch, i) => (
          <button
            key={ch.name}
            onClick={() => setActiveChannel(i)}
            className={`flex-1 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide transition-all ${
              i === activeChannel
                ? `${ch.textColor} border-b-2 ${ch.textColor.replace("text-", "border-")}`
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {ch.shortName}
          </button>
        ))}
      </div>

      {/* Video area */}
      <div className="relative">
        {showEmbed ? (
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              src={`https://www.youtube.com/embed/${channel.youtubeVideoId}?autoplay=0&mute=1&modestbranding=1&rel=0`}
              className="absolute inset-0 w-full h-full bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={`${channel.name} Live Stream`}
              onError={() => setEmbedFailed((prev) => ({ ...prev, [activeChannel]: true }))}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 bg-background/80">
            <div className={`p-3 rounded-full ${channel.color} mb-3`}>
              <Tv className={`h-6 w-6 ${channel.textColor}`} />
            </div>
            <p className="text-xs text-zinc-400 mb-1 font-medium">{channel.name}</p>
            <p className="text-[11px] text-zinc-600 mb-3">
              {channel.description}
            </p>
            <a
              href={channel.directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium ${channel.color} ${channel.textColor} hover:brightness-125 transition-all`}
            >
              <Play className="h-3.5 w-3.5" />
              Watch Live
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1.5 flex items-center justify-between border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-red-400 font-semibold">LIVE</span>
        </div>
        <a
          href={channel.directUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-zinc-600 hover:text-emerald-400 flex items-center gap-1 transition-colors"
        >
          Open in new tab <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}
