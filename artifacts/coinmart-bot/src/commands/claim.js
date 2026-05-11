import {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { dbQuery } from "../lib/database.js";
import { checkCooldown, setCooldown } from "../lib/cooldown.js";
import { processClaim } from "../lib/claimProcessor.js";

// Items that need the user's account/link before claiming
const ACCOUNT_PROMPTS = {
  tiktok_followers:    { label: "Your TikTok Username",           placeholder: "@yourusername or tiktok.com/@yourusername" },
  twitch_followers:    { label: "Your Twitch Username",           placeholder: "yourusername or twitch.tv/yourusername" },
  youtube_subscribers: { label: "Your YouTube Channel URL",       placeholder: "youtube.com/@yourchannel or channel URL" },
  discord_members:     { label: "Your Discord Server Invite Link", placeholder: "discord.gg/yourserver" },
  discord_bots:        { label: "Your Discord Server Invite Link", placeholder: "discord.gg/yourserver" },
};

export function needsAccountInfo(itemType) {
  return itemType && Object.hasOwn(ACCOUNT_PROMPTS, itemType);
}

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

    // Validate the code synchronously before showing modal or deferring
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
            .setTitle("❌ Code Not Found")
            .setDescription("That code doesn't exist. Double-check and try again.")
            .setFooter({ text: "CoinMart Security" }),
        ],
        ephemeral: true,
      });
    }

    if (!code.active) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Code Expired or Deactivated")
            .setDescription("This code is no longer active."),
        ],
        ephemeral: true,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    if (code.expires_at && code.expires_at <= now) {
      dbQuery.run("UPDATE codes SET active = 0 WHERE code = ?", rawCode);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Code Expired")
            .setDescription("This code has expired and can no longer be redeemed."),
        ],
        ephemeral: true,
      });
    }

    if (code.uses_left <= 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ No Uses Remaining")
            .setDescription("This code has been fully redeemed already."),
        ],
        ephemeral: true,
      });
    }

    const existing = dbQuery.get(
      "SELECT id FROM claims WHERE code = ? AND user_id = ?",
      rawCode,
      interaction.user.id
    );
    if (existing) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Already Claimed")
            .setDescription("You have already redeemed this code.")
            .setFooter({ text: "CoinMart Security" }),
        ],
        ephemeral: true,
      });
    }

    // --- Show modal if account info is required ---
    if (needsAccountInfo(code.item_type)) {
      const prompt = ACCOUNT_PROMPTS[code.item_type];
      const modal = new ModalBuilder()
        .setCustomId(`coinmart_claim_modal|${rawCode}`)
        .setTitle("One more step…");

      const input = new TextInputBuilder()
        .setCustomId("account_info")
        .setLabel(prompt.label)
        .setPlaceholder(prompt.placeholder)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      setCooldown(interaction.user.id, "claim");
      return interaction.showModal(modal);
    }

    // --- No account info needed — process immediately ---
    await interaction.deferReply({ ephemeral: true });

    const { status, newUsesLeft } = await processClaim({
      interaction,
      code,
      rawCode,
      claimer: interaction.user,
      claimerMember: interaction.member,
      accountInfo: null,
    });

    const embed = buildClaimEmbed(interaction.user, code, rawCode, status, newUsesLeft, null);
    await interaction.editReply({ embeds: [embed] });
  },
};

export function buildClaimEmbed(user, code, rawCode, status, newUsesLeft, accountInfo) {
  const embed = new EmbedBuilder()
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `CoinMart • ${user.tag}` })
    .setTimestamp();

  if (status === "pending") {
    embed
      .setColor(0xffd700)
      .setTitle("⏳ Claim Submitted!")
      .setDescription("Your claim has been submitted and is awaiting staff approval. You'll receive a DM once it's reviewed.")
      .addFields(
        { name: "🎁 Prize",   value: code.prize,         inline: false },
        { name: "🔑 Code",    value: `\`${rawCode}\``,   inline: true  },
        { name: "📊 Status",  value: "⏳ Pending Review", inline: true  }
      );
    if (accountInfo) {
      embed.addFields({ name: "🔗 Account / Link Submitted", value: accountInfo, inline: false });
    }
  } else {
    embed
      .setColor(0x2ecc71)
      .setTitle("✅ Reward Claimed!")
      .setDescription("You have successfully redeemed a CoinMart code!")
      .addFields(
        { name: "🎁 Prize",        value: code.prize,       inline: false },
        { name: "🔑 Code",         value: `\`${rawCode}\``, inline: true  },
        { name: "📊 Status",       value: "✅ Approved",     inline: true  },
        { name: "🎟️ Uses Left",   value: `${newUsesLeft}`,  inline: true  }
      );
    if (code.prize_type === "role" && code.role_id) {
      embed.addFields({ name: "🎭 Role Granted", value: `<@&${code.role_id}>`, inline: true });
    }
  }
  return embed;
}
