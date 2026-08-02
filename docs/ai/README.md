# The AI layer

A support conversation is a long thing. By the time an agent picks one up there may be thirty
messages in it, and they have to read all of it before they can type one sentence.

Two features want the same thing out of that pile. An agent opening a thread wants five lines
telling them what this is about. And we want to put the right help article in front of them, so
they can send a link instead of writing the same paragraph for the ninth time. Both need an answer
to one question: **what is this conversation actually about, right now?** So we compute that once,
keep it, and let both features read it.

> The state is a convenience. Every message still sends, every thread still works, and nothing in
> the product waits for a model. Switch the AI layer off entirely and the only thing that
> disappears is a panel and three links.

---

# 1. The architecture, and how it actually works

There is one extra row per conversation. It holds a small block of JSON and a number.

```
  conversation_states
  ────────────────────────────────────────────────────────
  conversation_id   41           ← primary key, one row per conversation
  workspace_id      7
  state             { product:  "leather walking boots"
                      issue:    "sole came away after three weeks"
                      intent:   "wants a refund or a replacement"
                      tried:    "asked for order number; sent returns link"
                      status:   "waiting on customer to post them back"
                      keywords: [refund, return, boot, shoe, sole, ...] }
  last_seq          14           ← we have read messages 1..14
  model             "gpt-4o-mini"
  updated_at        ...
```

`last_seq` is the whole trick. Every message carries a `seq`, a counter starting at 1 in each
conversation. The row says "this state was built from everything up to message 14". So the work
outstanding at any moment is exactly "messages 15 onwards", and it is a `WHERE seq > 14`.

## How the row gets updated

Nothing writes it in a request. When a message is saved — customer typing in the chat panel, agent
replying from the inbox, or an email arriving — we queue a background job and move on.

```
  message saved
       │
       ├─ is there already a PENDING summary.refresh job for this conversation?
       │        yes ──► do nothing at all
       │        no  ──► queue one, to run in 30 seconds
       │
  ... later, the job runner picks it up ...
       │
       ├─ read the state row     → last_seq = 14
       ├─ count messages seq>14  → 0? stop, nothing to do
       ├─ read messages 15..20   (60 at most)
       │
       ├─ one HTTP call: here is the state so far, here are the six new messages
       │                 give me the state back, updated
       │
       ├─ write state, set last_seq = 20, commit
       └─ push {"t":"summary","conversation":41} to the agents' sockets
```

That last line is a doorbell — "the summary changed, come and fetch it". An agent with the thread
open sees the panel update without touching anything.

The model never sees the whole thread, only the state and the messages since. A forty-message
conversation has cost forty messages in total, spread over a dozen small calls. Re-summarising
from scratch each time would have cost forty, then forty-one, then forty-two.

## How retrieval uses the same row

When the agent asks for suggested articles, we build one string and search on it.

```
  keywords (up to 16)  +  product  +  issue  +  intent  +  the customer's latest message
  └──────────────── from the state row ─────────────────┘  └──── read live from the thread ────┘
                                    │
                        split into words, dedupe, cap at 40
                                    │
                        Postgres full-text: word1 | word2 | word3 | ...
                        ranked against title (heavy) and body (lighter)
                        top 3, and only if they clear a relevance floor
```

## A worked example

Cara writes *"my boots arrived damaged."* No state exists yet, so we search on her message and get
the returns article. Good.

Six messages later she writes *"ok thanks."* On its own that is unsearchable. But the state says
damaged boots and a refund, so we still surface the returns article — the state is carrying her
earlier words forward.

Then she writes *"actually forget the boots, can you cancel my subscription?"* This is the case the
whole design exists for. The state still says boots. Her message says subscription. Because the
search text is *both*, "subscription" and "cancel" enter the query alongside the boot words and the
subscription article can win on rank. One more message and the state catches up.

**That is the real retrieval problem. It is not noise, it is drift.** People do not open a support
thread and stay on topic. They start with a delivery question, wander into billing, and end up
asking about the returns window. Search only the latest message and you lose the thread the moment
somebody writes "it still doesn't work". Search only the accumulated state and you keep answering
the question they asked ten minutes ago. You need both, weighted so neither can drown the other,
which is why the state contributes a bounded handful of terms and not its whole text.

---

# 2. The decisions, and what each one beat

## Keep a rolling state, don't re-read the thread

