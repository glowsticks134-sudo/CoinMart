import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the top CoinMart code claimers"),

  async execute(interaction) {
    const rows = dbQuery.all(
      `SELECT user_id, username, COUNT(*) as total_claims
       FROM claims
       WHERE guild_id = ? AND status != 'pending'
       GROUP BY user_id
       ORDER BY total_claims DESC
       LIMIT 10`,
      interaction.guildId
    );

    if (rows.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🏆 Claim Leaderboard")
            .setDescription("No claims have been made yet."),
        ],
      });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = rows.map((r, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      return `${medal} <@${r.user_id}> — **${r.total_claims}** claim${r.total_claims !== 1 ? "s" : ""}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🏆 CoinMart Claim Leaderboard")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "CoinMart • Top 10 Claimers" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
