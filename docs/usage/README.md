# Using the platform

This is a customer support desk. Your customers ask questions in two places — a chat panel on
your website, and your support email address — and every question lands in one shared inbox that
your team works through. There is also a public help centre you write articles for, so some
people answer their own question and never write to you at all.

This document walks the whole thing in order: signing up, adding your team, turning on chat and
email, working the inbox day to day, and publishing help articles. Nothing is assumed. Where
something is missing or half-built, it says so.

---

## 1. Signing up, and what a workspace is

You sign up with your name, an email address and a password. We email you a link; until you open
it your account exists but cannot do very much. The sign-up page waits for you and moves on by
itself once you have clicked the link, so you can leave it open in another tab. If the email
never turns up you can ask for another one.

Once you are confirmed you are asked to do one of two things: create a workspace, or join one
that has invited you with a code.

**A workspace is the whole desk.** It is not a folder or a project — it is the unit everything
else belongs to. Your colleagues are members of a workspace. Every conversation, every customer,
every help article belongs to one. So do the two things that let customers reach you: the widget
key that identifies your website to the chat panel, and the support email address. Create a
workspace and all of that comes into existence at once. The person who creates it is its first
admin.

You can belong to more than one workspace — an agency running support for two brands, say — and
switch between them. Only one is active at a time, and everything you see is the active one.

---

## 2. Adding your team

An admin invites people by email address, choosing whether each one joins as an **agent** or an
**admin**. We send them an email with a link and a short code. The code also appears on screen
straight after you send the invite, so you can copy it into a chat message if the email is slow.

The person you invited opens the link and sees which workspace it is for and who invited them,
then joins. They have to have an account and a confirmed email address first — if they are new
they sign up, confirm, and paste the code. The invite expires after a while, so send a fresh one
rather than chasing an old one.

There are two roles and the difference is small but important.

An **admin** can invite people, change anyone's role, remove people, and rename the workspace.
In the inbox, an admin sees every conversation in the workspace.

An **agent** cannot do any of the team management. In the inbox, an agent sees conversations
that are unassigned, plus conversations assigned to them. They do not see a conversation a
colleague has taken. This is the one thing that trips new teams up: if an agent says "the ticket
has disappeared", it has usually just been assigned to somebody else.

Everything else is the same for both. Agents reply, resolve, snooze, assign, and write and
publish help articles exactly as admins do.

Anyone can leave a workspace. If you are the last person in it, leaving deletes the workspace and
everything inside it. An admin cannot remove themselves from the members list — leaving is the
way out.

---

## 3. Putting the chat widget on your site

Every workspace has a **widget key** — a string beginning `wk_`. It says "this website is that
workspace" and nothing more. You paste one line of script onto your site:

```html
<script src="https://your-app-domain/widget.js" data-key="wk_your_key_here"></script> (your-app-domain = superprofintercom in this case)
```

That script adds a chat button in the bottom corner of every page it is on. Nothing else on your
site changes.

> **Known gap.** There is no screen in the product that shows you your widget key. Creating a
> workspace generates one, but today the only way to read it is out of the database. The same is
> true of your support email address, below. This is known and queued to be fixed; a settings
> screen showing both is the obvious home for it. Until then, someone with database access has to
> hand them to you once, at setup.

A customer clicks the button and the panel opens. The first thing they see is a short greeting
and a request for their name and email address. That is how a customer identifies themselves —
there is no account and no password. Giving an email is what lets us recognise the same person
later, including when they write in from their email client instead. Their browser is also
remembered, so a returning visitor on the same machine is picked up again without typing anything.

From there they see any conversations they have already had with you, and can open one to carry
on or start a new one. They type, and it arrives in your inbox. When you reply, it appears in
their panel while they are looking at it — no refresh. They can see when an agent is typing, and
you can see when they have read your reply.

---

## 4. Setting up email

Every workspace also gets a **support address**. It is derived from the workspace name, so a
workspace called Acme Support has an address starting `acme-support@`, at whichever mail domain
the platform is configured with. You do not create it and you cannot currently change it.

Point your public support address at it — usually by forwarding `support@yourcompany.com` to it,
or by publishing it directly. That is the whole setup. (The same caveat as the widget key
applies: nothing in the product shows you the address yet.)

When a customer emails that address, we look at who it was addressed to, work out which workspace
that is, and turn the email into a conversation in exactly the same inbox as your chat
conversations. The subject line becomes the conversation's subject. The sender becomes a
customer — and if that email address already belongs to a customer who has chatted with you, it
is the same person, not a second one. Automatic replies and out-of-office messages are recognised
and dropped rather than opening a conversation.

An agent replying to an email conversation writes it in the inbox like any other reply. It goes
out as an email from your support address, showing the agent's name and your workspace name as
the sender.

**When the customer replies to that reply, it lands back in the same conversation.** It does not
start a new one. We keep the invisible threading headers that email clients use, so the customer
can just hit reply, as many times as they like. Their quoted copy of your previous message is
stripped out, so the thread reads as a conversation rather than a growing stack of quotes.

Chat and email conversations sit side by side in one list. Apart from a marker showing which
channel a conversation came in on, you work them identically.

---

## 5. Working the inbox

The inbox is a list of conversations, newest activity first, with the conversation you have
opened beside it. You can narrow the list by channel and by who it is assigned to, and switch
between three views: **active**, **snoozed** and **resolved**.

**Picking one up.** Click a conversation to read it. Opening it marks it as read, so the unread
marker clears for you.