The obvious version sends the whole transcript every time and asks for a summary. One function, no
cursor. It also costs money in proportion to conversation length times number of refreshes, which
is roughly length squared — and long threads are exactly the ones worth summarising, so the cost
curve points at the wrong end.

There is a subtler reason. Re-summarising is not stable. Give a model the same forty messages twice
and you get two different summaries, so a panel an agent is watching rewords itself for no reason
and they stop trusting it. Asking it to *update* something is a smaller job with a smaller answer,
and fields nothing new touched tend to survive untouched.

The cost is that errors are now permanent. A bad summary at message 12 is the starting point for
message 13, and no pass ever re-reads the thread and notices. We took that, because the failure is
a stale panel and the alternative was a bill that grows quadratically.

## Five fields, not a paragraph

The state is `product`, `issue`, `intent`, `tried`, `status` — plus `keywords`, which is not for
humans and is covered below.

A paragraph reads well and is useless for the actual job, which is an agent glancing at a panel for
two seconds before they type. Five labelled lines can be read in two seconds; a paragraph cannot,
and the agent ends up reading the thread anyway, which is the thing we were saving them.

The five are the questions an agent asks in order. *What is this about* (`product`). *What is wrong*
(`issue`). *What do they want* (`intent`) — genuinely separate, because a broken sole can mean a
refund or a replacement and it changes the whole reply. *What have we already said* (`tried`) — the
field that stops an agent suggesting what a colleague suggested an hour ago, which is the single
most annoying thing a support desk does to people. *Where are we now* (`status`).

Fields also give the model somewhere to put things. "Summarise this" invites it to write about the
conversation; five named slots make it fill in facts. And it makes drift visible — when `product`
changes between refreshes, something happened.

## A sequence cursor, not a timestamp and not "the last twenty"

A time cursor would work until it didn't: two messages can share a millisecond, and an ingested
email can be saved carrying a timestamp from an hour ago, which a "newer than" query skips
silently. `seq` is a counter with a unique constraint per conversation, so "everything after 14"
has exactly one answer.

Always sending the last twenty messages looks simpler, re-pays for nineteen of them every refresh,
and loses one silently if twenty-one arrived in a burst.

The cursor buys something we did not design for and now rely on: **running the job twice is
harmless.** The second run counts messages after the cursor, finds none, and returns without
calling the model. Several of the races below are survivable only because of this.

## Exactly one pending job per conversation

Before queuing a refresh we look for a pending `summary.refresh` job carrying this conversation id.
If one exists we do nothing. That single rule does three jobs at once.

It is the **debounce**. Five messages in twenty seconds produce one job, not five. The first queues
a job for thirty seconds later, the other four find it and stand down, and one model call covers
all five. Thirty seconds is a guess at how long someone types, and guessing wrong is cheap both
ways: too short and we pay for an extra call, too long and a panel is half a minute behind.

It is the **mutual exclusion**. Two refreshes at once would both read the same cursor, both pay,
and race to write. Because there is only ever one pending row, there is normally only one job to
pick up.

It is the **cache invalidation**. The presence of a pending job *means* the stored state is known
to be behind. We never had to write "is this stale?" anywhere, and there is no second place to keep
that answer that could disagree with the first.

The alternative was a lock table, or a `needs_refresh` flag on the conversation, or a timer in
memory. Each solves one third of the problem and adds a thing that can drift out of step with the
other two. The honest cost is that the rule is a read followed by a write with no database
constraint behind it, so two simultaneous writers can both queue — see the bugs.

## Never in the request

The model call takes one to three seconds and sometimes thirty. Nobody ever waits on it. The
alternative — build the summary when someone opens the thread — puts a third-party HTTP call on the
critical path of the most-used screen in the product.

The consequence we accepted: opening a thread shows whatever state exists, which may be a few
messages behind and may not exist at all. That is why the panel is served with `through_seq` and
`updated_at` — the agent can see the summary covers 14 of 20 messages and judge it. A summary
honestly labelled as slightly stale is far better than one that is silently so.

## Force the answer into a schema instead of asking nicely

The request tells the provider the exact JSON shape it must return, all six fields required and no
extras allowed, enforced during generation rather than checked afterwards. Asking in the prompt
instead gets you a code fence, or a preamble, or five fields where you asked for six — each one a
parse failure and a paid call thrown away. The near-misses are the dangerous ones: a response
missing `status` parses fine and quietly blanks a field.

