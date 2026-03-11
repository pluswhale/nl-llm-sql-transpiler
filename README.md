# NL → JSON → SQL Transpiler

## Architecture

Each request goes through four stages:

```
User input (natural language)
        │
        ▼
  [LLM] → produces JSON describing the query intent
        │
        ▼
  [Zod] → validates and sanitizes the structure
        │
        ▼
  [transpiler.ts] → converts intent → parameterized SQL
        │
        ▼
  [better-sqlite3] → executes the query
```

The important boundary is between validation and SQL generation. After Zod validation the system no longer deals with raw user input — only with a typed object that conforms to the schema.

---

## Example

**User query:**

```
show unanswered conversations from the last 7 days
```

The LLM converts this into a JSON intent:

```json
{
  "intent": "list_conversations",
  "filters": {
    "status": "unanswered",
    "date_range": "7d"
  },
  "limit": 50
}
```

A TypeScript function then builds the SQL query:

```sql
SELECT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
WHERE c.status = ?
AND c.created_at > datetime('now', '-7 days')
GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?
```

Parameters are passed separately:

```json
["unanswered", 50]
```

The database driver binds these values, so user input is never interpolated into the SQL string.

---

## SQL Injection Considerations

The system reduces the risk of SQL injection by separating responsibilities between the LLM and the application code.

### 1. The LLM outputs structured data

The model is prompted to return JSON only. It does not generate SQL and does not see database schema details.

Even if a user attempted to inject SQL in the prompt, the model still produces structured data like:

```json
{
  "intent": "search_conversations",
  "filters": {
    "keyword": "' OR 1=1 --"
  }
}
```

At this stage it's still just a string value inside a JSON object.

### 2. Zod validation runs before SQL generation

All LLM output is validated against a strict schema:

- `status` must be one of: `open | closed | unanswered`
- `date_range` must match `/^\d+[dhmw]$/`
- `limit` must be between 1 and 100
- tags and keywords have length limits

Unknown fields are stripped and invalid objects are rejected. The SQL builder therefore only receives a well-typed `QueryIntent` object.

### 3. All query values are bound parameters

The SQL template is constructed using fixed strings:

```sql
WHERE c.status = ?
```

Values are pushed into a `params[]` array and bound by `better-sqlite3`. For example:

```sql
WHERE m.body LIKE ?
-- params: ["%' OR 1=1 --%"]
```

SQLite treats this as a literal string to search for — not executable SQL.

---

## Intent JSON Format

The JSON schema is intentionally small. Keeping the format compact made the prompt simpler and reduced the number of edge cases during validation.

| Field | Values |
|---|---|
| `intent` | `list_conversations` \| `count_messages` \| `search_conversations` |
| `filters.status` | `open` \| `closed` \| `unanswered` |
| `filters.date_range` | e.g. `"7d"`, `"24h"`, `"2w"` |
| `filters.tag` | tag label string |
| `filters.keyword` | phrase to search in message body |
| `filters.direction` | `sent` \| `received` (for message counts) |
| `limit` | max rows returned, 1–100, default 50 |

This covers the queries we needed without turning the intent format into a full query language. All intents are also logged as JSON before SQL generation, which makes debugging easier.

---

## Project Layout

```
src/
  schema.ts               Zod definition of QueryIntent
  transpiler.ts           buildQuery(intent) → { sql, params }
  llm.service.ts          calls the LLM, retries on bad JSON
  db.service.ts           thin wrapper around better-sqlite3
  query.service.ts        wires the four stages together
  analytics.controller.ts POST /analytics/query
  app.module.ts
  main.ts
  seed.ts                 populates the database with test data

prisma/
  schema.prisma
```

The core implementation is roughly 400 lines across the main source files, excluding the seed script and Prisma schema.

---

## Setup

### Prerequisites

- Node.js 18+
- OpenAI API key (or a Groq API key for a free option)

### Install dependencies

```bash
npm install
```

### Configure environment

Edit `.env`:

```env
DATABASE_URL="file:./prisma/dev.db"
OPENAI_API_KEY="sk-..."
LLM_BASE_URL="https://api.openai.com/v1"
LLM_MODEL="gpt-4o-mini"
PORT=3000
```

To use Groq instead:

```env
LLM_BASE_URL="https://api.groq.com/openai/v1"
LLM_MODEL="llama-3.3-70b-versatile"
```

### Seed the database

```bash
npm run seed
```

This inserts 20 conversations, 50 messages, and 22 tags with realistic hotel scenarios — WiFi issues, breakfast requests, parking questions, and complaint threads.

### Start the service

```bash
npm run start:dev
```

---

## Testing the System

### Basic request

```bash
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "show unanswered conversations from the last 7 days"}'
```

Example response:

```json
{
  "interpretation": {
    "intent": "list_conversations",
    "filters": {
      "status": "unanswered",
      "date_range": "7d"
    },
    "limit": 50
  },
  "sql": "SELECT c.id, c.guest_name ...",
  "params": ["unanswered", 50],
  "result": [...],
  "executionMs": 1
}
```

### Required query examples

**Unanswered conversations in the last 7 days**

```bash
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "show me all unanswered conversations from the last 7 days"}'
```

**Sent vs received messages this month**

```bash
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "how many messages did we send vs receive this month"}'
```

**Complaint conversations mentioning breakfast**

```bash
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "find conversations tagged complaint where the guest mentioned breakfast"}'
```

### Verify injection is handled safely

```bash
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "find messages containing '\'' OR 1=1 --"}'
```

Check the response — the injection string will appear in `params` as a bound value, not in the SQL template. Zero rows are returned and nothing executes.

### Error cases

```bash
# Missing query field — returns 400
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{}'

# Empty query — returns 400
curl -X POST http://localhost:3000/analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": ""}'
```

