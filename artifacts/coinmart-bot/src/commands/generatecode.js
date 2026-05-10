import {
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { dbQuery } from "../lib/database.js";
import { generateCode } from "../lib/codegen.js";
import { isAuthorized } from "../lib/permissions.js";
import { logAction, sendWebhookLog, buildLogEmbed } from "../lib/logger.js";
import { checkCooldown, setCooldown } from "../lib/cooldown.js";

export default {
  data: new SlashCommandBuilder()
    .setName("generatecode")
    .setDescription("Generate a new CoinMart redemption code (Staff only)")
    .addStringOption((o) =>
      o.setName("prize").setDescription("Prize/reward description").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("prize_type")
        .setDescription("Type of prize")
        .setRequired(true)
        .addChoices(
          { name: "Currency", value: "currency" },
          { name: "Discord Role", value: "role" },
          { name: "Custom Text", value: "custom" },
          { name: "Manual Approval", value: "manual" }
        )
    )
    .addIntegerOption((o) =>
      o
        .setName("max_uses")
        .setDescription("How many times can this code be redeemed? (default: 1)")
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .addIntegerOption((o) =>
      o
        .setName("expires_hours")
        .setDescription("Expiry in hours from now (leave blank = never expires)")
        .setMinValue(1)
        .setMaxValue(720)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("Role to grant (only for prize_type: role)")
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

    const prize = interaction.options.getString("prize");
    const prizeType = interaction.options.getString("prize_type");
    const maxUses = interaction.options.getInteger("max_uses") ?? 1;
    const expiresHours = interaction.options.getInteger("expires_hours");
    const roleOption = interaction.options.getRole("role");

    if (prizeType === "role" && !roleOption) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Missing Role")
            .setDescription("You must specify a role when prize type is **Role**."),
        ],
        ephemeral: true,
      });
    }

    const code = generateCode();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = expiresHours ? now + expiresHours * 3600 : null;
    const requiresApproval = prizeType === "manual" ? 1 : 0;

    dbQuery.run(
      `INSERT INTO codes (code, prize, prize_type, role_id, creator_id, creator_name, guild_id, max_uses, uses_left, expires_at, requires_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      prize,
      prizeType,
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
      `Code: ${code} | Prize: ${prize} | Uses: ${maxUses}`
    );

    const expiresStr = expiresAt
      ? `<t:${expiresAt}:R> (<t:${expiresAt}:f>)`
      : "Never";

    const fields = [
      { name: "Code", value: `\`${code}\``, inline: true },
      { name: "Prize", value: prize, inline: true },
      {
        name: "Prize Type",
        value: prizeType.charAt(0).toUpperCase() + prizeType.slice(1),
        inline: true,
      },
      { name: "Max Uses", value: `${maxUses}`, inline: true },
      { name: "Uses Left", value: `${maxUses}`, inline: true },
      { name: "Expires", value: expiresStr, inline: true },
      { name: "Created By", value: `<@${interaction.user.id}>`, inline: true },
      {
        name: "Requires Approval",
        value: requiresApproval ? "Yes" : "No",
        inline: true,
      },
    ];

    if (roleOption) {
      fields.push({ name: "Role Reward", value: `<@&${roleOption.id}>`, inline: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎟️ CoinMart Code Generated")
      .setDescription("A new redemption code has been created successfully.")
      .addFields(fields)
      .setFooter({ text: "CoinMart • Share this code with members" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    const logEmbed = buildLogEmbed(
      "📋 Code Generated",
      [
        { name: "Code", value: `\`${code}\``, inline: true },
        { name: "Prize", value: prize, inline: true },
        { name: "Staff", value: `<@${interaction.user.id}>`, inline: true },
      ],
      0xffd700
    );
    await sendWebhookLog(interaction.client, interaction.guildId, logEmbed);
  },
};
