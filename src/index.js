import { Client, GatewayIntentBits, ActivityType, MessageFlags } from "discord.js";
import dotenv from "dotenv";
import { ForeignOverwriteError, MuteRegistry, leaderTroops, roleNames } from "./mutes.js";
import { authorize, durationMs, formatRemaining } from "./tysta.js";

dotenv.config();

const { DISCORD_TOKEN } = process.env;

if (!DISCORD_TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const mutes = new MuteRegistry(client);

client.once("clientReady", async () => {
  console.log(`✅ ${client.user.tag} is online and ready!`);
  // The user id is what wsj27-infra's `type = "user"` overwrites must point at.
  console.log(`📊 Serving ${client.guilds.cache.size} guilds as user ${client.user.id}`);

  client.user.setActivity("Hjälpande bot", {
    type: ActivityType.Watching,
  });

  for (const guild of client.guilds.cache.values()) {
    try {
      await mutes.reconcile(guild);
    } catch (error) {
      console.error(`Kunde inte läsa tillbaka tystnader i ${guild.id}:`, error);
    }
  }
});

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

async function handlePing(interaction) {
  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  const since = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;

  await interaction.reply(
    ephemeral(`Jag lever. Uppe i ${since}, ansluten till ${client.guilds.cache.size} server(rar).`)
  );
}

/** Shared gate for /tysta and /häv-tystnad: who, whom, in which troops. */
function resolveTarget(interaction) {
  const target = interaction.options.getMember("deltagare");
  if (!target) return { ok: false, reason: "Den personen finns inte i servern." };

  const decision = authorize({
    invokerRoles: roleNames(interaction.member),
    invokerIsAdmin: interaction.memberPermissions.has("Administrator"),
    targetRoles: roleNames(target),
    targetIsBot: target.user.bot,
    isSelf: target.id === interaction.user.id,
  });
  return decision.ok ? { ...decision, target } : decision;
}

async function handleTysta(interaction) {
  const decision = resolveTarget(interaction);
  if (!decision.ok) return interaction.reply(ephemeral(decision.reason));

  const choice = interaction.options.getString("tid", true);
  const ms = durationMs(choice);
  if (!ms) return interaction.reply(ephemeral("Okänd tid."));
  const reason = interaction.options.getString("anledning") ?? undefined;
  const until = new Date(Date.now() + ms);

  // Several API calls follow; past three seconds Discord drops the interaction.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const done = [];
  for (const troop of decision.troops) {
    await mutes.mute(interaction.guild, {
      troop,
      userId: decision.target.id,
      until,
      byId: interaction.user.id,
      reason,
    });
    done.push(troop);
  }
  await interaction.editReply(
    `🔇 ${decision.target} är tystad i avdelning ${done.join(", ")} i ${formatRemaining(until)} (till <t:${Math.floor(
      until.getTime() / 1000
    )}:f>). Det står i chatten, och hävs automatiskt.`
  );
}

async function handleHav(interaction) {
  const decision = resolveTarget(interaction);
  if (!decision.ok) return interaction.reply(ephemeral(decision.reason));

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let lifted = 0;
  for (const troop of decision.troops) {
    if (await mutes.lift(interaction.guild, { troop, userId: decision.target.id })) lifted += 1;
  }
  await interaction.editReply(
    lifted ? `🔈 ${decision.target} kan skriva igen.` : `${decision.target} var inte tystad.`
  );
}

async function handleTystade(interaction) {
  const troops = leaderTroops(interaction.member, interaction.guild);
  if (troops.length === 0) {
    return interaction.reply(ephemeral("Kommandot kan bara avdelningens ledare använda."));
  }
  const active = mutes.list(troops);
  if (active.length === 0) {
    return interaction.reply(ephemeral(`Ingen är tystad i avdelning ${troops.join(", ")} just nu.`));
  }
  const lines = active.map(
    (m) => `• <@${m.userId}> (avd ${m.troop}) — ${formatRemaining(m.until)} kvar, till <t:${Math.floor(m.until.getTime() / 1000)}:f>`
  );
  await interaction.reply(ephemeral(lines.join("\n")));
}

const handlers = {
  ping: handlePing,
  tysta: handleTysta,
  "häv-tystnad": handleHav,
  tystade: handleTystade,
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const handler = handlers[interaction.commandName];
  if (!handler) return;

  try {
    await handler(interaction);
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    let text = "Något gick fel. Försök igen, eller säg till CMT.";
    if (error instanceof ForeignOverwriteError) {
      text = `${error.channel} har redan en egen behörighetsregel för den deltagaren, satt för hand. Jag rör den inte — be en Moderator.`;
    } else if (error?.code === 50013 || error?.code === 50001) {
      text = "Boten saknar behörighet i avdelningens kanaler — be CMT kontrollera overwrites för boten.";
    }
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(text).catch(() => {});
    } else {
      await interaction.reply(ephemeral(text)).catch(() => {});
    }
  }
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
