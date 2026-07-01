// background/service-worker.js
// Central message bus routing data between the UI panels and content scripts
import { BASE_PROMPTS, CREATOR_PROMPTS } from '../utils/base-prompts.js';

// --- Debug Logging Wrapper for SW ---
let DEBUG_MODE = false;
chrome.storage.local.get({ debugMode: false }, (res) => { DEBUG_MODE = res.debugMode; });
chrome.storage.onChanged.addListener((changes) => {
  if (changes.debugMode) DEBUG_MODE = changes.debugMode.newValue;
});
const log = (...args) => { if (DEBUG_MODE) console.log("[SW]", ...args); };
const warn = (...args) => { if (DEBUG_MODE) console.warn("[SW]", ...args); };
const err = (...args) => { if (DEBUG_MODE) console.error("[SW]", ...args); };

log("Service Worker initialized.");

// Initialize Defaults on Install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      savedPrompts: BASE_PROMPTS,
      basePrompts: BASE_PROMPTS,
      creatorPrompts: CREATOR_PROMPTS,
      debugMode: false
    }, () => console.log("Extension installed: Base prompts seeded.", BASE_PROMPTS));
  }
});

// Helper function to check if a URL is Gemini
function isGeminiUrl(url) {
  return url && url.startsWith("https://gemini.google.com");
}

// Disable side panel globally by default on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: false })
    .then(() => log("Side panel disabled globally by default."))
    .catch(error => err("Error setting global side panel options:", error));
});

// Function to update the extension's enabled/disabled state for a tab
function updateTabState(tabId, url) {
  if (isGeminiUrl(url)) {
    // Enable side panel for this tab
    chrome.sidePanel.setOptions({
      tabId: tabId,
      path: 'sidepanel/sidepanel.html',
      enabled: true
    }).catch(error => err("Error enabling sidePanel:", error));

    // Enable action icon for this tab
    if (chrome.action && chrome.action.enable) {
      chrome.action.enable(tabId).catch(error => err("Error enabling action:", error));
    }
  } else {
    // Disable side panel for this tab
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false
    }).catch(error => err("Error disabling sidePanel:", error));

    // Disable action icon for this tab
    if (chrome.action && chrome.action.disable) {
      chrome.action.disable(tabId).catch(error => err("Error disabling action:", error));
    }
  }
}

// Monitor tab updates to dynamically enable/disable the side panel & trigger prepopulation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    updateTabState(tabId, tab.url);
  }

  // Intercept completed loads for Gem creation routing
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('/gems/create')) {
    try {
      const sessionKey = `gem_prepop_${tabId}`;
      const data = await chrome.storage.session.get(sessionKey);

      if (data[sessionKey]) {
        log(`Routing pre-population payload to tab ${tabId}`);
        chrome.tabs.sendMessage(tabId, {
          action: 'PREPOPULATE_GEM',
          payload: data[sessionKey]
        });

        // Clean up the ephemeral state
        await chrome.storage.session.remove(sessionKey);
      }
    } catch (error) {
      err("Error retrieving prepopulation payload:", error);
    }
  }
});

// Monitor tab activation (switching tabs) to ensure correct state is applied
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url) {
      updateTabState(activeInfo.tabId, tab.url);
    } else {
      chrome.sidePanel.setOptions({
        tabId: activeInfo.tabId,
        enabled: false
      }).catch(error => { });
      if (chrome.action && chrome.action.disable) {
        chrome.action.disable(activeInfo.tabId).catch(error => { });
      }
    }
  });
});

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => err(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log("Service worker received message:", request);

  if (request.action === 'OPEN_SIDEPANEL') {
    if (sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          err("Error programmatically opening sidepanel:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  }

  if (request.action === 'CLOSE_SIDEPANEL') {
    if (sender.tab) {
      chrome.sidePanel.close({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          err("Error programmatically closing sidepanel:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    }
  }

  if (request.action === 'PAGE_RELOADED') {
    if (sender.tab) {
      log("[Service Worker] Tab reloaded. Closing sidepanel for tab:", sender.tab.id);
      chrome.sidePanel.setOptions({
        tabId: sender.tab.id,
        enabled: false
      }).then(() => {
        return chrome.sidePanel.setOptions({
          tabId: sender.tab.id,
          path: 'sidepanel/sidepanel.html',
          enabled: true
        });
      }).catch(error => err("Error toggling sidepanel state on refresh:", error));
      sendResponse({ success: true });
      return true;
    }
  }

  if (request.action === 'INJECT_FILES') {
    (async () => {
      try {
        const fileDataArray = [];
        for (const path of request.payload) {
          const url = chrome.runtime.getURL(path);
          const response = await fetch(url);
          const text = await response.text();
          const rawName = path.split('/').pop();
          const decodedName = decodeURIComponent(rawName);
          fileDataArray.push({ name: decodedName, content: text, type: 'text/markdown' });
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
        chrome.tabs.sendMessage(tab.id, { action: 'INJECT_FILES_DATA', payload: fileDataArray }, (resp) => {
          sendResponse(resp);
        });
      } catch (error) {
        err('Error reading asset files:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  if (request.action === 'SUBMIT_PROMPT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  if (request.action === 'NAVIGATE_AND_PREPOPULATE_GEM') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        await chrome.storage.session.set({
          [`gem_prepop_${tab.id}`]: request.payload
        });

        await chrome.tabs.update(tab.id, { url: 'https://gemini.google.com/gems/create' });
        sendResponse({ success: true });

      } catch (error) {
        err('Error initiating navigation routing:', error);
        sendResponse({ success: false, error: error.toString() });
      }
    })();
    return true;
  }

  return true;
});