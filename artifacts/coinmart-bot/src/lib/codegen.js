const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateCode(length = 6) {
  let suffix = "";
  for (let i = 0; i < length; i++) {
    suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `COINMART-${suffix}`;
}
