export const runtime = "edge";

export default function NotFound() {
  return (
    <div className="container mt-20 flex flex-col items-center text-center">
      <p className="text-6xl font-bold opacity-20">৪০৪</p>
      <h1 className="mt-4 text-2xl font-bold">পৃষ্ঠা পাওয়া যায়নি</h1>
      <p className="mt-2 text-sm opacity-60">The page you are looking for does not exist.</p>
      <a
        href="/"
        className="mt-6 rounded-full px-6 py-2.5 text-sm font-bold text-white"
        style={{ background: "var(--md-sys-color-primary)" }}
      >
        হোমে ফিরুন / Go Home
      </a>
    </div>
  );
}
