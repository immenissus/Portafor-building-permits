"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold text-stone-950">Something went wrong</h1>
      <p className="mt-3 text-sm text-stone-600">
        An unexpected error occurred. Your data is safe — try again.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-800"
      >
        Try again
      </button>
    </section>
  );
}