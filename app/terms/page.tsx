export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-16 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold text-stone-950">Terms of Service</h1>
        <p className="mt-2 text-sm text-stone-500">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-stone-700">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">1. Service Description</h2>
            <p>Portafor monitors publicly available government building permit and business license data feeds. When new filings match your defined service territory, we send email alerts to help you identify potential customers.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">2. Account Registration</h2>
            <p>You must provide accurate business information during registration. One account per business entity. You are responsible for maintaining the security of your account credentials.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">3. Subscriptions and Billing</h2>
            <ul className="list-inside list-disc space-y-1">
              <li>All plans include a 30-day free trial</li>
              <li>Subscriptions renew automatically unless cancelled</li>
              <li>Payments are processed securely through Stripe</li>
              <li>You may cancel anytime from your account settings</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Use the service for any unlawful purpose</li>
              <li>Attempt to access other users&apos; accounts or data</li>
              <li>Reverse engineer or attempt to extract the source code</li>
              <li>Resell or redistribute permit alert data without written permission</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">5. Data Accuracy</h2>
            <p>Portafor relies on publicly available government data feeds. While we strive for accuracy, we cannot guarantee the completeness or timeliness of permit data. Use this information as one of many inputs for your business decisions.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">6. Limitation of Liability</h2>
            <p>Portafor is provided &quot;as is&quot; without warranties. We are not liable for any business decisions made based on permit alert data. Our total liability shall not exceed the amount paid for your subscription in the preceding 12 months.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">7. Termination</h2>
            <p>We may suspend or terminate your account for violation of these terms. You may cancel your account at any time by contacting support@portafor.info.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-stone-900">8. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the new terms.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
