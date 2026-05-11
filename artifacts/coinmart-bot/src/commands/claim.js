import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { dbQuery } from "../lib/database.js";
import { logAction } from "../lib/logger.js";
import { checkCooldown, setCooldown } from "../lib/cooldown.js";

const PRIZE_TYPE_ICONS = {
  role:   "🎭",
  manual: "✏️",
  custom: "💬",
};

export default {
  data: new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Redeem a CoinMart code")
    .addStringOption((o) =>
      o
        .setName("code")
        .setDescription("Enter your redemption code (e.g. COINMART-X7A9P2)")
        .setRequired(true)
        .setMaxLength(20)
    ),

  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id, "claim");
    if (wait > 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("⏳ Slow down!")
            .setDescription(`Please wait **${wait}s** before claiming again.`),
        ],
        ephemeral: true,
      });
    }

    const rawCode = interaction.options.getString("code").trim().toUpperCase();

    if (!rawCode.startsWith("COINMART-")) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Invalid Code Format")
            .setDescription("Codes must start with `COINMART-`. Please check your code and try again.")
            .setFooter({ text: "CoinMart Security" }),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const code = dbQuery.get(
      "SELECT * FROM codes WHERE code = ? AND guild_id = ?",
      rawCode,
      interaction.guildId
    );

    if (!code) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Code Not Found")
            .setDescription("That code doesn't exist. Double-check and try again.")
            .setFooter({ text: "CoinMart Security" }),
        ],
      });
    }

    if (!code.active) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Code Expired or Deactivated")
            .setDescription("This code is no longer active."),
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
            .setDescription("This code has expired and can no longer be redeemed."),
        ],
      });
    }

    if (code.uses_left <= 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ No Uses Remaining")
            .setDescription("This code has been fully redeemed already."),
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
            .setDescription("You have already redeemed this code.")
            .setFooter({ text: "CoinMart Security" }),
        ],
      });
    }

    const status = code.requires_approval ? "pending" : "approved";

    dbQuery.run(
      "INSERT INTO claims (code, user_id, username, guild_id, status) VALUES (?, ?, ?, ?, ?)",
      rawCode,
      interaction.user.id,
      interaction.user.tag,
      interaction.guildId,
      status
    );

    const newUsesLeft = code.uses_left - 1;
    dbQuery.run("UPDATE codes SET uses_left = uses_left - 1 WHERE code = ?", rawCode);
    if (newUsesLeft <= 0) {
      dbQuery.run("UPDATE codes SET active = 0 WHERE code = ?", rawCode);
    }

    setCooldown(interaction.user.id, "claim");
    logAction(
      interaction.guildId,
      "CODE_CLAIMED",
      interaction.user.id,
      interaction.user.tag,
      `Code: ${rawCode} | Prize: ${code.prize} | Status: ${status}`
    );

    // --- Grant role immediately if not manual ---
    if (code.prize_type === "role" && code.role_id && !code.requires_approval) {
      try {
        await interaction.member.roles.add(code.role_id);
      } catch {
        console.error(`[CoinMart] Failed to assign role ${code.role_id}`);
      }
    }

    // --- Send approval embed with buttons to log channel ---
    if (code.requires_approval) {
      const logChannelRow = dbQuery.get(
        "SELECT value FROM config WHERE guild_id = ? AND key = ?",
        interaction.guildId,
        "log_channel"
      );

      if (logChannelRow) {
        try {
          const logChannel = await interaction.client.channels.fetch(logChannelRow.value);
          if (logChannel?.isTextBased()) {
            const approvalEmbed = new EmbedBuilder()
              .setColor(0xffd700)
              .setTitle("📋 New Manual Claim — Approval Required")
              .setDescription(`<@${interaction.user.id}> has claimed a code and is awaiting approval.`)
              .addFields(
                { name: "👤 User",      value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: "🔑 Code",      value: `\`${rawCode}\``,                                       inline: true },
                { name: "🎁 Prize",     value: code.prize,                                              inline: false },
                { name: "🕐 Claimed",   value: `<t:${now}:R>`,                                          inline: true },
                { name: "🎟️ Uses Left", value: `${newUsesLeft}`,                                        inline: true }
              )
              .setThumbnail(interaction.user.displayAvatarURL())
              .setFooter({ text: "CoinMart • Click a button below to approve or deny" })
              .setTimestamp();

            const approverRow = dbQuery.get(
              "SELECT value FROM config WHERE guild_id = ? AND key = ?",
              interaction.guildId,
              "approver_role"
            );
            const roleMention = approverRow ? `<@&${approverRow.value}>` : null;

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`coinmart_approve|${rawCode}|${interaction.user.id}`)
                .setLabel("Approve")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`coinmart_deny|${rawCode}|${interaction.user.id}`)
                .setLabel("Deny")
                .setEmoji("❌")
                .setStyle(ButtonStyle.Danger)
            );

            await logChannel.send({
              content: roleMention ? `${roleMention} — New claim needs review!` : null,
              embeds: [approvalEmbed],
              components: [row],
            });
          }
        } catch (err) {
          console.error("[CoinMart] Failed to send approval embed:", err);
        }
      }
    }

    // --- Reply to the claimer ---
    const icon = PRIZE_TYPE_ICONS[code.prize_type] ?? "🎁";
    const embed = new EmbedBuilder()
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: `CoinMart • ${interaction.user.tag}` })
      .setTimestamp();

    if (status === "pending") {
      embed
        .setColor(0xffd700)
        .setTitle("⏳ Claim Submitted!")
        .setDescription("Your claim has been submitted and is awaiting staff approval. You'll receive a DM once it's reviewed.")
        .addFields(
          { name: `${icon} Prize`, value: code.prize,         inline: false },
          { name: "🔑 Code",       value: `\`${rawCode}\``,   inline: true  },
          { name: "📊 Status",     value: "⏳ Pending Review", inline: true  }
        );
    } else {
      embed
        .setColor(0x2ecc71)
        .setTitle("✅ Reward Claimed!")
        .setDescription("You have successfully redeemed a CoinMart code!")
        .addFields(
          { name: `${icon} Prize`,      value: code.prize,       inline: false },
          { name: "🔑 Code",            value: `\`${rawCode}\``, inline: true  },
          { name: "📊 Status",          value: "✅ Approved",     inline: true  },
          { name: "🎟️ Uses Left",       value: `${newUsesLeft}`,  inline: true  }
        );

      if (code.prize_type === "role" && code.role_id) {
        embed.addFields({ name: "🎭 Role Granted", value: `<@&${code.role_id}>`, inline: true });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
