import { dbQuery } from "./database.js";
import { EmbedBuilder } from "discord.js";

export function logAction(guildId, action, actorId, actorName, details = null) {
  dbQuery.run(
    "INSERT INTO logs (guild_id, action, actor_id, actor_name, details) VALUES (?, ?, ?, ?, ?)",
    guildId,
    action,
    actorId,
    actorName,
    details
  );
}

export async function sendWebhookLog(client, guildId, embed) {
  const row = dbQuery.get(
    "SELECT value FROM config WHERE guild_id = ? AND key = ?",
    guildId,
    "log_channel"
  );
  if (!row) return;

  try {
    const channel = await client.channels.fetch(row.value);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch {}
}

export function buildLogEmbed(title, fields, color = 0xffd700) {
  return new EmbedBuilder()
    .setTitle(title)
    .addFields(fields)
    .setColor(color)
    .setTimestamp();
}
