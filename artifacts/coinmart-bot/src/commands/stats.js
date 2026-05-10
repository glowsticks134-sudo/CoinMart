import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isAuthorized } from "../lib/permissions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View CoinMart server statistics (Staff only)"),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to view stats."),
        ],
        ephemeral: true,
      });
    }

    const totalCodes   = dbQuery.get("SELECT COUNT(*) as c FROM codes WHERE guild_id = ?", interaction.guildId);
    const activeCodes  = dbQuery.get("SELECT COUNT(*) as c FROM codes WHERE guild_id = ? AND active = 1", interaction.guildId);
    const totalClaims  = dbQuery.get("SELECT COUNT(*) as c FROM claims WHERE guild_id = ?", interaction.guildId);
    const pending      = dbQuery.get("SELECT COUNT(*) as c FROM claims WHERE guild_id = ? AND status = 'pending'", interaction.guildId);
    const approved     = dbQuery.get("SELECT COUNT(*) as c FROM claims WHERE guild_id = ? AND status = 'approved'", interaction.guildId);
    const denied       = dbQuery.get("SELECT COUNT(*) as c FROM claims WHERE guild_id = ? AND status = 'denied'", interaction.guildId);
    const uniqueUsers  = dbQuery.get("SELECT COUNT(DISTINCT user_id) as c FROM claims WHERE guild_id = ?", interaction.guildId);

    const topItem = dbQuery.get(
      `SELECT prize_type, COUNT(*) as c FROM codes WHERE guild_id = ? GROUP BY prize_type ORDER BY c DESC LIMIT 1`,
      interaction.guildId
    );

    const recentClaim = dbQuery.get(
      `SELECT username, claimed_at FROM claims WHERE guild_id = ? ORDER BY claimed_at DESC LIMIT 1`,
      interaction.guildId
    );

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("📊 CoinMart Server Statistics")
      .setDescription(`Stats for **${interaction.guild.name}**`)
      .addFields(
        { name: "🎟️ Total Codes",   value: `${totalCodes?.c ?? 0}`,  inline: true },
        { name: "✅ Active Codes",   value: `${activeCodes?.c ?? 0}`, inline: true },
        { name: "​",                 value: "​",                        inline: true },
        { name: "🎉 Total Claims",   value: `${totalClaims?.c ?? 0}`, inline: true },
        { name: "✅ Approved",       value: `${approved?.c ?? 0}`,    inline: true },
        { name: "⏳ Pending",        value: `${pending?.c ?? 0}`,     inline: true },
        { name: "❌ Denied",         value: `${denied?.c ?? 0}`,      inline: true },
        { name: "👥 Unique Claimers",value: `${uniqueUsers?.c ?? 0}`, inline: true },
        { name: "​",                 value: "​",                        inline: true },
      )
      .setFooter({ text: "CoinMart Statistics" })
      .setTimestamp();

    if (recentClaim) {
      embed.addFields({
        name: "🕐 Last Claim",
        value: `**${recentClaim.username}** — <t:${recentClaim.claimed_at}:R>`,
        inline: false,
      });
    }

    if (topItem) {
      embed.addFields({
        name: "🏆 Most Used Delivery",
        value: topItem.prize_type.charAt(0).toUpperCase() + topItem.prize_type.slice(1),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
