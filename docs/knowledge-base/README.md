# The knowledge base

A shop writes help articles. Two audiences read them: agents in the inbox, who want the right
article while a customer waits, and strangers arriving from Google with no login. Both are served by
the same rows and the same search. The job of this layer is one sentence:

> Given some text — an agent's query, or a customer's whole conversation — find the article that
> answers it, out of everything this workspace has published, in a few milliseconds.

---

# 1. The architecture, and how it actually works

An article is a row: a title, two copies of its body, a status, a slug.

```
   agent's browser                    stranger's browser
   (the dashboard)                    (the help centre)
        │ POST /api/articles                  │ GET /api/help/site
        │ PATCH /api/articles/{id}            │ GET /api/help/article/{slug}
        │ POST  .../publish                   │ GET /api/help/search
        ▼                                     ▼
   ┌──────────────────────────────────────────────────────┐
   │  sanitise  ──►  articles row  ──►  Postgres computes  │
   │  (allowlist)    title, body_html,    the search       │
   │                 body_text, status,   column, in the   │
   │                 slug                 same transaction │
   │                                      ▼                │
   │                                   GIN index over      │
   │                                   published rows only │
   └──────────────────────────────────────────────────────┘
```

**Two copies of the body, on purpose.** `body_html` is what a reader sees; `body_text` is the same
content with the tags taken out. Indexing the HTML would put `strong`, `href` and every URL into the
index as if the author had typed them as words; stripping tags at search time means doing that work
on every query, which is what an index exists to avoid. `body_text` is derived from the *sanitised*
HTML, never from what arrived.

There are two states, `draft` and `published`. `published_at` is stamped once and never moved, so
"first published on" survives an unpublish and a republish. Nothing unpublished is visible outside
the dashboard, enforced in four separate `WHERE` clauses — public listing, public reader, public
search, agent search — not one shared helper. One helper every caller trusts is one place for
somebody to add an `include_drafts=True` escape hatch for the dashboard. Four independent clauses
cannot all be switched off by one change.

## How full-text search actually works

### What an inverted index is

You have ten thousand articles and somebody types "kestrel". The naive answer reads all ten thousand
and checks each one. That works, and it does not scale.

A normal database index answers "given this row, what is in it?". An **inverted index** answers the
opposite question — "given this word, which rows contain it?" — by storing, for every distinct word
that appears anywhere, the list of documents containing it:

```
'boot'  -> [1, 4, 9]        'refund' -> [2, 7]        'kestrel' -> [1, 4]
```

That is the whole idea. Searching a million documents for "kestrel" does not read a million
documents; it reads one list. It is called inverted because the ordinary map goes document → words
and this one goes word → documents.

**Postgres has one built in, and the name says so.** `GIN` stands for **Generalized INverted
Index**. That is not an analogy — it is the same structure Lucene is built on, and therefore
Elasticsearch. When somebody says "we should add a search engine", the search engine's core is
something our database already ships.

### The generated column

To use it you need the document's side of that structure: one article's words, normalised. Postgres
calls it a `tsvector`, and ours is a **stored generated column** — computed from the other columns
of the same row, on write, and stored:

```sql
setweight(to_tsvector('english', coalesce(title, '')),     'A') ||
setweight(to_tsvector('english', coalesce(body_text, '')), 'B')
```

Nothing in the application ever assigns to it; there is no `UPDATE articles SET search = ...`
anywhere, because Postgres refuses writes to a generated column. So the index is maintained by the
database **inside the same transaction as the write**. There is no window where an article is saved
but not searchable, no reindex job, and no way for the two to disagree. If the insert commits, the
row is searchable; if it rolls back, so does the index entry.

The real column for an article about football boots, read out of Postgres:

```
'boot':3A,10B 'cut':12B 'footbal':9B 'kestrel':2A,8B 'lace':27B 'narrow':13B
'reserv':24B 'run':4A 'size':7A,18B,22B 'stud':25B 'tri':41B 'true':5A
```

