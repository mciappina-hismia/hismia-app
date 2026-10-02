import { z } from 'zod';

export const healthCheckSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  apiVersion: z.string().regex(/^v\d+$/, 'Must match vN format'),
  uptimeSeconds: z.number().nonnegative().finite(),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;