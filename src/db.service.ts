import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private db: Database.Database;

  onModuleInit() {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? './prisma/dev.db';
    const resolved = path.resolve(process.cwd(), dbPath.replace(/^\.\//, ''));
    const dir = path.dirname(resolved);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.logger.log(`SQLite connected: ${resolved}`);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  execute<T = Record<string, unknown>>(sql: string, params: (string | number)[]): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  run(sql: string, params: (string | number)[] = []): Database.RunResult {
    return this.db.prepare(sql).run(...params);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
