import { Controller, Post, Body, HttpCode, HttpStatus, UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { QueryService } from './query.service';

class QueryRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  query: string;
}

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly queryService: QueryService) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async query(@Body() body: QueryRequestDto) {
    this.logger.log(`POST /analytics/query: "${body.query}"`);
    const result = await this.queryService.run(body.query);
    return result;
  }
}
