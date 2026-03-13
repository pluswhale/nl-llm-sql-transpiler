import { z } from 'zod';

export const ALLOWED_FIELDS = [
  'c.id',
  'c.status',
  'c.channel',
  'c.guest_name',
  'c.created_at',
  'm.direction',
  'm.body',
  'm.sent_at',
  't.label',
] as const;

export type AllowedField = (typeof ALLOWED_FIELDS)[number];

const SORT_FIELDS = [...ALLOWED_FIELDS, 'count', 'incoming_count'] as const;

const FilterSchema = z.object({
  field: z.enum(ALLOWED_FIELDS),
  op: z.enum(['eq', 'neq', 'in', 'like', 'starts_with', 'ends_with', 'gte', 'lte', 'not_exists']),
  value: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
});

export const QueryIntentSchema = z.object({
  action: z.enum(['list', 'count']),
  target: z.enum(['conversations', 'messages']),
  filters: z.array(FilterSchema).default([]),
  group_by: z.enum(ALLOWED_FIELDS).optional(),
  sort_by: z.enum(SORT_FIELDS).optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.number().int().min(1).max(100).default(50),
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;
export type QueryFilter = z.infer<typeof FilterSchema>;
