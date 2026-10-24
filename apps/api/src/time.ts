export function compareUtcInstants(left: string, right: string): number {
  const [leftWhole, leftFraction = ""] = left.slice(0, -1).split(".");
  const [rightWhole, rightFraction = ""] = right.slice(0, -1).split(".");
  if (leftWhole !== rightWhole) return leftWhole < rightWhole ? -1 : 1;
  const width = Math.max(leftFraction.length, rightFraction.length);
  const leftDigits = leftFraction.padEnd(width, "0");
  const rightDigits = rightFraction.padEnd(width, "0");
  return leftDigits === rightDigits ? 0 : leftDigits < rightDigits ? -1 : 1;
}
