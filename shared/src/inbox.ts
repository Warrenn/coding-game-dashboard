import { z } from 'zod';

export const InboxEntrySchema = z.object({
  /** ISO timestamp + suffix; doubles as DDB sort key. */
  eventId: z.string(),
  subject: z.string(),
  message: z.string(),
  /** Optional reference into the ledger (requestId, paymentId). */
  refId: z.string().nullable().optional(),
});
export type InboxEntry = z.infer<typeof InboxEntrySchema>;
