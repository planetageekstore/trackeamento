import { z } from "zod";

/** Schema de um evento de origem enviado pelo tracker (browser). */
export const trackEventInputSchema = z.object({
  type: z.enum(["PAGE_VIEW", "WHATSAPP_CLICK", "CHECKOUT"]),
  occurred_at: z.string().datetime().optional(),
  url: z.string().url().optional(),
  referrer: z.string().optional().nullable(),
  utm: z
    .object({
      source: z.string().nullable().optional(),
      medium: z.string().nullable().optional(),
      campaign: z.string().nullable().optional(),
      content: z.string().nullable().optional(),
      term: z.string().nullable().optional(),
    })
    .optional(),
  click_ids: z
    .object({
      fbclid: z.string().nullable().optional(),
      gclid: z.string().nullable().optional(),
    })
    .optional(),
  data: z.record(z.unknown()).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventInputSchema>;

/** Corpo do POST /api/track. */
export const trackPayloadSchema = z.object({
  sk: z.string().min(8), // site key pública (pk_live_...)
  trk: z.string().regex(/^TRK-[A-Z0-9]+$/),
  events: z.array(trackEventInputSchema).min(1).max(50),
});
export type TrackPayload = z.infer<typeof trackPayloadSchema>;

/** Payload relevante do webhook `order/paid` da Nuvemshop (parcial). */
export const nuvemshopOrderPaidSchema = z.object({
  store_id: z.union([z.string(), z.number()]),
  event: z.literal("order/paid"),
  id: z.union([z.string(), z.number()]),
});
export type NuvemshopOrderPaid = z.infer<typeof nuvemshopOrderPaidSchema>;

/** Payload relevante do webhook `messages.upsert` da Evolution API (parcial). */
export const evolutionMessageSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      id: z.string(),
      fromMe: z.boolean(),
    }),
    message: z
      .object({
        conversation: z.string().optional(),
        extendedTextMessage: z.object({ text: z.string() }).optional(),
      })
      .optional(),
    messageTimestamp: z.union([z.string(), z.number()]).optional(),
  }),
});
export type EvolutionMessage = z.infer<typeof evolutionMessageSchema>;
