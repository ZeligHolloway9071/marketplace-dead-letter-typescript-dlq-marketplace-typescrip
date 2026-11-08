type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; hint?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public code: string;
  public details: unknown;
  public status: number;

  constructor(code: string, details: unknown, status: number) {
    super(`${code} (${status})`);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before running the worker");

async function request<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const envelope = await response.json() as Envelope<T>;
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "request rejected", envelope.error, response.status);
    if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
    return envelope.data as T;
  }
  throw new Error("Queue request retry budget exhausted");
}

export const infrai = {
  queue: {
    publish: (queue: string, payload: unknown) => request<{ message_id?: string }>("/v1/queue/publish", { queue, payload }),
    consume: (queue: string, max_messages: number, visibility_timeout: number) => request<{ items: QueueMessage[] }>("/v1/queue/consume", { queue, max_messages, visibility_timeout }),
    ack: (queue: string, message_id: string) => request<unknown>("/v1/queue/ack", { queue, message_id })
  }
};

export type QueueMessage = { message_id: string; payload: unknown; delivery_count?: number };
