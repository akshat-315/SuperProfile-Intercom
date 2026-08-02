# The real-time layer

This is a customer support platform with two faces: a chat panel a shop puts on its website,
where a customer asks a question, and an inbox the shop's agents sit in all day, where every
question from every customer lands.

The product only works if both sides feel live. A customer who asks a question and sees
nothing happen assumes nobody is there. An agent who has to press refresh to find out whether
anyone is waiting is doing polling by hand. So the job of this layer is one sentence:

> When something happens in a conversation, everyone who should know must find out within a
> second, without anybody touching anything.

Everything else was already correct before it existed. It just wasn't alive.

---

# 1. The architecture, and how it actually works

```
   ┌──────────────────┐                     ┌──────────────────┐
   │  Agent's browser │                     │ Customer's       │
   │  (the inbox)     │                     │ browser (widget) │
   └───┬──────────┬───┘                     └───┬──────────┬───┘
       │          │                             │          │
  HTTP │          │ WebSocket              HTTP │          │ WebSocket
       │          │ /ws/agent                   │          │ /ws/widget
       ▼          ▼                             ▼          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                    ONE API PROCESS                           │
   │                                                              │
   │   HTTP routes  ──write──►  ┌──────────┐                      │
   │        │                   │ Postgres │                      │
   │        │  ◄────read─────   └──────────┘                      │
   │        │                                                     │
   │        └──after commit──►  fan-out ──►  ┌────────────────┐   │
   │                                         │   registry     │   │
   │                                         │ (a dictionary  │   │
   │                                         │  in memory)    │   │
   │                                         └────────────────┘   │
   └──────────────────────────────────────────────────────────────┘
```

The registry is the only new idea there: a plain dictionary remembering who is connected — two
of them in fact, one keyed by workspace holding every agent connection, one keyed by customer
holding that customer's open panels. This layer doesn't replace the database, the routes or the
permission rules. It sits beside them and says "go and look again".

## One message, end to end

Cara types "Is it there yet?" into a shop's chat panel. Ada is an agent in the inbox, reading a
different conversation.

```
Cara's browser          API process                Postgres        Ada's browser
      │                      │                        │                  │
      │  POST the message    │                        │                  │
      ├─────────────────────►│  insert message,       │                  │
      │                      │  seq = 12              │                  │
      │                      ├───────────────────────►│                  │
      │                      │  COMMIT                │                  │
      │                      ├───────────────────────►│                  │
      │                      │                    ✓ saved                │
      │                      │                                           │
      │                      │  now, and only now, tell people           │
      │  {"t":"message",     │  {"t":"message","conversation":41,"seq":12}│
      │   "conversation":41, │───────────────────────────────────────────►│
      │   "seq":12}          │                                           │
      │◄─────────────────────┤                        │   "something happened
      │  201 with the message│                        │    in 41" — go and look
      ├◄─────────────────────┤   GET /api/conversations                  │
      │                      │◄──────────────────────────────────────────┤
      │                      ├──────────────────────────────────────────►│
      │                      │                        │      the list row updates
```

What crosses the socket is not the message but three small fields: what happened, which
conversation, and the message's position in it. Ada's browser is told *that* something happened
and *where*, then fetches the *what* over ordinary HTTP, exactly as if she had pressed refresh.
We call that a **doorbell**. A doorbell tells you to go and look. It does not hand you the
parcel.

```
  /ws/agent    keyed by workspace   one connection per agent, per tab
               carries: message, typing, read, summary, resync, error
               filtered by the agent's role before anything is sent

  /ws/widget   keyed by customer    one connection per open panel
               carries: message, typing, read, resync, error
               no filtering needed — it only ever sees its own customer
```

Both sockets run the same code and differ in two things: how you prove who you are, and which
dictionary you go into. Traffic runs upward too — both sides send typing notifications, which
are rate limited, permission-checked, and rebroadcast to the other side.

---

# 2. The decisions, and what each one beat

## One connection per client, not per conversation

The obvious design is a socket per conversation. It falls apart the moment you look at what an
agent does: they aren't watching one conversation, they're watching an inbox of maybe two
hundred. Worse, a conversation nobody has opened has no socket at all, so a brand new customer
starting a brand new thread stays invisible until a refresh — the exact problem this layer
exists to solve.

So a connection is per **authenticated client**: one socket, one person, everything they are
entitled to hear. The question moves from "which socket do I write to" to "who is allowed to
hear this", which is a dictionary lookup. The cost is that a browser hears about conversations
it isn't looking at, so the client decides what to do with each doorbell. That is an `if`. The
alternative was two hundred connections.

## Save first, then tell people