We still clean up what comes back — strip each field, lower-case the keywords, drop duplicates, cap
at sixteen. Not because we distrust the schema, but because the schema promises a *shape* and says
nothing about the *contents*. A valid array of four hundred keywords is schema-conformant and a
broken query.

## The keywords field exists because prose is bad at search

`keywords` is generated with the other five and never shown to anybody. The five human fields are
written for a human; a search engine wants something else.

The specific problem is vocabulary. A customer writes "my boot came apart"; the article is titled
"Returning damaged footwear". Zero words in common, and full-text search finds nothing. So the
prompt asks for the customer's own words *and* the obvious synonyms an article might use instead —
boot and shoe, refund and return, delivery and shipping. It is a cheap bridge across the gap
embeddings would otherwise be needed for, bought as a by-product of a call we already make.

Alternative considered: search the prose fields alone. It half-works, and drags every filler word
in the sentence into the query.

## Postgres full-text, not embeddings

The material this was built from describes embeddings, an approximate-nearest-neighbour index and a
reranker. We did not build that, and it would be dishonest to imply otherwise. Full-text search was
already in the database because the help centre needs a search box. It costs nothing extra, it is
exact and explainable, and for a few hundred articles it is hard to beat.

Two deliberate details. The query is an **OR** of every term, not an AND: with forty terms from a
wandering conversation, requiring all of them returns nothing, ever. And there is a **relevance
floor** — measured on real data, a title match scores 1.4 and a single body-only match scores 0.4,
so the floor of 1.0 means an article needs either its title to match or about three separate body
hits. Below that we return nothing. A confidently wrong suggestion teaches an agent to ignore the
panel forever; an empty panel just means nothing matched.

What makes this affordable is that the whole thing is one function taking text and returning ranked
articles. The day full-text stops being good enough, that function changes and nothing else does.

## Failure is silence

If the provider is down, times out, errors, or hands back something unreadable, the job raises. The
runner catches it and retries with backoff — five attempts over about fifteen minutes, then it
gives up and marks the job failed. The cursor is not advanced, so a later successful run
reprocesses exactly the messages that were missed. Nothing is lost and nothing is double-counted.
The old state stays as it was: a stale summary beats a corrupt one.

If the provider is not configured at all, no job is ever queued and no row is ever written. The
summary endpoint returns null, suggestions fall back to searching the customer's recent messages
directly, and everything else is unaffected. That is the normal state of a development machine and
it is genuinely fine.

---

# 3. Known bugs

All verified against the code as it stands.

**The term cap can swallow the latest message — the exact thing the design exists to protect.** The
search text is built keywords-first, then product, issue, intent, then the latest message, and the
whole string is cut to the first 40 distinct words. Sixteen keywords plus three prose fields can
reach 40 before the latest message is reached. Measured with a realistic state, the message
*"actually forget the boots, can you cancel my whole subscription and delete my account"*
contributed `actually`, `forget`, `the`, `boots`, `can`, and lost `cancel`, `subscription`, `delete`
and `account`. Worse, stopwords occupy cap slots and are then discarded by Postgres, so the
effective budget is smaller than 40. **Open, and reachable in ordinary use on any conversation long
enough to fill the state.** Fix: build the query latest-message-first, or budget each source.

**A message arriving while a refresh is running never schedules one.** The job row stays `pending`
while it is being processed, so anything saved during the model call sees a pending job and stands
down — then sits past the cursor with nothing queued for it. **Open.** The window is the length of
the model call, and it repairs itself the moment any later message arrives or an agent opens the
thread. It only bites if the customer's last word lands inside that window.

**Backlogs over 60 messages stop halfway and nothing restarts them.** A run reads at most 60 new
messages, advances the cursor, and finishes successfully without queuing a follow-up. **Open.**
Unreachable at conversation pace; reachable through a bulk email import, or by enabling summaries
on a workspace whose threads are already long. One `schedule(soon=True)` at the end of a truncated
run fixes it.

**The one-pending-job rule is a check, not a constraint.** Two messages posted at the same instant
can both look, both see nothing, and both queue. **Open, reachable with any concurrent sender.** The
damage is small — the second job finds nothing past the cursor and returns — but it is small because
of the cursor, not because the rule held.

