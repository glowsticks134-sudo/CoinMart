import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { dbQuery } from "../lib/database.js";

export default {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure CoinMart bot settings (Admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("set_admin_role")
        .setDescription("Set the staff role that can generate/manage codes")
        .addRoleOption((o) =>
          o.setName("role").setDescription("The admin role").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set_log_channel")
        .setDescription("Set the channel where all code activity is logged")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("The log channel").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("view").setDescription("View current configuration")
    ),

  async execute(interaction) {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      interaction.guild.ownerId !== interaction.user.id
    ) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Access Denied")
            .setDescription("Only server administrators can change bot configuration."),
        ],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "set_admin_role") {
      const role = interaction.options.getRole("role");
      dbQuery.run(
        "INSERT OR REPLACE INTO config (guild_id, key, value) VALUES (?, ?, ?)",
        interaction.guildId,
        "admin_role",
        role.id
      );
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ Admin Role Set")
            .setDescription(
              `Members with <@&${role.id}> can now generate and manage codes.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (sub === "set_log_channel") {
      const channel = interaction.options.getChannel("channel");
      dbQuery.run(
        "INSERT OR REPLACE INTO config (guild_id, key, value) VALUES (?, ?, ?)",
        interaction.guildId,
        "log_channel",
        channel.id
      );
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ Log Channel Set")
            .setDescription(`All code activity will now be logged in <#${channel.id}>.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }

    if (sub === "view") {
      const adminRole = dbQuery.get(
        "SELECT value FROM config WHERE guild_id = ? AND key = ?",
        interaction.guildId,
        "admin_role"
      );
      const logChannel = dbQuery.get(
        "SELECT value FROM config WHERE guild_id = ? AND key = ?",
        interaction.guildId,
        "log_channel"
      );
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("⚙️ CoinMart Configuration")
            .addFields(
              {
                name: "Admin Role",
                value: adminRole
                  ? `<@&${adminRole.value}>`
                  : "Not set (using server Admins)",
                inline: true,
              },
              {
                name: "Log Channel",
                value: logChannel ? `<#${logChannel.value}>` : "Not set",
                inline: true,
              }
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  },
};
