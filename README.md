# Intercom

A customer support platform. A shop puts a chat panel on its website and points a support email
address at us; every question from either channel lands in one shared inbox its agents work all
day. Many shops use the same installation and none of them can see each other's data.

**New here? Read [`docs/usage/`](docs/usage/) first.** It walks through the product end to end —
signing up, creating a workspace, inviting people, installing the widget, wiring up the support
email, working the inbox, and publishing help articles. The design documents below assume you know
what the thing does.

## What it does

A customer opens the chat panel on the shop's site and asks a question, or emails the shop's
support address. Either way a conversation is created, and it appears in the agents' inbox within
about a second without anyone pressing refresh. Agents reply from the inbox; a chat reply appears
in the customer's panel, an email reply goes back out as a real threaded email that the customer
can answer from their own mail client.

Around that there is a workspace with admins and agents, email invitations, per-conversation
assignment, snoozing and resolving, a knowledge base with full-text search and a public help
centre, article suggestions offered to the agent while they type, and a rolling AI summary of each
conversation so an agent picking up a long thread does not have to read it from the top.

## Try it live

Everything below is deployed and clickable, no install required.

| What | Where |
| --- | --- |
| The demo shop | <https://superprofintercom.aksht.dev/demo/?app=https://superprofintercom.aksht.dev> |
| The agent inbox | <https://superprofintercom.aksht.dev> |
| The help centre | <https://superprofintercom.aksht.dev/help/superprofile> |
| The support email | `superprofile@aksht.dev` |

The demo shop is a stand-in customer website with the chat widget embedded. The agent inbox is the
app itself, where the resulting conversations land. The help centre is the demo workspace's public
knowledge base.

### Trying the email side

Send a plain email to `superprofile@aksht.dev` from any mail client and it turns up in the same
inbox as the chat messages, as a conversation you can reply to. Replies go back out as real email,
threaded, so the customer answers from their own mail client and never learns there is a support
tool involved.

The address is not a mailbox anyone reads. Each workspace gets its own random token, and the part
before the `@` is that token — `superprofile` here — so an incoming message can be traced to
exactly one workspace before anything else happens. Our mail provider receives the message and
tells us it has arrived; we fetch the body, check the signature over the raw bytes so nobody can
forge a delivery, then decide whether it belongs to a conversation we already know about. That
decision uses the message identifiers that mail clients pass around, never the subject line —
subjects get edited, translated and reused, and threading on them merges strangers' conversations
together. If nothing matches, it becomes a new conversation. If the thread was already resolved,
the customer's reply reopens it.

One thing worth trying: reply to a reply. The quoted text and signature are stripped, so the
inbox shows what the person actually wrote rather than the whole history pasted again.

Sign in to the demo workspace as any of these; they all share the password `superprofile-demo-2026`.

| Email | Name | Role |
| --- | --- | --- |
| `ananya@superprofile.demo` | Ananya Sharma | admin |
| `rohan@superprofile.demo` | Rohan Verma | agent |
| `kavya@superprofile.demo` | Kavya Nair | agent |

The fastest way to see the whole product: open the demo shop in one window and the inbox in
another signed in as Ananya, send a message from the shop, and watch it arrive in the inbox
without a refresh. That is ten seconds and it is the entire idea.

The `?app=` parameter is required because the demo page falls back to `localhost:3000` when it is
absent, so the plain `/demo/` URL loads no widget at all — a known rough edge.

## What we did not build

**Custom domains never shipped.** A shop's help centre lives at a path under the app's own domain
and nowhere else. There is no domain table, no certificate handling and no DNS work in the code —
the hostname lookup exists as a function that always returns nothing. It was designed and not
built; the knowledge-base document describes the intended design and says the same. If an older
plan reads as though a shop can point its own domain here, that plan has drifted from the code.

## What is missing, and what the next phase is

The product works. What it does not yet have is the machinery you need to run it for someone other
than yourself. These are known gaps, not oversights, roughly in the order I would close them. Each
subsystem's own document goes deeper.

**Observability — nothing watches this system.** Every request already writes one structured JSON
line with the method, route, status, duration and a request id, and the services log named events
through the same logger. That is real, and it is all there is. The lines go to the container's
standard output and nowhere else. Nothing collects or indexes them, so no one can ask "which
requests took over a second this morning" without reading a file by hand. There are no metrics —
no connected-socket count, no job queue depth, no error rate — and no tracing, so a slow reply
cannot be blamed on the database, the language model or our own code without guessing. Nothing
alerts: if the job runner stopped, the first to know would be a customer whose email never arrived.

