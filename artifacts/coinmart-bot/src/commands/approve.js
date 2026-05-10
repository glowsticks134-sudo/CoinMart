import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isAuthorized } from "../lib/permissions.js";
import { logAction, sendWebhookLog, buildLogEmbed } from "../lib/logger.js";

export default {
  data: new SlashCommandBuilder()
    .setName("approve")
    .setDescription("Approve or deny a pending manual claim (Staff only)")
    .addStringOption((o) =>
      o.setName("code").setDescription("The redemption code").setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The user who claimed it").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Approve or deny")
        .setRequired(true)
        .addChoices(
          { name: "Approve", value: "approved" },
          { name: "Deny", value: "denied" }
        )
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to approve claims."),
        ],
        ephemeral: true,
      });
    }

    const rawCode = interaction.options.getString("code").trim().toUpperCase();
    const targetUser = interaction.options.getUser("user");
    const action = interaction.options.getString("action");

    const claim = dbQuery.get(
      "SELECT * FROM claims WHERE code = ? AND user_id = ? AND guild_id = ?",
      rawCode,
      targetUser.id,
      interaction.guildId
    );

    if (!claim) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Claim Not Found")
            .setDescription("No pending claim found for that user and code."),
        ],
        ephemeral: true,
      });
    }

    if (claim.status !== "pending") {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Already Processed")
            .setDescription(`This claim has already been **${claim.status}**.`),
        ],
        ephemeral: true,
      });
    }

    dbQuery.run(
      "UPDATE claims SET status = ? WHERE code = ? AND user_id = ?",
      action,
      rawCode,
      targetUser.id
    );

    logAction(
      interaction.guildId,
      `CLAIM_${action.toUpperCase()}`,
      interaction.user.id,
      interaction.user.tag,
      `Code: ${rawCode} | User: ${targetUser.tag}`
    );

    const color = action === "approved" ? 0x2ecc71 : 0xe74c3c;
    const title = action === "approved" ? "✅ Claim Approved" : "❌ Claim Denied";

    try {
      await targetUser
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(color)
              .setTitle(`${title} — CoinMart`)
              .setDescription(
                action === "approved"
                  ? `Your redemption of code \`${rawCode}\` has been **approved** by staff!`
                  : `Your redemption of code \`${rawCode}\` has been **denied** by staff.`
              )
              .setTimestamp(),
          ],
        })
        .catch(() => {});
    } catch {}

    const logEmbed = buildLogEmbed(
      title,
      [
        { name: "Code", value: `\`${rawCode}\``, inline: true },
        { name: "User", value: `<@${targetUser.id}>`, inline: true },
        { name: "Staff", value: `<@${interaction.user.id}>`, inline: true },
      ],
      color
    );
    await sendWebhookLog(interaction.client, interaction.guildId, logEmbed);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(
            `<@${targetUser.id}>'s claim for \`${rawCode}\` has been **${action}**.`
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },
};
