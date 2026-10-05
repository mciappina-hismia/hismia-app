import { Global, Module } from '@nestjs/common';
import { ProfilesModule } from './profiles/profiles.module';
import { z } from 'zod';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AppConfigModule } from './app-config/app-config.module.js';

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

// Export the existing single identity factory to guarded bounded contexts.
@Global()
@Module({
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
  providers: [
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
export class IdentityModule {}

@Module({
  imports: [AppConfigModule, IdentityModule, ProfilesModule],
  controllers: [HealthController],
  providers: [startTimeProvider, HealthService],
})
export class AppModule {}
