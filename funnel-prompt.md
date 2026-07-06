# Portafor — Selling Funnel Webpage Prompt

## Overview

Build a single-page marketing funnel for Portafor, a SaaS tool that sends contractors instant alerts when new building permits are filed in their service area. The page converts visitors into signups. No navigation, no footer links — just one focused path to the CTA.

## Tech Stack

- **Next.js 14** App Router — create at `app/marketing/page.tsx`
- **Tailwind CSS** — same design system as the dashboard (warm off-white `#FAFAF8`, teal `#0F766E`, warm grays `stone-*`)
- **Lucide React** for icons
- No additional libraries

## Page Structure (top to bottom)

### 1. Hero Section
- **Headline:** "Stop chasing leads. Let permits come to you."
- **Subheadline:** "Portafor monitors real-time building permits in Austin and Orlando. When a new roofing, HVAC, or solar permit drops in your territory — you get an instant email alert."
- **Primary CTA button:** "Start free for 30 days" → links to `/sign-up`
- **Trust line below CTA:** "No credit card required. Cancel anytime."
- **Background:** Clean off-white, no hero image needed — keep it text-focused

### 2. How It Works (3 steps)
Three columns with icons:
1. **Draw your territory** — "Drop a pin or draw a polygon on the map. We watch that area 24/7."
2. **We monitor permits** — "Every new building permit filed with the city is checked against your zone."
3. **Get instant alerts** — "Receive an email the moment a matching permit appears. Be the first contractor to reach the homeowner."

### 3. Pain Point Section
**Header:** "You're losing leads to contractors who check permit sites first."
- 3 bullet points with subtle red/amber icons:
  - "City websites update slowly and are hard to search"
  - "By the time you check, another contractor already called"
  - "You can't monitor 10 cities manually"

**Resolution line:** "Portafor does the checking for you — every hour, automatically."

### 4. Social Proof / Numbers
A horizontal bar with key stats:
- "2,000+ permits monitored" (or whatever real number you have)
- "Austin & Orlando active"
- "Alerts sent within 1 hour of filing"

### 5. What You Get (Feature Grid)
2x2 grid of feature cards:
- **Real-time monitoring** — "We poll city data feeds hourly. No manual checking."
- **Territory mapping** — "Draw your exact service area on an interactive map."
- **Email alerts** — "Permit details, address, filing date — delivered to your inbox."
- **Filing search** — "Search any address to find nearby permits on demand."

### 6. Pricing Teaser
Simple card:
- **Free for 30 days** — full access, no limits
- **Then $49/month** — cancel anytime, keep your data
- CTA: "Start your trial" → `/sign-up`

### 7. Final CTA
Dark teal background strip:
- **"Every permit is a homeowner who needs your services."**
- **"Start finding them today."**
- CTA button: "Get started free" → `/sign-up`

## Design Notes

- **No stock photos** — keep it clean and text-driven
- **Mobile-first** — stack everything vertically on small screens
- **Warm, contractor-friendly tone** — not corporate, not techy. Write like you're talking to a roofer at a job site.
- **Font:** Inter or Geist (already in the project via next/font)
- **CTA buttons:** `bg-teal-700 hover:bg-teal-800 text-white rounded-xl px-6 py-3`
- **Section spacing:** `py-16 lg:py-24` between major sections

## Conversion Psychology

- Lead with the **pain** (losing leads to faster competitors), not features
- Show **specific cities** — "Austin" and "Orlando" feel real, not generic
- **"Free for 30 days"** removes friction — no commitment anxiety
- **No credit card required** eliminates the #1 signup blocker
- The page has **one goal**: get them to click "Start free for 30 days"

## URL

The page lives at `/marketing` but should be the homepage `/` for unauthenticated visitors. Update `app/page.tsx` to:
- If user is signed in → redirect to `/dashboard`
- If user is not signed in → show the marketing funnel instead of redirecting to `/sign-in`

## Example Copy Snippets

**Hero subheadline alternatives:**
- "New building permits mean new customers. We find them for you."
- "Every permit filed is a homeowner ready to hire. We make sure you know about it first."

**CTA alternatives:**
- "Find my next lead" 
- "See how it works"
- "Start monitoring permits"

**Pain point alternative:**
- "Your competitor already called that homeowner. You're still checking the city website."
