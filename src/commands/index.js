import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("take")
    .setDescription("Claim a name for your troop")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name you want to claim")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("return")
    .setDescription(
      "Return your troop's claimed name back to the available pool"
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name you want to return")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("list")
    .setDescription("Show all names and their claim status")
    .addBooleanOption((option) =>
      option
        .setName("available_only")
        .setDescription("Show only available names")
        .setRequired(false)
    ),
];

export default commands;
