import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { logAction, sendWebhookLog, buildLogEmbed } from "../lib/logger.js";
import { checkCooldown, setCooldown } from "../lib/cooldown.js";

const PRIZE_TYPE_ICONS = {
  tiktok_followers:    "🎵",
  twitch_followers:    "💜",
  youtube_subscribers: "▶️",
  discord_members:     "🟣",
  discord_bots:        "🤖",
  role:                "🎭",
  manual:              "✏️",
  custom:              "💬",
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
            .setDescription(
              "Codes must start with `COINMART-`. Please check your code and try again."
            )
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
            .setDescription("This code is no longer active.")
            .setFooter({ text: "CoinMart" }),
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
            .setDescription("This code has expired and can no longer be redeemed.")
            .setFooter({ text: "CoinMart" }),
        ],
      });
    }

    if (code.uses_left <= 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ No Uses Remaining")
            .setDescription("This code has been fully redeemed already.")
            .setFooter({ text: "CoinMart" }),
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

    if (code.prize_type === "role" && code.role_id && !code.requires_approval) {
      try {
        await interaction.member.roles.add(code.role_id);
      } catch {
        console.error(`[CoinMart] Failed to assign role ${code.role_id}`);
      }
    }

    const icon = PRIZE_TYPE_ICONS[code.prize_type] ?? "🎁";

    const pendingNote = code.requires_approval
      ? "\n\n⏳ **Your claim is pending manual approval by staff.** You'll receive a DM when it's reviewed."
      : "";

    const usesStr =
      newUsesLeft > 0
        ? `${newUsesLeft} use${newUsesLeft !== 1 ? "s" : ""} remaining`
        : "Code fully redeemed";

    const embed = new EmbedBuilder()
      .setColor(status === "approved" ? 0x2ecc71 : 0xffd700)
      .setTitle("✅ Reward Claimed!")
      .setDescription(`You have successfully redeemed a CoinMart code!${pendingNote}`)
      .addFields(
        { name: `${icon} Prize`,       value: code.prize,                                      inline: false },
        { name: "🔑 Code",             value: `\`${rawCode}\``,                                inline: true  },
        { name: "📊 Status",           value: status === "approved" ? "✅ Approved" : "⏳ Pending", inline: true },
        { name: "🎟️ Code Uses Left",  value: usesStr,                                          inline: true  }
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: `CoinMart • ${interaction.user.tag}` })
      .setTimestamp();

    if (code.prize_type === "role" && code.role_id && !code.requires_approval) {
      embed.addFields({ name: "🎭 Role Granted", value: `<@&${code.role_id}>`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });

    const logEmbed = buildLogEmbed(
      "🎉 Code Claimed",
      [
        { name: "Code",   value: `\`${rawCode}\``,               inline: true },
        { name: "Prize",  value: code.prize,                      inline: true },
        { name: "User",   value: `<@${interaction.user.id}>`,     inline: true },
        { name: "Status", value: status,                          inline: true },
      ],
      0x2ecc71
    );
    await sendWebhookLog(interaction.client, interaction.guildId, logEmbed);
  },
};
