import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { SectionHeading } from "@/components/content/SectionHeading";

export function NewsletterCTA() {
  return (
    <section className="container my-12">
      <div className="glass-card flex flex-col items-center gap-4 p-8 text-center md:p-12">
        <SectionHeading title="নিউজলেটার" />
        <p className="max-w-lg text-sm opacity-70">সর্বশেষ সংবাদ ও বিশ্লেষণ সরাসরি আপনার ইমেইলে পান।</p>
        <NewsletterForm />
      </div>
    </section>
  );
}
