import Link from "next/link";

export default function CratesPage() {
  return (
    <div className="min-h-screen p-8 sm:p-12">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Crates</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/library"
            className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
          >
            Library
          </Link>
          <Link
            href="/eras"
            className="px-3 py-1.5 rounded bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700"
          >
            Eras
          </Link>
        </div>
      </header>
      <p className="opacity-80">Crates page coming soon.</p>
    </div>
  );
}
