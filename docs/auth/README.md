# Signing in, and the inbox

Two things happen before anybody can answer a customer. Somebody has to prove who they are, and
the server has to work out which company's data they are allowed to touch. Everything in the
inbox — the list, the thread, who owns a conversation, whether it can be replied to — sits on
top of those two answers. This is the server side of both. Every number and every response
below was produced by running this code against a throwaway Postgres.

---

# 1. The architecture, and how it actually works

An agent's browser holds one thing: a cookie. Every request carries it, and the cookie is the
only reason the server knows anything about the caller.

```
   browser  ──  Cookie: session=<payload>.<signature>
     ▼
   origin check      is this a state-changing request from us?
     ▼
   sign-in dep       check the signature, decode {uid, wid},
     ▼               load the user and the membership row
   access level      signed in / verified / in a workspace / admin
     ▼               — declared in the route's own signature
   route             HTTP only: read body, call service, commit
     ▼
   service           the rules. no SQL clause about workspaces
     ▼
   workspace filter  every query gets WHERE workspace_id = N
     ▼               attached automatically, or it refuses
   Postgres
```

## The cookie

The cookie is a small JSON object, base64'd, with an HMAC signature after a dot. A real one
decodes to `{"exp":1786275369,"role":"admin","uid":1,"wid":1}` — a user id, a workspace id, a
role and an expiry seven days out. None of that is secret; the user already knows all four.

The cookie is not trying to hide anything. It is trying to be **unforgeable**. The server does
not store it — it recomputes the signature from the body that arrived and compares. Tested
directly: editing `uid` from 1 to 3 and leaving the signature untouched gives `401`, while the
untouched cookie gives `200`. The signature is the only thing between an attacker and another
account.

It is `HttpOnly` so page scripts cannot read it, `SameSite=Lax` so another site cannot make the
browser attach it to a POST, and `Secure` outside development.

## The workspace filter

Two companies use the product. Their rows live in the same tables. The only thing keeping them
apart is a `workspace_id` column and one piece of machinery.

That machinery is an ORM event handler. Before any query runs it looks at which tables the query
touches, and if any is workspace-owned it attaches `WHERE workspace_id = N` using the workspace
currently in scope. The sign-in dependency puts it there.

The important part is what happens when there is no workspace in scope:

```
no active workspace   ->  refused: query touched Conversation with no active workspace
use_workspace(1)      ->  11 conversations
use_workspace(2)      ->  7 conversations
all_workspaces(...)   ->  18 conversations
```

**It refuses rather than leaks.** A new endpoint that forgets to ask for a signed-in user does
not quietly return everybody's data — it raises. Deliberate crossings, like checking an email is
unique before any workspace exists, go through `all_workspaces()`, which requires a written
reason; there are 24 of them, so one `grep` lists every place the boundary is crossed on
purpose. Confirmed over HTTP: Ada in one workspace sees conversations `[1..7]`, Bob in another
sees `[8..14]`, and Ada asking for conversation 8 gets `404`.

## One request, end to end

Ada opens conversation 6.

```
GET /api/conversations/6, cookie attached
   signature checked       → uid 1, wid 1
   membership row loaded   → role admin, read from the database
   conversation 6 loaded   → filter added workspace_id = 1
   may she see it?         → admin, so yes
   messages loaded in seq order, inbound marked read, commit → 200
```

Every query in the middle of that had `workspace_id = 1` attached without anybody writing it.

---

# 2. The decisions, and what each one beat

## A signed cookie, not a sessions table

The alternative is a row per session, looked up on every request. It buys one thing we do not
have — the ability to cancel a session — and costs a database read on every single request in
the product. We took the cookie. The check is one HMAC and no I/O.

The cost is real. `POST /logout` tells the browser to drop the cookie, and that is all it can
do — replaying the same cookie value afterwards still returns `200`. Fine for somebody closing
a tab; not fine for "sign me out of my stolen laptop".

One thing *is* revocable, and it is the one that matters most. The role and the membership are
read from the database on every request, not from the cookie. Remove somebody from a workspace
and their next request fails; demote an admin and they are an agent immediately. The cookie
carries a `role` field and nothing reads it.

## bcrypt at twelve rounds, called directly

Passwords are stored as `$2b$12$…` — verified, sixty characters, work factor twelve. Never the
password itself.

Bcrypt is deliberately slow and each extra round doubles the cost. Measured here: **352 ms per
check**. That is nothing for something a person does once a week, and it gives somebody holding
a stolen database about three guesses a second per core instead of billions.

