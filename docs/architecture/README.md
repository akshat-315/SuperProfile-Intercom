# The system

This is a customer support platform. A shop puts a chat panel on its website, its customers ask
questions there or send email to a support address, and the shop's agents answer everything from
one inbox. Many shops share the same installation and none of them can see each other.

This document covers the system as a whole: what runs, how the pieces talk, what the tables look
like and why, how one database serves many shops without leaking, and where it would break. The
socket layer, email, the knowledge base, the AI summaries and the HTTP surface each have their own
document; where one of them owns a subject, this one points at it.

---

# 1. The architecture, and how it actually works

Three processes and a database. That is the whole thing.

```
   browsers ──►┌─────────┐  /api/ /ws/ /health  ┌───────────┐    ┌──────────────┐
   inbox,      │  nginx  ├──────────────────────►│    API    ├───►│ mail provider│
   chat panel, └────┬────┘                       │  FastAPI  │    │ Azure OpenAI │
   help centre      │  everything else           │           │    └──────────────┘
                    ▼                            │  HTTP     │
              ┌───────────┐                      │  sockets  │
              │    web    │                      │  jobs     │
              │  Next.js  │                      └─────┬─────┘
              └───────────┘                            ▼
                                                 ┌───────────┐
                                                 │ Postgres  │
                                                 └───────────┘
```

There is no message broker, no cache server, no search service and no separate worker. That is
deliberate, and it is the most important thing to know here: **one Python process does all the
server-side work.** It answers HTTP requests, holds the open WebSocket connections, and runs the
background jobs on a loop inside itself. The web process renders pages and proxies through to the
API; nothing is decided there. Search is Postgres full-text search, scheduled work is a Postgres
table, and the list of who is connected is a dictionary in memory.

## One message, end to end

A customer emails `support@a-shop.example`.

```
  mail provider          API process              Postgres        agent's inbox
       │ POST /hooks/email    │                       │                 │
       ├─────────────────────►│ signature checked over the raw bytes    │
       │                      │ write one job row     │                 │
       │◄─────────────────────┤──────────────────────►│  COMMIT, then 204
       │             ...... up to 3 seconds later ......                │
       │                      │◄──────────────────────┤ one due job     │
       │  GET the full email  │                       │                 │
       │◄────────────────────►│ workspace from the address              │
       │                      │ customer, thread, message, seq = 7      │
       │                      ├──────────────────────►│  COMMIT         │
       │                      │  now, and only now, tell people         │
       │                      ├────────────────────────────────────────►│
       │                      │      {"t":"message","conversation":41,"seq":7}
```

Two things there are the shape of the whole system. The webhook does almost nothing: it checks the
request really came from the mail provider, writes one row saying "there is an email with this id
waiting", and returns. It does not fetch, parse or store anything. The provider gets its answer in
milliseconds and stops retrying, and everything that can fail happens later, where failing is
cheap.

And the fan-out happens after the commit, never before, and cannot fail the work that triggered
it. What crosses the socket is not the message but three fields saying *something happened in
conversation 41, at position 7*; the browser then fetches over ordinary HTTP. The realtime
document explains why. An agent replying is the same story backwards: the reply is saved, the
conversation is claimed if nobody owned it, a job row for the outgoing email is written in the
same transaction, everything commits, and only then does the fan-out run.

## The data model

A workspace is one shop. Everything a shop owns hangs off it.

```
  workspace ──┬── workspace_member ── user        (people, global)
              ├── customer ── conversation ── message   (seq 1, 2, 3, …)
              │                    └───────── conversation_state  (the AI summary)
              ├── article ── article_category
              └── invite

  job                                            (the one table nobody owns)
```

A conversation is a list of messages in a fixed order, so that is what the model is: a row for the
thread and a row per message carrying `seq`, a counter starting at 1 in each conversation. Order
comes from that counter and never from a timestamp — the reason is a decision below.

