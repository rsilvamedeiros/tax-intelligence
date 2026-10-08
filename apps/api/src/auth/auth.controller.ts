import {
  Controller,
  Get,
  Headers,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedIdentity } from '@tax/contracts';
import { AuthService } from './auth.service';

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['statusCode', 'code', 'message', 'requestId'],
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string', format: 'uuid' },
  },
};
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['issuer', 'subject'],
      properties: {
        issuer: { type: 'string', format: 'uri', maxLength: 2048 },
        subject: { type: 'string', minLength: 1, maxLength: 255 },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: errorSchema,
    description: 'Missing or invalid access token',
  })
  @ApiServiceUnavailableResponse({
    schema: errorSchema,
    description: 'Token verification unavailable',
  })
  async me(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedIdentity> {
    try {
      return await this.auth.verify(authorization);
    } catch (error) {
      if (error instanceof UnauthorizedException)
        response.setHeader('WWW-Authenticate', 'Bearer');
      throw error;
    }
  }
}
