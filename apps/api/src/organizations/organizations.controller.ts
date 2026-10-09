import {
  BadRequestException,
  Body,
  NotFoundException,
  Patch,
  Put,
  ConflictException,
  Delete,
  HttpCode,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  organizationContextSchema,
  administrativeMembershipPageSchema,
  administrativeMembershipPageOpenApiSchema,
  membershipRoleChangeSchema,
  membershipRoleChangeOpenApiSchema,
  organizationPageSchema,
  organizationQuerySchema,
  organizationIdSchema,
  emptyQuerySchema,
  organizationPageOpenApiSchema,
  organizationContextOpenApiSchema,
  apiErrorOpenApiSchema,
} from '@tax/contracts';
import { AuthService } from '../auth';
import { AdministrativeMembershipService } from './administrative-membership.service';
import {
  MembershipDenied,
  OrganizationsService,
} from './organizations.service';
import {
  LastAdministrator,
  MembershipRevocationService,
} from './membership-revocation.service';
import {
  MembershipRoleService,
  MembershipNotFound,
} from './membership-role.service';

import {
  MembershipGrantService,
  GrantTargetNotFound,
  MembershipGrantConflict,
} from './membership-grant.service';

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
    private readonly revocations: MembershipRevocationService,
    private readonly roles: MembershipRoleService,
    private readonly grants: MembershipGrantService,
    private readonly administrativeMemberships: AdministrativeMembershipService,
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
  @Get(':organizationId/memberships')
  @ApiParam({
    name: 'organizationId',
    schema: { type: 'string', format: 'uuid' },
  })
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
  @ApiOkResponse({
    schema: administrativeMembershipPageOpenApiSchema as SchemaObject,
  })
  @ApiForbiddenResponse({
    description: 'No active administrative membership',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  async listMembers(
    @Headers('authorization') authorization: string | undefined,
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(authorization, response);
    const parsed = organizationQuerySchema.safeParse(query);
    if (
      !parsed.success ||
      !organizationIdSchema.safeParse(organizationId).success
    )
      throw new BadRequestException();
    try {
      return administrativeMembershipPageSchema.parse(
        await this.administrativeMemberships.list(
          identity,
          organizationId,
          parsed.data.limit,
          parsed.data.cursor,
        ),
      );
    } catch (error) {
      if (error instanceof MembershipDenied) throw new ForbiddenException();
      throw new ServiceUnavailableException();
    }
  }
  @Put(':organizationId/memberships/:actorId')
  @HttpCode(204)
  @ApiParam({
    name: 'organizationId',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({ name: 'actorId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({
    required: true,
    schema: membershipRoleChangeOpenApiSchema as SchemaObject,
  })
  @ApiNoContentResponse({
    description:
      'Membership granted or already equal; active administrator required',
  })
  @ApiForbiddenResponse({
    description: 'No active administrative membership',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  @ApiNotFoundResponse({
    description: 'Target actor does not exist',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  @ApiConflictResponse({
    description:
      'Membership revoked or role differs; use PATCH for role changes',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  async grantMembership(
    @Headers('authorization') authorization: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('actorId') actorId: string,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(authorization, response);
    const parsed = membershipRoleChangeSchema.safeParse(body);
    if (
      !parsed.success ||
      !organizationIdSchema.safeParse(organizationId).success ||
      !organizationIdSchema.safeParse(actorId).success ||
      !emptyQuerySchema.safeParse(query).success
    )
      throw new BadRequestException();
    try {
      await this.grants.grant(
        identity,
        organizationId,
        actorId,
        parsed.data.role,
        String(response.getHeader('x-request-id')),
      );
    } catch (error) {
      if (error instanceof MembershipDenied) throw new ForbiddenException();
      if (error instanceof GrantTargetNotFound) throw new NotFoundException();
      if (error instanceof MembershipGrantConflict)
        throw new ConflictException();
      throw new ServiceUnavailableException();
    }
  }
  @Patch(':organizationId/memberships/:actorId')
  @HttpCode(204)
  @ApiParam({
    name: 'organizationId',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({ name: 'actorId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({
    required: true,
    schema: membershipRoleChangeOpenApiSchema as SchemaObject,
  })
  @ApiNoContentResponse({
    description: 'Role changed or already equal; active administrator required',
  })
  @ApiForbiddenResponse({
    description: 'No active administrative membership',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  @ApiNotFoundResponse({
    description: 'Target membership absent or revoked',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  @ApiConflictResponse({
    description: 'The last administrator cannot be demoted',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  async changeRole(
    @Headers('authorization') authorization: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('actorId') actorId: string,
    @Query() query: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(authorization, response);
    const parsed = membershipRoleChangeSchema.safeParse(body);
    if (
      !parsed.success ||
      !organizationIdSchema.safeParse(organizationId).success ||
      !organizationIdSchema.safeParse(actorId).success ||
      !emptyQuerySchema.safeParse(query).success
    )
      throw new BadRequestException();
    try {
      await this.roles.change(
        identity,
        organizationId,
        actorId,
        parsed.data.role,
        String(response.getHeader('x-request-id')),
      );
    } catch (error) {
      if (error instanceof MembershipDenied) throw new ForbiddenException();
      if (error instanceof MembershipNotFound) throw new NotFoundException();
      if (error instanceof LastAdministrator) throw new ConflictException();
      throw new ServiceUnavailableException();
    }
  }
  @Delete(':organizationId/memberships/:actorId')
  @HttpCode(204)
  @ApiParam({
    name: 'organizationId',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiParam({ name: 'actorId', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({
    description:
      'Membership revoked or already absent; administrator authorization always required',
  })
  @ApiForbiddenResponse({
    description: 'No active administrative membership',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  @ApiConflictResponse({
    description: 'The last active administrator cannot be revoked',
    schema: apiErrorOpenApiSchema as SchemaObject,
  })
  async revoke(
    @Headers('authorization') authorization: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('actorId') actorId: string,
    @Query() query: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const identity = await this.identity(authorization, response);
    if (
      !organizationIdSchema.safeParse(organizationId).success ||
      !organizationIdSchema.safeParse(actorId).success ||
      !emptyQuerySchema.safeParse(query).success ||
      Number(request.headers['content-length'] ?? 0) !== 0 ||
      request.headers['transfer-encoding'] !== undefined
    )
      throw new BadRequestException();
    try {
      await this.revocations.revoke(
        identity,
        organizationId,
        actorId,
        String(response.getHeader('x-request-id')),
      );
    } catch (error) {
      if (error instanceof MembershipDenied) throw new ForbiddenException();
      if (error instanceof LastAdministrator) throw new ConflictException();
      throw new ServiceUnavailableException();
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
