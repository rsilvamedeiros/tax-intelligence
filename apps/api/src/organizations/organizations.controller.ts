import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Query,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  organizationContextSchema,
  organizationPageSchema,
  organizationQuerySchema,
  organizationIdSchema,
  emptyQuerySchema,
  organizationPageOpenApiSchema,
  organizationContextOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AuthService } from '../auth';
import {
  MembershipDenied,
  OrganizationsService,
} from './organizations.service';

@Controller('organizations')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'Invalid organization selector or pagination',
  schema: apiErrorOpenApiSchema as SchemaObject,
})
@ApiUnauthorizedResponse({
  description: 'Missing or invalid access token',
  schema: apiErrorOpenApiSchema as SchemaObject,
})
@ApiServiceUnavailableResponse({
  description: 'Identity or membership storage unavailable',
  schema: apiErrorOpenApiSchema as SchemaObject,
})
export class OrganizationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly organizations: OrganizationsService,
  ) {}
  private async identity(
    authorization: string | undefined,
    response: Response,
  ) {
    try {
      return await this.auth.verify(authorization);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        response.setHeader('WWW-Authenticate', 'Bearer');
      throw error;
    }
  }
  @Get()
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ schema: organizationPageOpenApiSchema as SchemaObject })
  async list(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(authorization, response);
    const parsed = organizationQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException();
    try {
      return organizationPageSchema.parse(
        await this.organizations.list(
          identity,
          parsed.data.limit,
          parsed.data.cursor,
        ),
      );
    } catch {
      throw new ServiceUnavailableException();
    }
  }
  @Get(':organizationId/context')
  @ApiParam({
    name: 'organizationId',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ schema: organizationContextOpenApiSchema as SchemaObject })
  @ApiForbiddenResponse({
    description: 'No active membership for this organization',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  async context(
    @Headers('authorization') authorization: string | undefined,
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(authorization, response);
    if (
      !organizationIdSchema.safeParse(organizationId).success ||
      !emptyQuerySchema.safeParse(query).success
    )
      throw new BadRequestException();
    try {
      return organizationContextSchema.parse(
        await this.organizations.context(identity, organizationId),
      );
    } catch (error) {
      if (error instanceof MembershipDenied) throw new ForbiddenException();
      throw new ServiceUnavailableException();
    }
  }
}