Three things happened at once. **Stemming** — the article says "football", "reserve", "lacing",
"studs"; the index holds the roots, so a customer typing "studs" matches an article that wrote
"stud". **Stop words** — "the", "are", "if", "you", "of" appear many times and not one is in the
vector, because a word appearing in nearly every document tells you nothing about which document you
want. **Weighting** — `'kestrel':2A,8B` means position 2 tagged A, position 8 tagged B; title is A,
body is B. Postgres weights A at 1.0 and B at 0.4, so a title hit is worth two and a half body hits.

### The partial index

The GIN index carries `WHERE status = 'published'`, so a workspace with forty live articles and a
hundred drafts indexes forty rows, and a draft is not merely filtered out of results — it is not in
the search structure at all. The catch: Postgres uses a partial index only when it can *prove* the
query is a subset of the index's condition, so every search must repeat `status = 'published'` in
its own `WHERE`. Both do. A future query that forgets gets no error — it silently gets a sequential
scan.

### Why the query terms are OR-joined

One character of SQL, and it is the difference between a feature that works and one that never
fires. Postgres's convenient query builders — `plainto_tsquery` and friends — **AND** every term
together. That is right for a search box, where somebody types three deliberate words and means all
three. It is catastrophic when the input is a sentence a customer typed:

```
message: "hi there, I bought the Kestrel boots last week and I am not sure what
          size to get for my son, do they run small?"

plainto_tsquery -> 'hi' & 'bought' & 'kestrel' & 'boot' & 'last' & 'week'
                   & 'sure' & 'size' & 'get' & 'son' & 'run' & 'small'  -> 0 matches
the same terms ORed                        -> 1 match, score 6.0, the sizing article
```

Zero. Not "poor results" — zero, for a question the knowledge base answers directly, because no
article contains "hi" *and* "bought" *and* "week" *and* "son". The panel would have said "nothing
close enough" for every conversation forever, and it would have looked like the search was bad
rather than the join.

So we OR, and let ranking decide which match is any good. Before the OR the input is reduced to
alphanumeric runs of two or more characters, lowercased, de-duplicated, capped at forty terms. That
is not a tokeniser, it is a **sanitiser**: `to_tsquery` takes an operator syntax, so `&`, `|`, `!`,
`(` and `:` all mean something, and a message containing `AT&T` would be a syntax error — a 500, not
a bad result. Nothing typed can be an operator if everything surviving is a letter or a digit. Stop
words are not stripped in Python and need not be; Postgres drops them at parse time.

### The confidence floor

Ranking is `ts_rank_cd`, which scores a document higher when the query's words appear close together
rather than merely often. The agent's search keeps results scoring **1.0 or more** — three for the
suggestion panel, eight for the manual picker. Measured: one body-word hit scores 0.4 and each extra
adds 0.4; one title-word hit scores exactly 1.0. So the floor reads, plainly: **one word of the
question has to appear in an article's title, or three of them in its body.** Anything weaker is
dropped, because a wrong article is worse than no article — the agent reads it, it is not the
answer, and they trust the panel less next time.

## Suggestions to the agent

The agent presses a button and gets up to three articles. What goes *into* the search is the
interesting part. The obvious input is the customer's recent messages. That was the first version,
and it was wrong for a reason worth stating generally: **a fixed window over recent messages assumes
a conversation is about what was said most recently, and support conversations are not.** They are
about one unresolved thing, discussed around the edges, sometimes for days.

A real fourteen-message conversation makes it concrete. Message 1 is "I can't work out what size to
get". Messages 2 to 14 are pitch type, colourways, delivery, returns, Klarna. The sizing question is
asked once, never restated, still unanswered at the end — and the last five customer messages
contain "size" zero times. A bigger window is not the fix: it dilutes a short conversation, and the
newest message alone is right until it is "ok" or "any update?", which in a support inbox is most
messages. Raw message text is the wrong input. We use instead a rolling summary that already had to
exist for another feature — one row per conversation holding `product`, `issue`, `intent`, `tried`,
`status` and a list of `keywords`, maintained by a background job. The query is then string
concatenation.

