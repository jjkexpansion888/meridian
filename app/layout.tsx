import type { Metadata } from "next";
import "./globals.css";
import "./research-chat.css";

export const metadata: Metadata = {
  title: "Meridian — Investment Intelligence",
  description: "Follow the evidence. Independent research across public equities, digital assets, and private companies.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
