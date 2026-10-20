import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Request, Response } from 'express';
import {
  organizationIdSchema,
  emptyQuerySchema,
  syntheticDocumentBatchInputSchema,
  syntheticDocumentIdempotencyKeySchema,
  syntheticDocumentBatchReceiptSchema,
  syntheticDocumentBatchDetailSchema,
  syntheticDocumentBatchInputOpenApiSchema,
  syntheticDocumentBatchReceiptOpenApiSchema,
  syntheticDocumentBatchDetailOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AuthService } from '../auth';
import { SyntheticBatchService } from './synthetic-batch.service';

@Controller('organizations/:organizationId/synthetic-document-batches')
@ApiBearerAuth()
@ApiParam({
  name: 'organizationId',
  schema: { type: 'string', format: 'uuid' },
})
@ApiResponse({ status: 400, schema: apiErrorOpenApiSchema as SchemaObject })
@ApiResponse({ status: 401, schema: apiErrorOpenApiSchema as SchemaObject })
@ApiResponse({ status: 403, schema: apiErrorOpenApiSchema as SchemaObject })
@ApiResponse({ status: 503, schema: apiErrorOpenApiSchema as SchemaObject })
export class SyntheticBatchController {
  constructor(
    private readonly auth: AuthService,
    private readonly repository: SyntheticBatchService,
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
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: {
      type: 'string',
      format: 'uuid',
      description:
        'Exactly one UUIDv4; scoped to organization and verified actor.',
    },
  })
  @ApiBody({
    schema: syntheticDocumentBatchInputOpenApiSchema as SchemaObject,
    description:
      'application/json only; maximum 16384 bytes, including chunked transport; no compression.',
  })
  @ApiResponse({
    status: 201,
    schema: syntheticDocumentBatchReceiptOpenApiSchema as SchemaObject,
  })
  @ApiResponse({
    status: 200,
    description: 'Equivalent replay',
    schema: syntheticDocumentBatchReceiptOpenApiSchema as SchemaObject,
  })
  @ApiResponse({ status: 409, schema: apiErrorOpenApiSchema as SchemaObject })
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
    const keyHeaders = request.rawHeaders.filter(
      (header, index) =>
        index % 2 === 0 && header.toLowerCase() === 'idempotency-key',
    );
    const key = syntheticDocumentIdempotencyKeySchema.safeParse(
      request.headers['idempotency-key'],
    );
    const input = syntheticDocumentBatchInputSchema.safeParse(request.body);
    if (keyHeaders.length !== 1 || !key.success || !input.success)
      throw new BadRequestException();
    let result;
    try {
      result = await this.repository.create({
        identity,
        organizationId,
        input: input.data,
        idempotencyKey: key.data,
        requestId: String(response.getHeader('x-request-id')),
      });
      if ('receipt' in result) {
        const receipt = syntheticDocumentBatchReceiptSchema.parse(
          result.receipt,
        );
        response.status(result.status === 'created' ? 201 : 200);
        return receipt;
      }
    } catch {
      throw new ServiceUnavailableException();
    }
    if (result.status === 'denied') throw new ForbiddenException();
    throw new ConflictException();
  }
  @Get(':batchId')
  @ApiParam({ name: 'batchId', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({
    status: 200,
    schema: syntheticDocumentBatchDetailOpenApiSchema as SchemaObject,
  })
  @ApiResponse({ status: 404, schema: apiErrorOpenApiSchema as SchemaObject })
  async get(
    @Param('organizationId') organizationId: string,
    @Param('batchId') batchId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(request, response);
    this.selectors(request, organizationId);
    if (
      !organizationIdSchema.safeParse(batchId).success ||
      request.headers['transfer-encoding'] !== undefined ||
      (request.headers['content-length'] !== undefined &&
        request.headers['content-length'] !== '0') ||
      request.body !== undefined
    )
      throw new BadRequestException();
    let result;
    try {
      result = await this.repository.get({ identity, organizationId, batchId });
      if (result.status === 'found')
        return syntheticDocumentBatchDetailSchema.parse(result.batch);
    } catch {
      throw new ServiceUnavailableException();
    }
    if (result.status === 'denied') throw new ForbiddenException();
    throw new NotFoundException();
  }
}
