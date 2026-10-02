export const START_TIME = Symbol('START_TIME');

export interface StartTimeProvider {
  getStartTime(): Date;
}

export const startTimeProvider: {
  provide: typeof START_TIME;
  useFactory: () => StartTimeProvider;
} = {
  provide: START_TIME,
  useFactory: (): StartTimeProvider => ({
    getStartTime: () => new Date(),
  }),
};

export type StartTime = InstanceType<typeof startTimeProvider.useFactory>;