A message also carries up to three optional identifiers, each answering "have I seen this before?"
from a different direction. `client_msg_id` is minted by the browser, so a retried send finds its
own earlier attempt instead of posting twice. `external_id` is the email `Message-ID`: it makes a
redelivered webhook a no-op, and it is what threading is built on, since an arriving email's
`In-Reply-To` and `References` headers are matched against it. `in_reply_to` records which message
this one answered.

Three columns on the conversation row copy things the messages already imply: the time of the last
message, a 200-character preview, and the unread count. That is for the inbox list, and it is also
a decision below.

Users sit deliberately outside the workspace tree. A person is one account with one email address
who may belong to several shops, and `workspace_member` says which and with what role. That is why
a few lookups say plainly "this is a person, look them up globally" — a cross-workspace read has to
be asked for by name, which is the next section.

## One database, many shops

Every table a shop owns carries its own `workspace_id` column — actually present on the row, not
reachable by following foreign keys. What makes it safe is that nobody is trusted to use it
correctly. One piece of code sits in front of every
query the ORM runs. If the query touches a table a shop owns, it adds the filter itself. If no
workspace is set, it does not run the query unfiltered — **it raises**:

```
  query with a workspace set   ──► filter added automatically
  query with no workspace set  ──► RuntimeError, the request fails
  deliberate cross-shop read   ──► allowed, but the code must name a reason
```

Signing in sets the workspace. A widget session sets it. A background job sets it from the row it
loaded. Anything else is a bug that stops the request instead of leaking a row.

I checked this rather than assuming it. Reading conversations with no workspace set raises
`NoActiveWorkspace`. And fetching another shop's conversation *by its primary key* from inside your
own returns `None` — the filter applies even when the query already names the exact row it wants.

## The background job runner

There is no queue server. A job is a row: a kind, a JSON payload, a status, a time to run at, an
attempt count and the last error. The runner is a loop inside the API process. Every three seconds
it takes up to twenty due jobs, locking them with `FOR UPDATE SKIP LOCKED` so another runner steps
over them rather than waits. A handler that throws is retried with a doubling delay capped at ten
minutes; after five attempts the job is marked failed and left alone. Five kinds exist: ingest an
inbound email, send a reply as email, send a verification email, send an invite email, and refresh
a conversation's AI summary. The part worth stealing is how a job is created: enqueueing writes the
row into the *caller's* transaction and does not commit, so an agent's reply and the job that
emails it out are one atomic write.

## The seams

The channel a conversation arrived on is a column, and both writers — chat panel and email ingest
— call the same function to add a message, so a third channel is a new writer and nothing else.
Sockets are known to one module with four public functions, so nothing in the request path knows a
socket exists. Mail is behind one module, the model provider behind one function, and the
workspace rule is one interceptor.

## What we did not build

**Custom domains never shipped.** A shop's help centre is reached at a path under the app's own
domain and nowhere else. The lookup that would resolve a hostname to a shop exists as a function
that always returns nothing, and there is no table, no certificate handling and no DNS work
anywhere in the code. It was designed and it was not built. If a plan or an older document reads
as though a shop can point its own domain at this, that document has drifted from the code.

---

# 2. The decisions, and what each one beat

## One database with a workspace column, not a database per shop

The alternative is a database, or a schema, per shop. It gives isolation you cannot get wrong,
which is a real thing to want. It also makes every migration a loop over every shop that can
half-succeed, and turns "how many open conversations are there across the platform" into a script
instead of a query. For a product where a shop is a few agents and a few thousand conversations,
that is a large permanent tax against a risk we can close another way. So: one database, one set
of tables, a column. The tax moves from operations to correctness — a missing filter is now a data
leak — and the next decision is what pays for it.

## The filter is applied for you, and refuses to run when it can't be

The obvious way to spend that column is to write the `where` clause in every query and rely on
review to catch the ones you forget. That fails in a specific way: the forgotten filter still
returns rows, the page still renders, and nothing is wrong until someone sees a stranger's
conversation. No test fails, because the test data has one shop in it.

