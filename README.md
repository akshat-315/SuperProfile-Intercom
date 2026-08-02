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

The demo shop is a stand-in customer website with the chat widget embedded. The agent inbox is the
app itself, where the resulting conversations land. The help centre is the demo workspace's public
knowledge base.

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
