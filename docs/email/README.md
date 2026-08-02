# The email channel

The product is a support desk. Most conversations start in a chat panel on a shop's website,
but plenty of customers never see that panel. They already have the shop's address, so they
write an email and expect an answer in their inbox. So the job of this layer is one sentence:

> A customer writes an ordinary email and gets an ordinary email back, while the agent only
> ever sees a conversation in the inbox.

Neither side should have to know the other exists. Most of the difficulty is that email was
not designed to be a conversation. It is a pile of independent letters that happen to
reference each other, and the references are optional.

# 1. The architecture, and how it actually works

Two directions, and they are not symmetrical. Mail arrives through a webhook. Mail leaves
through a background job. Both go through Resend, which owns the actual SMTP.

```
   INBOUND

   customer ──► Resend ──► POST /hooks/email  {type, email_id, message_id}
                                │  check the signature over the raw bytes
                                │  seen this message id before?
                                │  write one job row ─────────────► Postgres
                                ▼  204
                                ·
              job runner, seconds later
                                │  GET /emails/receiving/{email_id} ──► Resend
                                │  from, to, subject, headers, text, html ◄──
                                ▼
                  route → thread → strip quotes → insert ──► Postgres
```

The webhook does almost nothing. It checks the request really came from Resend, notices if it
has seen this email before, writes one row into a jobs table, and returns 204. The interesting
work — which shop the mail is for, which conversation it belongs to, what the customer actually
wrote — happens later in a background job, where it is allowed to be slow and allowed to fail.

That the webhook carries only metadata is partly not our choice: Resend's inbound webhook sends
an id, not a letter, and the body must be fetched over a second authenticated request. But it is
the right shape anyway. The signed payload stays small, so a redelivery costs nothing, and the
fetch — which can be slow, can time out, can fail — does not happen while a provider holds a
connection open waiting for our answer. A slow webhook gets retried by Resend on its schedule; a
failed job gets retried by us on ours, with backoff we control. Different problems, different
owners.

The queue is a table in Postgres. A loop inside the API process wakes every three seconds, claims
up to twenty due jobs with `FOR UPDATE SKIP LOCKED`, and runs them one after another. A job that
throws is retried five times with growing backoff, then marked failed. No broker.

## Routing: which shop is this for?

Every workspace gets its own inbound address, `slug@our-inbound-domain`. Routing matches the
part before the `@` against that token and never looks at the sender: one customer may write to
two shops we host, and a hundred customers write to the same shop. The recipient is the only
signal that means exactly one thing. The token is frozen at creation, and renaming a workspace
does not change it — if routing followed the current slug, the day a shop renamed itself every
reply in flight would arrive at an address that no longer resolves, and the customer would see
nothing at all, because a bounce they never read is indistinguishable from being ignored.

## Outbound: a reply from the dashboard is a real email

```
   agent clicks Send ──► POST /api/conversations/41/reply
        │  save the message (seq 4)
        │  mint a Message-ID <uuid@our-domain>, store it on the message
        │  enqueue an email.reply job          ── all in one commit ──► Postgres
        ▼  201 back to the browser immediately
        ·
   job runner, seconds later — build the headers, send via Resend
        From:        Ada from Touchline <touchline@our-inbound-domain>
        Reply-To:    touchline@our-inbound-domain
        Message-ID:  <9f3c…@our-domain>
        In-Reply-To: <CAF…@mail.gmail.com>   the customer's last email
        References:  <CAF…> <7b1…> <CAF2…>   every id in the thread so far
        Subject:     Re: Order 4182 arrived damaged
```

The message row and the job row are written in the same transaction, so an agent can never be told
their reply was saved while the thing that sends it was lost. They do not wait for the send: the
201 comes back as soon as the row commits, and if Resend is down the job retries in the
background with nobody staring at a spinner.

## Threading: how a reply lands in the right conversation

Every email carries a `Message-ID`, a globally unique string its sender invented. A reply carries
`In-Reply-To`, the id of the message being answered, and `References`, the ids of the whole chain
so far. We store the `Message-ID` of every email we receive, and mint and store one for every
reply we send. That second half is what makes this work at all: without our own ids the
customer's client has nothing to quote back, so we could receive threads but never continue them.

