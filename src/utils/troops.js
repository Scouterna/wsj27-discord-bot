/**
 * Utility functions for troop role detection and management
 */

/**
 * Extract troop role from Discord member roles
 * Looks for roles named "Avd 1" through "Avd 99"
 */
export function getUserTroopRole(member) {
  if (!member || !member.roles) {
    return null;
  }

  // Look for troop roles (Avd 1 through Avd 99)
  const troopRolePattern = /^Avd (\d{1,2}) .*$/;

  for (const role of member.roles.cache.values()) {
    const match = role.name.match(troopRolePattern);
    if (match) {
      const troopNumber = parseInt(match[1]);
      if (troopNumber >= 1 && troopNumber <= 99) {
        return `Avd ${troopNumber}`;
      }
    }
  }

  return null;
}

/**
 * Format user display name with troop information
 */
export function formatUserWithTroop(userName, troopRole) {
  if (troopRole) {
    return `${userName} (${troopRole})`;
  }
  return `${userName} (Ingen avdelning)`;
}

/**
 * Validate if user has a valid troop role
 */
export function hasValidTroopRole(member) {
  return getUserTroopRole(member) !== null;
}