We call `bcrypt` directly rather than through `passlib`, which is what most tutorials use.
`passlib`'s current release reads an attribute bcrypt 4 removed, so it prints a traceback at
import for something that is not an error, and on bcrypt 5 it fails outright. The thing
`passlib` exists for — migrating between hash algorithms — is not a problem we have.

Two details before hashing. Unicode is normalised, so an accent typed two ways is one password.
And anything past 72 bytes is hashed with SHA-256 first, because bcrypt ignores the rest —
without that a 200-character passphrase is secretly only its first 72 characters, and a
different passphrase sharing that prefix would sign you in too.

## Wrong password and unknown email answer identically

Both return `401 bad_credentials`, byte for byte, from one constant used in one place.

If "no account with that email" were a distinct answer, the login endpoint becomes a tool for
testing whether an address is registered here. Feed it a million addresses and you learn which
ones have accounts. Identical messages are not enough, because timing gives the same answer
away, so when the user is missing the code hashes the submitted password against a fixed dummy
hash anyway. Measured over the live server, seven requests each: **wrong password 359 ms,
unknown email 359 ms.** The honest cost is a worse message — somebody who mistyped their email
is told their password is wrong.

## The security boundary and the product rule are separate

The workspace filter answers *whose data is this*. A separate function answers *what may this
person see inside their own workspace*: an admin sees everything, an agent sees what is assigned
to them plus everything assigned to nobody.

The tempting move is to fold the second into the first, so the automatic clause becomes
`workspace_id = N AND (assignee = me OR assignee IS NULL)`. One mechanism, one place. It is the
wrong move. The first rule is absolute and must never change; the second is a policy that
changes the first time somebody asks for teams or a supervisor role. Merged, shipping an
ordinary feature means editing the tenant-isolation code, and a bug in the product rule becomes
a data leak.

The strict version of the product rule — agents see only what is assigned to them — was
rejected because a new conversation is assigned to nobody. Under it every new message is
invisible to every agent until an admin triages it by hand. The unassigned pool is not a
loophole; it is the queue.

## A colleague's conversation is 404, not 403

Verified: an agent opening a colleague's conversation and an agent opening conversation 99999
get byte-identical replies.

A `403` confirms the row exists. Walk the ids and the difference between 403 and 404 draws you
a map of how many conversations the workspace has and which are assigned. The rule: **an error
must not be more informative than the answer would have been.** The cost is that "not found" is
genuinely ambiguous, and an agent sent a link by a colleague cannot tell whether it was deleted
or simply is not theirs.

## Two roles, not a permissions matrix

`admin` and `agent`. Admin can invite, change roles, remove people and rename the workspace.
Both can read the team, work conversations, and write help articles. Verified: an agent
inviting gets `403 not_admin`, renaming gets `403 not_admin`, listing the team gets `200`.

A matrix of capabilities is the general answer and the wrong one at this size. Two roles are
enforceable as five named access levels asked for in a route's signature — signed in, verified,
in a workspace, admin, verified admin. A reader sees what a route requires without reading its
body, and a route that forgets to ask has no user variable at all, so it does not run. A matrix
moves the check into route bodies, where forgetting one fails open and looks fine.

One rule sits underneath both: a workspace must keep at least one admin. Verified — the only
admin demoting herself gets `400 last_admin`.

## Invites are a code plus an address, and joining cannot fail the confirmation

An admin invites an email address with a role. That mints an eight-character code from an
alphabet with no `0`, `O`, `1` or `I`, good for seven days, unique across the system, emailed
and also returned to the inviter so it can be pasted into chat.

There are two ways in. Sign up with the code typed in, or sign up without it and be joined
automatically because the address you just confirmed matches an outstanding invite. Both need a
confirmed email address first — verified, joining before confirming gives `403`. The automatic
join is *best effort inside the confirmation*: if the invite has expired or the workspace is
gone, the join is skipped and logged, and the email is still confirmed.

> Confirming an email address is the purpose of that request. Joining a workspace is a
> convenience that happens at the same moment. A convenience must not be able to fail the
> purpose.

Letting it fail is how somebody loses an account they own: the confirmation rolls back, so the
address is never confirmed, so every fresh link walks into the same wall — and so does the
resend button, the one escape hatch. The catch is narrow: it swallows only the codebase's own
"not allowed" error, so a genuine bug still fails loudly.

## Replying to an unassigned conversation claims it

Verified: conversation 2 has no assignee; Carol replies; conversation 2 is now assigned to
Carol. Ada replying afterwards changes nothing — it is already owned.

The alternative is an explicit "take this" button before you can answer. It is one more click in
the busiest path in the product, everyone would forget it, and the shared pool would fill with
conversations that have been answered and still look untouched — so two agents answer the same
question. Answering *is* the act of taking responsibility; doing it implicitly keeps the list
honest without anybody maintaining it. The defect on the other side of the same rule is in
section 3: an agent who assigns to a colleague immediately loses the ability to take it back.