When an email arrives we read `In-Reply-To` first, then walk `References` from the right (most
recent) to the left. The first id matching a message we already stored decides the
conversation. If nothing matches, it is a new conversation and the subject becomes its title.
That lookup is scoped to the workspace we already routed to, so a forged `In-Reply-To` cannot
join a thread belonging to a different shop.

Worked through: Sofia emails us, her client sets `Message-ID: <A>`, nothing matches, so we start
conversation 41 titled "Order 4182 arrived damaged" with message 1 carrying `<A>`. Ada replies
from the dashboard; we mint `<B>`, store it on message 2, and send `Message-ID: <B>`,
`In-Reply-To: <A>`. Sofia replies from her phone with `In-Reply-To: <B>`; we look up `<B>`, find
message 2, and land back in conversation 41. If she later forwards the thread to a colleague who
replies to us, his mail carries the same chain, so it lands in 41 too — under Sofia's name.

# 2. The decisions, and what each one beat

## The signature is checked over the raw bytes, before anything parses them

The webhook request is signed: an id, a timestamp and the exact body, HMACed with a shared
secret. We recompute and compare; no match, 401. The critical part is *what* we hash. We read
the body as raw bytes and hash those. The tempting alternative is to let the framework parse the
JSON — which it wants to do anyway, since that is what every other route does — and hash a
re-serialised copy. That fails in the worst possible way. Re-serialising reorders keys, changes
spacing, rewrites how unicode and floats are spelt, so the bytes you hash are no longer the
bytes that were signed. It usually still works in testing, because the fixture happens to
round-trip cleanly, then rejects every real request in production — and a team that hits that
tends to "fix" it by turning verification off.

So: hash first, parse second, and never parse into a shape you then serialise back. A
five-minute freshness window stops an old capture being replayed forever, and constant-time
comparison stops the signature being guessed a byte at a time. The endpoint is exempt from the
origin check guarding the rest of the API: a server-to-server webhook has no `Origin` header
and never needs one, and the signature is doing the whole job.

## One reply address per workspace, not one per conversation

The classic trick is a per-conversation address — `reply+41-a9f3@…` — so a reply routes by its
recipient alone, with no header parsing at all. We rejected it.

It is genuinely appealing: threading becomes trivial and immune to mail clients that mangle
headers. But the address has to be signed, or it becomes a way for anyone to post into any
conversation by guessing a number. The customer sees a machine-generated address, which reads
as a no-reply. Some clients and corporate gateways strip the `+` part. And you end up with two
independent routing systems, address-based and header-based, which will one day disagree —
about which customer's mail lands in which thread. One stable, human-readable address per shop
stays something a person is happy to put in a footer, and pushes threading entirely onto
identifiers, where it is one mechanism instead of two. The cost is named next: when the
identifiers are missing, we have nothing to fall back on.

## Threading on identifiers, never on subject

Subject-based threading is the trap. It looks like it works, because "Re: Order 4182" really
does identify a thread most of the time. Then two different customers both write "Re: Order",
or "Invoice", or "Refund", and they land in the same conversation. Customer A can now read
customer B's mail, and an agent replying to what they think is one thread sends it to whoever
wrote first. That is a leak between customers, produced by a heuristic that was never told it
was being used as a security boundary. Duplicated subjects are ordinary; duplicated Message-IDs
are not. So the subject decides exactly one thing — the title of a brand-new conversation — and
never decides which conversation a message joins.

The price is real. A customer whose mail client strips `References`, or who composes a fresh
mail to our address instead of hitting reply, starts a new conversation, and the agent sees two
threads from one person. We took that deal quickly: a split thread is a nuisance, a merged one
is a breach.

## A redelivered email is a no-op, not an error

Providers redeliver. A timeout on their side, a deploy on ours, an ambiguous response — all
produce the same webhook twice with identical mail. The naive handling is to detect the
duplicate and return an error, which is wrong twice: an error tells the provider to try again,
and trying again is what produced the duplicate.

So a duplicate delivery means nothing at all, at three deliberately overlapping layers. The
webhook checks whether it already stored a message with that id and returns 204 without
queueing. The ingest job checks again, because time has passed. Underneath both is a unique
constraint on `(workspace_id, external_id)`, so if both checks are raced past, the database
refuses the insert and we swallow the error.

