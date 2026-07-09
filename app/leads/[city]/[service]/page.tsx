import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const services: Record<string, {
  name: string;
  description: string;
  content: string;
}> = {
  "roofing-leads": {
    name: "Roofing Leads",
    description: "Get real-time roofing permit alerts. When a homeowner files a roofing permit in your territory, you get an instant email.",
    content: "Roofing permits are filed every day across the country. Each one represents a homeowner or business that needs a new roof, repairs, or re-roofing. Portafor monitors building permit data and alerts you the moment a roofing permit is filed in your service area.",
  },
  "hvac-leads": {
    name: "HVAC Leads",
    description: "Get real-time HVAC permit alerts. When a new HVAC permit is filed, you get notified instantly.",
    content: "HVAC permits are filed for new installations, replacements, and major repairs. Each permit represents a potential customer who needs HVAC services. Portafor tracks these permits and sends you alerts as they happen.",
  },
  "solar-leads": {
    name: "Solar Leads",
    description: "Get real-time solar permit alerts. Track new solar installation permits in your territory.",
    content: "Solar permits are filed for residential and commercial solar panel installations. These represent high-value projects. Portafor monitors solar permits and notifies you when new ones are filed in your area.",
  },
  "building-permit-leads": {
    name: "Building Permit Leads",
    description: "Get real-time building permit alerts for all types of construction work.",
    content: "Building permits cover a wide range of construction work — from new builds to renovations, additions, and repairs. Portafor monitors all building permits in your territory and alerts you to new opportunities.",
  },
  "contractor-leads": {
    name: "Contractor Leads",
    description: "Get real-time contractor permit alerts. Track new permits filed by contractors in your area.",
    content: "Contractor permits are filed for electrical, plumbing, roofing, HVAC, and general construction work. Each permit represents a potential customer. Portafor monitors these permits and sends you alerts.",
  },
};

const cities: Record<string, { name: string; state: string }> = {
  austin: { name: "Austin", state: "Texas" },
  "collin-county": { name: "Collin County", state: "Texas" },
  chicago: { name: "Chicago", state: "Illinois" },
  "new-york-city": { name: "New York City", state: "New York" },
  seattle: { name: "Seattle", state: "Washington" },
  orlando: { name: "Orlando", state: "Florida" },
};

export function generateStaticParams() {
  const params: { city: string; service: string }[] = [];
  for (const city of Object.keys(cities)) {
    for (const service of Object.keys(services)) {
      params.push({ city, service });
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ city: string; service: string }> }): Promise<Metadata> {
  const { city: citySlug, service: serviceSlug } = await params;
  const city = cities[citySlug];
  const service = services[serviceSlug];
  if (!city || !service) return {};

  const title = `${service.name} in ${city.name}, ${city.state} | Portafor`;
  const description = `${service.description} Serving ${city.name}, ${city.state} and surrounding areas.`;
  const url = `https://www.portafor.info/leads/${citySlug}/${serviceSlug}`;

  return {
    title,
    description,
    openGraph: { title, description, url, siteName: "Portafor", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: url },
  };
}

export default async function ServiceCityPage({ params }: { params: Promise<{ city: string; service: string }> }) {
  const { city: citySlug, service: serviceSlug } = await params;
  const city = cities[citySlug];
  const service = services[serviceSlug];
  if (!city || !service) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${service.name} in ${city.name}, ${city.state}`,
    description: service.description,
    provider: { "@type": "Organization", name: "Portafor", url: "https://www.portafor.info" },
    areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": "State", name: city.state } },
    serviceType: service.name,
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <nav className="border-b border-stone-200/60 bg-[#FAFAF8]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/" className="text-xl font-semibold text-stone-950">Portafor</Link>
          <div className="flex items-center gap-3">
            <Link href={`/leads/${citySlug}`} className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">{city.name}</Link>
            <Link href="/sign-up" className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-800">Start free trial</Link>
          </div>
        </div>
      </nav>

      <section className="px-4 pt-16 pb-20 lg:px-8 lg:pt-24 lg:pb-28">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-medium text-teal-700 mb-3">{service.name} in {city.name}, {city.state}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            {service.name} — {city.name}, {city.state}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">
            {service.description} Portafor automatically monitors permit data in {city.name} and sends you instant alerts.
          </p>
          <div className="mt-8">
            <Link href="/sign-up" className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-8 py-4 text-base font-medium text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800">
              Start getting {city.name} {service.name.toLowerCase()}
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-stone-950">How it works</h2>
          <div className="mt-6 space-y-4 text-stone-600 leading-relaxed">
            <p>{service.content}</p>
            <p>
              When you sign up, you draw your service territory on a map. Portafor then monitors the {city.name} permit
              data feed and matches new permits against your territory. When a match is found, you receive an email with
              the permit details — address, filing date, and permit type.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-stone-950">FAQs</h2>
          <div className="mt-8 divide-y divide-stone-200">
            {[
              { q: `What ${service.name.toLowerCase()} are tracked in ${city.name}?`, a: "We track all building permits and business licenses filed with the city. This includes new construction, renovations, replacements, and major repairs." },
              { q: "How fast are the alerts?", a: "We poll permit data every hour. Most alerts arrive within 60 minutes of a permit being posted." },
              { q: "Can I try before I buy?", a: "Yes — every plan starts with a 30-day free trial. No credit card required to start." },
            ].map(({ q, a }) => (
              <div key={q} className="py-5">
                <h3 className="text-base font-medium text-stone-900">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-semibold text-stone-950">Ready to start?</h2>
          <p className="mt-3 text-stone-600">Join contractors across {city.name} who use Portafor to find leads.</p>
          <Link href="/sign-up" className="mt-6 inline-flex items-center justify-center rounded-xl bg-teal-700 px-8 py-4 text-base font-medium text-white shadow-lg transition hover:bg-teal-800">
            Start free for 30 days
          </Link>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white px-4 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-stone-500 sm:flex-row">
          <div>&copy; {new Date().getFullYear()} Portafor. All rights reserved.</div>
          <div className="flex gap-6">
            <Link href="/blog" className="hover:text-stone-700 transition">Blog</Link>
            <Link href="/pricing" className="hover:text-stone-700 transition">Pricing</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