Every place that creates a message writes the row, commits, and only then fans out.

Fanning out first is about twenty milliseconds faster and makes it possible to tell a browser
about a message that then fails to save. That browser fetches, finds nothing, and cannot tell
whether it is early or wrong. The thread being the truth is the entire product. Doing both
inside the transaction is worse still: the fan-out would hold the transaction open for as long
as it takes to write to every socket, so one slow socket becomes a long-held row lock.

One rule follows. Because the message is already committed when the fan-out runs, **the fan-out
is not allowed to fail the request**. If writing to a socket throws, it is logged and swallowed.
The alternative is a message being saved and the sender told it wasn't.

> A dropped connection costs a re-render. It never costs a message.

## We send an id, not the message

The socket carries `{"t":"message","conversation":41,"seq":12}` and nothing else. Pushing the
whole body saves one round trip — 40 milliseconds instead of 80 — and costs three things.

*Two copies of one message will eventually disagree.* The pushed copy is built by the fan-out,
the stored copy by the fetch endpoint. The first time somebody adds a field or changes a date
format they drift, and the bug only shows for people who were connected at the time, which is
the hardest kind to reproduce. With a doorbell there is one serialiser, and it cannot disagree
with itself.

*A missed doorbell means "late". A missed body means "wrong".* Lose a doorbell and the next
fetch repairs it, because the fetch reads the database and the database is right. If the pushed
body was the only copy the client would ever see, losing it loses the message and nothing knows.

*You can batch ids; you cannot batch bodies.* Sixteen doorbells for one conversation collapse
into one fetch, because current state already contains all sixteen. Sixteen pushed bodies are
sixteen things the browser must handle. The price is one extra round trip, and nobody has
complained about a reply arriving in 80ms instead of 40.

## Ordering comes from a counter, not a clock

Every message carries a `seq`, a counter starting at 1 in each conversation. Clocks lie: two
messages can share a millisecond, two servers disagree about the time, and NTP can move a clock
backwards so a later message carries an earlier one. Order a thread by timestamp and it can
rearrange itself while somebody is reading it — which doesn't look like a sorting bug to a user,
it looks like a broken app. A counter can do none of that, and a unique constraint stops two
messages claiming the same number. `seq` also makes "everything after 47" a sentence with one
right answer, which is what catch-up will be built on the day we need it.

## A ticket gets you onto the socket, not a token

You cannot set a header on a WebSocket, and the session cookie isn't sent either: it is
`SameSite=Lax` and the socket is a different origin. We won't weaken it to `None`, because `Lax`
is a large part of why the app isn't vulnerable to CSRF. That leaves the query string, the least
private part of a request — it lands in the server's access log, every proxy's log, browser
history, and any error reporter that captures URLs. Putting the real session token there, 30
days long and not revocable, means one log file shipped to an aggregator is a month of chat
history for everyone in it.

So the credential is a **ticket**: a random string meaning nothing except "whoever holds this
was authenticated a moment ago". It is minted over HTTP, where auth already works, and spent on
the handshake, which hands the server the workspace, user and role behind it.

The ticket sits exactly where the real token would have, and it doesn't matter, because of what
it is. It lives 30 seconds, can be used once, and grants one thing — opening a socket for one
identity. No HTTP route accepts one. A ticket in a log file was already dead when the line was
written. Two details are deliberate: it is deleted *before* its expiry is checked, so even
presenting a dead ticket burns it, and the clock is monotonic, because an NTP step backwards
could otherwise make a ticket immortal.

Two honest edges. The role is captured at mint time, so socket permissions are a snapshot:
demoting an admin doesn't affect a socket they already hold, only their next one. And the agent
socket refuses foreign origins while the customer socket doesn't — the panel is an iframe on
arbitrary customer websites, so the list of valid origins is never complete and an allowlist
would silently break a paying customer's chat whenever their domain changed. That is safe
because **the ticket is the lock and the origin check is defence in depth**.

## A bounded queue, and we disconnect when it fills

Every connection owns a queue holding a hundred payloads, drained by one task. It exists because
a client that stops reading produces no error: a lid closes, a phone loses signal, a background
tab gets throttled, and everything the server wants to send piles up behind a blocked write.
With no ceiling that pile *is* the process's memory. This is the failure that actually kills
socket servers — not throughput, one client that stopped reading.

```
   fan-out ──► offer()
                 ├─ room in the queue?  ──► queue it, return immediately
                 └─ queue full?         ──► drop the payload, log a warning
                                            naming this client, and CLOSE
                                            the connection (code 1013)
```