**Assignment.** A conversation starts with nobody on it. You can assign it to any member of the
team, reassign it, or take it off someone. You usually do not need to: **if you reply to an
unassigned conversation, it becomes yours automatically.** That is the normal way work gets
divided — whoever answers first owns it. Remember that assigning a conversation to yourself takes
it out of your agent colleagues' view.

**Replying.** You type a reply and send it. What the customer sees depends on where they came
from. A chat customer sees it appear in their panel immediately if they have it open, and sees an
unread marker next time they open it if they do not. An email customer gets an email. Either way
your reply is in the thread the moment you send it, and there is nothing else to do.

**Resolving.** When you are finished, resolve the conversation. It leaves the active list and
moves to the resolved view. You can resolve in one step by sending your last reply with "send and
resolve".

**A resolved conversation refuses replies.** This is deliberate and worth knowing before it
surprises you. If you try to reply to a resolved conversation the product will not let you — the
reply box is replaced by a note saying it is resolved, and a button to reopen it. Reopen it and
you can carry on as normal. The same applies to snoozing: you cannot snooze something that is
resolved.

**The customer can reopen it themselves, and this is the important part.** If a customer sends
another message into a resolved conversation — by typing in the chat panel, or by replying to the
email — it reopens automatically and comes back to the top of your active list. You never lose a
follow-up because someone closed the thread too early.

**Snoozing.** Sometimes you cannot finish now: you are waiting on a courier, or a customer has
gone quiet. Snooze the conversation for a few hours or until tomorrow and it disappears from the
active list until then, at which point it comes back. You can write a line before snoozing — "I
will chase this and come back to you tomorrow" — and it is sent to the customer first, then the
conversation is parked. Sending nothing leaves the customer with silence, so it is worth the one
line.

---

## 6. The AI summary

Beside each conversation there is a short summary of it. It is four or five lines: what the
customer is asking about, what the problem is, what they are trying to achieve, what has already
been tried, and where it stands right now.

It exists for one moment in particular — when you open a conversation that is not yours and is
forty messages long. Instead of reading it from the top you read five lines and you are caught
up. It is also what powers article suggestions, described below.

It updates itself. When new messages arrive it is rewritten shortly afterwards, and it updates
rather than starting again, so anything still true stays. It refreshes on the spot when you open
a conversation. A brand new conversation with one message in it usually has nothing worth
summarising yet, and says so.

**The conversation works completely without it.** The summary is written by an AI service that is
configured separately. If it is not configured, or it is having a bad day, no summary appears and
absolutely nothing else changes — messages, replies, assignment, resolving, email and the widget
all behave exactly the same. Treat it as a convenience, not a dependency.

---

## 7. Help articles and the help centre

You can write help articles inside the product. An article has a title and a body you write in a
normal editor. Save it and it is a **draft** — visible to your team, invisible to the world.
Publish it and it appears on your public help centre. You can move a published article back to a
draft at any time, and it disappears from the public site again.

The **help centre** is a public page listing everything you have published, with a search box.
Customers do not sign in. They search, open an article, read it, and — often — go away happy
without writing to you.

Your help centre lives at `/help/<your-workspace-name>` on the platform's own domain. **Custom
domains were designed but never built.** There is a place in the code where "which workspace does
this hostname belong to" would be answered, and today it always answers "none", so pointing
`help.yourcompany.com` at us does nothing. If you want the help centre to look like part of your
site, link to it from your site.

Articles can be grouped into categories, and the help centre shows them grouped when they are.
But there is no screen for creating a category or putting an article into one — new articles are
saved without a category and appear in an ungrouped list. Categories can only be set up through
the API today. Another known gap, in the same queue as the widget key screen.

**Pulling an article into a reply.** This is where the articles earn their keep. While you are
reading a conversation you can ask for suggestions, and you get a short list of published
articles that match what this customer is actually asking about — matched against the summary, so
it works on the meaning of the conversation rather than one keyword. You can also search for an
article by name if you already know the one you want. Click a suggestion and its public link is
dropped into your reply box, where you can write a sentence around it before sending. The
customer gets a real answer and a link to the long version.

---

## Trying it yourself

There is a live demo you can click through without installing anything.

**The app** is at `https://superprofintercom.aksht.dev`. Sign up with your own email address to
get a workspace of your own; you will be its admin. A new workspace has an empty inbox, so there
is a button in the empty inbox that fills it with a handful of realistic conversations — a mix of
chat and email, some assigned, some not — which is the quickest way to see the inbox working.
That button is a development convenience and is switched off in a production build.

**The demo shop page** is hosted at
`https://superprofintercom.aksht.dev/demo/?app=https://superprofintercom.aksht.dev`. The `?app=`
parameter is required because the page falls back to `localhost:3000` without it, so the plain
`/demo/` URL loads no widget. It is a stand-in for a customer's
website with the chat widget embedded, and it comes with a widget key already filled in, pointed
at the demo workspace called SuperProfile. Open it, click the chat button, give a name and email,
and send a message. It arrives in the SuperProfile inbox. There is also a box on that page for
pasting your own widget key, so once you have one you can watch your own messages arrive in your
own inbox.

**The help centre** for that demo workspace is at `/help/superprofile` — several published
articles across five categories. One honest note: on the deployed demo that page currently
returns "not found" even though the articles behind it are there and the API serves them
correctly. It is a deployment fault rather than a fault in the feature, and it is being looked
at.

**The demo workspace sign-ins** all share the password `superprofile-demo-2026`:
`ananya@superprofile.demo` (Ananya Sharma, admin), `rohan@superprofile.demo` (Rohan Verma, agent)
and `kavya@superprofile.demo` (Kavya Nair, agent). Signing up with your own email instead takes
about a minute and gives you a workspace you can break freely.
