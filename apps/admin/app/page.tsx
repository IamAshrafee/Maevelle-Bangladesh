import Link from 'next/link';

export default function AdminHomePage() {
  return (
    <main>
      <section className="shell">
        <h1>Maevelle Admin</h1>
        <p>The internal administration shell is ready for authenticated access.</p>
        <Link href="/login">Sign in</Link>
      </section>
    </main>
  );
}
