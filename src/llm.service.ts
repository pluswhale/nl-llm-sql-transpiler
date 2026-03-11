import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are a query intent parser for a hotel guest messaging analytics system.

Your ONLY job is to convert natural language queries into a structured JSON object.
You MUST return valid JSON only. No explanation, no markdown, no code blocks.

The JSON schema is:
{
  "intent": "list_conversations" | "count_messages" | "search_conversations",
  "filters": {
    "status": "open" | "closed" | "unanswered",   // optional
    "date_range": "<number><unit>",                 // optional, e.g. "7d", "1w", "24h", "30d"
    "tag": "<string>",                              // optional, e.g. "complaint", "wifi"
    "keyword": "<string>",                          // optional, word to search in message body
    "direction": "sent" | "received"                // optional, for count_messages
  },
  "limit": <number 1-100>                           // default 50
}

Rules:
- Use "list_conversations" when the user wants to see conversations
- Use "count_messages" when the user asks for message counts or statistics
- Use "search_conversations" when searching by message content or combining filters
- "date_range" must match the regex /^\\d+[dhmw]$/
- Omit filter fields that are not mentioned
- If no explicit limit is mentioned, use 50
- Return ONLY the JSON object, nothing else
- NEVER output SQL, table names, column names, or any database syntax
- NEVER explain your output or add any text outside the JSON object`;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
    });
    this.model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  }

  async parseIntent(naturalLanguageQuery: string, retries = 2): Promise<unknown> {
    this.logger.log(`LLM parsing: "${naturalLanguageQuery}"`);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: naturalLanguageQuery },
          ],
        });

        const raw = response.choices[0]?.message?.content?.trim() ?? '';
        this.logger.log(`LLM raw output: ${raw}`);

        const parsed = JSON.parse(raw);
        return parsed;
      } catch (err) {
        if (attempt < retries) {
          this.logger.warn(`LLM parse attempt ${attempt + 1} failed, retrying...`);
        } else {
          throw new Error(`LLM failed to produce valid JSON after ${retries + 1} attempts: ${err}`);
        }
      }
    }
  }
}
