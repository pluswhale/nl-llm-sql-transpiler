import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { LlmService } from './llm.service';
import { DbService } from './db.service';
import { QueryIntentSchema, QueryIntent } from './schema';
import { buildQuery } from './transpiler';

export interface QueryPipelineResult {
  interpretation: QueryIntent;
  sql: string;
  params: (string | number)[];
  result: Record<string, unknown>[];
  executionMs: number;
}

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly db: DbService,
  ) {}

  async run(naturalLanguage: string): Promise<QueryPipelineResult> {
    this.logger.log(`[1/4] NL Query: "${naturalLanguage}"`);

    const raw = await this.llm.parseIntent(naturalLanguage);

    const parsed = QueryIntentSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.error(`[2/4] Schema validation failed: ${JSON.stringify(parsed.error.issues)}`);
      throw new BadRequestException({
        message: 'LLM produced an intent that failed schema validation',
        issues: parsed.error.issues,
      });
    }

    const intent = parsed.data;
    this.logger.log(`[2/4] Validated intent: ${JSON.stringify(intent)}`);

    const { sql, params } = buildQuery(intent);
    this.logger.log(`[3/4] Generated SQL: ${sql} | Params: ${JSON.stringify(params)}`);

    const start = Date.now();
    const result = this.db.execute(sql, params);
    const executionMs = Date.now() - start;

    this.logger.log(`[4/4] Executed in ${executionMs}ms, rows: ${result.length}`);

    return { interpretation: intent, sql, params, result, executionMs };
  }
}
