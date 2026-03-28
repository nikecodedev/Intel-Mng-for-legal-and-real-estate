import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-100">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">GEMS</h1>
      <p className="text-gray-600 mb-8">Legal & Real Estate Platform</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="px-6 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 font-medium"
        >
          Sign up
        </Link>
      </div>
    </main>
  );
}