Instead there is one interceptor in front of every ORM query, and its important property is not
that it adds the filter — it is what it does when it cannot. It raises. A route that forgot to
establish who it acts for returns a 500 on the first request anybody makes: loud, early, and
impossible to ship past.

Postgres row-level security would do the same job in the database, which is stronger — it survives
someone opening a psql prompt. We didn't use it because the policy would live in migrations while
the code choosing the workspace lives in Python, so two things must agree across a boundary, and
every connection would need the workspace set as a session variable, which is awkward through a
pooler. Right end state, wrong starting point.

## Every owned row carries the workspace itself

A message could reach its workspace through its conversation. Storing it again is denormalised and
can in principle disagree. It buys two things. Filtering is a comparison on the table you are
already reading, never a join, so the interceptor can be simple enough to be obviously correct —
it needs to know nothing about how tables relate. And the day one big shop needs its own database,
the rows already say where they belong, so moving them is a copy rather than a schema change. The
disagreement it risks is prevented by the same interceptor refusing to insert an owned row with no
workspace set.

## Jobs are a Postgres table, polled

Redis with a real queue library is the normal answer and is better at this in every way except
one: it is a second place where state lives, so there is a failure mode where the job says one
thing and the database says another. A table has none of that. Jobs are backed up because the
database is backed up, and a job commits together with the row it is about — the thing a broker
cannot give you without an outbox table, and an outbox table is this. `SKIP LOCKED` is what makes
it a queue rather than a table people fight over. The cost is small and honest: work waits up to
three seconds, and the runner is a loop we wrote instead of a library others have debugged. Nothing
here needs to be faster than that — email is not real-time and the summary is deliberately delayed
anyway.

## Messages are numbered, not timestamped

`seq` is per conversation and starts at 1. Two messages can share a millisecond, two servers can
disagree about the time, and a clock correction can move backwards. A counter does none of that, a
unique constraint stops two messages claiming one number, and "everything after 47" becomes a
sentence with one right answer. The realtime document explains what that makes possible.

## The session is a signed cookie, and its contents are not believed

A sessions table means a database read on every request to learn something the request already
carried. The cookie is a user id and an expiry, signed with a secret; if the signature checks out,
the request is who it says it is.

What matters is what happens next. The cookie also carries the workspace and the role, and **the
role is thrown away** — membership is re-read from the database on every request and the role comes
from there. Otherwise demoting an admin would do nothing for seven days, which is the classic way
this design goes wrong. The cookie gives a claim about identity, cheap to verify with a signature;
the database gives authority, which is not. The honest cost is that a signed cookie cannot be
revoked, so signing out ends the browser's copy and not the token. Seven days is the blast radius,
chosen for that reason rather than for convenience.

## Conversations remember their own preview and unread count

Two extra writes on the write path to remove a join and an aggregate from the read path everybody
sits on all day. The alternative — compute it every time — is correct by construction and is the
slowest query in the product.

## One process holds HTTP, sockets and jobs

Three deployables is the textbook answer: an API tier, a socket gateway, a worker fleet. Each
scales on its own curve and a stuck worker cannot slow a web request.

We run one, because at this size the textbook answer costs more than it saves. One image, one
deploy, one log stream, one health check. Sharing the process makes the fan-out after a save a
function call rather than a network hop, and a job uses the same connection pool. Splitting later
is cheap because nothing assumes otherwise: the runner starts in one place and the socket registry
is behind one module. The cost is not hidden and it is the whole of section 4 — every piece of
state held in memory is correct exactly as long as there is one process.

---

# 3. Known bugs

These belong to the system as a whole. The socket layer, the email channel and the knowledge base
name their own in their own documents.

**The job lock is released before the job is marked done.** The runner locks the rows it picks up
with `SKIP LOCKED`, but those locks belong to its transaction and vanish when it commits — and two
handlers commit their own work halfway through, while the job row still says `pending`. A second
runner polling in that window runs the same job again. Measured: with a handler that never commits,
two staggered runners ran the job once; with a handler that commits mid-flight, exactly as the real
ones do, the same job ran **twice**. Inbound email survives this, being deduplicated on the mail
`Message-ID`; the outgoing reply sender has no such check, so the customer gets the same reply
twice. **Unreachable with one runner, reachable the moment there are two — the same day anyone adds
a second API container. Open.** The fix is to mark the job taken in its own committed statement
before running it.

