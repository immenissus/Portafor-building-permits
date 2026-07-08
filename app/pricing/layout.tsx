import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Building Permit Alerts for Contractors",
  description: "Simple, transparent pricing for Portafor. Start with a 30-day free trial. Plans for solo contractors, growing businesses, and multi-location teams.",
  openGraph: {
    title: "Portafor Pricing — Building Permit Alert Plans",
    description: "Start with a 30-day free trial. Plans from $49/mo for solo contractors to $249/mo for enterprise teams.",
    url: "https://portafor.info/pricing",
    siteName: "Portafor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portafor Pricing",
    description: "Start with a 30-day free trial. Plans from $49/mo.",
  },
  alternates: {
    canonical: "https://portafor.info/pricing",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
