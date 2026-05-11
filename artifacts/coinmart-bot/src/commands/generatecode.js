import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { dbQuery } from "../lib/database.js";
import { generateCode } from "../lib/codegen.js";
import { isAuthorized } from "../lib/permissions.js";
import { logAction, sendWebhookLog, buildLogEmbed } from "../lib/logger.js";
import { checkCooldown, setCooldown } from "../lib/cooldown.js";

const ITEM_LABELS = {
  tiktok_followers:    "TikTok Followers",
  twitch_followers:    "Twitch Followers",
  youtube_subscribers: "YouTube Subscribers",
  discord_members:     "Discord Members",
  discord_bots:        "Discord Bots",
};

const ITEM_EMOJIS = {
  tiktok_followers:    "🎵",
  twitch_followers:    "💜",
  youtube_subscribers: "▶️",
  discord_members:     "🟣",
  discord_bots:        "🤖",
};

export default {
  data: new SlashCommandBuilder()
    .setName("generatecode")
    .setDescription("Generate a new CoinMart redemption code (Staff only)")
    .addStringOption((o) =>
      o
        .setName("item")
        .setDescription("What is being rewarded?")
        .setRequired(true)
        .addChoices(
          { name: "🎵 TikTok Followers",    value: "tiktok_followers" },
          { name: "💜 Twitch Followers",    value: "twitch_followers" },
          { name: "▶️ YouTube Subscribers", value: "youtube_subscribers" },
          { name: "🟣 Discord Members",     value: "discord_members" },
          { name: "🤖 Discord Bots",        value: "discord_bots" }
        )
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How many? (e.g. 500)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000000)
    )
    .addStringOption((o) =>
      o
        .setName("delivery")
        .setDescription("How is this prize delivered?")
        .setRequired(true)
        .addChoices(
          { name: "🎭 Discord Role Grant",    value: "role" },
          { name: "✏️ Manual Staff Approval", value: "manual" },
          { name: "💬 Custom Instructions",   value: "custom" }
        )
    )
    .addIntegerOption((o) =>
      o
        .setName("max_uses")
        .setDescription("How many members can redeem this code? (default: 1)")
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .addIntegerOption((o) =>
      o
        .setName("expires_hours")
        .setDescription("Expire after how many hours? (leave blank = never)")
        .setMinValue(1)
        .setMaxValue(720)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("Role to grant (only for delivery: Role Grant)")
    )
    .addStringOption((o) =>
      o
        .setName("instructions")
        .setDescription("Custom delivery instructions shown to claimers")
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction.member, interaction.guildId)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("You do not have permission to generate codes.")
            .setFooter({ text: "CoinMart Security" }),
        ],
        ephemeral: true,
      });
    }

    const wait = checkCooldown(interaction.user.id, "generatecode");
    if (wait > 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("⏳ Slow down!")
            .setDescription(`Please wait **${wait}s** before generating another code.`),
        ],
        ephemeral: true,
      });
    }

    const itemKey      = interaction.options.getString("item");
    const amount       = interaction.options.getInteger("amount");
    const delivery     = interaction.options.getString("delivery");
    const maxUses      = interaction.options.getInteger("max_uses") ?? 1;
    const expiresHours = interaction.options.getInteger("expires_hours");
    const roleOption   = interaction.options.getRole("role");
    const instructions = interaction.options.getString("instructions");

    if (delivery === "role" && !roleOption) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Missing Role")
            .setDescription("You must specify a role when delivery is **Role Grant**."),
        ],
        ephemeral: true,
      });
    }

    const itemLabel = ITEM_LABELS[itemKey];
    const itemEmoji = ITEM_EMOJIS[itemKey];
    const prize = `${amount.toLocaleString()} ${itemLabel}`;

    const code = generateCode();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = expiresHours ? now + expiresHours * 3600 : null;
    const requiresApproval = delivery === "manual" ? 1 : 0;
    const prizeStored = instructions ? `${prize} | ${instructions}` : prize;

    dbQuery.run(
      `INSERT INTO codes (code, prize, prize_type, item_type, role_id, creator_id, creator_name, guild_id, max_uses, uses_left, expires_at, requires_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      prizeStored,
      delivery,
      itemKey,
      roleOption?.id ?? null,
      interaction.user.id,
      interaction.user.tag,
      interaction.guildId,
      maxUses,
      maxUses,
      expiresAt,
      requiresApproval
    );

    setCooldown(interaction.user.id, "generatecode");
    logAction(
      interaction.guildId,
      "CODE_GENERATED",
      interaction.user.id,
      interaction.user.tag,
      `Code: ${code} | Item: ${prize} | Delivery: ${delivery} | Uses: ${maxUses}`
    );

    const expiresStr = expiresAt ? `<t:${expiresAt}:R> (<t:${expiresAt}:f>)` : "Never";
    const deliveryLabels = { role: "🎭 Role Grant", manual: "✏️ Manual Approval", custom: "💬 Custom" };

    const fields = [
      { name: "🔑 Code",       value: `\`\`\`${code}\`\`\``, inline: false },
      { name: `${itemEmoji} Item`,   value: itemLabel,         inline: true },
      { name: "🔢 Amount",     value: amount.toLocaleString(), inline: true },
      { name: "📦 Delivery",   value: deliveryLabels[delivery], inline: true },
      { name: "👥 Max Uses",   value: `${maxUses}`,            inline: true },
      { name: "⏳ Expires",    value: expiresStr,               inline: true },
      { name: "👤 Created By", value: `<@${interaction.user.id}>`, inline: true },
    ];

    if (roleOption) fields.push({ name: "🎭 Role", value: `<@&${roleOption.id}>`, inline: true });
    if (instructions) fields.push({ name: "📋 Instructions", value: instructions, inline: false });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎟️ CoinMart Code Generated")
      .setDescription(`A new redemption code for **${prize}** has been created!`)
      .addFields(fields)
      .setFooter({ text: "CoinMart • Share this code with your members" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    const logEmbed = buildLogEmbed(
      "📋 Code Generated",
      [
        { name: "Code",  value: `\`${code}\``,               inline: true },
        { name: "Prize", value: prize,                        inline: true },
        { name: "Staff", value: `<@${interaction.user.id}>`, inline: true },
      ],
      0xffd700
    );
    await sendWebhookLog(interaction.client, interaction.guildId, logEmbed);
  },
};
