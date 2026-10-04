import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, Auth } from './auth.guard';
import type { AuthenticatedUser } from './auth.types';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(AuthGuard)
  me(
    @Auth() user: AuthenticatedUser,
  ): Pick<AuthenticatedUser, 'sub' | 'email' | 'role' | 'appMetadata'> {
    return { sub: user.sub, email: user.email, role: user.role, appMetadata: user.appMetadata };
  }
}
