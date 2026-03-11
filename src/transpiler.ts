import { QueryIntent } from './schema';

export interface CompiledQuery {
  sql: string;
  params: (string | number)[];
}

const DATE_RANGE_MAP: Record<string, string> = {
  d: 'days',
  h: 'hours',
  m: 'minutes',
  w: 'days',
};

function parseDateRange(range: string): string {
  const unit = range.slice(-1);
  const value = parseInt(range.slice(0, -1), 10);
  const sqlUnit = DATE_RANGE_MAP[unit] ?? 'days';
  const multiplier = unit === 'w' ? value * 7 : value;
  return `datetime('now', '-${multiplier} ${sqlUnit}')`;
}

export function buildQuery(intent: QueryIntent): CompiledQuery {
  const filters = intent.filters ?? {};
  const params: (string | number)[] = [];

  if (intent.intent === 'count_messages') {
    return buildCountMessages(filters, params);
  }

  if (intent.intent === 'search_conversations') {
    return buildSearchConversations(filters, params, intent.limit);
  }

  return buildListConversations(filters, params, intent.limit);
}

function buildListConversations(
  filters: QueryIntent['filters'],
  params: (string | number)[],
  limit: number,
): CompiledQuery {
  const conditions: string[] = [];

  let sql = `SELECT c.id, c.guest_name, c.channel, c.created_at, c.status`;

  const needsTagJoin = filters?.tag !== undefined;
  const needsMsgJoin = false;

  sql += ` FROM conversations c`;

  if (needsTagJoin) {
    sql += ` JOIN tags t ON t.conversation_id = c.id`;
  }

  if (filters?.status) {
    conditions.push(`c.status = ?`);
    params.push(filters.status);
  }

  if (filters?.date_range) {
    conditions.push(`c.created_at > ${parseDateRange(filters.date_range)}`);
  }

  if (filters?.tag) {
    conditions.push(`t.label = ?`);
    params.push(filters.tag);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(` AND `);
  }

  sql += ` GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?`;
  params.push(limit);

  return { sql, params };
}

function buildSearchConversations(
  filters: QueryIntent['filters'],
  params: (string | number)[],
  limit: number,
): CompiledQuery {
  const conditions: string[] = [];

  let sql = `SELECT DISTINCT c.id, c.guest_name, c.channel, c.created_at, c.status`;
  sql += ` FROM conversations c`;

  const needsTagJoin = filters?.tag !== undefined;
  const needsMsgJoin = filters?.keyword !== undefined;

  if (needsMsgJoin) {
    sql += ` JOIN messages m ON m.conversation_id = c.id`;
  }
  if (needsTagJoin) {
    sql += ` JOIN tags t ON t.conversation_id = c.id`;
  }

  if (filters?.status) {
    conditions.push(`c.status = ?`);
    params.push(filters.status);
  }

  if (filters?.date_range) {
    conditions.push(`c.created_at > ${parseDateRange(filters.date_range)}`);
  }

  if (filters?.keyword) {
    conditions.push(`m.body LIKE ?`);
    params.push(`%${filters.keyword}%`);
  }

  if (filters?.tag) {
    conditions.push(`t.label = ?`);
    params.push(filters.tag);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(` AND `);
  }

  sql += ` ORDER BY c.created_at DESC LIMIT ?`;
  params.push(limit);

  return { sql, params };
}

function buildCountMessages(
  filters: QueryIntent['filters'],
  params: (string | number)[],
): CompiledQuery {
  const conditions: string[] = [];

  let sql = `SELECT m.direction, COUNT(*) as count FROM messages m`;

  if (filters?.date_range) {
    conditions.push(`m.sent_at > ${parseDateRange(filters.date_range)}`);
  }

  if (filters?.direction) {
    conditions.push(`m.direction = ?`);
    params.push(filters.direction);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(` AND `);
  }

  sql += ` GROUP BY m.direction`;

  return { sql, params };
}
