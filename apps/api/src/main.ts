import 'reflect-metadata';
import { startTelemetry } from './telemetry';
import { readConfig } from './config';
import type { NestExpressApplication } from '@nestjs/platform-express';
async function bootstrap() {
  const config = readConfig();
  const sdk = startTelemetry();
  const { NestFactory } = await import('@nestjs/core');
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
  const { AppModule } = await import('./app.module');
  const { configureHttp, jsonLog } = await import('./http');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });
  configureHttp(app);
  if (!config.production) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Tax Intelligence API')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
  if (sdk) {
    const shutdown = () => {
      void sdk
        .shutdown()
        .catch(() => jsonLog({ event: 'telemetry.shutdown.failed' }));
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }
  await app.listen(config.port, '127.0.0.1');
  jsonLog({ event: 'application.started', port: config.port });
}
void bootstrap().catch(() => {
  console.error(JSON.stringify({ event: 'application.start.failed' }));
  process.exitCode = 1;
});
