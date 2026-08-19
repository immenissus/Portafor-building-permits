"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, CheckCircle, Clock, Mail, Map, Search, Shield, Zap,
  Star, Users, TrendingUp, Bell, Globe, BarChart3, Loader2
} from "lucide-react";

const pricingTiers = [
  { name: "Starter", price: 49, yearlyPrice: 39, description: "For solo contractors", features: ["1 city territory", "Building permit alerts", "Email notifications", "Basic territory mapping", "30-day free trial"], tier: "starter", popular: false },
  { name: "Professional", price: 99, yearlyPrice: 79, description: "For growing businesses", features: ["Up to 3 city territories", "Building permits + business licenses", "Instant email alerts", "Advanced territory mapping", "Filing search tool", "Priority support"], tier: "professional", popular: true },
  { name: "Enterprise", price: 249, yearlyPrice: 199, description: "For multi-location teams", features: ["Unlimited city territories", "All permit types", "Instant alerts + daily digest", "Team dashboard access", "API access", "Dedicated account manager", "Custom integrations"], tier: "enterprise", popular: false }
];

function PricingSection() {
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  async function handleSubscribe(tier: string) {
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval: billingInterval })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setLoadingTier(null);
      }
    } catch {
      setLoadingTier(null);
    }
  }

  return (
    <section id="pricing" className="px-4 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <h2 className="text-center text-3xl font-semibold text-stone-950">Simple, transparent pricing</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-stone-600">Start free for 30 days. Cancel anytime.</p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <button onClick={() => setBillingInterval("monthly")} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${billingInterval === "monthly" ? "bg-teal-700 text-white" : "text-stone-600 hover:text-stone-900"}`}>Monthly</button>
            <button onClick={() => setBillingInterval("yearly")} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${billingInterval === "yearly" ? "bg-teal-700 text-white" : "text-stone-600 hover:text-stone-900"}`}>Yearly <span className="ml-1 text-xs text-amber-600">Save 20%</span></button>
          </div>
        </motion.div>
        <motion.div className="mt-12 grid gap-6 lg:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          {pricingTiers.map(({ name, price, yearlyPrice, description, features, tier, popular }) => {
            const displayPrice = billingInterval === "yearly" ? yearlyPrice : price;
            const isLoading = loadingTier === tier;
            return (
              <motion.div key={tier} variants={fadeUp} className={`relative rounded-2xl border p-6 ${popular ? "border-teal-200 bg-white shadow-lg shadow-teal-100/50 ring-1 ring-teal-100" : "border-stone-200 bg-white"}`}>
                {popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-700 px-4 py-1 text-xs font-medium text-white">Most popular</div>}
                <div className="text-sm font-medium text-stone-500">{name}</div>
                <div className="mt-2 flex items-baseline gap-1"><span className="text-4xl font-semibold text-stone-950">${displayPrice}</span><span className="text-stone-500">/month</span></div>
                {billingInterval === "yearly" && <p className="mt-1 text-xs text-stone-500">${displayPrice * 12}/year</p>}
                <p className="mt-2 text-sm text-stone-600">{description}</p>
                <button onClick={() => handleSubscribe(tier)} disabled={isLoading} className={`mt-6 inline-flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-medium transition ${popular ? "bg-teal-700 text-white hover:bg-teal-800" : "border border-stone-200 text-stone-700 hover:bg-stone-50"} disabled:opacity-50`}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start free trial"}
                </button>
                <ul className="mt-6 space-y-3">
                  {features.map((f) => (<li key={f} className="flex items-start gap-2.5 text-sm text-stone-600"><CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-600" />{f}</li>))}
                </ul>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } }
};

const testimonials = [
  {
    name: "Mike Rodriguez",
    company: "Premier Roofing Austin",
    text: "We landed 3 new jobs in our first week. The alerts come in before anyone else is even checking the city site.",
    rating: 5,
    role: "Owner"
  },
  {
    name: "Sarah Chen",
    company: "SunCoast Solar FL",
    text: "I used to spend an hour every morning checking permit websites. Now I just wait for the email. Game changer.",
    rating: 5,
    role: "Sales Manager"
  },
  {
    name: "David Thompson",
    company: "Thompson HVAC Services",
    text: "The territory map is perfect. I set it up once and now leads just flow in automatically.",
    rating: 5,
    role: "Owner"
  }
];

const faqs = [
  {
    q: "How quickly do I get alerted after a permit is filed?",
    a: "We poll city data feeds every hour. Most alerts arrive within 60 minutes of a permit being posted publicly."
  },
  {
    q: "Can I monitor multiple cities?",
    a: "Yes! Draw separate territories in each city you serve. Each territory gets its own independent monitoring."
  },
  {
    q: "What happens after the 30-day free trial?",
    a: "You continue at your selected plan price. Cancel anytime — no contracts, no commitments."
  },
  {
    q: "Do I need to install anything?",
    a: "No. Portafor is 100% web-based. Just sign in from any browser — desktop, tablet, or phone."
  },
  {
    q: "Which permit types do you track?",
    a: "Building permits and business licenses. We monitor new construction, renovations, roofing, HVAC, solar, and more."
  }
];

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] overflow-hidden">
      {/* Top Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-stone-200/60 bg-[#FAFAF8]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/" className="text-xl font-semibold text-stone-950">Portafor</Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-stone-600 hover:text-stone-900 transition">
              Log in
            </Link>
            <Link href="/sign-up" className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-teal-800">
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-4 pt-28 pb-20 lg:px-8 lg:pt-36 lg:py-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-teal-100/40 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-amber-100/30 blur-3xl" />
        </div>
        <motion.div
          className="relative mx-auto max-w-4xl text-center"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} className="mb-6 inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-700">
            <Bell className="h-4 w-4" />
            Now monitoring 6 cities across the US
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl lg:text-6xl">
            Stop chasing leads.<br />
            <span className="text-teal-700">Let permits come to you.</span>
          </motion.h1>
          <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">
            Portafor monitors real-time building permits in Austin, Collin County, Chicago, New York City, Seattle, and Orlando.
            When a new roofing, HVAC, or solar permit drops in your territory
            — you get an instant email alert before your competitors even know it exists.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-2 rounded-xl bg-teal-700 px-8 py-4 text-base font-medium text-white shadow-lg shadow-teal-700/25 transition hover:bg-teal-800 hover:shadow-xl hover:shadow-teal-700/30"
            >
              Start free for 30 days
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-8 py-4 text-base font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
            >
              See how it works
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-5 text-sm text-stone-500">
            30-day free trial · Cancel anytime
          </motion.p>
        </motion.div>
      </section>

      {/* Dashboard Preview */}
      <section className="px-4 pb-16 lg:px-8">
        <motion.div
          className="mx-auto max-w-5xl"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={scaleIn}
        >
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-stone-200/50">
            <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-amber-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-stone-400">portafor.info/dashboard</span>
            </div>
            <div className="relative aspect-[16/9]">
              <img src="/images/dashboard-preview.png" alt="Portafor dashboard showing permit alerts" className="h-full w-full object-cover" />
            </div>
          </div>
        </motion.div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-center text-3xl font-semibold text-stone-950">How it works</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-stone-600">Three simple steps to start getting leads from building permits.</p>
          </motion.div>
          <motion.div className="mt-16 grid gap-8 sm:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {[
              { icon: Map, step: "01", title: "Draw your territory", desc: "Drop a pin or draw a polygon on the map. We watch it 24/7." },
              { icon: Search, step: "02", title: "We monitor permits", desc: "Every new building permit filed with the city is automatically checked against your zone." },
              { icon: Mail, step: "03", title: "Get instant alerts", desc: "Receive an email the moment a matching permit appears — address, type, and date included." }
            ].map(({ icon: Icon, step, title, desc }) => (
              <motion.div key={title} variants={fadeUp} className="relative">
                <div className="mb-4 flex h-48 items-center justify-center overflow-hidden rounded-2xl border border-stone-100 bg-stone-50">
                  <Icon className="h-12 w-12 text-stone-200" />
                </div>
                <div className="text-sm font-semibold text-teal-600">Step {step}</div>
                <h3 className="mt-1 text-xl font-semibold text-stone-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-center text-3xl font-semibold text-stone-950">
              You&apos;re losing leads to contractors<br className="hidden sm:block" /> who check permit sites first.
            </h2>
          </motion.div>
          <motion.div className="mt-12 grid gap-6 sm:grid-cols-2" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {[
              { icon: Clock, title: "Manual checking wastes hours", desc: "You or your staff spend time every morning checking city websites instead of closing deals.", color: "text-red-500 bg-red-50" },
              { icon: TrendingUp, title: "Competitors strike first", desc: "By the time you find a new permit, another contractor has already called the homeowner.", color: "text-amber-600 bg-amber-50" },
              { icon: Globe, title: "Too many cities to track", desc: "You serve multiple areas but can't monitor 5 different city permit websites daily.", color: "text-blue-500 bg-blue-50" },
              { icon: BarChart3, title: "Missed revenue", desc: "Every unfollowed permit is a job you could have won. The math adds up fast.", color: "text-purple-500 bg-purple-50" }
            ].map(({ icon: Icon, title, desc, color }) => (
              <motion.div key={title} variants={fadeUp} className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-6 w-6" /></div>
                <div><h3 className="font-semibold text-stone-900">{title}</h3><p className="mt-1 text-sm text-stone-600">{desc}</p></div>
              </motion.div>
            ))}
          </motion.div>
          <motion.div className="mt-12 text-center" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <p className="text-xl font-medium text-teal-700">Portafor does the checking for you — every hour, automatically.</p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-stone-200 bg-white px-4 py-16 lg:px-8">
        <motion.div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 text-center sm:grid-cols-4" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          {[
            { value: "2,000+", label: "Permits monitored" },
            { value: "7", label: "Cities active" },
            { value: "< 1 hr", label: "Alert speed" },
            { value: "30 days", label: "Free trial" }
          ].map(({ value, label }) => (
            <motion.div key={label} variants={fadeUp}>
              <div className="text-3xl font-semibold text-teal-700">{value}</div>
              <div className="mt-1 text-sm text-stone-500">{label}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Testimonials */}
      <section className="px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-center text-3xl font-semibold text-stone-950">Trusted by contractors across Texas & Florida</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-stone-600">See what other service businesses are saying about Portafor.</p>
          </motion.div>
          <motion.div className="mt-12 grid gap-6 sm:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {testimonials.map(({ name, company, text, rating, role }) => (
              <motion.div key={name} variants={fadeUp} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex gap-0.5">{Array.from({ length: rating }).map((_, i) => (<Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />))}</div>
                <p className="mt-4 text-sm leading-relaxed text-stone-700">&ldquo;{text}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3 border-t border-stone-100 pt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-700">{name.split(" ").map(n => n[0]).join("")}</div>
                  <div><div className="text-sm font-medium text-stone-900">{name}</div><div className="text-xs text-stone-500">{role}, {company}</div></div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-center text-3xl font-semibold text-stone-950">Everything you need</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-stone-600">Powerful features designed specifically for local service contractors.</p>
          </motion.div>
          <motion.div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {[
              { icon: Zap, title: "Real-time monitoring", desc: "We poll city data feeds hourly. No manual checking required." },
              { icon: Map, title: "Territory mapping", desc: "Draw your exact service area on an interactive map." },
              { icon: Mail, title: "Email alerts", desc: "Permit details, address, filing date — delivered to your inbox." },
              { icon: Search, title: "Filing search", desc: "Search any address to find nearby permits on demand." },
              { icon: Shield, title: "Duplicate detection", desc: "Never get alerted twice for the same permit." },
              { icon: Users, title: "Multi-city support", desc: "Monitor multiple territories across different cities." }
            ].map(({ icon: Icon, title, desc }) => (
              <motion.div key={title} variants={fadeUp} className="group rounded-2xl border border-stone-200 bg-white p-6 transition hover:border-teal-200 hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-100"><Icon className="h-6 w-6" /></div>
                <h3 className="mt-4 font-semibold text-stone-900">{title}</h3>
                <p className="mt-2 text-sm text-stone-600">{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing — Stripe cards */}
      <PricingSection />

      {/* FAQ */}
      <section className="border-t border-stone-200 bg-white px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
            <h2 className="text-center text-3xl font-semibold text-stone-950">Frequently asked questions</h2>
          </motion.div>
          <motion.div className="mt-10 divide-y divide-stone-200" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
            {faqs.map(({ q, a }) => (
              <motion.div key={q} variants={fadeUp} className="py-5">
                <h3 className="text-base font-medium text-stone-900">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{a}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative bg-teal-700 px-4 py-20 text-center lg:px-8 lg:py-24">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-teal-600/50 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-teal-800/50 blur-3xl" />
        </div>
        <motion.div className="relative mx-auto max-w-2xl" initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger}>
          <motion.h2 variants={fadeUp} className="text-3xl font-semibold text-white sm:text-4xl">
            Every permit is a homeowner<br className="hidden sm:block" /> who needs your services.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-lg text-teal-100">Start finding them today. Free for 30 days.</motion.p>
          <motion.div variants={fadeUp}>
            <Link href="/sign-up" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-medium text-teal-700 shadow-lg transition hover:bg-stone-50">
              Get started free <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white px-4 py-8 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-stone-500 sm:flex-row">
          <div>&copy; {new Date().getFullYear()} Portafor. All rights reserved.</div>
          <div className="flex gap-6">
            <Link href="/blog" className="hover:text-stone-700 transition">Blog</Link>
            <Link href="/privacy" className="hover:text-stone-700 transition">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-stone-700 transition">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
