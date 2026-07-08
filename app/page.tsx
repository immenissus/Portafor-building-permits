import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import MarketingPage from "./marketing/page";

export const metadata: Metadata = {
  title: "Portafor — Building Permit & License Alerts for Contractors",
  description: "Real-time building permit and business license alerts for roofers, HVAC, solar installers, and local service contractors. Get instant email notifications when new permits drop in your territory.",
  keywords: [
    "building permits", "permit alerts", "contractor leads", "HVAC permits",
    "roofing permits", "solar permits", "business licenses", "contractor email alerts",
    "building permit leads", "permit notification service"
  ],
  openGraph: {
    title: "Portafor — Building Permit & License Alerts for Contractors",
    description: "Stop chasing leads. Let permits come to you. Real-time building permit alerts for local service contractors.",
    url: "https://portafor.info",
    siteName: "Portafor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portafor — Building Permit & License Alerts",
    description: "Real-time building permit alerts for local service contractors.",
  },
  alternates: {
    canonical: "https://portafor.info",
  },
};

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return <MarketingPage />;
}