```
   conversation ──► background job ──► one state row
                    (LLM, off the                │
                     click path)     keywords, product, issue, intent
                                                 │
   agent clicks "Suggest articles"               │
        └────────► newest customer message ──────┴──► full-text search ──► top 3

   window of last five messages   ->  sizing article ranked 7 of 7, not shown
   state + newest message         ->  sizing article ranked 1 of 8, score 7.8
```

`tried` and `status` are left out on purpose: they describe what has been done *about* the problem,
not what it is, and "confirmed thirty-day returns with postage refund" in a query about boot sizing
drags in the returns article. With no state yet, it falls back to joining the last five customer
messages, so the button does something useful on a brand-new thread.

## The public help centre

Three read-only unauthenticated endpoints: the site (categories plus every published article), one
article by slug, and search. Each first resolves *which workspace's help centre this is*, then runs
its query with that workspace scoped in. Resolution tries the hostname first and the workspace slug
second; the hostname branch returns nothing today, so every request resolves by slug at
`/help/{workspace}/{article}`. Both lookups run inside the one deliberate escape hatch from the
tenant filter that otherwise refuses any query with no workspace in scope — correct, because a help
centre is public and by definition names its own workspace, and the first place to look if a
cross-tenant leak is ever suspected here. The rate limit is enforced **before** the workspace is
resolved: sixty requests a minute per IP, so an attacker probing for which workspace slugs exist
pays for every guess, not only for the hits.

---

# 2. The decisions, and what each one beat

## The slug is frozen once an article is published

A slug is the URL-safe form of the title: "Do Kestrel boots run true to size?" becomes
`do-kestrel-boots-run-true-to-size`. It is unique per workspace, not globally, so two shops can both
own `/refunds`. While an article is a draft, renaming it regenerates the slug. Once `published_at`
is set, the slug never changes again however the title is edited.

The alternative — keep the slug in step with the title, always — is what the code did first, and it
means fixing a typo in a headline breaks the page. Every link to that article dies at once: an email
an agent sent last week, a Google result, a customer's bookmark. No redirect, no warning. Verified
before the fix: rename a live article and the old URL 404s while the new one 200s.

The other alternative is a redirect table of every slug an article has ever had. It keeps old links
alive and is strictly more capable. It is also a second table, a second lookup on the public read
path, and a new question each time — which slug is canonical for search engines, what happens when a
new article wants a slug an old one abandoned. Freezing is one `if`, and it is the same reasoning
that freezes an inbound email address once it is in use: a published identifier belongs to whoever
is holding it, not to whoever is editing it. The honest cost is that URL and title drift apart —
"Paying with Klarna or Clearpay" can live at `/paying-with-klarna` forever. Slightly untidy, and
nobody's link ever breaks, which is the right way round.

## Rich text is sanitised on the server, with an allowlist

Every other write path here is one authenticated person's text shown to a few colleagues and one
customer, stored and rendered as plain text. The knowledge base differs three ways at once: it is
genuinely rich text, so it cannot be escaped wholesale; it is stored and served to every visitor
afterwards, so one bad save is a payload that fires for everybody who reads that page; and it is the
one surface deliberately served to strangers, on the same origin as the dashboard. That is *stored*
cross-site scripting, the worse kind — reflected XSS needs a victim to click a crafted link; stored
XSS just waits.

**An allowlist, never a blocklist.** The list names twenty-six permitted tags; everything else goes,
along with every attribute except `href`/`title` on links and `src`/`alt`/`title` on images, and
every scheme except http, https and mailto. A blocklist — "strip `<script>`, strip `onerror`" — is a
list of the attacks somebody thought of, and the history of XSS is the history of the ones they did
not. The clearest case is a login form posting to somebody else's server: no JavaScript in it at
all, so a blocklist built around "script" and "on\*" catches none of it, and the allowlist catches
it because `form` and `input` are simply not on the list.

