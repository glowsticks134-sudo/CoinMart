import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`[CoinMart] Logged in as ${client.user.tag}`);
    client.user.setPresence({
      activities: [{ name: "CoinMart Codes", type: 3 }],
      status: "online",
    });

    const commands = [];
    const commandsPath = join(__dirname, "../commands");
    const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith(".js"));
    for (const file of commandFiles) {
      const command = await import(`../commands/${file}`);
      if (command.default?.data) {
        commands.push(command.default.data.toJSON());
      }
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log(`[CoinMart] Deployed ${commands.length} slash commands globally.`);
    } catch (err) {
      console.error("[CoinMart] Failed to deploy commands:", err);
    }
  },
};
