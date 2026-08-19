import * as Sentry from "@sentry/nextjs";

async function main(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log("SENTRY_DSN is not set - nothing was sent.");
    process.exit(1);
  }

  Sentry.init({
    dsn,
    environment: "local-smoke-test",
    tracesSampleRate: 1.0,
  });

  const eventId = Sentry.captureException(
    new Error("Portafor Sentry integration smoke test"),
  );

  const flushed = await Sentry.flush(5000);

  console.log(
    flushed
      ? `Test event sent to Sentry (id: ${eventId}).`
      : "Sentry failed to flush the event before timeout.",
  );

  process.exit(flushed ? 0 : 1);
}

void main();