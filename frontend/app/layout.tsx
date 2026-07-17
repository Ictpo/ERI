import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { AppearanceProvider } from "@/lib/appearance";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Display serif for the wordmark and headings (BRANDING.md Step 2).
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ERI — Hear the pattern beneath the noise",
  description:
    "Statistical text analysis: word statistics, Reinert classification, similarity networks and correspondence analysis.",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable} font-sans`}>
        <AppearanceProvider>
          {children}
          <Toaster />
        </AppearanceProvider>
      </body>
    </html>
  );
}
