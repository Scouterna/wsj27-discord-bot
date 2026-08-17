import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Colors,
  ActivityType,
} from "discord.js";
import dotenv from "dotenv";
import {
  loadNames,
  claimName,
  returnName,
  getAllNamesWithStatus,
  isNameAvailable,
} from "./storage.js";
import {
  getUserTroopRole,
  formatUserWithTroop,
  hasValidTroopRole,
} from "./utils/troops.js";

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

  // Set bot activity
  client.user.setActivity("Hjälpande bot", {
    type: ActivityType.Watching,
  });
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction);
  } else if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
  }
});

async function handleSlashCommand(interaction) {
  const { commandName, member, user } = interaction;

  // Check if user has a valid troop role
  const troopRole = getUserTroopRole(member);

  if (!troopRole) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ Ingen avdelningsroll")
      .setDescription(
        "Du måste ha en avdelningsroll (tex Avd 1) för att använda denna bot."
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  try {
    switch (commandName) {
      case "take":
        await handleTakeCommand(interaction, troopRole);
        break;
      case "return":
        await handleReturnCommand(interaction, troopRole);
        break;
      case "list":
        await handleListCommand(interaction);
        break;
      default:
        await interaction.reply({
          content: "Okänt kommando!",
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error("Error handling command:", error);
    const errorEmbed = new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ Error")
      .setDescription("Ett fel inträffade vid bearbetning av ditt kommando.")
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}

async function handleTakeCommand(interaction, troopRole) {
  await interaction.deferReply();

  const name = interaction.options.getString("name");
  const { user } = interaction;
  const userName = user.username;

  const result = await claimName(name, user.id, userName, troopRole);

  const embed = new EmbedBuilder().setTimestamp().setFooter({
    text: `Requested by ${formatUserWithTroop(userName, troopRole)}`,
  });

  if (result.success) {
    embed
      .setColor(Colors.Green)
      .setTitle("✅ Avdelningsnamnet har tagits")
      .setDescription(result.message)
      .addFields(
        { name: "Namn", value: name, inline: true },
        { name: "Avdelning", value: troopRole, inline: true },
        { name: "Tagen av", value: userName, inline: true }
      );
  } else {
    embed
      .setColor(Colors.Red)
      .setTitle("❌ Misslyckades att ta namnet")
      .setDescription(result.message);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleReturnCommand(interaction, troopRole) {
  await interaction.deferReply();

  const name = interaction.options.getString("name");
  const { user } = interaction;
  const userName = user.username;

  const result = await returnName(name, troopRole);

  const embed = new EmbedBuilder().setTimestamp().setFooter({
    text: `Requested by ${formatUserWithTroop(userName, troopRole)}`,
  });

  if (result.success) {
    embed
      .setColor(Colors.Green)
      .setTitle("✅ Namn har återlämnats")
      .setDescription(result.message)
      .addFields(
        { name: "Namn", value: name, inline: true },
        { name: "Återlämnat av", value: troopRole, inline: true }
      );
  } else {
    embed
      .setColor(Colors.Red)
      .setTitle("❌ Misslyckades att återlämna namnet")
      .setDescription(result.message);
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleListCommand(interaction) {
  await interaction.deferReply();

  const availableOnly =
    interaction.options.getBoolean("bara_tillgängliga") || false;
  const namesWithStatus = await getAllNamesWithStatus();

  let filteredNames = namesWithStatus;
  if (availableOnly) {
    filteredNames = namesWithStatus.filter((item) => !item.claimed);
  }

  if (filteredNames.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle("📝 Namnlista")
      .setDescription(
        availableOnly
          ? "Inga tillgängliga namn hittades."
          : "Inga namn hittades."
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // Split into chunks of 25 fields (Discord limit)
  const chunks = [];
  for (let i = 0; i < filteredNames.length; i += 25) {
    chunks.push(filteredNames.slice(i, i + 25));
  }

  const embeds = chunks.map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(
        index === 0
          ? `📝 Namnlista ${availableOnly ? "(Bara tillgängliga)" : ""}`
          : `📝 Namnlista (Fortsättning ${index + 1})`
      )
      .setTimestamp();

    chunk.forEach((item) => {
      let fieldValue;
      if (item.claimed) {
        fieldValue = `🔴 Taget av ${formatUserWithTroop(
          item.claimInfo.userName,
          item.claimInfo.troopRole
        )}`;
      } else {
        fieldValue = "🟢 Tillgänglig";
      }

      embed.addFields({ name: item.name, value: fieldValue, inline: true });
    });

    // Add summary on first embed
    if (index === 0) {
      const totalNames = namesWithStatus.length;
      const claimedNames = namesWithStatus.filter(
        (item) => item.claimed
      ).length;
      const availableNames = totalNames - claimedNames;

      embed.setDescription(
        `**Antal Namn:** ${totalNames} | **Tagna:** ${claimedNames} | **Tillgängliga:** ${availableNames}`
      );
    }

    return embed;
  });

  await interaction.editReply({ embeds });
}

async function handleAutocomplete(interaction) {
  const { commandName, options } = interaction;
  const focusedOption = options.getFocused(true);

  if (commandName === "take" && focusedOption.name === "name") {
    // Show available names for /take command
    const names = await loadNames();
    const namesWithStatus = await getAllNamesWithStatus();
    const availableNames = namesWithStatus
      .filter((item) => !item.claimed)
      .map((item) => item.name);

    const filtered = availableNames
      .filter((name) =>
        name.toLowerCase().includes(focusedOption.value.toLowerCase())
      )
      .slice(0, 25); // Discord limit

    await interaction.respond(filtered.map((name) => ({ name, value: name })));
  } else if (commandName === "return" && focusedOption.name === "name") {
    // Show troop's claimed names for /return command
    const troopRole = getUserTroopRole(interaction.member);
    if (!troopRole) {
      return interaction.respond([]);
    }

    const namesWithStatus = await getAllNamesWithStatus();
    const troopClaimedNames = namesWithStatus
      .filter((item) => item.claimed && item.claimInfo.troopRole === troopRole)
      .map((item) => item.name);

    const filtered = troopClaimedNames
      .filter((name) =>
        name.toLowerCase().includes(focusedOption.value.toLowerCase())
      )
      .slice(0, 25); // Discord limit

    await interaction.respond(filtered.map((name) => ({ name, value: name })));
  }
}

// Error handling
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
