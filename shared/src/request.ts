import { z } from 'zod';

export const PaymentRequestStatusSchema = z.enum(['PENDING', 'PAID', 'CANCELLED']);
export type PaymentRequestStatus = z.infer<typeof PaymentRequestStatusSchema>;

export const PaymentRequestSchema = z.object({
  requestId: z.string().min(1),
  requestedAt: z.string(),
  achievementKeys: z.array(z.string().min(1)).min(1),
  totalAmount: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  note: z.string().optional(),
  status: PaymentRequestStatusSchema,
});
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;
