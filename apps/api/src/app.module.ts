import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
@Module({
  controllers: [HealthController, AuthController],
  providers: [HealthService, AuthService],
})
export class AppModule {}
