import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isApprover } from "../lib/permissions.js";
import { logAction, sendWebhookLog, buildLogEmbed } from "../lib/logger.js";

export default {
  name: "interactionCreate",
  once: false,
  async execute(interaction) {
    // ── Slash commands ────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[CoinMart] Error in /${interaction.commandName}:`, error);
        const errEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("⚠️ Something went wrong")
          .setDescription("An internal error occurred. Please try again or contact a server admin.")
          .setFooter({ text: "CoinMart Error Handler" })
          .setTimestamp();

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errEmbed] }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // ── Button interactions ───────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guildId, member, user } = interaction;

      if (!customId.startsWith("coinmart_approve|") && !customId.startsWith("coinmart_deny|")) return;

      // Permission check
      if (!isApprover(member, guildId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Access Denied")
              .setDescription("You do not have permission to approve or deny claims."),
          ],
          ephemeral: true,
        });
      }

      const parts = customId.split("|");
      const action   = parts[0] === "coinmart_approve" ? "approved" : "denied";
      const code     = parts[1];
      const claimant = parts[2];

      const claim = dbQuery.get(
        "SELECT * FROM claims WHERE code = ? AND user_id = ? AND guild_id = ?",
        code,
        claimant,
        guildId
      );

      if (!claim) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Claim Not Found")
              .setDescription("This claim no longer exists in the database."),
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
              .setDescription(`This claim was already **${claim.status}**.`),
          ],
          ephemeral: true,
        });
      }

      // Update the claim status
      dbQuery.run(
        "UPDATE claims SET status = ? WHERE code = ? AND user_id = ?",
        action,
        code,
        claimant
      );

      // If approved and prize is a role, grant it now
      if (action === "approved") {
        const codeRow = dbQuery.get("SELECT * FROM codes WHERE code = ?", code);
        if (codeRow?.prize_type === "role" && codeRow?.role_id) {
          try {
            const targetMember = await interaction.guild.members.fetch(claimant);
            await targetMember.roles.add(codeRow.role_id);
          } catch {
            console.error(`[CoinMart] Failed to assign role on approval for ${claimant}`);
          }
        }
      }

      logAction(
        guildId,
        `CLAIM_${action.toUpperCase()}`,
        user.id,
        user.tag,
        `Code: ${code} | Claimant: ${claimant}`
      );

      // DM the claimant
      try {
        const claimantUser = await interaction.client.users.fetch(claimant);
        await claimantUser.send({
          embeds: [
            new EmbedBuilder()
              .setColor(action === "approved" ? 0x2ecc71 : 0xe74c3c)
              .setTitle(action === "approved" ? "✅ Claim Approved!" : "❌ Claim Denied")
              .setDescription(
                action === "approved"
                  ? `Your redemption of code \`${code}\` has been **approved** by staff! Enjoy your reward.`
                  : `Your redemption of code \`${code}\` has been **denied** by staff.`
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      } catch {}

      const color = action === "approved" ? 0x2ecc71 : 0xe74c3c;
      const icon  = action === "approved" ? "✅" : "❌";
      const label = action === "approved" ? "Approved" : "Denied";

      // Edit the original embed to show resolved state
      const resolvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(color)
        .setTitle(`${icon} Claim ${label}`)
        .setDescription(
          `<@${claimant}>'s claim was **${action}** by <@${user.id}>.`
        )
        .setFooter({ text: `CoinMart • Reviewed by ${user.tag}` });

      // Disable the buttons after action
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("done_approve")
          .setLabel("Approve")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("done_deny")
          .setLabel("Deny")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await interaction.update({
        embeds: [resolvedEmbed],
        components: [disabledRow],
      });
    }
  },
};
