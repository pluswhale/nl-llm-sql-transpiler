import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsController } from './analytics.controller';
import { QueryService } from './query.service';
import { LlmService } from './llm.service';
import { DbService } from './db.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AnalyticsController],
  providers: [QueryService, LlmService, DbService],
})
export class AppModule {}
