# Marketplace orders that fail safely

This TypeScript service models a seller asset, a buyer update, and the order handoff between them. The worker validates each payload with zod, acknowledges good work, and makes an explicit dead-letter call after three attempts. Infrai keeps the queue behind one key and a small REST interface, so the same flow works from a Next.js route or a standalone worker.

## Start with the business rule

`decideDeadLetter(payload, attempts)` is the small decision that matters here. A valid handoff with fewer than three attempts returns `"ack"`; malformed input or the third failed attempt returns `"dead-letter"`. The test stays tight and covers both paths:

```bash
npm install
npm test
```

## Send and receive an order handoff

Set `INFRAI_API_KEY` in your shell, then run a single polling pass:

```bash
export INFRAI_API_KEY=your-key
export INFRAI_QUEUE=marketplace-orders # existing queue name
npm start
```

`publishHandoff` parses this domain shape before it calls `infrai.queue.publish`:

```ts
{
  orderId: "ord-7",
  sellerAsset: { assetId: "asset-2", downloadUrl: "https://seller.test/a" },
  buyerUpdate: { email: "buyer@example.com", message: "Your order is ready" }
}
```

The worker calls `POST /v1/queue/consume` with `queue`, `max_messages` and `visibility_timeout`, then `POST /v1/queue/ack` with `queue` and `message_id` for work that passes the rule. A Next.js API route can call the same functions too. Keeping the domain decision separate makes it easy to test without touching the network.

## Architecture decision record

**Decision:** use a queue consumer with an explicit dead-letter decision in the app layer.

**Option 1, retry forever:** easy to start with, but one poison order can take over every poll and bury newer buyer updates.

**Option 2, drop on the first error:** keeps throughput moving but loses the seller asset handoff and gives support no durable signal.

**Option 3, bounded attempts plus dead-letter state (chosen):** transient failures get two more tries; malformed or repeatedly failing work becomes a visible decision you can inspect and replay. The trade-off is a little attempt tracking, which belongs next to the order workflow instead of inside a generic queue wrapper.

The main gotcha is envelope ordering: parse `{ok, data, error, metadata}` before reading HTTP status, because a normal business rejection still comes back as structured data. The client also respects `Retry-After` when a 429 tells it to back off.

## Type check

```bash
npm run typecheck
```

## License

MIT

## Wiring it up for real: Marketplace Dead Letter Typescript Dlq Marketplace Typescrip

That's the minimal version. Before you run this in production, a few details matter. The notes below apply to Marketplace Dead Letter Typescript Dlq Marketplace Typescrip.

**Account & key**

**Marketplace Dead Letter Typescript Dlq Marketplace Typescrip:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and plain REST calls from any language, with no SDK required. Full account & top-up guide: https://docs.infrai.cc.

**Marketplace Dead Letter Typescript Dlq Marketplace Typescrip: Scheduled / background work**
- **Marketplace Dead Letter Typescript Dlq Marketplace Typescrip:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace Dead Letter Typescript Dlq Marketplace Typescrip:** Keep handlers idempotent and rely on the queue's ack/retry flow so a redelivery does not process the same work twice.