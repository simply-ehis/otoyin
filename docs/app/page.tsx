import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-3xl font-bold mb-4">otoyin Documentation</h1>
      <p className="text-lg text-muted-foreground mb-8">
        Browse the knowledge base for feature documentation.
      </p>
      <Link href="/docs/00-index" className="text-primary underline underline-offset-4">
        View Knowledge Base
      </Link>
    </main>
  );
}
