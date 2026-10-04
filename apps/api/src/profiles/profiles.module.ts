import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { PROFILE_REPOSITORY } from './profiles.repository';
import { PrismaProfilesRepository } from './prisma-profiles.repository';

@Module({
  controllers: [ProfilesController],
  providers: [
    ProfilesService,
    { provide: PROFILE_REPOSITORY, useFactory: () => new PrismaProfilesRepository() },
  ],
})
export class ProfilesModule {}
