import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { SyntheticBatchController } from './synthetic-batch.controller';
import { SyntheticBatchRepository } from './synthetic-batch.repository';
import { SyntheticBatchService } from './synthetic-batch.service';

@Module({
  imports: [AuthModule],
  controllers: [SyntheticBatchController],
  providers: [
    SyntheticBatchRepository,
    {
      provide: SyntheticBatchService,
      inject: [SyntheticBatchRepository],
      useFactory: (repository: SyntheticBatchRepository) =>
        new SyntheticBatchService(repository),
    },
  ],
})
export class FiscalComplianceModule {}
