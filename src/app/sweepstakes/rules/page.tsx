import Link from 'next/link'

export default function SweepstakesRulesPage() {
  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 space-y-8">
      <div>
        <Link
          href="/sweepstakes"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back to Sweepstakes
        </Link>
      </div>

      <h1 className="text-3xl font-bold">Official Sweepstakes Rules</h1>

      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        {'{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}'}
      </div>

      <div className="prose prose-zinc max-w-none dark:prose-invert space-y-8">
        <section>
          <h2>1. No Purchase Necessary</h2>
          <p>
            No purchase or payment of any kind is necessary to enter or win this sweepstake.
            A purchase will not increase your chances of winning. Void where prohibited by law.
          </p>
          <p>
            To enter without purchase, follow the free entry method described in the How to Enter
            section below. All entries are subject to verification.
          </p>
        </section>

        <section>
          <h2>2. How to Enter</h2>
          <p>
            During the sweepstake period, eligible participants may enter by: (a) purchasing an
            eligible e-book from omniincubator.org, which will automatically credit entries to
            your account; or (b) downloading a free resource and confirming your email address,
            which will credit the applicable number of non-purchase entries.
          </p>
          <p>
            Entries are credited at the rates specified on the sweepstake detail page and are
            subject to change at the Sponsor&apos;s discretion. Only one entry per transaction.
          </p>
        </section>

        <section>
          <h2>3. Eligibility</h2>
          <p>
            Open to legal residents of the United States who are 18 years of age or older at
            the time of entry. Employees, officers, and directors of the Sponsor and its affiliates,
            subsidiaries, advertising agencies, and their immediate family members are not eligible.
          </p>
          <p>
            By entering, participants confirm they meet all eligibility requirements. The Sponsor
            reserves the right to verify eligibility before awarding any prize.
          </p>
        </section>

        <section>
          <h2>4. Prize Description</h2>
          <p>
            The prize for each sweepstake drawing is described on the current sweepstake detail
            page. Cash prizes are awarded in United States Dollars. The Sponsor reserves the right
            to substitute a prize of equal or greater value.
          </p>
          <p>
            Prizes are non-transferable and cannot be redeemed for cash except where required by
            law. All federal, state, and local taxes on prizes are the sole responsibility of the
            winner.
          </p>
        </section>

        <section>
          <h2>5. Odds of Winning</h2>
          <p>
            Odds of winning depend on the total number of eligible entries received during the
            sweepstake period. Each entry is weighted equally unless otherwise specified. Entry
            multipliers for members apply as described on the sweepstake detail page.
          </p>
        </section>

        <section>
          <h2>6. Drawing Method</h2>
          <p>
            The winner will be selected by a random drawing from all eligible entries received
            during the sweepstake period. The drawing will be conducted by the Sponsor or an
            authorized third party within a reasonable time after the sweepstake close date.
          </p>
          <p>
            The Sponsor&apos;s decisions are final and binding in all matters relating to this
            sweepstake.
          </p>
        </section>

        <section>
          <h2>7. Winner Notification</h2>
          <p>
            The potential winner will be notified by email to the address associated with their
            account within 7 business days of the drawing. The potential winner must respond to
            the notification within 14 days or an alternate winner may be selected.
          </p>
          <p>
            The Sponsor is not responsible for lost, late, or misdirected winner notifications.
          </p>
        </section>

        <section>
          <h2>8. Claiming the Prize</h2>
          <p>
            To claim the prize, the potential winner must complete and return any required
            affidavit of eligibility, liability release, and/or publicity release within the
            time specified by the Sponsor. Failure to do so may result in disqualification and
            selection of an alternate winner.
          </p>
          <p>
            Cash prizes will be disbursed via the method determined by the Sponsor, which may
            include bank transfer, check, or digital payment. Processing may take 4–6 weeks.
          </p>
        </section>

        <section>
          <h2>9. Sponsor</h2>
          <p>
            This sweepstake is sponsored by Omni Incubator LLC (&ldquo;Sponsor&rdquo;),
            omniincubator.org. For questions or comments about this sweepstake, please contact
            us at support@omniincubator.org.
          </p>
          <p>
            By participating, entrants agree to be bound by these Official Rules and the decisions
            of the Sponsor, which are final and binding in all respects.
          </p>
        </section>
      </div>
    </div>
  )
}