**The job lock is released before the job is marked done.** The runner claims due jobs with `FOR
UPDATE SKIP LOCKED`, but those locks end when its transaction commits — and this handler commits its
own write before returning, while the row still says `pending`. **Unreachable with one runner,
reachable the day there are two. Open.** The cursor makes the duplicate a no-op in the common case;
otherwise it is a duplicate paid call and a last-writer-wins race the next refresh corrects.

**Nothing stops the model forgetting.** The returned object replaces the stored one wholesale, and
the schema requires all six fields but permits empty strings — so a model having an off moment can
blank a `tried` field that took four messages to build, and nothing would ever restore it. "Keep
anything still true" is a request, not a guarantee. **Open by omission.** Refusing to overwrite a
non-empty field with an empty one would cost three lines.

**Multi-word keywords are dropped rather than split.** The cleanup keeps a keyword only if it is
entirely alphanumeric, so "gift card" and "sign-in" are discarded whole. **Open, minor** — the
prompt asks for single words and mostly gets them.

---

# 4. Would this hold if we had to scale it?

The model call is the expensive part and it is not what breaks first. Everything under it is. Here
is the order things give way in, and the arithmetic behind each.

```
  STAGE                       TRIGGER                    WHAT A USER SEES
  ─────────────────────────────────────────────────────────────────────────────────
  0  today                    a few hundred convs/day    nothing
  1  the job runner fills up  sustained message rate     signup emails arrive late
  2  the scheduling scan      stage 1 backing up         every message write slows
  3  a second container       an uptime requirement      duplicate model bills
  4  the model bill           volume                     a line item on an invoice
  5  retrieval gets vague     more, and more varied,     agents stop clicking the
                              help articles              suggestions
  ─────────────────────────────────────────────────────────────────────────────────
  ceiling: one API process, low thousands of conversations a day
```

Stages 1 and 2 are one problem feeding itself. Stage 3 is triggered by something other than load,
so it can arrive first.

## Stage 1 — the runner fills up, and email is what breaks

**Breaks.** One job runner, polling every three seconds, taking up to twenty due jobs and working
through them *one after another* in a plain loop. A summary job sits on an HTTP call inside that
loop — one to three seconds normally, thirty at timeout, opening a fresh connection each time. So
the ceiling is roughly one job every two seconds. It is this one because the queue is *shared*: the
same runner carries reply email, verification email, invites and inbound email ingestion. Five
kinds, one line. Summaries do not slow summaries down, they slow email down.

**When.** Read it two ways. Smoothly, half a job a second is about forty thousand a day — but load
is never smooth, and a peak hour four times the average starts queueing around ten thousand
messages a day. Sharply: the thirty-second debounce means one conversation produces at most one job
every thirty seconds, so about **fifteen conversations being typed into at the same moment**
saturates it. Fifteen is a small number and it is the honest one to quote.

**User sees.** Not a slow summary. Somebody signs up and their verification email takes four
minutes, because it queued behind eleven model calls. Nobody will guess the summariser did that.

**Options.** *Await the batch instead of looping it* — fire twenty due jobs together, so a batch
costs one round trip of wall clock instead of twenty. A few lines, nothing new to run; costs a
wider blast radius and leaves the queue shared. *Split the queue by kind* — email gets its own
runner and can never sit behind a model call; also no new infrastructure, the same table with a
`kind` filter, but it needs the lock bug fixed first, because two runners is exactly what makes
that bug real. *A real queue product* — correct, and far too much machinery for this.

**Lean.** Batch first: small, and buys an immediate order of magnitude. Splitting the queue is what
we actually want, because it fixes the shape of the problem rather than its size — and I would fold
the lock fix into that work rather than doing it early, since it costs nothing while there is one
runner. No queue product until the jobs table itself is the bottleneck, which is a long way off.

## Stage 2 — the scheduling check turns into a scan, exactly when you can least afford it

**Breaks.** Before queuing a refresh we ask "is there already a pending refresh job for conversation
41?", and we ask by matching a value inside a JSON column. The only index on that table is on status
and run time — nothing on kind, nothing on the payload. This runs on the write path of every single
message. It is a feedback loop with stage 1: the queue only grows when the runner is behind, and the
bigger it grows the more each incoming message pays to look through it.

**When.** Never on its own. It appears as the second half of stage 1, once pending rows run to the
hundreds.

**User sees.** Sending a chat message gets perceptibly slower — and slower for everyone at once, not
just the conversations causing it.

