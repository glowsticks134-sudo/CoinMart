import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { dbQuery } from "./database.js";
import { logAction } from "./logger.js";

/**
 * Shared logic for processing a valid claim.
 * Called from both the direct /claim path and the modal submit path.
 *
 * @param {object} opts
 * @param {import('discord.js').Interaction} opts.interaction - the original interaction (used to fetch guild/client)
 * @param {object} opts.code        - the code row from the DB
 * @param {string} opts.rawCode     - the code string
 * @param {object} opts.claimer     - Discord User object
 * @param {object} opts.claimerMember - Discord GuildMember object
 * @param {string|null} opts.accountInfo - submitted account/link (null if not required)
 */
export async function processClaim({ interaction, code, rawCode, claimer, claimerMember, accountInfo }) {
  const guildId = interaction.guildId;
  const now = Math.floor(Date.now() / 1000);
  const status = code.requires_approval ? "pending" : "approved";

  dbQuery.run(
    "INSERT INTO claims (code, user_id, username, guild_id, status, account_info) VALUES (?, ?, ?, ?, ?, ?)",
    rawCode,
    claimer.id,
    claimer.tag,
    guildId,
    status,
    accountInfo ?? null
  );

  const newUsesLeft = code.uses_left - 1;
  dbQuery.run("UPDATE codes SET uses_left = uses_left - 1 WHERE code = ?", rawCode);
  if (newUsesLeft <= 0) {
    dbQuery.run("UPDATE codes SET active = 0 WHERE code = ?", rawCode);
  }

  logAction(
    guildId,
    "CODE_CLAIMED",
    claimer.id,
    claimer.tag,
    `Code: ${rawCode} | Prize: ${code.prize} | Status: ${status}${accountInfo ? ` | Account: ${accountInfo}` : ""}`
  );

  // Grant role immediately for non-manual role codes
  if (code.prize_type === "role" && code.role_id && !code.requires_approval) {
    try {
      await claimerMember.roles.add(code.role_id);
    } catch {
      console.error(`[CoinMart] Failed to assign role ${code.role_id}`);
    }
  }

  // Send approval embed with buttons to the log channel
  if (code.requires_approval) {
    const logChannelRow = dbQuery.get(
      "SELECT value FROM config WHERE guild_id = ? AND key = ?",
      guildId,
      "log_channel"
    );

    if (logChannelRow) {
      try {
        const logChannel = await interaction.client.channels.fetch(logChannelRow.value);
        if (logChannel?.isTextBased()) {
          const fields = [
            { name: "👤 User",       value: `<@${claimer.id}> (${claimer.tag})`, inline: true },
            { name: "🔑 Code",       value: `\`${rawCode}\``,                    inline: true },
            { name: "🎁 Prize",      value: code.prize,                           inline: false },
          ];

          if (accountInfo) {
            fields.push({ name: "🔗 Account / Link", value: accountInfo, inline: false });
          }

          fields.push(
            { name: "🕐 Claimed",    value: `<t:${now}:R>`,     inline: true },
            { name: "🎟️ Uses Left", value: `${newUsesLeft}`,    inline: true }
          );

          const approvalEmbed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("📋 New Manual Claim — Approval Required")
            .setDescription(`<@${claimer.id}> has submitted a claim and is awaiting approval.`)
            .addFields(fields)
            .setThumbnail(claimer.displayAvatarURL())
            .setFooter({ text: "CoinMart • Click a button below to approve or deny" })
            .setTimestamp();

          const approverRow = dbQuery.get(
            "SELECT value FROM config WHERE guild_id = ? AND key = ?",
            guildId,
            "approver_role"
          );
          const roleMention = approverRow ? `<@&${approverRow.value}>` : null;

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`coinmart_approve|${rawCode}|${claimer.id}`)
              .setLabel("Approve")
              .setEmoji("✅")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`coinmart_deny|${rawCode}|${claimer.id}`)
              .setLabel("Deny")
              .setEmoji("❌")
              .setStyle(ButtonStyle.Danger)
          );

          await logChannel.send({
            content: roleMention ? `${roleMention} — New claim needs review!` : null,
            embeds: [approvalEmbed],
            components: [row],
          });
        }
      } catch (err) {
        console.error("[CoinMart] Failed to send approval embed:", err);
      }
    }
  }

  return { status, newUsesLeft };
}
