import Link from "next/link";
import { ArrowRight, CheckCircle, Clock, Mail, Map, Search, Shield, Zap } from "lucide-react";

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8]">
      {/* Hero */}
      <section className="px-4 py-20 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
            Stop chasing leads.<br />
            <span className="text-teal-700">Let permits come to you.</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-stone-600">
            Portafor monitors real-time building permits in Austin and Orlando.
            When a new roofing, HVAC, or solar permit drops in your territory
            — you get an instant email alert.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-8 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-teal-800"
            >
              Start free for 30 days <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-stone-500">No credit card required. Cancel anytime.</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold text-stone-950">How it works</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {[
              { icon: Map, title: "Draw your territory", desc: "Drop a pin or draw a polygon on the map. We watch that area 24/7." },
              { icon: Search, title: "We monitor permits", desc: "Every new building permit filed with the city is checked against your zone." },
              { icon: Mail, title: "Get instant alerts", desc: "Receive an email the moment a matching permit appears. Be the first to call." }
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-stone-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-semibold text-stone-950">
            You&apos;re losing leads to contractors who check permit sites first.
          </h2>
          <div className="mt-10 space-y-4">
            {[
              "City websites update slowly and are hard to search",
              "By the time you check, another contractor already called",
              "You can&apos;t monitor 10 cities manually"
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-4">
                <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                <span className="text-stone-700">{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-lg font-medium text-teal-700">
            Portafor does the checking for you — every hour, automatically.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-stone-200 bg-white px-4 py-12 lg:px-8">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 text-center sm:grid-cols-3">
          {[
            { value: "2,000+", label: "Permits monitored" },
            { value: "2", label: "Cities active" },
            { value: "< 1 hr", label: "Alert response time" }
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="text-3xl font-semibold text-teal-700">{value}</div>
              <div className="mt-1 text-sm text-stone-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold text-stone-950">Everything you need</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {[
              { icon: Zap, title: "Real-time monitoring", desc: "We poll city data feeds hourly. No manual checking required." },
              { icon: Map, title: "Territory mapping", desc: "Draw your exact service area on an interactive map." },
              { icon: Mail, title: "Email alerts", desc: "Permit details, address, filing date — delivered to your inbox." },
              { icon: Search, title: "Filing search", desc: "Search any address to find nearby permits on demand." }
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-stone-900">{title}</h3>
                  <p className="mt-1 text-sm text-stone-600">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-2xl font-semibold text-stone-950">Simple pricing</h2>
          <div className="mt-8 rounded-2xl border border-stone-200 bg-[#FAFAF8] p-8">
            <div className="text-sm font-medium text-teal-700">Free for 30 days</div>
            <div className="mt-2 text-4xl font-semibold text-stone-950">$49<span className="text-lg font-normal text-stone-500">/month</span></div>
            <p className="mt-3 text-sm text-stone-600">Full access. Cancel anytime. Keep your data.</p>
            <Link
              href="/sign-up"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-6 py-3 text-base font-medium text-white transition hover:bg-teal-800"
            >
              Start your trial
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-teal-700 px-4 py-16 text-center lg:px-8 lg:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Every permit is a homeowner who needs your services.
          </h2>
          <p className="mt-3 text-lg text-teal-100">Start finding them today.</p>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-medium text-teal-700 shadow-sm transition hover:bg-stone-50"
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