The point of the constraint is that it is not a check anyone has to remember. The two explicit
checks are optimisations that avoid pointless work; the constraint is the correctness. That is
why one column is both the threading key and the duplicate key. And the webhook always answers
with a success code: for a duplicate, for a payload we cannot parse, for mail addressed to a
workspace that does not exist. Anything else tells the provider to keep trying forever for a
mail that will never be accepted.

## Outbound mail comes from our domain, always

Replies go out as `Ada from Touchline <touchline@our-inbound-domain>` — the shop's name in the
display name, our address underneath. Sending as `support@theircompany.com` is what everyone
asks for and we cannot do it: it needs SPF and DKIM records on a domain we do not control, and
without them the mail is rejected by DMARC or filed as spam. Sending as the agent's own address
has the same problem plus a worse one — replies would land in a personal inbox and leave the
product entirely. Letting a shop authenticate its own sending domain is a real feature, but a
feature, not a default. Because that display name is user-controlled, control characters,
quotes and angle brackets are stripped from it first: a newline in an agent's name is header
injection.

## Anything that looks automated is dropped on the floor

We drop mail carrying `Auto-Submitted`, a bulk or list `Precedence`, an autoreply header or a
`List-Id`, and anything sent from our own domains. This is not tidiness. Their out-of-office
responder answers our reply; we treat that as a customer message and reply again; their
responder answers again. A loop between two automated systems is one of the standard ways to
get a sending domain blocklisted, and the damage outlives the bug by weeks. The alternative,
reply-rate limiting per address, solves it later and more expensively.

## Quoted history is cut off before we store the message

Every reply carries the entire thread underneath it. Stored as-is, message ten contains
messages one through nine and the inbox becomes unreadable. So we look for the markers mail
clients put above the quoted part — a line starting with `>`, an "On … wrote:" attribution,
Outlook's row of underscores, "----- Original Message -----" — take the earliest, and keep only
what is above it. If that leaves nothing we keep the whole thing, because a message that is
entirely quote is more likely to be our mistake than a genuinely empty message.

This will never be perfect, and it is worth being blunt about why. There is no standard for
quoting. Every client invented its own convention, the conventions are localised, and the marker
is ordinary prose a human can also write — any rule that catches Gmail's attribution line also
catches a customer who begins a sentence with "On Tuesday I wrote:". The alternatives are worse:
store everything and make the inbox useless, or run a cleverer parser that is wrong in less
predictable ways. We took the simple heuristic and accepted that it sometimes cuts too much. The
full original stays retrievable from the provider, which makes the trade survivable.

One honest correction to the intent: we strip quoted *history*, not *signatures*. The classic
`-- ` sign-off separator is not one of our markers, so a customer's name, title and phone number
arrive as part of their message.

## A customer reply reopens a resolved conversation; an agent cannot reply into one

If an inbound email threads onto a conversation an agent already resolved, we set it back to
open, clear any snooze, and let it into the active list with an unread mark. From the customer's
side nothing special happened — they replied to an email — and "that ticket is closed, please
open a new one" is the thing everybody hates about support systems. The dashboard behaves
differently on purpose: an agent replying to a resolved conversation gets a 409 telling them to
reopen it first. The inconsistency is deliberate. The customer's action is an accident of what
they did, so we read it generously; the agent's is a deliberate click in a UI that can afford to
ask whether they meant this one.

Attachments, finally, are not handled at all: the text and HTML parts become the message body
and everything else is dropped. Storing files that arrive from strangers means virus scanning,
size limits, access control and a serving path — a feature of its own, and half-doing it is
worse than not doing it.


# 3. Known bugs

Each was checked against the code as it stands; the first was reproduced.

**Quote stripping loses real text, in two ways I reproduced.** A customer answering inline,
underneath each quoted question, loses every answer: `See my answers below.\n> when did you
order?\nLast Tuesday.` stores only "See my answers below." And a customer who writes an
attribution-shaped sentence loses everything after it: `Hi Ada,\n\nOn Tuesday I wrote: please
cancel order 4182.\nStill nothing has happened. Please refund me.` stores exactly `Hi Ada,`.
Nothing indicates text was removed. The inline case is **reachable today by ordinary use**; the
false attribution needs the phrase to come after some real content, because as the first line
the fallback keeps the whole message. **Both open.** Keeping non-quoted lines below a quote
block fixes the first; requiring a date on the attribution line fixes most of the second.

