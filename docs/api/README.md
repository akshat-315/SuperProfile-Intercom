# The HTTP surface

Everything the product does goes through one FastAPI process and about forty routes. Three
completely different kinds of caller share it: an agent's browser, a chat panel embedded on a
stranger's website, and a few things with no identity at all. Most of the design of this surface
is about keeping those three apart without writing the same check three times.

Every response and every number below came from running this code against a throwaway Postgres.

---

# 1. The architecture, and how it actually works

Routes are grouped by **who is allowed to call them**, and the prefix says which group you are
in. That is the organising idea, and it is not the same as grouping by resource.

```
  /api/auth        /api/workspaces   /api/team    /api/conversations
  /api/articles                                   cookie — a signed-in agent
  ─────────────────────────────────────────────────────────────────────────
  /api/widget/…                                   bearer token — a customer
  ─────────────────────────────────────────────────────────────────────────
  /api/help/…      /api/invite/{code}             nobody — public
  /hooks/email                                    a webhook signature
  /health                                         infrastructure
```

A resource-shaped alternative would put the customer's view of a conversation under
`/api/conversations` next to the agent's, because it is the same row. That is the wrong cut. The
two callers have different credentials, different rate limits, different shapes of answer and
different things they are allowed to know. Splitting by caller means a whole prefix shares one
security story, and adding a route to it inherits that story rather than restating it.

Inside any request the layers are always the same: middleware (origin check on cookie-carrying
writes, a trace id on everything), then the access level asked for in the route's signature, then
a router that is HTTP only, then a service holding the rules, then the workspace filter that
attaches `WHERE workspace_id = N` to every query or refuses. The router holds no SQL and the
service holds no HTTP, which is why signing somebody up can be called from a script.

## The error envelope

Every failure, from any of the three groups, looks like this:

```json
{"error": {"code": "conversation_resolved",
           "message": "This conversation is resolved. Reopen it before replying.",
           "trace_id": "req_2d37d9b8"}}
```

The same id goes out as an `X-Request-Id` header and onto every log line for that request, so a
user pasting `req_2d37d9b8` into a support chat hands you the exact request. Four handlers cover
everything, including a catch-all on bare `Exception`, so nothing escapes as a raw traceback.

**`code` is the contract; `message` is decoration.** The client behaves differently for different
failures — login redirect, back off and retry, inline warning — and decides that from `code`. The
message stays free to be reworded or translated without silently breaking a client comparing
strings.

## Validation happens twice, on purpose

The two halves answer different questions and produce different answers.

**Is this request even well-formed?** Pydantic. A missing field, a body over 10,000 characters,
`after_seq=-1`, a malformed UUID. All of it is refused before any of our code runs, with `422`
and the code `invalid_request` — one generic answer for the whole class.

**Is this a thing you may do?** Our own code, with a specific code and a sentence a person can
act on. Verified, live:

```
GET  ?state=nonsense       400 bad_state            "Pick one of active, snoozed, resolved."
GET  ?cursor=page2         400 bad_cursor           "That page marker is not valid."
POST reply, body ""        422 invalid_request      "Some of those details aren't valid."
POST reply, resolved       409 conversation_resolved "…Reopen it before replying."
POST /widget/session       404 unknown_widget       "That widget key is not recognised."
POST team/invite as agent  403 not_admin            "Only an admin can do that."
PATCH last admin → agent   400 last_admin           "A workspace needs at least one admin…"
POST login, 6th in a min   429 rate_limited         "Too many attempts. Wait a minute…"
```

The generic `422` is deliberately unhelpful, and that is the trade. Which field was wrong is in
the log, not the response. A shape error is a client bug — a correct client never produces one —
so the answer optimises for telling a prober nothing. A rule error is a human's normal situation
and gets a real sentence.

## The widget's endpoints, and why they are not cookie-shaped

An agent authenticates with a cookie. The widget authenticates with a bearer token in an
`Authorization` header. The difference is not stylistic.

A cookie is attached by the browser automatically to any request going to that domain. That is
what makes CSRF possible, and the defence is an origin check on state-changing requests. Verified:
the same request with `Origin: https://evil.example` gets `403 forbidden_origin`, and with no
`Origin` header gets `204`.

