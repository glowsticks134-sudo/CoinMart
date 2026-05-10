import { dbQuery } from "./database.js";

const COOLDOWNS = {
  claim: 10,
  generatecode: 5,
};

export function checkCooldown(userId, command) {
  const seconds = COOLDOWNS[command] ?? 5;
  const now = Math.floor(Date.now() / 1000);
  const row = dbQuery.get(
    "SELECT last_used FROM cooldowns WHERE user_id = ? AND command = ?",
    userId,
    command
  );

  if (row) {
    const elapsed = now - row.last_used;
    if (elapsed < seconds) {
      return seconds - elapsed;
    }
  }
  return 0;
}

export function setCooldown(userId, command) {
  const now = Math.floor(Date.now() / 1000);
  dbQuery.run(
    "INSERT OR REPLACE INTO cooldowns (user_id, command, last_used) VALUES (?, ?, ?)",
    userId,
    command,
    now
  );
}
