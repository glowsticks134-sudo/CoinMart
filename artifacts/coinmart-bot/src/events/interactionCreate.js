import { EmbedBuilder } from "discord.js";

export default {
  name: "interactionCreate",
  once: false,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[CoinMart] Error executing /${interaction.commandName}:`, error);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("⚠️ Something went wrong")
        .setDescription(
          "An internal error occurred. Please try again or contact a server admin."
        )
        .setFooter({ text: "CoinMart Error Handler" })
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
      }
    }
  },
};