**On the server, not in the editor**, because the attacker does not use your editor — they `curl`
the API, so any sanitiser running before the request leaves the browser is advisory. And it is **a
real HTML5 parser, not a regex**: browsers recover from malformed markup in ways string matching
does not predict — `<scr<script>ipt>`, unclosed tags, entities that decode into a scheme — so a
sanitiser that does not parse the way a browser parses is one you can get past.

**Sanitising on write, not on read.** The database then holds only safe HTML, every reader is safe
without doing anything, and the cost is paid once per save rather than once per view. The price is
that a stored value is only as safe as the allowlist was on the day it was written: if a bypass is
found in the library, rows saved before the upgrade are still there and still served. Sanitising on
read fixes that and puts a parser on every page view. The standard trade, taken deliberately — and
it implies a backfill command that does not exist. The title goes through the same library with an
*empty* tag allowlist, truncated **after** sanitising, because truncating first could cut a tag in
half and hand a malformed fragment to the sanitiser.

## The search index is a column, not a service

The alternative is Elasticsearch, and the honest answer is short: **we already have the inverted
index.** GIN is the same structure. Elasticsearch adds a second datastore holding a copy of data
whose master lives in Postgres, and a copy can drift. Drift is not hypothetical, it is the normal
state of that architecture. Publish an article while the indexer is down and it is live and
unfindable. Let a delete not propagate and a stranger gets a result that 404s. Restore a backup and
the two stores disagree about the last hour with nothing to tell you. Each of those needs a
reconciliation job, and each reconciliation job needs its own monitoring. The generated column has
none of those failure modes because it is not a copy — it is a column of the row, written in the
row's own transaction. Stated fairly, Elasticsearch would buy typo tolerance, faceting,
highlighting, hand-maintained synonyms and scale past one Postgres; none is the constraint here.

Two smaller alternatives lost the same way. **A trigger** does the same job in a function living
outside the table definition, which has to be kept in step with the columns it reads and can be
dropped by a migration without anything failing loudly. **Computing the vector in Python on save**
puts the definition of "what is searchable" in the application, where two write paths can disagree
and where anything touching the table from outside — a migration, a backfill, `psql` — silently
produces an unsearchable row.

## Title above body, rather than one undifferentiated blob

Indexing title and body together is simpler: one call, no `setweight`. It also makes a long article
about returns that mentions boots twice outrank the article whose *title* is the customer's exact
question. Since only three suggestions are shown, an article that ranks fourth may as well not
exist.

## The query builder is deterministic — no model on the click path

The design that first suggests itself is a second LLM call that reads the conversation and writes a
search query. It buys nothing. The distillation already happened in the background — doing it again
on the click is the same work twice, once when nobody is waiting and once when somebody is. It puts
a second or two on a panel that should feel like a lookup, it makes suggestions slow whenever Azure
is slow for a feature with nothing to do with Azure, and it is non-deterministic: the same
conversation gives different suggestions on two clicks, which is what makes an agent stop trusting a
panel.

## Suggestions are a button, not automatic

The summary loads by itself when the panel opens; suggestions do not. Load is the small reason. The
real reason is what an unrequested wrong answer does to trust. An agent who presses a button and
gets three mediocre articles shrugs: they asked, the knowledge base did not have it, they move on.
The same three appearing on their own every time they open a conversation are three things to read
past before they can work; within a week the panel is furniture, and when it is right nobody
notices. The button also makes failure legible — pressing it and getting nothing means "no article
exists for this, someone should write one", where the same emptiness arriving on its own is
indistinguishable from a panel that has not loaded.

## Custom domains were designed and not built

A workspace pointing `help.theircompany.com` at us and getting its own help centre there was
designed and never implemented. What exists is a seam: help-centre resolution checks a hostname
before it checks a workspace slug, and the hostname lookup is a function that returns nothing. There
is no domains table, no verification, no certificates. It was cut because it is mostly operational
work rather than product work — certificate issuance and renewal per customer, DNS verification, and
a per-hostname failure mode where one customer's site is down and nothing tells us — and that was
worth less than finishing search and the help centre, so it was dropped rather than half-built. The
seam stayed because the precedence question, does the hostname win or the slug, is much easier to
answer while writing the code that consumes it than as a retrofit.

