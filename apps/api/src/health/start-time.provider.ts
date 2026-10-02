export const START_TIME = Symbol('START_TIME');

export interface StartTimeProvider {
  getStartTime(): Date;
}

export const startTimeProvider = {
  provide: START_TIME,
  useFactory: (): StartTimeProvider => ({
    getStartTime: () => new Date(),
  }),
};