## Resolved refuses agent replies; a customer's message reopens automatically

Verified both ways. An agent replying to a resolved conversation gets
`409 conversation_resolved` — "This conversation is resolved. Reopen it before replying."
A customer sending into the same resolved conversation gets `200`, and the status returns to
`open` by itself.

The asymmetry is the decision, and it comes from who would be surprised.

An agent has a screen. If replying silently reopened a thread, an agent adding a closing note to
something they had just finished would quietly put it back in the queue and the sidebar count
would rise for a reason nobody could see. A `409` costs one click on "reopen", and the click is
a statement: *I am working on this again.* A customer has no such concept — they were never told
the thread was resolved, and asking them to press "reopen" is asking them to understand our
filing system. Their message is itself the evidence that the thing is not finished.

One subtlety took thought. The customer's send checks for a duplicate **before** it reopens.
Consider: the customer sends, the response is lost on the network, an agent answers and
resolves, the customer's panel retries the same message. With the check first the retry finds
the stored message, returns it, and **the thread stays resolved** — verified. With reopen
first, a retry of an hour-old message drags a finished conversation back into somebody's queue.

> An idempotent write must be idempotent in its side effects, not only in its rows.

---

# 3. Known bugs

Each was checked against the code as it stands.

**Message numbering collapses under concurrency.** Allocating a message's position reads the
current highest number, then inserts. Two writers read the same number and the second hits the
uniqueness constraint. There is a retry, five attempts deep, and it is not enough. Measured:
sixteen replies posted *concurrently* into one conversation produced **nine HTTP 500s** and
seven saved messages. The same sixteen sent one after another all succeed. **Reachable today by
anything automated — an email backlog, a bulk import, two agents on saved replies. Open.**

**Confirming your email can join you to a workspace without putting you in it.** The
confirmation route joins you and does not re-sign the cookie, so the next request has
memberships and no active workspace. Verified: after confirming, `/me` returned
`memberships [('Acme Support','agent')] active None role None`. Every other route that changes
which workspace you are in re-signs on the way out; this one does not, and the client papers
over it with an extra request. **Open, fires on every invite accepted this way** — one line.

**An agent cannot undo their own assignment.** Hand a conversation to a colleague and the next
request for it is `404`, because you now fail your own visibility check — no undo and no way
back without an admin. Assigning to the wrong name in a dropdown is a one-character mistake.
**Open.** The fix is to let whoever just changed the assignee change it again.

**A session cannot be cancelled.** Logout is advice to the browser; replaying the cookie
afterwards returns `200`. **Open, and deliberate** — but a stolen cookie is good for a week, and
rotating the signing secret signs out every agent in the product at once.

**The query shape that gets underneath the filter still works.**
`select(func.count()).select_from(X)` loads no entity, so the filter finds nothing to guard and
returns *before it checks whether a workspace is active*. Measured on one session: that shape
returned 18 conversations with no workspace set, while `select(func.count(X.id))` returned 11
and 7 for the two workspaces and refused outright with none. The one live use is harmless — it
counts users, which are not workspace-owned, inside a declared crossing. **The instance is fine;
the pattern is one line from a leak, and it has caused one before. Open.**

**The reopen branch in the agent's reply is dead code.** The service reopens a resolved
conversation after writing, but the route refuses resolved conversations before the service is
reached. It reads as though agents' replies reopen threads, which is the opposite of the shipped
behaviour. **Open, cosmetic.**

**The seeding route is registered in production and then refuses.** It checks an environment
variable that defaults to `development`, so a deployment that forgets to set `ENVIRONMENT` has a
live endpoint that fills a real workspace with fake conversations. **Open.** Not registering the
route is zero lines of attack; registering it and refusing is one line of defence.

Four earlier bugs in this area are **fixed**, and the fixes were confirmed here: last-admin
guards that counted every membership row in the system rather than this workspace's; an expired
invite that permanently locked somebody out of confirming their own email; leaving one of two
workspaces returning `401` for everything afterwards; and creating a workspace unverified.

---

# 4. SCALING — what breaks first, and what we would do about it

**Authentication itself scales further than anything around it** — one HMAC and two indexed
lookups per request, nothing shared. What gives way is the code beside it: a read-then-write
with no lock, dictionaries that only exist in one process, and eventually one database. In the
order they would actually bite.

## Stage 1 — message numbering, and it is already broken

**What breaks.** Allocating a message's position is a read followed by an insert with nothing
holding the gap. Two writers read the same number; the second violates the uniqueness
constraint. Five retries do not save it, because under real concurrency the retries collide too.

