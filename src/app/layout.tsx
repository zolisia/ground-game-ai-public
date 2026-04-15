import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ground Game Intel — Constituency Intelligence",
  description:
    "Real-time constituency intelligence dashboard for MPs and parliamentary candidates. Local news, voter data, community issues, and AI-powered briefings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#0a0a0a] text-zinc-200">
        {children}
      </body>
    </html>
  );
}
