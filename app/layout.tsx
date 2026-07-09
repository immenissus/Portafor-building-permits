import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: {
    default: "Portafor — Building Permit & License Alerts for Contractors",
    template: "%s | Portafor"
  },
  description: "Real-time building permit and business license alerts for roofers, HVAC, solar installers, and local service contractors. Get instant email notifications when new permits drop in your territory.",
  keywords: ["building permits", "permit alerts", "contractor leads", "HVAC permits", "roofing permits", "solar permits", "business licenses", "Austin permits", "Orlando permits"],
  openGraph: {
    title: "Portafor — Building Permit & License Alerts",
    description: "Real-time building permit and business license alerts for local service contractors.",
    url: "https://portafor.info",
    siteName: "Portafor",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Portafor — Building Permit & License Alerts",
    description: "Real-time building permit and business license alerts for local service contractors."
  },
  icons: {
    icon: "/favicon.png"
  }
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Portafor",
  url: "https://portafor.info",
  logo: "https://portafor.info/favicon.png",
  description: "Real-time building permit and business license alerts for local service contractors.",
  sameAs: [],
  areaServed: [
    { "@type": "City", name: "Austin", containedInPlace: { "@type": "State", name: "Texas" } },
    { "@type": "City", name: "Collin County", containedInPlace: { "@type": "State", name: "Texas" } },
    { "@type": "City", name: "Chicago", containedInPlace: { "@type": "State", name: "Illinois" } },
    { "@type": "City", name: "New York City", containedInPlace: { "@type": "State", name: "New York" } },
    { "@type": "City", name: "Seattle", containedInPlace: { "@type": "State", name: "Washington" } },
    { "@type": "City", name: "Orlando", containedInPlace: { "@type": "State", name: "Florida" } },
  ],
  makesOffer: {
    "@type": "Offer",
    itemOffered: {
      "@type": "Service",
      name: "Building Permit & License Alert Service",
      description: "Automated monitoring of building permits and business licenses with instant email alerts."
    }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