**What it looks like.** An HTTP 500 in front of whoever was sending. No corruption — the
constraint holds, so the data is never wrong — but the message is simply not saved. Measured:
sixteen concurrent replies into one conversation, nine failed.

**At what scale.** Not a traffic number — it needs two writes to *one conversation* to overlap.
At human typing speed that essentially never happens, which is why it has survived. It becomes
routine the day anything automated writes: an email backlog draining, an import, a bot.

**Options.** *Allocate the number inside the insert*, so the database computes it and there is
no gap to race in; a slightly more awkward statement, and no contention at all in the normal
case. *Lock the conversation row* before computing; simpler to reason about, and it serialises
every writer on a busy thread behind one lock.

**Lean.** The insert-side allocation. The failures that will actually hurt are the automated
ones, and those are exactly the case where a lock costs the most.

## Stage 2 — the day there is a second process

**What breaks.** The rate limiter and the WebSocket ticket store are plain dictionaries inside
one process. They break on the first horizontal scale-out, which usually arrives for
zero-downtime deploys long before load demands it.

**What it looks like.** Two different failures. The rate limiter silently multiplies: a limit
configured as five per minute is really ten with two containers, and nothing in the code, the
config or the logs says so. The ticket store fails loudly but confusingly — mint a ticket on
container A, present it to container B, and the connection is refused forever in a way that
looks exactly like a broken client. **At what scale:** the moment the container count is two.

**Options.** *Redis* for both: built for it, and one more thing to run and to be down.
*Postgres* for tickets: nothing new to operate, but it turns a 30-second throwaway string into
rows somebody has to clean up. *Leave the limiter and divide its numbers by the container
count*: costs nothing, and the real limit becomes something you have to know rather than read.

**Lean.** Move the tickets, leave the limiter. The limits were judgement calls, not physical
constants, so dividing them is honest; and a shared limiter writes to the shared store on every
request including every request in an attack, which adds load at the worst possible moment.

## Stage 3 — the first real security requirement, not a load one

**What breaks.** Nothing, mechanically. Stateless sessions keep working. What arrives is a
requirement they cannot meet: sign out one device, or make a password change kill existing
sessions.

**What it looks like.** A support conversation that ends in "we cannot do that", and a stolen
cookie that stays good for its full seven days.

**Options.** *A counter on the user row mixed into the signature*: bumping it invalidates all of
that person's cookies at once, costs no extra query because the user row is already loaded, and
gives no per-device control. *A real sessions table*: full control, and it reintroduces exactly
the read-per-request the design avoided.

**Lean.** The counter first — it covers the case people actually ask for, "log me out
everywhere", for almost nothing. Hold the table until somebody needs to kill one session.

## Stage 4 — the inbox reads

**What breaks.** A page of conversations is three queries no matter how many rows it holds, so
the list is not the problem. Every *write* to a conversation — reply, assign, snooze — loads the
entire thread first, every message of it, purely to run the visibility check.

**What it looks like.** Nothing at all until one customer has a very long thread, and then
every action on that one thread is slow while everything else is fine — which reads as a
customer-specific mystery rather than a performance bug.

**At what scale.** Threads in the low thousands of messages, which happens when a customer keeps
replying to the same email.

**Options and lean.** Load only the conversation row for the check, and fetch messages when the
thread is actually being read. There is no real second option; the only argument is when. Do it
before it is urgent, precisely because it is invisible until it is not.

## Stage 5 — one Postgres

**What breaks.** Everything here is one database. `messages` grows fastest and is read almost
entirely by conversation, so it is the first table to get uncomfortable — slower queries and a
restore window that stops being casual, well before anything actually fails.

**Options.** *Partition `messages`* by workspace or by age: no application change at all, and a
lot of headroom. *Read replicas* for the list: the inbox tolerates being a second stale, but
replicas add a staleness question to every read and somebody will get it wrong on a
write-then-read path. *Shard by workspace*: the filter is exactly the seam a shard key would
use, because every workspace-owned query already carries `workspace_id`, so routing is a change
to one file rather than to every query.

**Lean.** Partitioning first, because it costs nothing in application code. Sharding is the end
state and a long way off; that it would be cheap is the payoff for making isolation automatic
rather than something each query remembers.

## Where this stops being sensible

Nothing above needs a rewrite to serve a few hundred agents across a few thousand workspaces on
one database. Stage 1 should be fixed now, because it is already reachable. Stage 2 becomes real
the day somebody wants two containers — a deployment decision rather than a scale one. The rest
is a long way out, and I would want each stage to have actually hurt before designing the next.
