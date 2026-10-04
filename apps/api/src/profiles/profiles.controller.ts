import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Auth, AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Post('onboarding')
  @HttpCode(200)
  onboard(@Auth() user: AuthenticatedUser, @Body() input: unknown) {
    return this.profiles.onboard(user.sub, input);
  }
}
