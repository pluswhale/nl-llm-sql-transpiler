import { QueryIntent, QueryFilter } from './schema';

export interface CompiledQuery {
  sql: string;
  params: (string | number)[];
}

const MSG_FIELDS = new Set(['m.direction', 'm.body', 'm.sent_at']);
const TAG_FIELDS = new Set(['t.label']);


interface JoinFlags {
  needsMsg: boolean;
  needsTag: boolean;
  needsConv: boolean;
}

function tableOf(field: string): string {
  return field.split('.')[0];
}

function resolveJoins(intent: QueryIntent): JoinFlags {
  const joinDriving = intent.filters.filter((f) => f.op !== 'not_exists');
  const tables = new Set([
    ...joinDriving.map((f) => tableOf(f.field)),
    ...(intent.group_by ? [tableOf(intent.group_by)] : []),
  ]);

  return { needsMsg: tables.has('m'), needsTag: tables.has('t'), needsConv: tables.has('c') };
}


function selectClause(intent: QueryIntent): string {
  if (intent.action === 'list') {
    return intent.target === 'conversations'
      ? 'SELECT c.id, c.guest_name, c.channel, c.status, c.created_at'
      : 'SELECT m.id, m.conversation_id, m.direction, m.body, m.sent_at';
  }

  const countExpr = intent.target === 'conversations' ? 'COUNT(DISTINCT c.id)' : 'COUNT(m.id)';
  return intent.group_by
    ? `SELECT ${intent.group_by}, ${countExpr} AS count`
    : `SELECT ${countExpr} AS count`;
}

function fromClause(intent: QueryIntent): string {
  return intent.target === 'conversations' ? 'FROM conversations c' : 'FROM messages m';
}

function joinClauses(intent: QueryIntent, joins: JoinFlags): string[] {
  const clauses: string[] = [];

  if (intent.target === 'conversations') {
    if (joins.needsMsg) clauses.push('LEFT JOIN messages m ON m.conversation_id = c.id');
    if (joins.needsTag) clauses.push('LEFT JOIN tags t ON t.conversation_id = c.id');
  } else {
    if (joins.needsConv) clauses.push('JOIN conversations c ON c.id = m.conversation_id');
    if (joins.needsTag) clauses.push('JOIN tags t ON t.conversation_id = m.conversation_id');
  }

  return clauses;
}

function notExistsClause(filter: QueryFilter, params: (string | number)[]): string {
  const { field, value } = filter;

  if (MSG_FIELDS.has(field)) {
    if (value !== undefined) {
      params.push(value as string);
      return `NOT EXISTS (SELECT 1 FROM messages sub_m WHERE sub_m.conversation_id = c.id AND sub_m.direction = ?)`;
    }
    return `NOT EXISTS (SELECT 1 FROM messages sub_m WHERE sub_m.conversation_id = c.id)`;
  }

  if (TAG_FIELDS.has(field)) {
    if (value !== undefined) {
      params.push(value as string);
      return `NOT EXISTS (SELECT 1 FROM tags sub_t WHERE sub_t.conversation_id = c.id AND sub_t.label = ?)`;
    }
    return `NOT EXISTS (SELECT 1 FROM tags sub_t WHERE sub_t.conversation_id = c.id)`;
  }

  throw new Error(`not_exists is not supported for field: ${field}`);
}

function filterToCondition(filter: QueryFilter, params: (string | number)[]): string {
  const { field, op, value } = filter;

  switch (op) {
    case 'eq':          params.push(value as string | number); return `${field} = ?`;
    case 'neq':         params.push(value as string | number); return `${field} != ?`;
    case 'gte':         params.push(value as string | number); return `${field} >= ?`;
    case 'lte':         params.push(value as string | number); return `${field} <= ?`;
    case 'like':        params.push(`%${value}%`);             return `${field} LIKE ?`;
    case 'starts_with': params.push(`${value}%`);              return `${field} LIKE ?`;
    case 'ends_with':   params.push(`%${value}`);              return `${field} LIKE ?`;
    case 'in': {
      const arr = value as string[];
      arr.forEach((v) => params.push(v));
      return `${field} IN (${arr.map(() => '?').join(', ')})`;
    }
    case 'not_exists':
      return notExistsClause(filter, params);
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown operator: ${_exhaustive}`);
    }
  }
}

function whereClause(filters: QueryFilter[], params: (string | number)[]): string | null {
  if (filters.length === 0) return null;
  const conditions = filters.map((f) => filterToCondition(f, params));
  return 'WHERE ' + conditions.join('\n  AND ');
}

function groupByClause(intent: QueryIntent, joins: JoinFlags): string | null {
  if (intent.action === 'list' && intent.target === 'conversations' && (joins.needsMsg || joins.needsTag)) {
    return 'GROUP BY c.id';
  }
  if (intent.action === 'count' && intent.group_by) {
    return `GROUP BY ${intent.group_by}`;
  }
  return null;
}

function orderByClause(intent: QueryIntent): string | null {
  const dir = intent.sort_order.toUpperCase();

  if (intent.sort_by === 'incoming_count') {
    return `ORDER BY (SELECT COUNT(*) FROM messages sub_m WHERE sub_m.conversation_id = c.id AND sub_m.direction = 'received') ${dir}`;
  }
  if (intent.sort_by === 'count') return `ORDER BY count ${dir}`;
  if (intent.sort_by)             return `ORDER BY ${intent.sort_by} ${dir}`;

  if (intent.action === 'list') {
    const defaultField = intent.target === 'conversations' ? 'c.created_at' : 'm.sent_at';
    return `ORDER BY ${defaultField} DESC`;
  }

  return null;
}


export function buildQuery(intent: QueryIntent): CompiledQuery {
  const params: (string | number)[] = [];
  const joins = resolveJoins(intent);

  const sql = [
    selectClause(intent),
    fromClause(intent),
    ...joinClauses(intent, joins),
    whereClause(intent.filters, params),
    groupByClause(intent, joins),
    orderByClause(intent),
    'LIMIT ?',
  ]
    .filter((clause): clause is string => clause !== null)
    .join('\n');

  params.push(intent.limit);

  return { sql, params };
}
