import { SlashCommandBuilder } from "discord.js";

// The name-claiming commands (/take, /return, /list) were removed on
// 2026-08-17 — that feature is not going to be used. What is left is a bot
// that holds a gateway connection and can confirm it is running.
export const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Kontrollera att boten lever"),
];

export default commands;
