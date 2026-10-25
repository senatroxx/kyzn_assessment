const businessTimeZone =
  import.meta.env.VITE_BUSINESS_TIME_ZONE || "Asia/Jakarta";

const dateTimeFormatter = new Intl.DateTimeFormat("en-ID", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: businessTimeZone,
  timeZoneName: "short",
});

const instantDateFormatter = new Intl.DateTimeFormat("en-ID", {
  dateStyle: "medium",
  timeZone: businessTimeZone,
});

const dateFormatter = new Intl.DateTimeFormat("en-ID", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatBusinessDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatBusinessDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function formatBusinessInstantDate(value: string) {
  return instantDateFormatter.format(new Date(value));
}

export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((value) => value.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