**Signatures are not stripped**, as described above. **Reachable always. Open, cosmetic.**

**An email with no Message-ID has no duplicate protection at all.** Every layer of the
idempotency story keys on that header. If it is absent — rare from real clients, common from
scripts and gateways — both explicit checks are skipped and the unique constraint has nothing to
bite on, so a redelivered webhook stores the message twice. Such an email also cannot be threaded
onto, so any reply to it starts a new conversation. **Reachable whenever the provider redelivers
such a mail. Open.** A fallback hash of sender, date and subject would close it.

**If the inbound domain is not configured, every email reply fails silently.** The setting
defaults to empty and nothing checks it at startup — there is a property that would report
whether inbound is configured, and it is never called anywhere. Unset, replies go out addressed
from `slug@`, which is not an address; the provider rejects them, the job retries five times and
gives up. The agent sees their reply in the dashboard looking sent, and the customer receives
nothing. **Reachable in any deployment missing that variable, which is the easiest one to forget.
Open**, and the fix is a startup check.

**A duplicate email can wipe out the completion records of other jobs in the same batch.** When
ingest hits the unique-constraint path it rolls the transaction back — and that transaction
belongs to the job runner and is shared by all twenty jobs in the batch. Jobs that already
finished had their "done" marks written but not committed, and the rollback discards them, so
they stay pending and run again. If one was an outbound reply, **the customer gets that reply
twice.** The runner copies the fields it needs into locals before calling a handler, precisely
because a handler may invalidate its objects; it just does not defend against a handler
discarding its writes. **Unreachable without a duplicate delivery landing in the same batch as a
reply; reachable in production, where redelivery is normal. Open.** The fix is a session per job.

**The job lock is released before the job is marked done.** Jobs are claimed with `FOR UPDATE
SKIP LOCKED`, but the locks belong to the runner's transaction and the ingest handler commits
its own work partway through, so the row becomes claimable again while it still says pending.
For ingest that is harmless — the duplicate check catches it, which is exactly what that decision
was for. For an outbound reply it is not: it sends the email twice. **Unreachable with one
runner, reachable the day there are two. Open.**

**The webhook returns success even when queueing failed.** If the enqueue throws — a brief
database outage, say — we roll back, log it, and still answer 204. The provider is told we
accepted the mail, never retries, and the email is gone. "Always answer success" is right for a
duplicate and for an unroutable recipient, but a failure on our side is exactly what provider
retries exist for. **Reachable during any database blip. Open.**

**The duplicate check at the webhook cannot use its index.** The only index covering that column
is the unique constraint on `(workspace_id, external_id)`, and the webhook has not routed to a
workspace yet, so it filters on the id alone, without the index's leading column. Postgres 16
has no skip scan, so that is a sequential scan of the messages table on every inbound email. It
grows with total message volume rather than email volume, so it starts hurting for reasons that
look unrelated. **Not wrong, just slow. Open** — one plain index.

**Three smaller ones, all open.** A duplicate email costs five pointless insert attempts, because
the insert path retries on any constraint violation — that is how it handles two messages racing
for the same sequence number. That sequence number is allocated read-then-insert, and email is
where it is likeliest to collide, since a backlog delivered at once is the automated-sender
pattern a human typing never produces. And replies go out as plain text, so a customer's
formatting comes back stripped.

# 4. Scaling: what breaks first, and what we would do about it

Two halves: what actually happens as this grows, and what I would want to do about it. Below is
the order I expect the failures to arrive in — not a plan, but the options I would be choosing
between and what each costs.

## Stage 0 — where it stands today

One `uvicorn` process, no worker flag, with the job runner living inside it. One runner, one
loop, one shared database session per batch. Comfortable at a few hundred emails a day.

## Stage 1 — the job runner stalls, and it stalls on latency, not volume

**This breaks earlier than a throughput number suggests.** Every inbound email costs one HTTP
round trip to Resend to fetch the body; every outbound reply costs another to send it. Those
calls run one after another, inside a single loop that also handles AI summaries, verification
emails and invites, with a ten-second timeout each. So one email behind a slow provider delays
every other workspace's mail by up to ten seconds, and an unlucky batch of twenty delays it by
over three minutes. The ceiling is not really a number of emails — it is twenty jobs per
three-second tick minus however long the network took.