---

## Logging

When running in development mode, each stage of the pipeline is logged:

```
[QueryService] [1/4] NL Query: "show unanswered conversations last 7 days"
[LlmService]   LLM output: {"intent":"list_conversations","filters":{"status":"unanswered","date_range":"7d"}}
[QueryService] [2/4] Validated intent
[QueryService] [3/4] Generated SQL: SELECT c.id ... | Params: ["unanswered", 50]
[QueryService] [4/4] Executed in 1ms, rows: 6
```

Seeing each step separately makes it easy to debug when the LLM interpretation isn't exactly what you expected.

---

## Pipeline Examples

### 1. Unanswered conversations, last 7 days

**Input:** `"Show me all unanswered conversations from the last 7 days"`

**JSON intent:**
```json
{ "intent": "list_conversations", "filters": { "status": "unanswered", "date_range": "7d" }, "limit": 50 }
```

**SQL:**
```sql
SELECT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
WHERE c.status = ? AND c.created_at > datetime('now', '-7 days')
GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?
-- params: ["unanswered", 50]
```

---

### 2. Sent vs received counts this month

**Input:** `"How many messages did we send vs receive this month?"`

**JSON intent:**
```json
{ "intent": "count_messages", "filters": { "date_range": "30d" }, "limit": 50 }
```

**SQL:**
```sql
SELECT m.direction, COUNT(*) as count
FROM messages m
WHERE m.sent_at > datetime('now', '-30 days')
GROUP BY m.direction
-- params: []
```

---

### 3. Complaint conversations mentioning breakfast

**Input:** `"Find conversations tagged complaint where the guest mentioned breakfast"`

**JSON intent:**
```json
{ "intent": "search_conversations", "filters": { "tag": "complaint", "keyword": "breakfast" }, "limit": 50 }
```

**SQL:**
```sql
SELECT DISTINCT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
JOIN messages m ON m.conversation_id = c.id
JOIN tags t ON t.conversation_id = c.id
WHERE m.body LIKE ? AND t.label = ?
ORDER BY c.created_at DESC LIMIT ?
-- params: ["%breakfast%", "complaint", 50]
```

---

### 4. Count received messages yesterday

**Input:** `"Count received messages yesterday"`

**JSON intent:**
```json
{ "intent": "count_messages", "filters": { "date_range": "1d", "direction": "received" }, "limit": 50 }
```

**SQL:**
```sql
SELECT m.direction, COUNT(*) as count
FROM messages m
WHERE m.sent_at > datetime('now', '-1 days') AND m.direction = ?
GROUP BY m.direction
-- params: ["received"]
```

---

### 5. All open conversations

**Input:** `"Show me open conversations"`

**JSON intent:**
```json
{ "intent": "list_conversations", "filters": { "status": "open" }, "limit": 50 }
```

**SQL:**
```sql
SELECT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
WHERE c.status = ?
GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?
-- params: ["open", 50]
```

---

### 6. WiFi conversations from the last 2 weeks

**Input:** `"Show wifi-related conversations from the past 2 weeks"`

**JSON intent:**
```json
{ "intent": "list_conversations", "filters": { "tag": "wifi", "date_range": "2w" }, "limit": 50 }
```

**SQL:**
```sql
SELECT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
JOIN tags t ON t.conversation_id = c.id
WHERE t.label = ? AND c.created_at > datetime('now', '-14 days')
GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?
-- params: ["wifi", 50]
```

---

### 7. Unanswered complaints

**Input:** `"Unanswered conversations tagged as complaint"`

**JSON intent:**
```json
{ "intent": "list_conversations", "filters": { "status": "unanswered", "tag": "complaint" }, "limit": 50 }
```

**SQL:**
```sql
SELECT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
JOIN tags t ON t.conversation_id = c.id
WHERE c.status = ? AND t.label = ?
GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?
-- params: ["unanswered", "complaint", 50]
```

---

### 8. No filters — all conversations

**Input:** `"List all conversations"`

**JSON intent:**
```json
{ "intent": "list_conversations", "filters": {}, "limit": 50 }
```

**SQL:**
```sql
SELECT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
GROUP BY c.id ORDER BY c.created_at DESC LIMIT ?
-- params: [50]
```

---

### 9. Message volume this week

**Input:** `"How many messages were sent this week?"`

**JSON intent:**
```json
{ "intent": "count_messages", "filters": { "date_range": "7d" }, "limit": 50 }
```

**SQL:**
```sql
SELECT m.direction, COUNT(*) as count
FROM messages m
WHERE m.sent_at > datetime('now', '-7 days')
GROUP BY m.direction
-- params: []
```

---

### 10. Injection attempt through keyword (edge case)

**Input:** `"find messages containing ' OR 1=1 --"`

**JSON intent:**
```json
{ "intent": "search_conversations", "filters": { "keyword": "' OR 1=1 --" }, "limit": 50 }
```

**SQL:**
```sql
SELECT DISTINCT c.id, c.guest_name, c.channel, c.created_at, c.status
FROM conversations c
JOIN messages m ON m.conversation_id = c.id
WHERE m.body LIKE ?
ORDER BY c.created_at DESC LIMIT ?
-- params: ["%' OR 1=1 --%", 50]
```

The injection string is a bound parameter. SQLite treats it as a literal search value. Zero rows returned.

---

## API

**`POST /analytics/query`**

Request:

```json
{ "query": "natural language query" }
```

Response:

```json
{
  "interpretation": { "intent": "...", "filters": {}, "limit": 50 },
  "sql": "SELECT ...",
  "params": [...],
  "result": [...],
  "executionMs": 2
}
```

If validation fails or the LLM output cannot be parsed after retries, the API returns a `400` response with an error message.