Now look at the widget. **It is deliberately loaded from a stranger's website.** With a cookie,
every embedding shop — and every analytics script on every embedding shop — would be a page that
can cause authenticated requests on a visitor's behalf. The thing the origin check treats as an
attack would be the normal operating mode, so the check would have to be turned off for the
feature to work at all. A bearer token has no such problem, because nothing attaches it
automatically. So the middleware exempts those paths, and the variable it tests is named
`carries_cookie` rather than `skip_origin_check` — named for the reason, so nobody adds a path to
it to make a 403 go away.

The rejected alternative was keeping cookies and allow-listing each shop's origin. It fails on its
own terms: the shop's page is exactly where an injected script runs, so allowing the shop allows
the attacker. It also turns a constant into per-workspace configuration whose first symptom when
wrong is a paying customer's chat being broken.

Two tokens are handed out, signed with different derived keys, so one minted for one purpose is
invalid for the other. The long-lived **browser id** only says "this browser has been here
before"; the **session token** names a customer and a workspace and is what the other five
endpoints require. Verified: replaying a browser id as a session token gives
`401 chat_session_gone`, the same answer as sending nothing at all.

## What stops a widget key being abused

Nothing prevents its use — the key is public by design. It sits in a `<script>` tag on a shop's
website. Anybody can read it and call `POST /api/widget/session` from anywhere, and that is
correct: the panel has to work on a page we do not control. Verified: a session opened from
`Origin: https://evil.example` with no cookie returns a working token.

What is defended is *volume*, by two limits keyed on opposite things:

```
  POST /widget/session   20 per minute   keyed on client IP + the widget key
  POST /widget/conversations   5 / 5min  keyed on the customer id in the signed token
  POST /…/messages            30 / min   keyed on the customer id in the signed token
  plus a hard cap of three OPEN conversations per customer
```

The reasoning is that per-customer keying is strong — the id comes out of a token the server
minted and can prove it minted, and an attacker cannot invent one — but it has an obvious escape:
mint a new customer, get a new allowance. That escape runs into the other limit, because minting
an identity means calling `/session`, which is keyed on the network you are coming from.

> The per-IP limit rations the creation of identities. The per-identity limits ration what an
> identity can do. Getting volume means defeating both, and they are defeated by opposite things.

Section 3 measures how well that actually holds. Not very.

## Reading: cursors for lists, sequence numbers for messages

The conversation list is ordered newest-first and paged by a cursor, which is the last row's
timestamp, meaning "older than this". Thirty rows a page, and `next_cursor` is null when there
is no more.

Page numbers were rejected because `OFFSET 30` skips thirty rows of the *current* answer, and in
an inbox the answer changes between requests. Two messages arrive while an agent reads page one,
two conversations move to the top, everything shifts down by two — and page two skips two rows
that were never shown. No gap, no warning, two customers waiting. A cursor describes a value
rather than a position, so a new arrival cannot land inside a page already served.

For messages inside a thread the widget passes `?after_seq=N`, where `seq` is a counter starting
at 1 in each conversation. Verified: `after_seq=0` returned `[1,2,3]`, `after_seq=2` returned
`[3]`. A counter can express "everything after 47" with exactly one right answer; a timestamp
cannot — inclusive replays a message, exclusive loses one written in the same millisecond.

## Writing twice: idempotency

The client invents a UUID before it sends, and sends it along with the message. Verified — the
same reply posted three times with the same id:

```
attempt 1 -> id 33 seq 6
attempt 2 -> id 33 seq 6
attempt 3 -> id 33 seq 6
rows in the database with that id: 1

the same body twice with NO client id  ->  id 34, id 35   (two rows, correctly)
```

The danger is not a double-click, which a disabled button fixes. It is the deliberate retry
seconds later by somebody who has good reason to believe the first attempt failed — and from
their side that is indistinguishable from a first attempt.

It is checked twice. A `SELECT` first, and a unique constraint on `(conversation, client id)`
underneath. That is not belt and braces: the select closes the ordinary case cheaply, and only
the database can close the case where two retries are in flight at once, because only the
database sees both. **A check in application code is an optimisation; the constraint is the
guarantee.**