**One slow job delays every other job behind it.** The runner takes a batch of twenty and runs them
one after another. A summary refresh calls a model provider with a thirty-second timeout, so a hung
call can hold up an email a customer is waiting for by half a minute, and delays the next poll too.
Nothing is lost; it is just late, invisibly. **Reachable today wherever summaries are switched on.
Open.**

**Message numbering can fail under concurrent writes.** Allocating `seq` reads the current highest
number then inserts, so two writers can read the same number and one loses to the uniqueness
constraint. It retries five times, then gives up with a 500. Measured: sixteen messages posted into
one conversation at the same instant produced **five saved and eleven failures**; the same sixteen
sent one after another all succeed. **Unreachable at human typing speed. Reachable with automated
senders, a bulk import, or an email backlog arriving at once. Open.** The fix is to allocate the
number inside a single insert.

**Everything the process remembers is wrong as soon as there are two processes.** The open sockets,
the one-time tickets that let a browser open one, and the rate limiter's counters are all in-process
dictionaries. With two containers a ticket minted by one and spent on the other fails forever, and
an agent connected to one never hears about a message saved by the other. Nothing errors; it is
quietly half-live. **Unreachable with one container, reachable with two. Open** — stage 1 below.

**A duplicate summary refresh can be queued.** Scheduling one checks whether a pending refresh
exists and enqueues if not, so two messages arriving at the same instant can both find nothing and
both enqueue. One wasted model call, not a wrong summary. **Reachable, harmless, open.**

**The rate limiter trusts a header it cannot verify.** Requests are keyed by `X-Forwarded-For` when
present, with no check that a proxy set it. The supplied nginx config overwrites that header with
the real peer address and the API listens only on localhost, so the documented deployment is fine.
**Unreachable behind the intended proxy. Reachable in any deployment that exposes the API directly
or puts a proxy in front that appends rather than overwrites. Open.**

**A job that gives up tells nobody.** After five attempts a job is marked `failed` with its error
text and the runner moves on. Nothing alerts and no page lists failed jobs, so an email that never
went out is a row in a table nobody queries. **Open** — more a missing feature than a defect, but
the effect is that this system can silently stop delivering mail.

**There are no automated tests.** Not one, anywhere in the repository. Not a bug, but it is why
every claim here was checked by reading the code or running it, and the honest reason the defects
above were found late rather than early.

---

# 4. If we had to scale this — what breaks first, and what we would do

Things break in an order, and it is not the order you would guess. **The first failure is not
caused by load at all.**

```
  stage 0   today             one process, one database             holds fine
  stage 1   second container  in-memory state, and the job runner   BREAKS FIRST
  stage 2   busy runner       one loop, jobs queue behind each other
  stage 3   growth            the jobs table, then messages
  stage 4   real load         sockets first, then the database      the ceiling
```

## Stage 0 — where we are, and what it holds

One API process, one Postgres, a few shops with a handful of agents each and conversations in the
thousands. Comfortable, and nothing is close to a limit: the inbox list is indexed and paged on a
keyset cursor, article search is a GIN index, and the working set fits in memory. Order of
magnitude, one process on a small box is fine to roughly a hundred requests a second and a few
thousand open sockets.

## Stage 1 — the second container. This is what breaks first

**What breaks.** The socket registry, the one-time socket tickets and the rate limiter are
dictionaries inside the process. The job runner also starts inside every process.

**Why this first.** The trigger is not traffic, it is wanting zero-downtime deploys — and people
want that long before load justifies a second box. So it arrives first almost regardless of how
the product grows.

