import { z } from "zod";
import { infrai, InfraiError, type QueueMessage } from "./infrai_client.js";

const queue = process.env.INFRAI_QUEUE ?? "marketplace-orders";

export const orderHandoff = z.object({
  orderId: z.string().min(1),
  sellerAsset: z.object({ assetId: z.string(), downloadUrl: z.string().url() }),
  buyerUpdate: z.object({ email: z.string().email(), message: z.string().min(1) })
});
export type OrderHandoff = z.infer<typeof orderHandoff>;

export function decideDeadLetter(input: unknown, attempts: number): "ack" | "dead-letter" {
  const parsed = orderHandoff.safeParse(input);
  return parsed.success && attempts < 3 ? "ack" : "dead-letter";
}

export async function publishHandoff(input: unknown): Promise<string | undefined> {
  const handoff = orderHandoff.parse(input);
  const result = await infrai.queue.publish(queue, handoff);
  return result.message_id;
}

export async function processMessage(message: QueueMessage, attempts: number): Promise<"ack" | "dead-letter"> {
  const decision = decideDeadLetter(message.payload, attempts);
  if (decision === "ack") await infrai.queue.ack(queue, message.message_id);
  return decision;
}

export async function runOnce(): Promise<void> {
  const result = await infrai.queue.consume(queue, 10, 30);
  for (const message of result.items) {
    try {
      const decision = await processMessage(message, message.delivery_count ?? 0);
      console.log(JSON.stringify({ orderId: (message.payload as { orderId?: string }).orderId, decision }));
    } catch (error) {
      if (error instanceof InfraiError) console.error(error.code);
      else throw error;
    }
  }
}

if (process.argv[1]?.endsWith("marketplace_worker.ts")) {
  runOnce().catch((error) => { console.error(error); process.exitCode = 1; });
}
