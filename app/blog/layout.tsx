import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Building Permit Tips & Contractor Insights",
  description: "Read about building permits, contractor leads, and how local service businesses can grow using permit data and territory monitoring.",
  openGraph: {
    title: "Portafor Blog — Permit & Contractor Insights",
    description: "Tips, insights, and updates about building permits and contractor lead generation.",
    url: "https://portafor.info/blog",
    siteName: "Portafor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Portafor Blog",
    description: "Building permit tips and contractor insights.",
  },
  alternates: {
    canonical: "https://portafor.info/blog",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
