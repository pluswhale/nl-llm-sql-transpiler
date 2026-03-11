import { z } from 'zod';

export const QueryIntentSchema = z.object({
  intent: z.enum(['list_conversations', 'count_messages', 'search_conversations']),
  filters: z
    .object({
      status: z.enum(['open', 'closed', 'unanswered']).optional(),
      date_range: z
        .string()
        .regex(/^\d+[dhmw]$/)
        .optional(),
      tag: z.string().max(64).optional(),
      keyword: z.string().max(256).optional(),
      direction: z.enum(['sent', 'received']).optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;
