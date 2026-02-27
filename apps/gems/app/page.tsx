import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">GEMS</h1>
      <p className="text-gray-600 mb-8">Legal & Real Estate Platform</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="px-4 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50"
        >
          Sign up
        </Link>
        <Link
          href="/dashboard"
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
