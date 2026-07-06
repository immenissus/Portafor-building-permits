export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-16 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold text-stone-950">Privacy Policy</h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-stone-700">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">1. Information We Collect</h2>
            <p>We collect information you provide directly:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Business name and type</li>
              <li>Email address (via Clerk authentication)</li>
              <li>Service territory (geographic area you define)</li>
              <li>Payment information (processed by Stripe, never stored on our servers)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">2. How We Use Your Information</h2>
            <ul className="list-inside list-disc space-y-1">
              <li>To provide permit monitoring and email alerts for your service territory</li>
              <li>To process payments and manage your subscription</li>
              <li>To communicate about your account and service updates</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">3. Data Sources</h2>
            <p>We monitor publicly available government open data feeds (building permits, business licenses) from municipal Socrata/SODA APIs. This data is public record and not considered private information.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">4. Third-Party Services</h2>
            <ul className="list-inside list-disc space-y-1">
              <li><strong>Clerk</strong> — authentication and session management</li>
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>Supabase</strong> — database hosting</li>
              <li><strong>Vercel</strong> — application hosting</li>
              <li><strong>Mapbox</strong> — mapping and geocoding</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">5. Data Security</h2>
            <p>We use industry-standard encryption and security practices. Your API keys are stored securely and never exposed in client-side code.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">6. Data Retention</h2>
            <p>We retain your account data for as long as your account is active. You may delete your account by contacting us.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">7. Contact</h2>
            <p>For privacy-related inquiries, contact us at support@portafor.info</p>
          </section>
        </div>
      </div>
    </main>
  );
}