---

# 3. Known bugs

Each was checked against the code as it stands.

**A PATCH that omits the body erases the body.** The article service is written for partial updates
— each field is applied only if it is not `None`. The request schema defeats it: `body_html`
defaults to an empty string, so a request that does not mention the body arrives as `""`, which is
not `None`, and the content is replaced with nothing. `category_id` has the same shape and silently
uncategorises the article. Confirmed by constructing the request object the route uses: a title-only
edit yields `body_html=''` and `category_id=None`. The route is declared `PATCH` and behaves as
`PUT`. **Reachable today by anyone calling the API directly, on every edit that does not resend
every field. Open.** Fix: make the fields genuinely optional, or rename the route to what it does.

**Two people creating an article with the same title at the same moment get a 500.** Choosing a free
slug reads the slugs already taken, picks one that is not, then inserts. Two requests can read the
same set, pick the same slug, and the second hits the uniqueness constraint. **Unreachable at human
speed with one author; reachable with two people clicking at once, or a bulk import. Open.** Same
read-then-insert shape as the message-numbering defect in the real-time layer, and the same fix.

**The public help search has no confidence floor and the agent's search does.** Two functions build
the same query; one keeps results at 1.0 and above, the other keeps everything that matches at all
and returns ten. A stranger searching for "my order" gets every article sharing any word with it.
For a search box that is arguably correct — the person can see the list and judge it — but it is not
a decision anybody made, it is two copies of one query that drifted. **Open**, and the fix is one
function with the differences as parameters.

**The hostname branch of help-centre resolution cannot work, for two reasons.** The lookup returns
nothing, and separately the server reads a forwarded `x-help-host` header that nothing sets — our
nginx config also leaves that header alone rather than overwriting it, so a client-supplied value
would pass through. All inert today. **Open**, and worth naming so nobody implements a third of it
and spends an afternoon wondering why nothing changed.

**There is no way to delete an article.** Create, read, update, publish, unpublish. An article
written by mistake can only be hidden. **Open, by omission.**

**Two pieces of code that mislead the reader.** A `by_slug` helper in the article service is never
called, and the suggestion path fetches five customer messages and uses only the newest whenever a
summary exists. Neither costs anything measurable; both make the code read as though the old
message-window design still matters. **Open, cosmetic.**

---

# 4. Scaling: what breaks first, and what we would do about it

Two questions kept separate: what actually happens as this grows, and what we would reach for. The
stages are in the order they arrive, not in order of interest — and the first is dull, which is
usually how it goes.

## Stage 0 — today

One API process, one Postgres, tens of articles per workspace. Search is a GIN lookup over one
workspace's rows: single-digit milliseconds, nothing to tune. Everything below is somewhere this
stops being true.

## Stage 1 — the public listing endpoint, at roughly a few hundred articles in one workspace

**What breaks.** `GET /api/help/site` returns *every* published article in one response, with a
preview of each and no pagination. There is no limit anywhere in that query.

**Why this first.** It is the only endpoint whose cost grows with the size of the corpus rather than
with traffic, and it is on the path of every visit to a help centre — the landing page calls it.
Everything else here is bounded: search returns three, eight or ten rows.

**What it looks like.** Nothing errors. The landing page just gets slower, for everybody, in
proportion to how much the shop has written. Forty articles is a small JSON document; a few thousand
is a megabyte on an unauthenticated route. The shop with the best help centre gets the worst one,
which is exactly backwards.

**Options.** Pagination is the honest fix, and it changes the public URL structure and the page
design. A cached rendering per workspace, dropped when anything is published, keeps the URLs and
adds one invalidation rule. Given publishes are rare and reads constant, the cache is cheap and its
invalidation is genuinely simple — one event, one key. **I would start with the cache**, because it
buys the most for the least change, and add pagination when a workspace really does have hundreds of
articles and no reader wants them on one page anyway.

