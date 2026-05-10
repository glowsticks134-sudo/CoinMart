import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isAuthorized } from "../lib/permissions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("codeinfo")
    .setDescription("Get details about a specific code (Staff only)")
    .addStringOption((o) =>
      o.setName("code").setDescription("The code to look up").setRequired(true)
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to view code info."),
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

    const claims = dbQuery.all(
      "SELECT username, claimed_at, status FROM claims WHERE code = ? ORDER BY claimed_at DESC",
      rawCode
    );

    const expiresStr = code.expires_at
      ? `<t:${code.expires_at}:f> (<t:${code.expires_at}:R>)`
      : "Never";
    const status = code.active ? "✅ Active" : "🔴 Inactive";

    const embed = new EmbedBuilder()
      .setColor(code.active ? 0x2ecc71 : 0xe74c3c)
      .setTitle(`🎟️ Code Info: \`${code.code}\``)
      .addFields(
        { name: "Prize", value: code.prize, inline: true },
        { name: "Prize Type", value: code.prize_type, inline: true },
        { name: "Status", value: status, inline: true },
        {
          name: "Uses",
          value: `${code.uses_left} / ${code.max_uses} remaining`,
          inline: true,
        },
        { name: "Expires", value: expiresStr, inline: true },
        {
          name: "Requires Approval",
          value: code.requires_approval ? "Yes" : "No",
          inline: true,
        },
        {
          name: "Created By",
          value: `<@${code.creator_id}> (${code.creator_name})`,
          inline: false,
        },
        { name: "Created At", value: `<t:${code.created_at}:f>`, inline: true }
      )
      .setTimestamp();

    if (claims.length > 0) {
      const claimList = claims
        .slice(0, 10)
        .map((c) => `• **${c.username}** — <t:${c.claimed_at}:R> [${c.status}]`)
        .join("\n");
      embed.addFields({ name: `Claims (${claims.length})`, value: claimList });
    } else {
      embed.addFields({ name: "Claims", value: "No one has claimed this code yet." });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
