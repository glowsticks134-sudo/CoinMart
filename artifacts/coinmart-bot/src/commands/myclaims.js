import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";

const STATUS_ICONS = {
  approved: "✅",
  pending:  "⏳",
  denied:   "❌",
};

export default {
  data: new SlashCommandBuilder()
    .setName("myclaims")
    .setDescription("View your personal redemption history"),

  async execute(interaction) {
    const claims = dbQuery.all(
      `SELECT cl.code, cl.claimed_at, cl.status, co.prize
       FROM claims cl
       JOIN codes co ON cl.code = co.code
       WHERE cl.user_id = ? AND cl.guild_id = ?
       ORDER BY cl.claimed_at DESC
       LIMIT 15`,
      interaction.user.id,
      interaction.guildId
    );

    if (claims.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("📋 Your Claim History")
            .setDescription("You haven't redeemed any codes yet.\nUse `/claim` to redeem a code!"),
        ],
        ephemeral: true,
      });
    }

    const lines = claims.map((c) => {
      const icon  = STATUS_ICONS[c.status] ?? "❓";
      const prize = c.prize.length > 45 ? c.prize.slice(0, 42) + "…" : c.prize;
      return `${icon} \`${c.code}\` — **${prize}**\n　<t:${c.claimed_at}:R>`;
    });

    const approved = claims.filter((c) => c.status === "approved").length;
    const pending  = claims.filter((c) => c.status === "pending").length;
    const denied   = claims.filter((c) => c.status === "denied").length;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 ${interaction.user.displayName}'s Claim History`)
      .setDescription(lines.join("\n\n"))
      .addFields(
        { name: "✅ Approved", value: `${approved}`, inline: true },
        { name: "⏳ Pending",  value: `${pending}`,  inline: true },
        { name: "❌ Denied",   value: `${denied}`,   inline: true }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: `Showing last ${claims.length} redemptions` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