**Options.** A partial index on kind and conversation id covering only pending rows makes the lookup
a point read. Make it *unique* and it also closes the double-queue race from section 3, so one index
fixes a performance bug and a correctness bug together. The alternative is to stop asking the
database at all and keep the pending set in memory — faster still, and wrong the moment there are
two processes, which is stage 3.

**Lean.** The unique partial index, and I would ship it *before* stage 1 rather than after. One
migration, it turns a convention into something the database enforces, and it is the rare change
with no argument against it.

## Stage 3 — the second container, which arrives for a reason unrelated to load

**Breaks.** The runner is started by the API process itself, unconditionally, with no flag to turn
it off. You cannot add a second API container without also getting a second job runner. And the
runner claims work with `FOR UPDATE SKIP LOCKED`, which would be safe, except this handler commits
its own write before returning — so the lock is gone while the row still says pending, and the other
runner can claim the same job.

**When.** The day there are two containers. There is no load threshold, because the trigger is an
uptime requirement. The first time somebody wants zero-downtime deploys they get two runners whether
they wanted them or not, and that usually lands long before load would justify it.

**User sees.** Mostly nothing, which is the trap. The cursor makes a duplicate run a no-op in the
common case. Where messages arrived in between, you pay twice and two writers race on one row, which
the next refresh corrects. The visible symptom is a bill bigger than the message count explains.

**Options.** Fix the claim properly: mark the job claimed in its own committed transaction before
running the handler, so it survives the handler committing. Not large, and it is the real fix. The
cheap dodge is a flag that starts the runner in only one container — which works, and quietly
reintroduces a single point of failure for every background job in the product.

**Lean.** Fix the claim. The flag is the kind of shortcut still there three years later, and it
trades a correctness bug for an availability bug, which is not a trade.

## Stage 4 — the model bill

**Breaks.** Nothing technical. Every message eventually buys a model call, softened only by the
thirty-second debounce and by the cheap early exit — a refresh with no new messages returns before
calling anything, which is why an agent clicking through their inbox is nearly free. **When.**
Invisible at a few hundred conversations a day; a question somebody asks at a hundred thousand.

**Options and lean.** They all trade freshness for money: raise the debounce, require more than one
new message before bothering, or only refresh threads an agent has actually opened. The last is the
one I would take, because it is the only one that removes waste rather than just doing less — the
summary exists for a human who is reading, so computing it for threads nobody opens is pure waste
and costs nothing in quality. Worth saying that today the threshold is *one* new message, the most
eager setting available: a choice for a product with few conversations, not a considered position,
and the first dial I would turn.

## Stage 5 — retrieval stops being useful long before it stops being fast

**Breaks.** Quality, not speed. A GIN index over published articles handles tens of thousands of
documents without noticing. What decays is that an OR of forty loosely-related terms matches more
and more articles weakly as the library grows, so the relevance floor ends up doing more work than
the ranking does, and three suggestions become three plausible-looking wrong ones. **When.** It
tracks the *variety* of the library, not its size — a few hundred articles spanning genuinely
different topics will show it sooner than a thousand narrow ones.

**User sees.** Agents stop clicking the suggestions. No error and no slow page, which makes it the
easiest failure here to miss. The metric worth having is the click rate on suggested articles, and
we do not measure it today.

**Options and lean.** Embeddings with a reranker is the real answer, and the reason is vocabulary
rather than volume — word overlap stops being a good proxy for meaning. Cheaper intermediate steps
are weighting the latest message above the state, or scoring with AND-of-some rather than
OR-of-everything. I would do none of it yet: the keywords field is already buying the main thing
embeddings would buy. Fix the term-cap bug from section 3 first, since that is a real defect sitting
underneath any measurement we might take, then measure the click rate, and only then talk about
embeddings. Retrieval is one function taking text and returning ranked articles, so the swap stays
contained whenever it comes.

## The ceiling, plainly

One API process, low thousands of conversations a day. Past that the single job runner is the
binding constraint, and everything above is ordinary work — a batch, an index, a split queue, a
proper claim. None of it changes the shape of anything.

The shape only has to change on the day a summary must be fresh within seconds rather than within a
minute. The entire design assumes the state is allowed to lag: that is what the debounce buys, what
the cursor makes safe, and why nothing in a request ever waits. If that assumption breaks,
queue-and-debounce goes with it, and the answer is updating as messages arrive — a different system,
and a much more expensive one. Nothing about this product suggests it needs that.
