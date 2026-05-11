import { dbQuery } from "./database.js";
import { PermissionFlagsBits } from "discord.js";

export function isAuthorized(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.guild.ownerId === member.id) return true;

  const row = dbQuery.get(
    "SELECT value FROM config WHERE guild_id = ? AND key = ?",
    guildId,
    "admin_role"
  );
  if (row) return member.roles.cache.has(row.value);
  return false;
}

export function isApprover(member, guildId) {
  // Admins can always approve
  if (isAuthorized(member, guildId)) return true;

  // Check dedicated approver role
  const row = dbQuery.get(
    "SELECT value FROM config WHERE guild_id = ? AND key = ?",
    guildId,
    "approver_role"
  );
  if (row) return member.roles.cache.has(row.value);
  return false;
}
