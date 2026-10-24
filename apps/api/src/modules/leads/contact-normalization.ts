import { emailSchema, phoneSchema } from "@kyzn/shared";

export function normalizePhone(phone: string): string {
  const value = phoneSchema.parse(phone);
  const digits = value.replace(/\D/g, "");
  return value.startsWith("+") ? `+${digits}` : `+62${digits.slice(1)}`;
}

export function normalizeEmail(email: string): string {
  return emailSchema.parse(email).toLowerCase();
}

export function phoneSearchTerms(query: string): string[] {
  if (!/[0-9]/.test(query) || /[^0-9+ ().-]/.test(query)) return [];
  const opens = [...query].filter((char) => char === "(").length;
  const closes = [...query].filter((char) => char === ")").length;
  if (opens !== closes || opens > 1) return [];
  if (opens === 1) {
    const start = query.indexOf("(");
    const end = query.indexOf(")");
    if (end < start || !/[0-9]/.test(query.slice(start + 1, end))) return [];
  }
  const digits = query.replace(/\D/g, "");
  if (
    query.includes("+") &&
    (!/^\s*\+/.test(query) ||
      [...query].filter((char) => char === "+").length > 1)
  )
    return [];
  if (!/^\+?[0-9]+$/.test(query.replace(/[ ().-]/g, ""))) return [];
  return [digits, ...(digits.startsWith("0") ? [`62${digits.slice(1)}`] : [])];
}
