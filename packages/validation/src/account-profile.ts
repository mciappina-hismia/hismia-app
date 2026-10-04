import { z } from 'zod';

const nonBlank = z.string().trim().min(1);
const gender = z.enum(['mujer', 'varón', 'no binario', 'otra identidad', 'prefiero no informar']);

type CalendarDay = { year: number; month: number; day: number };

function calendarDay(value: string): CalendarDay | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return undefined;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]!) return undefined;
  return { year, month, day };
}

/** Calendar-only age check. Feb 29 turns 18 on March 1 in a non-leap anniversary year. */
export function isAdultOn(birthDate: string, asOf: string): boolean {
  const birth = calendarDay(birthDate);
  const today = calendarDay(asOf);
  if (!birth || !today || birthDate > asOf) return false;
  const anniversaryYear = birth.year + 18;
  if (anniversaryYear > 9999) return false;
  const anniversaryLeap =
    anniversaryYear % 4 === 0 && (anniversaryYear % 100 !== 0 || anniversaryYear % 400 === 0);
  const leapDayInNonLeapYear = birth.month === 2 && birth.day === 29 && !anniversaryLeap;
  const anniversaryMonth = leapDayInNonLeapYear ? 3 : birth.month;
  const anniversaryDay = leapDayInNonLeapYear ? 1 : birth.day;
  const eighteenthBirthday = `${String(anniversaryYear).padStart(4, '0')}-${String(anniversaryMonth).padStart(2, '0')}-${String(anniversaryDay).padStart(2, '0')}`;
  return asOf >= eighteenthBirthday;
}

/** Validates untrusted profile input; it does not authenticate or authorize access. */
export function accountProfileSchema(asOf: string) {
  return z
    .discriminatedUnion('accountType', [
      z
        .object({
          accountType: z.literal('patient'),
          displayName: nonBlank,
          birthDate: z
            .string()
            .refine((value) => isAdultOn(value, asOf), 'Must be an adult on the reference date'),
          gender: gender.optional(),
          residenceLocality: nonBlank,
        })
        .strict(),
      z
        .object({
          accountType: z.literal('professional'),
          displayName: nonBlank,
          specialty: nonBlank,
          practiceLocality: nonBlank,
        })
        .strict(),
      z
        .object({
          accountType: z.literal('institution'),
          name: nonBlank,
          type: nonBlank,
          location: nonBlank,
        })
        .strict(),
    ])
    .refine(() => calendarDay(asOf) !== undefined, 'Invalid reference date');
}
