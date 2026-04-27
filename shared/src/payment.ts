import { z } from 'zod';

/**
 * One line of a payment, with the unit price *frozen* at the moment of
 * payment. Prior payments never re-price when the agreement's pricing rules
 * change.
 */
export const PaymentLineItemSchema = z.object({
  achievementKey: z.string().min(1),
  unitPriceAtPayment: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  description: z.string(),
});
export type PaymentLineItem = z.infer<typeof PaymentLineItemSchema>;

export const PaymentSchema = z.object({
  paymentId: z.string().min(1),
  paidAt: z.string(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  note: z.string().optional(),
  lineItems: z.array(PaymentLineItemSchema).min(1),
});
export type Payment = z.infer<typeof PaymentSchema>;
