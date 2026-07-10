import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4">
      <h1 className="text-6xl font-bold text-stone-900">404</h1>
      <p className="mt-4 text-lg text-stone-600">This page could not be found.</p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-teal-700 px-6 py-3 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
