import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { SyntheticDiagnosticExecutionService } from './application/synthetic-diagnostic-execution';
import { SyntheticDiagnosticRepository } from './synthetic-diagnostic.repository';
import { SyntheticDiagnosticController } from './synthetic-diagnostic.controller';

@Module({
  imports: [AuthModule],
  controllers: [SyntheticDiagnosticController],
  providers: [
    SyntheticDiagnosticRepository,
    {
      provide: SyntheticDiagnosticExecutionService,
      inject: [SyntheticDiagnosticRepository],
      useFactory: (repository: SyntheticDiagnosticRepository) =>
        new SyntheticDiagnosticExecutionService(repository),
    },
  ],
})
export class TaxIntelligenceModule {}
