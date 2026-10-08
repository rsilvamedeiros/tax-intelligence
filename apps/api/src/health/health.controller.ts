import { Controller, Get, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiProperty,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { HealthResponse } from '@tax/contracts';
import { HealthService } from './health.service';
class HealthChecksDto {
  @ApiProperty({ enum: ['up', 'down', 'not_configured'] }) database!: string;
}
class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'] }) status!: string;
  @ApiProperty({ enum: ['tax-intelligence-api'] }) service!: string;
  @ApiProperty({ type: HealthChecksDto, required: false })
  checks?: HealthChecksDto;
}
@ApiTags('operations')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get('live')
  @ApiOperation({ summary: 'Verifica se o processo está ativo' })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  live(): HealthResponse {
    return this.health.live();
  }
  @Get('ready')
  @ApiOperation({
    summary:
      'Verifica dependências configuradas; bootstrap permite banco ausente',
  })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  @ApiResponse({ status: 503, type: HealthResponseDto })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const result = await this.health.ready();
    if (result.status === 'error') response.status(503);
    return result;
  }
}