## Stage 2 — the second API process, whenever uptime demands one

**What breaks.** The rate limiter is a dictionary in one process, as is anything else here that
remembers something between requests.

**Why this arrives when it does.** It is not triggered by load at all. It is triggered the first
time somebody wants two containers for zero-downtime deploys, which usually comes long before
traffic justifies it.

**What it looks like.** Every public limit silently doubles. Sixty requests a minute per IP becomes
a hundred and twenty, split at random by whichever container the load balancer picked. Nothing logs
it and nothing looks wrong; the help centre is simply easier to scrape than the number in the code
says.

**Options.** Move the counters into Postgres, which is already there and already touched by every
request, at the cost of a write per request on a hot path. Or Redis, built for exactly this and one
more thing to run and monitor. The "we already have Postgres" argument is usually decisive and
**here I would still lean Redis**, because a counter write per public request is the one workload
where that argument stops being free — it puts write traffic on the database in proportion to
unauthenticated reads, which is the traffic you least want to trust. The stronger point is that this
is not a knowledge-base problem: the connection registry in the real-time layer breaks the same day
for the same reason, and I would do all the single-process state as one piece of work rather than
four migrations with three windows where the system is half fixed.

## Stage 3 — retrieval quality, at roughly a few thousand articles in one workspace

**What breaks.** Not speed. The GIN lookup is still fast. What stops working is the *ranking*.

**Why this is a different kind of problem.** Everything above is engineering. This one is that
lexical search matches words, not meaning. "My son's feet hurt after training" and "boot fit guide"
share no words at all, so no ranking function can connect them. On a small corpus that rarely
matters, because the right article usually shares some word. On a large one, near-duplicates
multiply, `ts_rank_cd` produces ties it cannot break, and the correct answer starts landing fourth —
which, when three are shown, is the same as not existing.

**What it looks like.** Nothing at all, and that is the problem. No error, no slow query, no log
line. Agents quietly stop pressing the button, the feature degrades into furniture, and the only
evidence is that nobody uses it.

**The partial mitigation we already have.** The summariser is asked for synonyms the customer did
*not* use, which is why "sizing", "astroturf" and "delivery" turn up in queries where nobody said
them. A real bridge across the vocabulary gap, and cheap, because the model was running anyway. Also
a stand-in: it does not survive typos and it does not survive another language.

**Options.** Embeddings — turning text into a few hundred numbers positioned so similar meanings sit
near each other — are the actual answer, by two roads. `pgvector` adds a column and an index to the
database we already run: no new service, the article stays one row, and the write path grows an
embedding call plus a re-embed of everything whenever the model changes. A dedicated vector store is
purpose-built and faster at large scale, and is a second datastore holding a copy of our data — the
exact drift problem that kept us out of Elasticsearch. **Given the whole design is "one row, one
transaction, no copies", `pgvector` is where I would start**, running lexical and vector search
together and fusing the results, which is where most production systems end up anyway. A dedicated
store is where I would end up only if one Postgres genuinely could not hold it.

**But I would measure first.** Nothing records which suggestions were shown or used, so "are
suggestions working?" is unanswerable today. That is the cheapest item on this list and the one that
should decide whether Stage 3 is real or imagined. Building embeddings before knowing the miss rate
is guessing expensively.

## Where this design stops being sensible

Two lines, and neither is a search problem. The first is the day one process is no longer acceptable
— for uptime, not for load — which takes the rate limiter and every other in-process dictionary with
it; realistically that is the first serious uptime requirement, not a traffic number. The second is
the day a single workspace's corpus is large enough that lexical ranking stops finding the right
article, somewhere in the low thousands of articles.

Below both lines — a few hundred workspaces with a few hundred articles each, on one Postgres and
one API process — this is the right design, and adding machinery to it would be cost with no return.
Above them it is the same design with more rows in it, plus one component that did not exist before.
That is a better place to be than a system claiming to have no ceiling.