Blocking the fan-out until the slow client catches up was the simplest thing to write, and turns
one stuck client into a stall for everyone else who should have received that message. Dropping
the oldest payload and keeping the connection sounds gentler and is much worse: the client stays
connected, believes it is up to date, and is silently missing a message with no reconnect coming
to repair it. That is a gap, and gaps are the one thing this design won't tolerate. Closing is
right because a client a hundred doorbells behind has no useful state anyway, and the reconnect
triggers a catch-up that repairs it exactly.

## The role rule applies to the fan-out, not only to the fetch

An admin sees every conversation in the workspace; a non-admin sees only conversations that are
unassigned or assigned to them. That rule lives in the query behind `GET /api/conversations`,
and is enforced a **second time, independently**, before anything goes out over a socket.

You could argue that's redundant, since a non-admin who refetched would get a correct list that
simply doesn't contain conversation 41. But three things leak anyway: their list flickers for a
reason they can't see, the browser makes a query it didn't need, and **the existence of the
conversation leaks** even though its contents don't. In a shared inbox that is a real signal.

> A permission check on the read path is not a permission check on the push path.

The rule applies a third time on the way *in*: before broadcasting a typing notification we
check the agent may see that conversation, otherwise they could announce they are typing into a
thread they can't open and the customer would be shown a colleague's name. The customer's socket
needs none of this — keyed by customer id, its filtering is structural rather than conditional,
which is the better kind.

## Register the connection, then tell it to catch up

```
  WRONG — catch up first, then register:
     tell the client to catch up
        message 51 is saved and fanned out → not in the registry yet → dropped
     register the connection
        the client never sees 51, and nothing anywhere knows

  RIGHT — register first, then catch up:
     register the connection
        message 51 is saved and delivered normally
     tell the client to catch up
        the client fetches, sees 51 again, discards the duplicate
```

> A duplicate is one comparison. A gap is unrecoverable.

The catch-up frame is one word — `{"t":"resync"}` — and the client refetches. The original design
called for a replay: the client says "I have everything up to 47" and the server sends 48, 49, 50
individually. We simplified that deliberately. Because the socket only carries ids, replay and
resync end in the same query against the same database, and only one of them has a middle. A
replay is a sequence of frames over time, so a message arriving mid-sequence must be either
delivered out of order or held and possibly lost. It costs a full refetch per reconnect — a
deploy disconnecting six hundred agents is six hundred inbox queries rather than three small
deltas each. Affordable today, and `seq` is already in every frame for the day it isn't.

## Rate limiting returns a boolean instead of raising

Typing notifications travel upward, potentially one per keystroke; the limit is five per second
per person. The interesting part is the shape, not the number. The rest of the system has a
limiter that raises and the framework turns that into an HTTP 429. A WebSocket has no response
object, no headers and no status code once the handshake is done, so raising would kill the
connection — wildly disproportionate to somebody typing quickly. So the limiter was split into
two functions over one implementation: one decides and returns true or false, one decides and
then raises. The socket calls the first, replies with an error frame, keeps the connection open,
and counts a strike; ten strikes closes it. The usual cause of a burst is a customer typing fast
and closing the panel mid-sentence, and killing their chat for that would be absurd.

## No application heartbeat

One already exists a layer down: the server pings every 20 seconds and closes anything that
doesn't answer within 20 more, and browsers reply in the network stack below JavaScript. A JSON
ping on top would add a **second definition of "dead"** that can disagree with the first — the
shorter timeout wins and the longer one becomes dead code that looks like a safety net.

---

# 3. Known bugs

Naming the defects is more useful than claiming there are none. Each was checked against the
code as it stands.

**Refusals come back as HTTP 403, not close code 1008.** Every refusal uses 1008, but refusals
happen *before* the handshake completes and a close code only exists once there is a WebSocket,
so the framework answers with a plain 403. Anybody hunting for 1008 in the network panel will
never find it. A bug in expectations, not behaviour. **Open.** The one place 1008 really is
delivered is the strike-based close, on an accepted connection that then misbehaved.

**Message numbering gives up after five attempts.** Allocating `seq` reads the current highest
number and then inserts, so two writers can read the same number and the second collides with
the uniqueness constraint. Measured: sixteen messages posted *concurrently* into one conversation
produced nine HTTP 500s; the same sixteen sent one after another all succeed. **Unreachable at
human typing speed; reachable with automated senders, bulk imports or an email backlog. Open.**
The fix is to allocate the number inside a single insert.

