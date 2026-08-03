import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./polish.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blackvector.win";
const SITE_ROOT = SITE_URL.endsWith("/") ? SITE_URL : `${SITE_URL}/`;
const SOCIAL_IMAGE = new URL("og.png", SITE_ROOT).toString();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ROOT),
  title: {
    default: "Black Vector | Large-Scale Fleet-Command RTS",
    template: "%s | Black Vector",
  },
  description:
    "Build fleets, capture strategic territory, grow a wartime economy, and command massive real-time battles across human space.",
  applicationName: "Black Vector",
  keywords: [
    "Black Vector",
    "fleet-command RTS",
    "large-scale RTS",
    "space strategy game",
    "science fiction game",
  ],
  openGraph: {
    type: "website",
    title: "Black Vector",
    description: "The machines left. The war began.",
    siteName: "Black Vector",
    images: [
      {
        url: SOCIAL_IMAGE,
        width: 1200,
        height: 630,
        alt: "Black Vector carrier group above a storm world",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Black Vector",
    description: "The machines left. The war began.",
    images: [SOCIAL_IMAGE],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
