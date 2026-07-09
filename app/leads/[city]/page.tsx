import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const cities: Record<string, {
  name: string;
  state: string;
  description: string;
  highlights: string[];
  permitStats: string;
}> = {
  austin: {
    name: "Austin",
    state: "Texas",
    description: "Get real-time building permit alerts in Austin, TX. Portafor monitors Austin's Socrata data feed for new roofing, HVAC, and solar permits filed in your service territory.",
    highlights: ["Travis County permit data", "Same-day alerts for new filings", "Covering Austin metro area"],
    permitStats: "Austin issues thousands of building permits annually across residential and commercial projects.",
  },
  "collin-county": {
    name: "Collin County",
    state: "Texas",
    description: "Get real-time building permit alerts in Collin County, TX. Portafor monitors Texas state data for new roofing, HVAC, and solar permits across Collin County.",
    highlights: ["Texas state permit data", "County-wide coverage", "Suburban and rural permits"],
    permitStats: "Collin County's rapid growth drives consistent permit activity.",
  },
  chicago: {
    name: "Chicago",
    state: "Illinois",
    description: "Get real-time building permit alerts in Chicago, IL. Portafor monitors Chicago's open data portal for new roofing, HVAC, and solar permits.",
    highlights: ["Chicago data portal integration", "Cook County coverage", "Urban and suburban permits"],
    permitStats: "Chicago's building permit system tracks thousands of permits annually.",
  },
  "new-york-city": {
    name: "New York City",
    state: "New York",
    description: "Get real-time building permit alerts in New York City, NY. Portafor monitors NYC DOB data for new roofing, HVAC, and solar permits across all five boroughs.",
    highlights: ["NYC DOB data feeds", "All five boroughs", "Residential and commercial"],
    permitStats: "NYC's Department of Buildings processes tens of thousands of permits annually.",
  },
  seattle: {
    name: "Seattle",
    state: "Washington",
    description: "Get real-time building permit alerts in Seattle, WA. Portafor monitors Seattle data for new roofing, HVAC, and solar permits.",
    highlights: ["Seattle data portal", "King County coverage", "Urban development permits"],
    permitStats: "Seattle's rapid development drives high permit volumes.",
  },
  orlando: {
    name: "Orlando",
    state: "Florida",
    description: "Get real-time building permit alerts in Orlando, FL. Portafor monitors Orange County permit data for new roofing, HVAC, and solar permits in your territory.",
    highlights: ["Orange County permit feeds", "Instant email notifications", "Central Florida coverage"],
    permitStats: "Orlando's growth drives consistent permit activity across residential and commercial construction.",
  },
};

export function generateStaticParams() {
  return Object.keys(cities).map((city) => ({ city }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = cities[citySlug];
  if (!city) return {};

  const title = `${city.name} Building Permit & Contractor Leads | Portafor`;
  const description = city.description;
  const url = `https://portafor.info/leads/${citySlug}`;

  return {
    title,
    description,
    openGraph: { title, description, url, siteName: "Portafor", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: url },
  };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: citySlug } = await params;
  const city = cities[citySlug];
  if (!city) notFound();

  const citySchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Building Permit Leads in ${city.name}, ${city.state}`,
    description: city.description,
    provider: { "@type": "Organization", name: "Portafor", url: "https://portafor.info" },
    areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": "State", name: city.state } },
    serviceType: "Building Permit Alert Service",
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(citySchema) }} />

      <nav className="border-b border-stone-200/60 bg-[#FAFAF8]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/" className="text-xl font-semibold text-stone-950">Portafor</Link>
          <div className="flex items-center gap-3">
            <Link href="/blog" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">Blog</Link>
            <Link href="/sign-in" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">Log in</Link>
            <Link href="/sign-up" className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-800">Start free trial</Link>
          </div>
        </div>
      </nav>

      <section className="px-4 pt-16 pb-20 lg:px-8 lg:pt-24 lg:pb-28">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-medium text-teal-700 mb-3">Now monitoring {city.name}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">{city.name} Building Permit Leads</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">{city.description}</p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link href="/sign-up" className="inline-flex items-center justify-center rounded-xl bg-teal-700 px-8 py-4 text-base font-medium text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800">
              Start getting {city.name} leads
            </Link>
            <Link href="/pricing" className="inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-8 py-4 text-base font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-stone-950">How Portafor works in {city.name}</h2>
          <p className="mt-3 text-stone-600">{city.permitStats}</p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {city.highlights.map((h) => (
              <div key={h} className="rounded-2xl border border-stone-200 bg-stone-50 p-6"><p className="font-medium text-stone-900">{h}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-stone-950">What is a building permit lead?</h2>
          <div className="mt-4 space-y-4 text-stone-600 leading-relaxed">
            <p>A building permit is filed with the city when a homeowner or business plans construction work — a new roof, HVAC installation, solar panels, or renovations. These permits are public record and represent potential customers who need your services.</p>
            <p>Portafor monitors the {city.name} permit data feed and alerts you the moment a new permit matching your service type is filed in your territory.</p>
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-semibold text-stone-950">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-stone-200">
            {[
              { q: `How quickly does Portafor alert me about new ${city.name} permits?`, a: `We poll the ${city.name} permit data feed every hour. Most alerts arrive within 60 minutes of a permit being posted publicly.` },
              { q: `What types of permits does Portafor track in ${city.name}?`, a: "Building permits and business licenses. We monitor new construction, renovations, roofing, HVAC, solar, and more." },
              { q: "Is there a free trial?", a: "Yes — every plan starts with a 30-day free trial. Cancel anytime, no contracts." },
            ].map(({ q, a }) => (
              <div key={q} className="py-5"><h3 className="text-base font-medium text-stone-900">{q}</h3><p className="mt-2 text-sm leading-relaxed text-stone-600">{a}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative bg-teal-700 px-4 py-20 text-center lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">Start getting {city.name} permit leads today</h2>
          <p className="mt-4 text-lg text-teal-100">Free for 30 days. Cancel anytime.</p>
          <Link href="/sign-up" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-medium text-teal-700 shadow-lg transition hover:bg-stone-50">Get started free</Link>
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
