import { REST, Routes, ActivityType } from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { dbQuery } from "../lib/database.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function updatePresence(client) {
  try {
    const row = dbQuery.get("SELECT COUNT(*) as c FROM codes WHERE active = 1");
    const count = row?.c ?? 0;
    client.user.setPresence({
      activities: [
        {
          name: `${count} active code${count !== 1 ? "s" : ""} | /claim`,
          type: ActivityType.Watching,
        },
      ],
      status: "online",
    });
  } catch {
    client.user.setPresence({
      activities: [{ name: "/claim to redeem", type: ActivityType.Watching }],
      status: "online",
    });
  }
}

export default {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`[CoinMart] Logged in as ${client.user.tag}`);

    updatePresence(client);
    setInterval(() => updatePresence(client), 5 * 60 * 1000);

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
