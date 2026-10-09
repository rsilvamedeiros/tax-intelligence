import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';
import { MembershipRevocationService } from './membership-revocation.service';
import { MembershipRoleService } from './membership-role.service';
@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsRepository,
    {
      provide: MembershipRoleService,
      inject: [OrganizationsRepository],
      useFactory: (repository: OrganizationsRepository) =>
        new MembershipRoleService(repository),
    },
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
