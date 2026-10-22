import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { AuthModule } from './auth';
import { OrganizationsModule } from './organizations/organizations.module';
import { FiscalComplianceModule } from './fiscal-compliance/fiscal-compliance.module';
import { TaxIntelligenceModule } from './tax-intelligence/tax-intelligence.module';
@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    FiscalComplianceModule,
    TaxIntelligenceModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
