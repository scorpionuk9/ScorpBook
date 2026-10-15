import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy Policy — ScorpBook" };

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" updated="13 October 2026">
    <section>
      <p>ScorpBook is provided by Scorpia Tech Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what personal data ScorpBook handles, why, and what we do with it. It applies to people who sign up to ScorpBook or are invited to a business on it (&ldquo;you&rdquo;), and to people whose details appear in a business&apos;s records, such as its suppliers and customers.</p>
    </section>

    <section>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your email address and password (stored only as a secure hash by our sign-in provider) and, if you turn it on, your two-step verification setup.</li>
        <li>Business details: business name, whether it is a sole trader or limited company, VAT registration status and number, and financial year end.</li>
        <li>Bookkeeping records you create or upload: transactions, categories, bills, supplier details (such as names, emails, phone numbers and addresses), bank statement lines you upload, bank categorisation rules, VAT return figures, and the people you invite to your business.</li>
        <li>If you connect ScorpInvoice: the invoices (including your customers&apos; names), payments and expenses sent from your ScorpInvoice account.</li>
        <li>Basic technical information needed to run and secure the service, such as sign-in times, IP addresses and error logs.</li>
      </ul>
    </section>

    <section>
      <h2>Why we use it</h2>
      <ul>
        <li>To provide ScorpBook: keeping your books, producing reports and VAT figures, and syncing with ScorpInvoice when you ask us to.</li>
        <li>To let the people you invite work on your business&apos;s books with the access you choose.</li>
        <li>To send account emails, such as confirming your email address and resetting your password.</li>
        <li>To keep the service secure, prevent misuse and fix problems.</li>
        <li>To answer you when you contact us.</li>
      </ul>
      <p>We rely on providing the service you asked for (contract) and our legitimate interest in running it securely. For records about other people (for example your suppliers and customers), your business decides what is recorded and we process it on your behalf.</p>
    </section>

    <section>
      <h2>Who we share it with</h2>
      <p>We use these providers to run ScorpBook. Each only receives what it needs:</p>
      <ul>
        <li>Supabase: hosts our database and handles sign-in.</li>
        <li>Cloudflare: hosts the ScorpBook website.</li>
        <li>Resend: sends account emails.</li>
        <li>ScorpInvoice (also run by Scorpia Tech Ltd): only if you connect it, to exchange your invoice, payment and expense records.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or share it with anyone else except where the law requires us to.</p>
    </section>

    <section>
      <h2>How long we keep it</h2>
      <p>We keep your account and books for as long as your account is active, so your history stays available. Businesses usually need to keep accounting records for at least six years; please export what you need before closing your account. If you ask us to close your account, we delete your personal data within 30 days, except where we are required by law to keep it longer.</p>
    </section>

    <section>
      <h2>Cookies</h2>
      <p>ScorpBook only uses cookies needed to run it: keeping you signed in, remembering which business you are working in, and remembering whether you prefer the simple or accountant view. We do not use analytics or advertising cookies.</p>
    </section>

    <section>
      <h2>Your rights</h2>
      <p>Under UK data protection law you can ask to access, correct, delete or receive a copy of your personal data, and object to or restrict how we use it. Contact us to do this. If you are unhappy with how we handle your data, you can complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>Questions about this policy or your data: <ContactLink />. See also our <Link href="/terms" className="font-medium text-accent">Terms of Service</Link>.</p>
    </section>
  </LegalPage>;
}
