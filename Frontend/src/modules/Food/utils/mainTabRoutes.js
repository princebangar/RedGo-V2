/** Main bottom-nav / desktop-nav tab routes — exact paths only (no sub-routes). */

export const MAIN_TAB_IDS = ["delivery", "takeaway", "dining", "under250", "profile"];

export function normalizeFoodUserPath(pathname) {
  let path = pathname || "/";
  if (path.startsWith("/food")) {
    path = path.substring(5) || "/";
  }
  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }
  return path || "/";
}

export function getMainTabFromPath(pathname) {
  const normalized = normalizeFoodUserPath(pathname);

  if (normalized === "/takeaway" || normalized === "/user/takeaway") {
    return "takeaway";
  }
  if (normalized === "/dining" || normalized === "/user/dining") {
    return "dining";
  }
  if (normalized === "/under-250" || normalized === "/user/under-250") {
    return "under250";
  }
  if (normalized === "/profile" || normalized === "/user/profile") {
    return "profile";
  }
  if (
    normalized === "/" ||
    normalized === "/user" ||
    normalized === "/home" ||
    normalized === "/user/home"
  ) {
    return "delivery";
  }

  return null;
}

export function isExactMainTabPath(pathname) {
  return getMainTabFromPath(pathname) !== null;
}

export const LAST_MAIN_TAB_BEFORE_PROFILE_KEY = "foodLastMainTabBeforeProfile";

export function rememberMainTabBeforeProfile(tabId) {
  if (!tabId || tabId === "profile") return;
  try {
    sessionStorage.setItem(LAST_MAIN_TAB_BEFORE_PROFILE_KEY, tabId);
  } catch {
    // ignore
  }
}

export function getRememberedMainTabBeforeProfile() {
  try {
    const tabId = sessionStorage.getItem(LAST_MAIN_TAB_BEFORE_PROFILE_KEY);
    if (tabId && tabId !== "profile" && MAIN_TAB_IDS.includes(tabId)) {
      return tabId;
    }
  } catch {
    // ignore
  }
  return null;
}

export function resolveProfileBackPath(fromPath) {
  const fromTab = fromPath ? getMainTabFromPath(fromPath) : null;
  if (fromTab && fromTab !== "profile") {
    return mainTabToPath(fromTab);
  }
  const remembered = getRememberedMainTabBeforeProfile();
  if (remembered) {
    return mainTabToPath(remembered);
  }
  return mainTabToPath("delivery");
}

export function mainTabToPath(tabId) {
  switch (tabId) {
    case "takeaway":
      return "/food/user/takeaway";
    case "dining":
      return "/food/user/dining";
    case "under250":
      return "/food/user/under-250";
    case "profile":
      return "/food/user/profile";
    case "delivery":
    default:
      return "/food/user";
  }
}
