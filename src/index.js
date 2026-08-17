import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const { DISCORD_TOKEN } = process.env;

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", () => {
  console.log(`✅ ${client.user.tag} is online and ready!`);
  console.log(`📊 Serving ${client.guilds.cache.size} guilds`);

  client.user.setActivity("Hjälpande bot", {
    type: ActivityType.Watching,
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "ping") return;

  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const since = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;

  await interaction.reply({
    content: `Jag lever. Uppe i ${since}, ansluten till ${client.guilds.cache.size} server(rar).`,
    ephemeral: true,
  });
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  client.destroy();
  process.exit(0);
});

client.login(DISCORD_TOKEN);
