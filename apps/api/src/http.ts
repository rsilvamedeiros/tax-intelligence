import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@tax/contracts';
import helmet from 'helmet';
import { readConfig } from './config';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type LogSink = (entry: Record<string, string | number>) => void;
export const jsonLog: LogSink = (entry) => console.log(JSON.stringify(entry));
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const oversized =
      error instanceof Error &&
      'type' in error &&
      error.type === 'entity.too.large';
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : oversized
          ? 413
          : 500;
    const body: ApiError = {
      statusCode: status,
      code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED',
      message:
        status >= 500 ? 'Erro interno do servidor' : 'Requisição rejeitada',
      requestId: String(response.getHeader('x-request-id')),
    };
    response.status(status).json(body);
  }
}
export function configureHttp(
  app: NestExpressApplication,
  log: LogSink = jsonLog,
) {
  const config = readConfig();
  app.setGlobalPrefix('v1');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && uuidPattern.test(incoming) ? incoming : randomUUID();
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    const start = performance.now();
    const span = trace
      .getTracer('tax-intelligence-api')
      .startSpan('http.request');
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      // Whitelist only resolved route templates. Never emit URL, query, body or credentials.
      const path: unknown = request.route?.path;
      const route = typeof path === 'string' ? path : 'unmatched';
      span.setAttribute('http.route', route);
      span.setAttribute('http.response.status_code', response.statusCode);
      if (response.statusCode >= 500)
        span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      log({
        event: 'http.request.completed',
        requestId,
        route,
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - start),
      });
    };
    response.once('finish', finish);
    response.once('close', finish);
    next();
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.use(helmet());
  app.enableCors({
    origin: config.origin,
    exposedHeaders: ['x-request-id'],
    credentials: false,
  });
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
}
