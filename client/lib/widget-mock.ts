export type MockMessage = {
  id: number;
  seq: number;
  from: "customer" | "agent";
  author: string | null;
  body: string;
  at: string;
};

export type MockThread = {
  id: number;
  subject: string;
  status: "open" | "resolved";
  unread: number;
  last_at: string;
  messages: MockMessage[];
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

export const MOCK_GREETING = "Hi! Ask us anything about kit, sizing or delivery.";

export const MOCK_THREADS: MockThread[] = [
  {
    id: 1,
    subject: "Are the Kestrel boots true to size?",
    status: "open",
    unread: 1,
    last_at: minutesAgo(4),
    messages: [
      {
        id: 1,
        seq: 1,
        from: "customer",
        author: null,
        body: "Are the Kestrel boots true to size? I'm usually a 9.",
        at: minutesAgo(12),
      },
      {
        id: 2,
        seq: 2,
        from: "agent",
        author: "Akshat",
        body: "They come up about half a size small, so I'd take the 9.5 in those.",
        at: minutesAgo(7),
      },
      {
        id: 3,
        seq: 3,
        from: "agent",
        author: "Akshat",
        body: "Happy to send both and you return the one that doesn't fit — returns are free.",
        at: minutesAgo(4),
      },
    ],
  },
  {
    id: 2,
    subject: "Where is order 4182?",
    status: "resolved",
    unread: 0,
    last_at: minutesAgo(60 * 26),
    messages: [
      {
        id: 4,
        seq: 1,
        from: "customer",
        author: null,
        body: "Where is order 4182? It said next day.",
        at: minutesAgo(60 * 30),
      },
      {
        id: 5,
        seq: 2,
        from: "agent",
        author: "Priya",
        body: "It went out this morning — the courier has it for delivery before 6pm today.",
        at: minutesAgo(60 * 26),
      },
    ],
  },
];
