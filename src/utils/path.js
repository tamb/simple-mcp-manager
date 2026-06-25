const path = require("node:path");
const { IS_WIN, HOME, APPDATA } = require("../config/constants");

/**
 * Abbreviate a config file path for display:
 *   - Replace HOME with ~
 *   - Replace APPDATA with %APPDATA% (Windows)
 *   - Trim to maxLen with leading ellipsis if needed
 */
function abbreviatePath(filePath, maxLen) {
  let p = path.resolve(filePath);

  // Normalise to forward slashes for display
  p = p.replace(/\\/g, "/");
  const home = HOME.replace(/\\/g, "/");

  // Replace known prefixes
  if (IS_WIN && APPDATA) {
    const appdata = APPDATA.replace(/\\/g, "/");
    if (p.startsWith(appdata)) {
      p = `%APPDATA%${p.slice(appdata.length)}`;
    }
  }
  if (p.startsWith(home)) {
    p = `~${p.slice(home.length)}`;
  }

  if (maxLen && p.length > maxLen) {
    p = `...${p.slice(p.length - maxLen + 3)}`;
  }
  return p;
}

module.exports = {
  abbreviatePath,
};