**A handler that rolled back used to make its job retry forever.** One background-job handler
rolls its transaction back on a recovery path, which expires the ORM objects loaded in that
transaction — including the runner's own copy of the job row. The runner then read the job's
`id` to log "job done", triggered a lazy reload it couldn't perform, and threw. That exception
escaped the per-job error handling, so the batch never committed, so the attempt count was never
saved: the job stayed pending with zero attempts and came round again three seconds later,
forever. It could never hit the maximum-attempts limit, because the counter that would have
stopped it was the thing failing to save — a bounded failure accidentally replaced by an
unbounded one. **Fixed**: the runner now reads what it needs into locals before calling the
handler. A runner must not depend on state the code it calls is allowed to invalidate.

**The job lock is released before the job is marked done.** The runner selects due jobs with
`FOR UPDATE SKIP LOCKED`, but those locks live in its transaction and are released the moment it
commits — and some handlers commit their own work mid-processing, so the lock goes away while the
row still says `pending` and another runner can run the same job twice. **Unreachable with one
runner, reachable with two. Open**, and it goes live the same day the registry does, so it is
worth fixing as part of that work.

**The chat panel used to lose agent messages.** The panel optimistically appended the customer's
own message while a doorbell could trigger a reload that *replaced* the list. The two raced, and
the append could win using a copy captured before the reload, so an agent reply arriving in
between simply vanished — still in the database, back on the next reload, which made it look
intermittent and hard to believe. **Fixed** by merging on sequence number instead of replacing:
a stale copy can now only fail to add something, which the next merge repairs. Merging beats
replacing any time two sources write to the same list.

**The 64 KB frame limit exists in the container image, not in the code.** The cap is set on the
server's command line in the Dockerfile, so running the server any other way — the local
development entrypoint, for instance — falls back to the library default of 16 MB. The same code
enforces two very different limits depending on how it was started, and the safe one is the
configuration hardest to notice. **Reachable in any deployment not using that exact command.
Open.**

**Only typing frames are rate limited.** A frame type with no limit registered passes unlimited,
so an authenticated client can send any other type as fast as it likes, each JSON parsed before
being discarded. Cheap per frame and it needs a real session, so it isn't urgent — but "unknown
frames are free" is the wrong default. **Open.**

**Strikes never reset.** A connection open all day that trips the typing limit occasionally will
eventually accumulate ten strikes and be closed, though it was never abusive in any single
moment. The reconnect is invisible, so the impact is small. **Open, cosmetic.**

**Typing notifications cost a database query each.** The permission check before broadcasting
loads the conversation, so a keystroke-frequency event costs a database round trip, up to five
per second per person. The check is correct and shouldn't be removed; the fix is a small
per-connection cache. **Not a bug today; a scaling defect already visible.**

**Assign, resolve and snooze push nothing.** They change what an agent's list should show and fan
out no event. The list repairs itself on the next message or tab focus, so it is never wrong for
long — but a colleague reassigning a conversation during a quiet hour is invisible until
something else happens. Not a principled decision, a gap. **Open, one call each.**

**A latent hazard in connection teardown.** Cleanup cancels the task that writes to the socket
and awaits it, suppressing the expected cancellation. If that task had *already* died from a
different error — which it can, if it writes to a socket that has just been closed — the await
re-raises that error and the "socket closed" log line never runs. The mechanism is confirmed:
awaiting an already-failed cancelled task re-raises rather than suppresses. **I could not
reproduce it live**, though; the window is narrow, and the connection leaves the registry first,
so there is no leak — just a noisy traceback and a missing log line. **A hazard, not a confirmed
defect.**

**And the one that would be invisible.** The browser bundle is compiled with the API's address
baked in at build time. If that value is missing at build, the client silently falls back to its
own origin — the web server, which carries no socket connections. Every HTTP call still works,
because those go through a proxy; only the socket fails. **The app looks completely healthy and
is simply not live**, no errors and no failed requests, just messages that appear when somebody
reloads. The closely related variable used by the proxy has a build-time guard and this one
doesn't. **Open**, and it is one line.

---

# 4. Would this hold if we had to scale it?

Not far, and the limit arrives for a reason that has nothing to do with load. Two questions are
worth keeping apart: what breaks, in what order, and what a person using the product sees — and
what we should do about it. Each stage below answers both.

## Stage 0 — where we are today, and what it holds

One process. One dictionary of connections, one of tickets, one of rate-limit buckets, one job
runner. A doorbell is a function call inside the process that just wrote the row.

**This is a single-process design, and it stops being sensible the day one process stops being
acceptable** — a few thousand sockets, or the first real uptime requirement. Usually the second.

## Stage 1 — the first wall: the second container

### What breaks, and what a person sees

**The connection registry goes first, because it is a dictionary in one process.** The fan-out
runs inside whichever container handled the write and reaches only that container's sockets. With
two containers, about half of every doorbell goes to a registry without the person it was for.