**What it looks like.** Not an error. An agent on container A never hears about a message saved by
container B, so their inbox is live for some conversations and dead for others, with no failed
request and nothing in the logs. A ticket minted on A and spent on B is refused every time, which
reads as a client bug. And two runners make the lock defect live: a customer receives the same
reply email twice. The expensive part is that all three look like different problems and are one.

**The options for the shared state.** Postgres `LISTEN/NOTIFY` or Redis. `NOTIFY` costs nothing new
to run and gives no delivery guarantee to a listener that is down. Redis is built for this and is
another thing to operate, secure and back up. Because the socket carries only an id and the browser
fetches the body, a missed notification degrades to "briefly stale" rather than "wrong" — so the
guarantee we would give up is one we do not need. **The lean is `NOTIFY` first, Redis if fan-out
volume outgrows it**, and **do all three at once**: separately it is three changes with two windows
in which the system is half-fixed, and half-fixed is harder to reason about than either end.

**The runner has a cheaper answer than either.** Rather than making many runners safe, run exactly
one — the same image with a different command in its own container, while the API containers start
no runner. That is an environment variable and a compose entry. It removes the double-send without
touching the locking code and takes slow model calls out of the process serving requests. The cost
is that nothing restarts it if it dies, so you trade "occasionally paused" for "occasionally
duplicated" — and paused is the better failure, because it is loud. The proper fix, claiming the
job in its own committed statement before running it, is about ten lines and I would do it too. I
just would not block a deploy on it.

## Stage 2 — the runner gets busy

**What breaks.** Twenty due jobs are run one after another, and a summary refresh can sit on a
model call for thirty seconds. **What it looks like:** a reply email arrives half a minute late for
no visible reason. Latency, not loss, which is why it would go unnoticed for a long time.

**The options.** Run the batch concurrently — a few lines, but they share one database session, so
not free. Or give slow work its own runner so summaries cannot delay mail. Or leave it, since
nothing here has a latency guarantee. **I lean to splitting mail from summaries**: the kinds
already exist, so it is configuration rather than code, and it leaves the concurrency question for
when there is evidence it matters.

## Stage 3 — the tables start to grow

**What breaks.** The jobs table before anything else, because **nothing ever deletes a finished
job**, and scheduling a summary asks "is a refresh already queued for this conversation?" by
filtering pending jobs on a JSON field with no index that can help. **What it looks like:** sending
a message gets slowly, evenly worse for everyone over months, with no incident to point at — the
worst kind to diagnose, because there is no before and after.

**The options.** An index on kind plus a nightly delete of old completed rows, which is an
afternoon; or a separate table for scheduled refreshes so the question stops being a scan. **The
lean is the index and the cleanup**, because the second is a new concept to maintain and buys
nothing until the first stops being enough.

## Stage 4 — real load, and the ceiling

**What breaks.** Sockets before requests. An open socket costs memory whether or not anyone is
typing, a different cost curve from HTTP, and that is what sets the per-process limit. After that
the database, where the biggest table by a wide margin will be messages.

**The options, in the order I would reach for them.** Read replicas for the list and search paths,
close to a connection-string change because those paths are read-only. Then partitioning messages —
by time rather than by shop, because the access pattern is overwhelmingly recent-first. Then, only
if one shop genuinely dwarfs the rest, moving that shop to its own database; possible without a
schema change precisely because every row already carries its workspace, and having the option is
worth more than using it. Further out the socket layer wants to be its own tier, scaled on
connection count rather than request count, because those curves stop being the same and paying for
one to get the other is expensive. I would want the earlier steps to have actually hurt first.

## The honest ceiling

**This design stops being sensible the day one process stops being acceptable** — realistically a
few thousand concurrent sockets, or the first hard uptime requirement, whichever comes first. Below
that it is not a compromise, it is the right shape: fewer moving parts than the textbook answer,
one place to look when something is wrong, and every piece of state in the one system that is
already backed up. Above it, the work is not a rewrite — it is moving three dictionaries out of
memory, running the job loop somewhere else, and putting a replica behind the reads. Nothing in the
code assumes the current shape, which was most of the point of choosing it.