The same idea, differently shaped, protects the inbound email webhook. Every stored message
carries the sender's message id, unique per workspace, and the hook checks it before queueing
anything. A provider that delivers twice — which they all do — writes one message.

---

# 2. The decisions, and what each one beat

## Access levels are asked for in the signature, not called in the body

A route declares what it needs by naming a type: signed in, verified, in a workspace, admin,
verified admin. The alternative is the usual `user = await get_current_user(request, db)` on the
first line of each handler.

The signature version wins for one reason that matters more than the others. **A route that
forgets to call a helper still compiles, still returns 200, and quietly serves data to anyone.
A route that forgets to declare a dependency has no user variable at all, so it does not run.**
Both are mistakes; one is caught by Python and one is caught by a customer.

There is a second payoff specific to this codebase: the dependency is where the workspace filter
gets armed. A route that asks for a signed-in user gets tenant scoping for free, and one that
does not and touches an owned table raises rather than leaking.

## Starting a conversation and sending its first message are one call

The obvious REST shape is `POST /conversations` to create an empty thread, then
`POST /conversations/{id}/messages` to put something in it. Rejected on one failure: if the
second call fails, an empty conversation is left sitting in an agent's inbox. The agent opens it,
there is nothing there, and there is no way to tell whether the customer is still typing, gave up
or lost signal. It reads as a broken product and cannot be distinguished from one.

The cost is honest: the endpoint does two things and its request body is a message. We took that
over a class of empty threads nobody can explain.

## Marking read is a POST, never a side effect of the GET

`GET /widget/conversations/{id}` reports the unread count. It does not clear it. A separate
`POST /…/read` does that, when the client decides the person has actually seen the messages.

The temptation is real — the GET already loaded the thread. It is wrong for the ordinary
properties of GET rather than anything about chat. A GET that times out is retried by the
browser, by the fetch wrapper, by a proxy, by somebody pressing reload; prefetchers issue GETs
for pages nobody opened; a cache may answer one without the server ever seeing it. Fetching a
thread is also not reading it — only the client knows whether it was on screen.

> `GET` means "tell me". If it also means "and remember that you told me", every retry, prefetch
> and cache between the browser and the database becomes a source of writes you did not author.

## Rate limits live in memory, and are keyed on the strongest proved identity

The counters are a dictionary in the process. There is no Redis, deliberately.

A shared limiter writes to the shared store on **every** request, including every request in an
attack — so it adds load at the exact moment you are under pressure, on the thing everything else
also depends on. The in-memory version gets cheaper per request under load: a dictionary lookup
and four floating-point operations.

The second half of the argument is what makes it defensible rather than merely convenient. **The
limit was never a physical constant.** Five logins a minute is a round number picked by judgement.
If the answer with four processes is "an attacker gets twenty", the fix is to configure five when
you meant twenty across four — not to buy a distributed counter.

The keying decision is separate and firmer. Where the request has already proved an identity, the
limit is keyed on that, not on the IP address. An IP is simultaneously too coarse and too weak: it
punishes a whole office for one person, and anybody who minds can change it for pennies. `/session`
is keyed on IP only because it is the call that creates the identity, so there is nothing better.

The whole scheme sits behind one function, so moving to a shared store later changes one body and
no callers.

---

# 3. Known bugs

Each was reproduced against a running server.

**Any wrong method returns a `405` whose code says `internal_error`.** The table mapping status
codes to error codes has no entry for 405, so the fallback fires. Verified:
`DELETE /api/auth/me` → `405` with `{"code":"internal_error","message":"Something went wrong on
our end."}`. A client branching on `code` sees a server fault where it should see a routing
mistake, and anyone reading logs sees a phantom internal error. **Open, one line.**

**There is no CORS handling at all.** No middleware, no `Access-Control-Allow-*` header anywhere.
Verified: `OPTIONS /api/widget/session` with an `Origin` and a request-method header returns
`405 internal_error`, not a preflight response. Today this is invisible, because the panel is
served by the Next app and its calls are proxied server-side, so the browser never crosses an
origin. **It becomes total the day the panel and the API are served from different hosts — which
is exactly what hosting the demo shop anywhere real means. Every widget call fails at once. Open.**

