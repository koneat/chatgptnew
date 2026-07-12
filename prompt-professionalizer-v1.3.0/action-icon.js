const SUPPORTED_HOSTS = new Set([
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "chat.deepseek.com",
  "copilot.microsoft.com",
  "grok.com",
  "www.perplexity.ai",
  "poe.com"
]);
const ICON_CACHE = new Map();

chrome.runtime.onInstalled.addListener(refreshAllIcons);
chrome.runtime.onStartup.addListener(refreshAllIcons);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    setTabIcon(tabId, changeInfo.url || tab.url).catch(() => undefined);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await setTabIcon(tabId, tab.url);
  } catch {
    // Tab may close before it can be read.
  }
});

async function refreshAllIcons() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => setTabIcon(tab.id, tab.url)));
}

async function setTabIcon(tabId, url) {
  if (!Number.isInteger(tabId)) return;
  const supported = isSupportedUrl(url);
  const color = supported ? "#16a34a" : "#64748b";
  try {
    await chrome.action.setIcon({ tabId, imageData: getIcon(color) });
    await chrome.action.setBadgeText({ tabId, text: "" });
  } catch {
    await chrome.action.setBadgeText({ tabId, text: "P" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
  }
  await chrome.action.setTitle({
    tabId,
    title: supported
      ? "Prompt Professionalizer：当前网站已适配"
      : "Prompt Professionalizer：当前网站未适配"
  });
}

function isSupportedUrl(url) {
  try {
    return SUPPORTED_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function getIcon(color) {
  if (!ICON_CACHE.has(color)) {
    ICON_CACHE.set(color, {
      16: drawIcon(16, color),
      32: drawIcon(32, color)
    });
  }
  return ICON_CACHE.get(color);
}

function drawIcon(size, color) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.fillStyle = color;
  context.beginPath();
  context.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff";
  context.font = `800 ${Math.round(size * 0.62)}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("P", size / 2, size / 2 + size * 0.04);
  return context.getImageData(0, 0, size, size);
}
