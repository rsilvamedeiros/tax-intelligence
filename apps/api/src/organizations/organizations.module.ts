import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';
import { MembershipRevocationService } from './membership-revocation.service';
@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsRepository,
    {
      provide: MembershipRevocationService,
      inject: [OrganizationsRepository],
      useFactory: (repository: OrganizationsRepository) =>
        new MembershipRevocationService(repository),
    },
    {
      provide: OrganizationsService,
      inject: [OrganizationsRepository],
      useFactory: (directory: OrganizationsRepository) =>
        new OrganizationsService(directory),
    },
  ],
})
export class OrganizationsModule {}
