import assert from "node:assert/strict";
import { decideDeadLetter, runOnce } from "./marketplace_worker.js";
import { infrai } from "./infrai_client.js";

const valid = { orderId: "ord-7", sellerAsset: { assetId: "asset-2", downloadUrl: "https://seller.test/a" }, buyerUpdate: { email: "buyer@example.com", message: "Your order is ready" } };
assert.equal(decideDeadLetter(valid, 0), "ack");
assert.equal(decideDeadLetter(valid, 3), "dead-letter");
assert.equal(decideDeadLetter({ orderId: "ord-7" }, 0), "dead-letter");
console.log("dead-letter decision tests passed");

async function testRunOnce(): Promise<void> {
  const consume = infrai.queue.consume;
  const ack = infrai.queue.ack;
  const log = console.log;
  const acknowledged: string[] = [];
  const decisions: string[] = [];
  try {
    infrai.queue.consume = async () => ({ items: [
      { message_id: "first", payload: valid, delivery_count: 1 },
      { message_id: "third", payload: valid, delivery_count: 3 }
    ] });
    infrai.queue.ack = async (_queue, id) => { acknowledged.push(id); };
    console.log = (line: string) => { decisions.push(JSON.parse(line).decision); };
    await runOnce();
    assert.deepEqual(acknowledged, ["first"]);
    assert.deepEqual(decisions, ["ack", "dead-letter"]);
  } finally {
    infrai.queue.consume = consume;
    infrai.queue.ack = ack;
    console.log = log;
  }
  console.log("consume delivery-attempt tests passed");
}

testRunOnce().catch((error) => { console.error(error); process.exitCode = 1; });
