import { Module } from '@nestjs/common';
import { z } from 'zod';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';

export const authEnvSchema = z
  .object({
    SUPABASE_PROJECT_URL: z.string().url(),
    SUPABASE_JWKS_URL: z.string().url(),
    SUPABASE_ISSUER: z.string().url(),
    SUPABASE_AUDIENCE: z.literal('authenticated'),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(), // Server-only; never used for identity.
    AUTH_USE_MOCK: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((env, context) => {
    if (env.AUTH_USE_MOCK !== 'true' && !env.SUPABASE_ANON_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUPABASE_ANON_KEY'],
        message: 'SUPABASE_ANON_KEY is required without AUTH_USE_MOCK',
      });
    }
  });
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { startTimeProvider } from './health/start-time.provider';

@Module({
  controllers: [HealthController, AuthController],
  providers: [
    startTimeProvider,
    HealthService,
    AuthGuard,
    {
      provide: AuthService,
      useFactory: () => {
        const config = authEnvSchema.parse(process.env);
        if (config.AUTH_USE_MOCK === 'true' && process.env.NODE_ENV === 'production') {
          throw new Error('Mock identity providers are not allowed in production');
        }
        return new AuthService();
      },
    },
  ],
})
export class AppModule {}
