import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isAuthorized } from "../lib/permissions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("codes")
    .setDescription("List all active CoinMart codes (Staff only)"),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to view codes."),
        ],
        ephemeral: true,
      });
    }

    const codes = dbQuery.all(
      "SELECT * FROM codes WHERE guild_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 20",
      interaction.guildId
    );

    if (codes.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🎟️ Active Codes")
            .setDescription("No active codes found."),
        ],
        ephemeral: true,
      });
    }

    const lines = codes.map((c) => {
      const expires = c.expires_at ? `<t:${c.expires_at}:R>` : "Never";
      return `\`${c.code}\` — **${c.prize}** | Uses: **${c.uses_left}/${c.max_uses}** | Expires: ${expires}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎟️ Active CoinMart Codes")
      .setDescription(lines.join("\n"))
      .setFooter({ text: `Showing ${codes.length} active codes` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
