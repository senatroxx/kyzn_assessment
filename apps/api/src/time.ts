export function businessDateAt(value: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDateOnlyDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function businessDateStartUtc(value: string, timeZone: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidate = targetWallTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .map(({ type, value }) => [type, value]),
    );
    const observedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const difference = targetWallTime - observedWallTime;
    if (difference === 0) break;
    candidate += difference;
  }

  return new Date(candidate).toISOString();
}

export function compareUtcInstants(left: string, right: string): number {
  const [leftWhole, leftFraction = ""] = left.slice(0, -1).split(".");
  const [rightWhole, rightFraction = ""] = right.slice(0, -1).split(".");
  if (leftWhole !== rightWhole) return leftWhole < rightWhole ? -1 : 1;
  const width = Math.max(leftFraction.length, rightFraction.length);
  const leftDigits = leftFraction.padEnd(width, "0");
  const rightDigits = rightFraction.padEnd(width, "0");
  return leftDigits === rightDigits ? 0 : leftDigits < rightDigits ? -1 : 1;
}