**The widget limits do not hold, measured.** Because `/conversations` is keyed on the customer id
and a fresh customer is free to mint, the per-identity cap is only as strong as the per-IP cap on
minting. From **one IP address**, eight sessions opened back to back and three conversations
started in each produced **24 new conversations, with nothing refused** — the workspace went from
12 conversations to 36 and gained 17 customer records. The sustained ceiling is roughly 20
sessions a minute times three open threads, so about 60 junk threads a minute per address. **Open,
and reachable by anybody who can read a `<script>` tag.**

**Three widget endpoints have no limit at all**: both `GET`s and `POST /…/read`. Verified: forty
consecutive list calls, forty `200`s. They need a valid session token, so `/session` must be
passed first, but one of them is a write and the list runs an aggregate over `messages`. **Open.**

**The rate limiter keys on a header the caller controls.** The client IP is read from
`X-Forwarded-For` with no check that a trusted proxy set it. That is correct behind a proxy that
overwrites the header and forgeable by anyone talking to the app directly. It is how each
fictional caller in this document's testing got their own bucket — one header, one fresh
allowance. **Open, and it undercuts the per-IP half of the widget scheme above.**

**The list cursor is a bare timestamp, so ties are skipped.** Two conversations sharing a
`last_message_at` at a page boundary both fall past the strict comparison. Reproduced: two rows
given the same timestamp, then a page requested with that timestamp as the cursor, returned `[]`
while both rows were present without a cursor. **Open.** The fix is a cursor of
`(last_message_at, id)`, since the id breaks every tie.

**The customer's thread list has no paging and no limit.** It returns every thread that customer
has ever had. The three-open cap bounds only *open* ones, so a long-standing customer accumulates
resolved threads without bound. **Open.**

**Concurrent writes to one conversation return 500s.** Message positions are allocated by reading
the current highest and inserting; five retries are not enough under real concurrency. Measured:
sixteen concurrent replies, nine `500`s. **Open** — this is the surface's worst failure mode,
because it is a plain server error on the path a customer is waiting on.

**A migration will fail the first time it meets a database with data.** The migration adding
`widget_key` adds it `NOT NULL` and `UNIQUE` with no default and no backfill. Against an empty
database it works, which is why it passed. Against any database with a workspace row it fails, and
a `server_default` cannot fix it because the default would collide with itself on the second row.
The repair is three steps: add it nullable, backfill each row with its own key, then tighten.
**Open, and it will bite exactly once, at the worst moment.**

**The origin check only fires when the browser sends an `Origin` header.** Verified: the same
state-changing request with no `Origin` succeeds. Browsers do send it on cross-origin writes, so
this is not currently exploitable from a page — but the check is written as "refuse if present and
wrong" rather than "require it". **Open, low.**

**Two dead paths.** The help centre can be resolved by hostname, and the function that would do it
returns nothing, so only the `?slug=` form works. And the seeding route is registered in production
and refuses at request time based on an environment variable that defaults to `development`.
**Both open, both cosmetic until the second one is not.**

---

# 4. SCALING — what breaks first, and what we would do about it

The surface itself is thin: routing, validation, an envelope. **What breaks is never the routing —
it is the assumptions each endpoint makes about who is calling it.** In the order they bite.

## Stage 1 — the widget key, and it is already open

**What breaks.** The measurement above: one IP, 24 conversations, nothing refused. Nothing ties
volume to a workspace, so the limits bound a *caller*, not the damage.

**What it looks like.** Not an outage. An inbox full of junk threads that a paying customer's
agents have to triage by hand, and a customer table full of ghosts. We would find out from them,
not from a graph. It costs us almost nothing to serve, which is why nothing alerts.

**At what scale.** One bored person with a browser. There is no threshold.

**Options.** *Cap open conversations per IP as well as per customer* — cheap, and shared offices
and mobile carriers share addresses, so it has real false positives. *A per-workspace ceiling with
an alert* — does not stop the flood, but turns a silent problem into a phone call, and it is the
only option that scales with what the shop can actually absorb. *A challenge before the first
thread* (a proof-of-work or a captcha) — effective, and it puts friction on the single most
important path in a product whose purpose is to reduce friction. *Signed identity from the host
site*, where the shop signs its own logged-in user id with a shared secret — this is the real
answer, and it removes the anonymous path entirely for shops that can do it.