The fix is [OpenTelemetry](https://opentelemetry.io/) for instrumentation and
[SigNoz](https://signoz.io/) as the place it lands — logs, metrics and traces in one tool rather
than three. FastAPI, SQLAlchemy and httpx have off-the-shelf instrumentation, so request spans,
every SQL query and the Azure calls come almost free; the trace id then threads into the existing
structured logs so a line and its trace point at each other. The metrics worth adding by hand are
connected sockets, queue depth, job failure rate and summary latency — the ones that would have
caught the retry-forever bug while it was happening. Grafana with Loki and Tempo does the same job
if you prefer the pieces separate. Note that self-hosted SigNoz runs ClickHouse and is not a light
neighbour; on a small box it belongs elsewhere, or on their hosted tier.

**No automated tests and no continuous integration.** Not a thin suite — none. Every claim in the
design documents was checked by running the system by hand. That holds while one person keeps the
whole thing in their head, and stops the day a second person changes something. The first tests
worth writing are the ones covering the defects already named in the documents.

**Security and abuse.** The widget key is public by design, and the server accepts it from any
origin with no cap on how many conversations one visitor may open — measured, not assumed. It
needs a per-workspace list of allowed domains and a rate limit on conversation creation. There is
also no audit trail: nothing records who resolved a conversation, changed a role or removed a
member.

**It is still one process.** The connection registry, the socket tickets, the rate limiter and the
job lock all live in memory, so a second API container breaks all four at once, silently. Postgres
`LISTEN/NOTIFY` is the smallest thing that fixes them together, and the architecture document
argues for doing it as one piece of work rather than four.

**Real-time.** Assignment, resolve and snooze do not notify anyone, so another agent's list can
stay stale until their next message or tab focus — three function calls to close. Reconnecting
refetches the whole thread rather than replaying from the last sequence number, which is fine at
this size and wasteful later. There is no cap on connections per address.

**Email.** Quote and signature stripping is pattern matching, and mail clients are endlessly
inventive, so some replies will still carry a tail of quoted text. Attachments are not handled at
all — an inbound file is dropped, and an agent cannot send one. Bounces and delivery failures are
not surfaced, so a reply to a dead address looks successful.

**Knowledge base.** Search is English-only, because the text index is built with the English
configuration. Articles cannot be deleted. Categories exist in the database and the API but the
editor never sets one, so the feature is unreachable. There is no image upload, no draft preview,
and no versioning, so an edit to a published article is live immediately with no way back.

**AI.** The summary is best-effort: if the model is unavailable the conversation works and the
panel simply shows nothing, which is the right failure but an invisible one — nothing tells an
agent the summary is stale. Cost is untracked. The refresh job scans the queue by payload with no
index on it, which is cheap now and will not stay cheap.

**Inbox.** No search across conversations, no filtering by tag or customer, no bulk actions, no
canned replies, and no way to merge two conversations from the same person. These are the things
an agent working eight hours a day asks for second, right after the inbox is fast.

**Deployment.** One machine, no redundancy, and deploys drop every open socket because there is no
second container to move traffic to. Backups are whatever the managed database provides. The demo
page still needs its `?app=` parameter, which is a one-line fix nobody has made.

## Running it locally

You need Python 3.13 with [uv](https://docs.astral.sh/uv/), Node 22, and a Postgres 16 you can
reach. The quickest Postgres is a container:

```bash
docker run -d --name intercom-db -p 5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=intercom \
  postgres:16-alpine
```

Then the API:

```bash
cd server
cp .env.example .env          # set DATABASE_URL and SESSION_SECRET
make install                  # uv sync
make migrate                  # alembic upgrade head
make dev                      # http://localhost:8000
```

`GET /health` should return `{"status":"ok","db":"ok",...}`. Interactive API docs are at `/docs`.

And the web app, in a second terminal:

```bash
cd client
npm install
npm run dev                   # http://localhost:3000
```

Email delivery, inbound email and AI summaries each stay switched off until their credentials are
present, and the rest of the product works without them. In development, verification and invite
links are printed to the API log instead of being emailed, so you never need a mail provider to
sign up. `POST /api/dev/seed` fills a workspace with sample conversations; it refuses to run in
production.

One caveat on `docker compose --profile local-db up -d db`: that Postgres publishes no port to the
host, so it is only reachable from the other compose services. If you use it, `DATABASE_URL` must
name `db` as the host, not `localhost`.

## How it is deployed

Two images built from this repository — `server/Dockerfile` and `client/Dockerfile` — plus a
managed Postgres. `docker compose up` runs the Alembic migrations to completion first, then starts
the API and the web app, each bound to localhost only. Nginx terminates TLS and is the only thing
listening publicly: it sends `/api/`, `/ws/` and `/health` straight to the API, `/demo/` to a
static page, and everything else to the web app. `deploy/nginx.conf.example` is the working
configuration, including the long timeouts and upgrade headers that WebSockets need.

One thing to get right at build time: `NEXT_PUBLIC_API_ORIGIN` is compiled into the browser bundle
and is what the browser uses to open its WebSocket. If it is missing the app still looks healthy
and simply is not live. `API_ORIGIN` has a build-time guard; this one does not.

## The documentation

| Document | What it covers |
|---|---|
| [`docs/usage/`](docs/usage/) | **Start here.** How to actually use the platform, from signing up to publishing help articles |
| [`docs/architecture/`](docs/architecture/) | The system as a whole: the services, the data model, how one database serves many shops, the job runner, and where it breaks |
| [`docs/api/`](docs/api/) | The design of the HTTP surface: how routes are organised, validation, error shapes, pagination, idempotency |
| [`docs/auth/`](docs/auth/) | Sessions, passwords, roles, invites, workspace isolation, and how a conversation is assigned and resolved |
| [`docs/inbox/`](docs/inbox/) | A pointer: the inbox is documented together with authentication and workspace access in `docs/auth/` |
| [`docs/websocket/`](docs/websocket/) | The WebSocket layer: why the socket carries an id and not a message, and how a browser catches up |
| [`docs/email/`](docs/email/) | Inbound and outbound email, threading on Message-ID, and why duplicate deliveries are harmless |
| [`docs/knowledge-base/`](docs/knowledge-base/) | Articles, Postgres full-text search, the public help centre, and the custom-domain design that was never built |
| [`docs/ai/`](docs/ai/) | The rolling conversation state behind the agent summary and article suggestions |

Every design document answers the same four questions: what the architecture is and how it works,
what we decided and what each decision beat, what the known bugs are, and what would break first
if this had to scale. The bugs sections are honest and name defects that are still open.
