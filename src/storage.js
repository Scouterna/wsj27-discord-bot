import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "data");
const NAMES_FILE = path.join(DATA_DIR, "names.json");
const CLAIMS_FILE = path.join(DATA_DIR, "claims.json");

/**
 * Ensure data directory exists
 */
async function ensureDataDirectory() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/**
 * Load the list of available names
 */
export async function loadNames() {
  try {
    const data = await fs.readFile(NAMES_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading names:", error);
    return [];
  }
}

/**
 * Load current claims data
 * Structure: { "name": { "userId": "123", "userName": "User#1234", "troopRole": "Troop 1", "claimedAt": "2025-01-01T00:00:00.000Z" } }
 */
export async function loadClaims() {
  await ensureDataDirectory();
  try {
    const data = await fs.readFile(CLAIMS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, return empty object
    return {};
  }
}

/**
 * Save claims data to file
 */
export async function saveClaims(claims) {
  await ensureDataDirectory();
  try {
    await fs.writeFile(CLAIMS_FILE, JSON.stringify(claims, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving claims:", error);
    return false;
  }
}

/**
 * Check if a name is available
 */
export async function isNameAvailable(name) {
  const claims = await loadClaims();
  return !claims[name];
}

/**
 * Check if a troop already has a claimed name
 */
export async function getTroopClaimedName(troopRole) {
  const claims = await loadClaims();
  for (const [name, claim] of Object.entries(claims)) {
    if (claim.troopRole === troopRole) {
      return name;
    }
  }
  return null;
}

/**
 * Claim a name for a troop
 */
export async function claimName(name, userId, userName, troopRole) {
  const claims = await loadClaims();

  // Check if name is available
  if (claims[name]) {
    return {
      success: false,
      message: `Name "${name}" is already taken by ${claims[name].userName} from ${claims[name].troopRole}`,
    };
  }

  // Check if troop already has a name
  const existingName = await getTroopClaimedName(troopRole);
  if (existingName) {
    return {
      success: false,
      message: `Your troop (${troopRole}) already holds the name "${existingName}"`,
    };
  }

  // Claim the name
  claims[name] = {
    userId,
    userName,
    troopRole,
    claimedAt: new Date().toISOString(),
  };

  const saved = await saveClaims(claims);
  if (saved) {
    return {
      success: true,
      message: `Successfully claimed "${name}" for ${troopRole}`,
    };
  } else {
    return { success: false, message: "Failed to save claim data" };
  }
}

/**
 * Return a name (only by the troop that claimed it)
 */
export async function returnName(name, troopRole) {
  const claims = await loadClaims();

  if (!claims[name]) {
    return {
      success: false,
      message: `Name "${name}" is not currently claimed`,
    };
  }

  if (claims[name].troopRole !== troopRole) {
    return {
      success: false,
      message: `Name "${name}" is claimed by ${claims[name].troopRole}, not your troop (${troopRole})`,
    };
  }

  delete claims[name];

  const saved = await saveClaims(claims);
  if (saved) {
    return {
      success: true,
      message: `Successfully returned "${name}" to the available pool`,
    };
  } else {
    return { success: false, message: "Failed to save claim data" };
  }
}

/**
 * Get all names with their claim status
 */
export async function getAllNamesWithStatus() {
  const names = await loadNames();
  const claims = await loadClaims();

  return names.map((name) => ({
    name,
    claimed: !!claims[name],
    claimInfo: claims[name] || null,
  }));
}
