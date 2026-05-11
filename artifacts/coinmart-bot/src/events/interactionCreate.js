import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { isApprover } from "../lib/permissions.js";
import { logAction } from "../lib/logger.js";
import { processClaim } from "../lib/claimProcessor.js";
import { buildClaimEmbed } from "../commands/claim.js";

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
          .setDescription("An internal error occurred. Please try again.")
          .setTimestamp();
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errEmbed] }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // ── Modal submissions ─────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith("coinmart_claim_modal|")) return;

      const rawCode   = interaction.customId.split("|")[1];
      const accountInfo = interaction.fields.getTextInputValue("account_info").trim();

      await interaction.deferReply({ ephemeral: true });

      // Re-validate the code (race condition safety)
      const code = dbQuery.get(
        "SELECT * FROM codes WHERE code = ? AND guild_id = ?",
        rawCode,
        interaction.guildId
      );

      if (!code || !code.active) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Code No Longer Valid")
              .setDescription("This code has expired or been deactivated since you started your claim."),
          ],
        });
      }

      const now = Math.floor(Date.now() / 1000);
      if (code.expires_at && code.expires_at <= now) {
        dbQuery.run("UPDATE codes SET active = 0 WHERE code = ?", rawCode);
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Code Expired")
              .setDescription("This code expired before your submission was received."),
          ],
        });
      }

      if (code.uses_left <= 0) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ No Uses Remaining")
              .setDescription("This code was fully claimed before your submission was received."),
          ],
        });
      }

      const existing = dbQuery.get(
        "SELECT id FROM claims WHERE code = ? AND user_id = ?",
        rawCode,
        interaction.user.id
      );
      if (existing) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("❌ Already Claimed")
              .setDescription("You have already redeemed this code."),
          ],
        });
      }

      const { status, newUsesLeft } = await processClaim({
        interaction,
        code,
        rawCode,
        claimer: interaction.user,
        claimerMember: interaction.member,
        accountInfo,
      });

      const embed = buildClaimEmbed(interaction.user, code, rawCode, status, newUsesLeft, accountInfo);
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Button interactions ───────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guildId, member, user } = interaction;
      if (!customId.startsWith("coinmart_approve|") && !customId.startsWith("coinmart_deny|")) return;

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

      const parts    = customId.split("|");
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

      dbQuery.run(
        "UPDATE claims SET status = ? WHERE code = ? AND user_id = ?",
        action,
        code,
        claimant
      );

      // Grant role if approved
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

      // Edit the original embed to show resolved state + disable buttons
      const resolvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(color)
        .setTitle(`${icon} Claim ${action.charAt(0).toUpperCase() + action.slice(1)}`)
        .setDescription(`<@${claimant}>'s claim was **${action}** by <@${user.id}>.`)
        .setFooter({ text: `CoinMart • Reviewed by ${user.tag}` });

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

      await interaction.update({ embeds: [resolvedEmbed], components: [disabledRow] });
    }
  },
};
