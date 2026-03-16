import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands/index.js";

dotenv.config();

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables");
  process.exit(1);
}

if (!DISCORD_CLIENT_ID) {
  console.error("Missing DISCORD_CLIENT_ID in environment variables");
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

async function deployCommands() {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    //clean up both guild and global commands first
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: [] });
    if (DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: [] }
      );
    }
    let data;
    if (DISCORD_GUILD_ID) {
      // Deploy to specific guild (faster for development)
      data = await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commands.map((command) => command.toJSON()) }
      );
      console.log(
        `Successfully reloaded ${data.length} guild application (/) commands.`
      );
    } else {
      // Deploy globally (takes up to 1 hour to update)
      data = await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
        body: commands.map((command) => command.toJSON()),
      });
      console.log(
        `Successfully reloaded ${data.length} global application (/) commands.`
      );
    }
  } catch (error) {
    console.error("Error deploying commands:", error);
  }
}

deployCommands();
