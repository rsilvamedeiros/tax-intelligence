import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AuthModule } from './auth';
import { OrganizationsModule } from './organizations/organizations.module';
@Module({
  imports: [AuthModule, OrganizationsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