The shape matters more than the cause: not some people live and others dead, but per message. A
customer sits with the panel open; the first reply appears instantly, the second never appears,
then they type "hello?" and the missing half arrives at once because sending caused a refetch. An
agent sees the inbox go quiet, then repair when they click away and back. Nothing logs any of it.

**Three other things break the same day, for the same reason** — the ticket store, the rate
limiter and the job lock are all process-local dictionaries or single-runner assumptions.

*Tickets* are minted over HTTP and spent on the handshake, so with two containers they meet about
half the time. The browser re-mints and backs off, so a panel comes alive in twenty seconds, not one.

*The rate limiter* keeps buckets per process, so the real limit becomes the number we wrote down
times the number of containers. Nobody sees anything; it is a security note.

*The job lock* is unreachable with one runner, but every API process starts its own, so a second
container is a second runner. A customer who emails in gets the same reply twice.

### What we should ideally do

Candidate directions, not a decision. For the registry the usual answers are Postgres
`LISTEN/NOTIFY` or Redis pub/sub: every process listens on a channel, whichever handles a write
notifies, and each fans out to its own local registry. The dictionary stays; it just stops being
the only place the news arrives. `NOTIFY` is tempting because the database is already there, but
its payload is capped and it gives no delivery guarantee if a listener is down. Redis costs a
moving piece and is built for the fan-out. Since we push only an id, the cap barely matters and a
missed doorbell is "briefly stale", not "wrong" — so `NOTIFY` is where we would start, and Redis
where we would end up if volume outgrew it.

Tickets and rate-limit buckets want a shared store — the same Redis, or sticky routing as a
stopgap we would later unpick. The job lock wants its lock held until the row is marked done. I
would do all four as one job: separately it is four migrations, each leaving the system half-fixed.

## Stage 2 — the next wall: connections become the thing you manage

### What breaks, and what a person sees

The constraint stops being messages and becomes connections. A socket costs memory whether or not
anybody types, so it is what sets the per-process ceiling. Two things turn sharp before we get
there.

The rate limiter keeps its buckets in one dictionary and, past four thousand entries, rebuilds
the whole thing on **every check**, under a lock, on the event loop. Buckets are per person and
expire after an hour, so a few thousand visitors in an hour is enough, and typing checks five
times a second per person. A person does not see a rate-limit message; they see the whole API go
slow at once, including pages unrelated to chat. The permission check before every typing
broadcast also loads the conversation, so keystrokes cost round trips — section 3's footnote,
arriving here as a real problem.

There are no metrics on the socket layer, so the only evidence the queue is failing is a warning
that fires after we have dropped somebody: we find out from a customer. And many load balancers
cap how long an upgraded connection may live, cutting every socket on a schedule.

### What we should ideally do

None of it is exotic. A cap on concurrent connections per IP, since rate-limiting frames does
nothing against ten thousand idle sockets from one place. Metrics on the socket layer. A
per-connection permission cache. A limiter sweep on a timer. A balancer built for long-lived ones.

## Stage 3 — further out: the full refetch, and the fan-out itself

### What breaks, and what a person sees

**Resync-everything gives next.** A reconnect means "go and fetch the lot" — fine when a deploy
disconnects six hundred browsers, not fine at fifty thousand. A person sees the app at its worst
straight after every deploy: slow lists, spinners, the odd timeout, every time.

**Then `LISTEN/NOTIFY` itself becomes the wrong tool**, because every notification goes to every
process, so fan-out work grows with processes × messages. That surfaces as write latency on
ordinary paths: sending a message gets slower because somebody else's workspace is busy.

### What we should ideally do

The replacement for resync is already designed for: `seq` is in every doorbell, so catch-up can
become a replay of "everything after 47" without changing a frame. The reason not to do it now is
honest — a replay has a middle, so a message arriving mid-sequence must be delivered out of order
or held and possibly lost. A resync has no middle.

For the fan-out, Redis channels per workspace is the natural next step, so a process only receives
traffic for workspaces it holds. Beyond that the socket layer wants to be its own service: a
gateway tier that only holds connections and fans out, scaled on connection count, because
connection count and request count stop being the same curve. That is also where a connections
table in Postgres — rejected at the start, because a row written on connect is wrong the instant a
process dies — becomes correct, as by then it is a real presence system. I would want the earlier
steps to have actually hurt first.

Worth noticing through all of that: **the protocol never changes.** The frames are the same three
fields at every stage, and only the transport underneath moves — a dictionary, then Postgres,
then Redis, then a gateway tier. That is the payoff for deciding early that the socket carries an
id and not a message.
