import { SiteFooter, SiteHeader } from '@/components/marketing/site-header';

export const metadata = { title: 'Privacy' };

/**
 * What the app stores, in plain words. Not a privacy policy an attorney has
 * signed off on — the page says so rather than dressing a draft up as one.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-6 md:py-10">
      <SiteHeader signedIn={false} />
      <article className="space-y-4 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          An attorney has not reviewed this page. It says what the software actually stores and who
          can see it.
        </p>
        <p>
          An account is an email and a sign-in held by the authentication service. The organization
          holds the company name, the people you invite, and the jobs, clients, money, photos, and
          files you enter. A person sees the organization they belong to. Money the client is
          billed, and the company’s own costs, are separate permissions — a field login is not
          handed the margin.
        </p>
        <p>
          Files sit in private storage under that organization’s own prefix. A card number is not
          written here. Stripe holds the card and the invoices for the subscription. If you connect
          Google to send mail or put a job on a calendar, the refresh token is encrypted before it
          is stored, and the connection is the one you authorize.
        </p>
        <p>
          Client links for a proposal, a change order, or an intake form are tokens. The raw token
          lives in the link, not in the database as a usable secret. Someone with the link can open
          that one document. They do not get the rest of the company.
        </p>
        <p>
          The product is not in the business of selling your client list. Records are there so your
          company can run the job. Removing a person from the organization removes their access.
          Deleting the organization is the owner’s act, from the account, and is not something this
          page can do for you.
        </p>
      </article>
      <SiteFooter />
    </div>
  );
}