**What it looks like:** nothing errors. Replies take minutes instead of seconds, the customer
sends a second "hello?", and the agent swears they already answered. Roughly a few thousand
emails a day, or one bad provider afternoon, whichever comes first.

The candidates are concurrency inside the loop, more runner processes, or a real broker.
**Concurrency inside the loop** turns twenty serial network calls into twenty parallel ones,
with nothing new to deploy. It costs one prerequisite: each job needs its own database session,
since they currently share one — which happens to be the direct cause of the batch-rollback bug
above, so it is two fixes for one. **More runner processes** is nearly free and the natural next
step, but see stage 2: today it would duplicate outbound emails. **A broker** — SQS, Redis,
anything — buys per-queue isolation so a mail backlog cannot delay summaries at all, and costs
another moving piece plus the ability to inspect the queue with SQL. I would start with
concurrency because it is cheapest and fixes a real bug on the way past, take more runners next,
and keep the broker for the day queue isolation is the actual complaint rather than raw speed.

## Stage 2 — a second container starts sending mail twice

The runner lives inside the API process, so the moment the business wants a second API container
— for a zero-downtime deploy, or just HTTP headroom — it gets a second job runner it never asked
for. **The trigger is not email volume at all**, which is why this one tends to arrive first.

**What it looks like:** customers occasionally receive the same reply twice, at random, with no
error anywhere and nothing in the dashboard showing it. You find out from a support ticket about
your support tool.

The fix is small: the claim lock is released when the runner commits, but the ingest handler
commits partway through, so the row becomes claimable again while it still says pending. Marking
the job done in the transaction that does its work closes it. The alternative — pinning the
runner to one container with a flag or a leader election — avoids the fix and stops the runner
scaling exactly when the API starts to. I would fix the transaction and let the runners
multiply, before a second container exists rather than after.

## Stage 3 — the duplicate check starts scanning everything

Every inbound email runs one query that cannot use an index, as described in the bugs. Free at ten
thousand messages, painful at ten million. **What it looks like:** a mystery — the thing that gets
slow is email ingestion, but the table being scanned grows with chat traffic, so the graph that
moves has nothing to do with the feature that hurts. It is one index; the only decision is
noticing early enough to avoid a day of confusion.

## Stage 4 — the shared sending domain becomes the limit, and it is not a code problem

Every workspace sends from one domain we own. Providers rate-limit per domain and, more
importantly, reputation is earned per domain, so one shop with a badly behaved list can degrade
delivery for every other shop on the platform. No amount of queue tuning touches that.

**What it looks like:** replies stop arriving for customers we have no complaint from, mail lands
in spam folders, and the only evidence is a deliverability dashboard nobody reads daily.

The options are to police senders ourselves — rate limits, content checks, suspension — or to let
each workspace authenticate its own sending domain so its reputation is its own. Policing is
cheaper to build and permanently adversarial. Per-workspace domains solve the problem structurally
rather than repeatedly, so that is where I would lean — and I would expect the pressure to arrive
on commercial grounds ("we want mail to say our name") before it ever arrives as a delivery
incident. It is also the point where the "we always send from our domain" decision stops being
right.

## Stage 5 — further out, the shape changes rather than the size

Ingest becomes its own service, so mail load and web load stop competing for the same processes
and can be scaled on different curves. Threading lookups — today one query per referenced id —
become one query against a small identifiers table. And the genuine heuristics, quote stripping
and automated-mail detection, want to stop being regular expressions in the hot path and start
being something with test cases and a corpus of real mail behind them: their failure mode is
silent data loss, and the only honest way to know how often they are wrong is to measure. I
would want the current versions to have visibly hurt someone before building that, but I would
want the measurement in well before then.

## The ceiling, plainly

This design is sensible in the low thousands of emails a day, on one process, in one deployment.
It stops being sensible at whichever comes first: the volume where the queue is never empty, or
the day someone needs a second API container. Those two pressures are independent, and the second
usually arrives first — which is why I would fix the job transaction before optimising throughput.

Worth noticing throughout: **the identifiers never change.** Message-ID, In-Reply-To and
References are the same headers whether the mail is handled by one loop or by a fleet.
Everything that scales here is transport and concurrency. The part that decides which
conversation a message belongs to was correct on day one and does not need to move.
