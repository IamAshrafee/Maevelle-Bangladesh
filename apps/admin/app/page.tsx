import Link from 'next/link';

export default function AdminHomePage() {
  return (
    <main>
      <section className="shell">
        <h1>Maevelle Admin</h1>
        <p>The internal administration shell is ready for the upcoming IAM foundation.</p>
        <Link href="/login">Login placeholder</Link>
      </section>
    </main>
  );
}
