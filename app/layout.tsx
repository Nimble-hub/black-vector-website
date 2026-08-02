import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Black Vector",
  description: "A cinematic fleet-command RTS.",
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
