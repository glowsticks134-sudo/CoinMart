import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isAuthorized } from "../lib/permissions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pendingclaims")
    .setDescription("View all claims awaiting manual approval (Staff only)"),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to view pending claims."),
        ],
        ephemeral: true,
      });
    }

    const pending = dbQuery.all(
      `SELECT cl.code, cl.user_id, cl.username, cl.claimed_at, co.prize
       FROM claims cl
       JOIN codes co ON cl.code = co.code
       WHERE cl.guild_id = ? AND cl.status = 'pending'
       ORDER BY cl.claimed_at ASC
       LIMIT 25`,
      interaction.guildId
    );

    if (pending.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ No Pending Claims")
            .setDescription("There are no claims waiting for approval right now."),
        ],
        ephemeral: true,
      });
    }

    const lines = pending.map((p, i) => {
      const prize = p.prize.length > 40 ? p.prize.slice(0, 37) + "…" : p.prize;
      return `**${i + 1}.** <@${p.user_id}> — \`${p.code}\`\n　📦 ${prize} | ⏰ <t:${p.claimed_at}:R>`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`⏳ Pending Claims (${pending.length})`)
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: "Use /approve to approve or deny each claim" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