**Lean.** Ceiling plus alert first, because it is a day's work and converts an invisible failure
into a visible one. Signed identity is where this ends up, but it needs the shop to implement
something, so it will never cover everybody — which means the anonymous path always needs a
ceiling anyway. A challenge only if the ceiling starts firing for real abuse rather than for one
enthusiastic customer.

## Stage 2 — the client IP stops meaning anything

**What breaks.** Every per-IP limit reads a header the caller can set, so the per-IP half of stage
1's defence is one `curl` flag away from nothing.

**What it looks like.** The limits appear to work in every test, because tests come from one place.
Under abuse they simply never fire, and the log shows a thousand different addresses.

**At what scale.** The first time anybody tries. It is invisible until then.

**Options.** *Trust only the proxy's own view*: take the last hop rather than the first, which is
correct behind exactly one proxy and wrong behind two. *Configure how many hops to trust*, which
is right and is a deployment fact the code cannot verify, so it is a comment somebody will get
wrong. *Stop treating IP as an identity for anything that matters* and lean harder on the signed
token, keeping IP only for the one call that mints identities.

**Lean.** Trust a configured hop count, and treat it as what it is — a mitigation, not a control.
The honest framing is that IP-based limits raise the cost of abuse and never prevent it, so the
weight should sit on the identity limits and on stage 1's ceiling.

## Stage 3 — the reads that have no bound

**What breaks.** The customer's thread list returns everything, and the cursor skips tied rows at
a page boundary.

**What it looks like.** For the customer, a panel that gets slower every year and eventually stalls
on open. For the agent, a conversation that is simply missing from the list, with nothing to
indicate a gap — which is the worse of the two, because nobody reports a row they never saw.

**At what scale.** The list: a few hundred threads for one customer, so years for most and months
for a shop with chatty regulars. The cursor: two conversations sharing a timestamp at row 30,
which needs either bulk activity or an import.

**Options.** Page the thread list with the same cursor mechanism the inbox uses, and make the
cursor `(timestamp, id)`. Both are small and there is no serious alternative.

**Lean.** Fix the cursor now — it is silent data loss and costs one line in each of two places.
Page the thread list when somebody's panel is actually slow, since the cap on open threads keeps
the common case small.

## Stage 4 — the day the panel is served from somewhere else

**What breaks.** The absence of CORS. Today the browser never crosses an origin because the Next
app proxies; the moment the panel and the API are on different hosts, every widget call needs a
preflight the server does not answer.

**What it looks like.** Total and immediate for the widget, and completely fine for the agent app,
so it presents as "chat is broken for everyone" right after a deployment change that looked
unrelated.

**Options.** Add CORS middleware allowing any origin for the widget prefix and only our own origin
for the rest. There is no real alternative — but the split matters: the widget's origin list can
never be complete, and the agent app's should never be open.

**Lean.** Do it as part of whatever change moves the hosting, never separately, and in the same
pass check that no security-headers middleware sets `X-Frame-Options: DENY` — the panel is an
iframe on somebody else's page, so that one header would break every embed at once.

## Stage 5 — a second client

**What breaks.** Nothing mechanical. What is missing is a promise. There is no version prefix, no
deprecation story, and no tests. The OpenAPI document is the only written contract.

**What it looks like.** The first change to a response shape breaks a client somebody else ships
on their own schedule, and there is no mechanism to notice before they do.

**At what scale.** The first integration, mobile app, or partner — not a request count.

**Options.** *Version the prefix* (`/api/v1`) — cheap now and near-free forever, but versioning
without tests is a promise you cannot keep. *Contract tests generated from the OpenAPI document* —
the thing that actually catches a breaking change. *Additive-only discipline*, which costs nothing
and relies on everybody remembering.

**Lean.** Tests before versioning. A `/v1` prefix with nothing checking it is decoration; a test
suite over the current shapes is what makes any later promise real — and this codebase has none,
which is the single most overdue thing in it.

## Where this stops being sensible

The surface holds fine for one product with one first-party client at a few hundred requests a
second. It stops being sensible when it has callers we do not control — a partner integration or a
mobile app — because from that day a wrong error code, an unbounded list and an unversioned shape
stop being ours to fix quietly. That is a business event rather than a load number, and it is the
one worth watching for.
