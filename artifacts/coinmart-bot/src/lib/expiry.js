import { dbQuery } from "./database.js";

export function startExpiryJob(client) {
  const expire = () => {
    const now = Math.floor(Date.now() / 1000);
    const result = dbQuery.run(
      "UPDATE codes SET active = 0 WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= ?",
      now
    );
    if (result.changes > 0) {
      console.log(`[CoinMart] Expired ${result.changes} code(s).`);
    }
  };

  expire();
  setInterval(expire, 60_000);
}
