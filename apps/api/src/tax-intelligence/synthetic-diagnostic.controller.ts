import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Request, Response } from 'express';
import {
  organizationIdSchema,
  emptyQuerySchema,
  syntheticDiagnosticExecutionInputSchema,
  syntheticDiagnosticExecutionReceiptSchema,
  syntheticDiagnosticExecutionDetailSchema,
  syntheticDiagnosticExecutionInputOpenApiSchema,
  syntheticDiagnosticExecutionReceiptOpenApiSchema,
  syntheticDiagnosticExecutionDetailOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AuthService } from '../auth';
import { SyntheticDiagnosticExecutionService } from './application/synthetic-diagnostic-execution';

@Controller('organizations/:organizationId/synthetic-diagnostic-executions')
@ApiBearerAuth()
@ApiParam({
  name: 'organizationId',
  schema: { type: 'string', format: 'uuid' },
})
@ApiResponse({ status: 400, schema: apiErrorOpenApiSchema as SchemaObject })
@ApiResponse({ status: 401, schema: apiErrorOpenApiSchema as SchemaObject })
@ApiResponse({ status: 403, schema: apiErrorOpenApiSchema as SchemaObject })
@ApiResponse({ status: 503, schema: apiErrorOpenApiSchema as SchemaObject })
export class SyntheticDiagnosticController {
  constructor(
    private readonly auth: AuthService,
    private readonly diagnostics: SyntheticDiagnosticExecutionService,
  ) {}
  private async identity(request: Request, response: Response) {
    try {
      return await this.auth.verify(request.headers.authorization);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        response.setHeader('WWW-Authenticate', 'Bearer');
      throw error;
    }
  }
  private selectors(request: Request, organizationId: string) {
    if (
      !organizationIdSchema.safeParse(organizationId).success ||
      !emptyQuerySchema.safeParse(request.query).success
    )
      throw new BadRequestException();
  }
  @Post()
  @ApiBody({
    schema: syntheticDiagnosticExecutionInputOpenApiSchema as SchemaObject,
    description:
      'application/json only; maximum 1024 bytes, including chunked transport; no compression.',
  })
  @ApiResponse({
    status: 201,
    schema: syntheticDiagnosticExecutionReceiptOpenApiSchema as SchemaObject,
  })
  @ApiResponse({
    status: 200,
    description: 'Equivalent replay',
    schema: syntheticDiagnosticExecutionReceiptOpenApiSchema as SchemaObject,
  })
  @ApiResponse({ status: 404, schema: apiErrorOpenApiSchema as SchemaObject })
  @ApiResponse({ status: 413, schema: apiErrorOpenApiSchema as SchemaObject })
  @ApiResponse({ status: 415, schema: apiErrorOpenApiSchema as SchemaObject })
  async create(
    @Param('organizationId') organizationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(request, response);
    this.selectors(request, organizationId);
    if (
      !request.is('application/json') ||
      (request.headers['content-encoding'] &&
        request.headers['content-encoding'] !== 'identity')
    )
      throw new UnsupportedMediaTypeException();
    const input = syntheticDiagnosticExecutionInputSchema.safeParse(
      request.body,
    );
    if (!input.success || request.headers['idempotency-key'] !== undefined)
      throw new BadRequestException();
    let result;
    try {
      result = await this.diagnostics.create(identity, {
        organizationId,
        batchId: input.data.batchId,
        requestId: String(response.getHeader('x-request-id')),
      });
      if ('receipt' in result) {
        const receipt = syntheticDiagnosticExecutionReceiptSchema.parse(
          result.receipt,
        );
        response.status(result.status === 'created' ? 201 : 200);
        return receipt;
      }
    } catch {
      throw new ServiceUnavailableException();
    }
    if (result.status === 'denied') throw new ForbiddenException();
    throw new NotFoundException();
  }
  @Get(':executionId')
  @ApiParam({ name: 'executionId', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({
    status: 200,
    schema: syntheticDiagnosticExecutionDetailOpenApiSchema as SchemaObject,
  })
  @ApiResponse({ status: 404, schema: apiErrorOpenApiSchema as SchemaObject })
  async get(
    @Param('organizationId') organizationId: string,
    @Param('executionId') executionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(request, response);
    this.selectors(request, organizationId);
    if (
      !organizationIdSchema.safeParse(executionId).success ||
      request.headers['transfer-encoding'] !== undefined ||
      (request.headers['content-length'] !== undefined &&
        request.headers['content-length'] !== '0') ||
      request.body !== undefined
    )
      throw new BadRequestException();
    let result;
    try {
      result = await this.diagnostics.get(identity, {
        organizationId,
        executionId,
      });
      if (result.status === 'found')
        return syntheticDiagnosticExecutionDetailSchema.parse(result.execution);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (result.status === 'denied') throw new ForbiddenException();
    throw new NotFoundException();
  }
}
