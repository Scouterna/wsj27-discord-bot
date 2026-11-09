import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { DURATIONS } from "../tysta.js";

// The name-claiming commands (/take, /return, /list) were removed on
// 2026-08-17 — that feature is not going to be used.
//
// The tysta commands are visible to everyone who can use application commands
// at all; who may actually run them is decided in src/tysta.js (authorize), not
// by default_member_permissions. Leaders carry no server permission that would
// single them out, and participants cannot use slash commands anywhere on the
// server (@everyone is 0 and no participant overwrite grants it), so the bot's
// own check is the real gate.
export const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Kontrollera att boten lever"),

  new SlashCommandBuilder()
    .setName("tysta")
    .setDescription("Tysta en deltagare i avdelningens kanaler under en tid")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("deltagare").setDescription("Deltagaren som ska tystas").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("tid")
        .setDescription("Hur länge")
        .setRequired(true)
        .addChoices(...DURATIONS.map((d) => ({ name: d.label, value: d.value })))
    )
    .addStringOption((option) =>
      option.setName("anledning").setDescription("Visas i chatten tillsammans med tystningen").setMaxLength(200)
    ),

  new SlashCommandBuilder()
    .setName("häv-tystnad")
    .setDescription("Låt en tystad deltagare skriva igen")
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName("deltagare").setDescription("Deltagaren som ska få skriva igen").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("tystade")
    .setDescription("Visa vilka som är tystade i din avdelning just nu")
    .setContexts(InteractionContextType.Guild),
];

export default commands;
