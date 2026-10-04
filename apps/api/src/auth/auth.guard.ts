import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { AuthError, type AuthenticatedUser } from './auth.types';

type AuthRequest = FastifyRequest & { authenticatedUser?: AuthenticatedUser };

/** A single 401 error-code class for all identity denials; never echo token or provider errors. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/.exec(header) : null;
    if (!match?.[1])
      throw new UnauthorizedException({ code: 'AUTH_DENIED', message: 'Authentication required' });
    try {
      request.authenticatedUser = await this.auth.authenticate(match[1]);
      return true;
    } catch (error) {
      if (error instanceof AuthError) {
        throw new UnauthorizedException({ code: 'AUTH_DENIED', message: 'Authentication denied' });
      }
      throw error;
    }
  }
}

export const Auth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthRequest>().authenticatedUser;
    if (!user)
      throw new UnauthorizedException({ code: 'AUTH_DENIED', message: 'Authentication required' });
    return user;
  },
);
