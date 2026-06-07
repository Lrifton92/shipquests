import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "./_components/BottomNav";
import { Providers } from "./_components/Providers";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShipQuests — earn cUSD",
  description: "Complete simple onchain actions, claim cUSD rewards. Built for MiniPay on Celo.",
  other: {
    "talentapp:project_verification":
      "c8e931f60adf8d451535108b3c445ab16fdafa75af4c2049fd82149f5298ea0380d132af51b20786f1ae1fad7b04d08a8a64828aee04330a72c8ecf27f6bb10a",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
