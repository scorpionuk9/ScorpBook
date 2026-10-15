import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms of Service — ScorpBook" };

export default function TermsPage() {
  return <LegalPage title="Terms of Service" updated="13 October 2026">
    <section>
      <p>These Terms govern your use of ScorpBook, provided by Scorpia Tech Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account or using ScorpBook you agree to them. If you don&apos;t agree, please don&apos;t use ScorpBook.</p>
    </section>

    <section>
      <h2>1. The service</h2>
      <p>ScorpBook is bookkeeping software for UK sole traders and limited companies. It helps you record transactions, categorise bank statements, produce reports and work out VAT return figures, and can sync records from ScorpInvoice. ScorpBook is a tool, not an accountant: it does not give tax, legal or financial advice.</p>
    </section>

    <section>
      <h2>2. Your responsibilities</h2>
      <p>You are responsible for the accuracy and completeness of your records, for checking any figures ScorpBook produces (including VAT return figures) before you rely on them or send them to HMRC, and for meeting your own tax, filing and record-keeping obligations. Please ask an accountant if you are unsure how something should be recorded.</p>
    </section>

    <section>
      <h2>3. Beta</h2>
      <p>ScorpBook is currently in beta and free to use. Features may change, and we may introduce paid plans. We will tell you before any charge applies to you, and you can always export your records before deciding whether to continue.</p>
    </section>

    <section>
      <h2>4. &ldquo;As-is&rdquo; provision</h2>
      <p>ScorpBook is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We work to keep it reliable and accurate, but we don&apos;t guarantee that it will be uninterrupted or free of errors, and we give no warranty beyond what the law requires.</p>
    </section>

    <section>
      <h2>5. Your account and team</h2>
      <p>Keep your sign-in details secure; we strongly recommend turning on two-step verification. You are responsible for activity under your account. A business&apos;s Owner decides who is invited and what access they have, and is responsible for removing people who should no longer have access. Tell us promptly if you suspect unauthorised access.</p>
    </section>

    <section>
      <h2>6. Acceptable use</h2>
      <p>Don&apos;t use ScorpBook for anything unlawful, to record data you have no right to hold, or in a way that could harm the service or other users, such as trying to access another business&apos;s records.</p>
    </section>

    <section>
      <h2>7. Third-party services</h2>
      <p>ScorpBook relies on third-party services, including Supabase, Cloudflare and Resend, and on ScorpInvoice if you connect it. We aren&apos;t responsible for losses caused by outages or errors in services outside our direct control.</p>
    </section>

    <section>
      <h2>8. Limitation of liability</h2>
      <p>To the fullest extent permitted by law, we are not liable for indirect or consequential loss arising from your use of ScorpBook, including lost profits, penalties or interest charged by HMRC, or loss of data, whether caused by downtime, a calculation error, a bug or any other fault. Our total liability to you for any claim is limited to the greater of the fees you paid us in the 12 months before the claim, or £100. Nothing in these Terms limits liability that cannot lawfully be limited, such as for death or personal injury caused by negligence, or for fraud.</p>
    </section>

    <section>
      <h2>9. Ending your use</h2>
      <p>You can stop using ScorpBook at any time and ask us to close your account. We may suspend or close accounts that materially breach these Terms or misuse the service. See our <Link href="/privacy" className="font-medium text-accent">Privacy Policy</Link> for what happens to your data.</p>
    </section>

    <section>
      <h2>10. Changes</h2>
      <p>We may update these Terms. If we make material changes we will take reasonable steps to let you know. Continuing to use ScorpBook after changes take effect means you accept them.</p>
    </section>

    <section>
      <h2>11. Governing law</h2>
      <p>These Terms are governed by the laws of England and Wales, and the courts of England and Wales have exclusive jurisdiction.</p>
    </section>

    <section>
      <h2>12. Contact</h2>
      <p>Questions about these Terms: <ContactLink />.</p>
    </section>
  </LegalPage>;
}
