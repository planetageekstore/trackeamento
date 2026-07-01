import { Queue, Worker, type Processor } from "bullmq";
import IORedis from "ioredis";
import { env } from "./supabase.js";
import type { EvolutionMessage } from "@trk/shared/schemas";

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const MESSAGE_QUEUE = "wa-messages";

/** Payload enfileirado a cada mensagem de entrada da Evolution. */
export interface InboundMessageJob {
  instance: string;
  message: EvolutionMessage["data"];
}

export const messageQueue = new Queue<InboundMessageJob>(MESSAGE_QUEUE, { connection });

/** Backoff exponencial com teto de 60s (usado por ambas as filas). */
const backoffStrategy = (attempts: number) => Math.min(1000 * 2 ** attempts, 60_000);

/** Registra o consumidor da fila de mensagens (retry com backoff exponencial). */
export function startMessageWorker(processor: Processor<InboundMessageJob>): Worker<InboundMessageJob> {
  return new Worker<InboundMessageJob>(MESSAGE_QUEUE, processor, {
    connection,
    settings: { backoffStrategy },
  });
}

export const DISPATCH_QUEUE = "wa-dispatch";

/** Job de envio de conversão server-side (US5). */
export interface DispatchJob {
  eventId: string;
}

export const dispatchQueue = new Queue<DispatchJob>(DISPATCH_QUEUE, { connection });

/** Enfileira o envio de conversão de um evento atribuído. */
export async function enqueueDispatch(eventId: string): Promise<void> {
  await dispatchQueue.add(
    "dispatch",
    { eventId },
    { attempts: 5, backoff: { type: "custom" }, removeOnComplete: 1000, removeOnFail: 5000 },
  );
}

export function startDispatchWorker(processor: Processor<DispatchJob>): Worker<DispatchJob> {
  return new Worker<DispatchJob>(DISPATCH_QUEUE, processor, {
    connection,
    settings: { backoffStrategy },
  });
}
