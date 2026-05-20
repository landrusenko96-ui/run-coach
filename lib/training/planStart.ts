import type { RaceDistance } from "@/types/training";

export type PlanStartValidationInput = {
  startDateText: string;
  raceDateText: string;
  raceDistance: RaceDistance;
  todayDateText?: string;
};

export function getLocalDateText(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addDaysToDateText(dateText: string, daysToAdd: number): string {
  const date = parseDateOnly(dateText);

  date.setDate(date.getDate() + daysToAdd);

  return formatDateOnly(date);
}

export function subtractDaysFromDateText(
  dateText: string,
  daysToSubtract: number,
): string {
  return addDaysToDateText(dateText, -daysToSubtract);
}

export function getMinimumPlanLeadDays(raceDistance: RaceDistance): number {
  return raceDistance === "marathon" ? 42 : 21;
}

export function getMinimumPlanLeadWeeks(raceDistance: RaceDistance): number {
  return raceDistance === "marathon" ? 6 : 3;
}

export function getLatestAllowedPlanStartDate(
  raceDateText: string,
  raceDistance: RaceDistance,
): string {
  return subtractDaysFromDateText(
    raceDateText,
    getMinimumPlanLeadDays(raceDistance),
  );
}

export function validatePlanStartDate({
  startDateText,
  raceDateText,
  raceDistance,
  todayDateText = getLocalDateText(),
}: PlanStartValidationInput): string | null {
  if (!isValidDateText(startDateText)) {
    return "Choose a valid plan start date.";
  }

  if (!isValidDateText(raceDateText)) {
    return "Race date is missing or invalid. Update the active Race Goal before generating a plan.";
  }

  if (startDateText < todayDateText) {
    return "Plan start date cannot be in the past.";
  }

  if (raceDateText < todayDateText) {
    return "Race date is in the past. Update the active Race Goal before generating a plan.";
  }

  const latestAllowedStartDate = getLatestAllowedPlanStartDate(
    raceDateText,
    raceDistance,
  );
  const minimumLeadWeeks = getMinimumPlanLeadWeeks(raceDistance);
  const raceLabel =
    raceDistance === "marathon" ? "Marathon" : "Half marathon";

  if (latestAllowedStartDate < todayDateText) {
    return `${raceLabel} plans need at least ${minimumLeadWeeks} weeks before race day. Update the race date before generating a plan.`;
  }

  if (startDateText > latestAllowedStartDate) {
    return `${raceLabel} plans need at least ${minimumLeadWeeks} weeks before race day. Choose ${latestAllowedStartDate} or earlier.`;
  }

  return null;
}

function isValidDateText(dateText: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false;
  }

  return formatDateOnly(parseDateOnly(dateText)) === dateText;
}

function parseDateOnly(dateText: string): Date {
  const [year, month, day] = dateText.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
