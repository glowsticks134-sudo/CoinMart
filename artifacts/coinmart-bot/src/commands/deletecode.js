import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isAuthorized } from "../lib/permissions.js";
import { logAction, sendWebhookLog, buildLogEmbed } from "../lib/logger.js";

export default {
  data: new SlashCommandBuilder()
    .setName("deletecode")
    .setDescription("Deactivate/delete a CoinMart code (Staff only)")
    .addStringOption((o) =>
      o.setName("code").setDescription("The code to delete").setRequired(true)
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to delete codes."),
        ],
        ephemeral: true,
      });
    }

    const rawCode = interaction.options.getString("code").trim().toUpperCase();
    const code = dbQuery.get(
      "SELECT * FROM codes WHERE code = ? AND guild_id = ?",
      rawCode,
      interaction.guildId
    );

    if (!code) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Not Found")
            .setDescription(`No code found matching \`${rawCode}\`.`),
        ],
        ephemeral: true,
      });
    }

    dbQuery.run(
      "UPDATE codes SET active = 0 WHERE code = ? AND guild_id = ?",
      rawCode,
      interaction.guildId
    );

    logAction(
      interaction.guildId,
      "CODE_DELETED",
      interaction.user.id,
      interaction.user.tag,
      `Code: ${rawCode}`
    );

    const logEmbed = buildLogEmbed(
      "🗑️ Code Deleted",
      [
        { name: "Code", value: `\`${rawCode}\``, inline: true },
        { name: "Prize", value: code.prize, inline: true },
        { name: "Staff", value: `<@${interaction.user.id}>`, inline: true },
      ],
      0xe74c3c
    );
    await sendWebhookLog(interaction.client, interaction.guildId, logEmbed);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("✅ Code Deactivated")
          .setDescription(
            `Code \`${rawCode}\` has been deactivated and can no longer be redeemed.`
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },
};
