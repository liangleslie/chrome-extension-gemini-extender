// background/service-worker.js
// Central message bus routing data between the UI panels and content scripts

console.log("Service Worker initialized.");

// Helper function to check if a URL is Gemini
function isGeminiUrl(url) {
  return url && url.startsWith("https://gemini.google.com");
}

// Disable side panel globally by default on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: false })
    .then(() => console.log("Side panel disabled globally by default."))
    .catch(err => console.error("Error setting global side panel options:", err));
});

// Function to update the extension's enabled/disabled state for a tab
function updateTabState(tabId, url) {
  if (isGeminiUrl(url)) {
    // Enable side panel for this tab
    chrome.sidePanel.setOptions({
      tabId: tabId,
      path: 'sidepanel/sidepanel.html',
      enabled: true
    }).catch(err => console.error("Error enabling sidePanel:", err));
    
    // Enable action icon for this tab
    if (chrome.action && chrome.action.enable) {
      chrome.action.enable(tabId).catch(err => console.error("Error enabling action:", err));
    }
  } else {
    // Disable side panel for this tab
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false
    }).catch(err => console.error("Error disabling sidePanel:", err));
    
    // Disable action icon for this tab
    if (chrome.action && chrome.action.disable) {
      chrome.action.disable(tabId).catch(err => console.error("Error disabling action:", err));
    }
  }
}

// Monitor tab updates to dynamically enable/disable the side panel & action
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    updateTabState(tabId, tab.url);
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
      }).catch(err => {});
      if (chrome.action && chrome.action.disable) {
        chrome.action.disable(activeInfo.tabId).catch(err => {});
      }
    }
  });
});

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Service worker received message:", request);
  
  if (request.action === 'OPEN_SIDEPANEL') {
    if (sender.tab) {
      // Must be called synchronously to preserve user gesture context
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch((error) => {
          console.error("Error programmatically opening sidepanel:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open
    }
  }

  if (request.action === 'PAGE_RELOADED') {
    if (sender.tab) {
      console.log("[Service Worker] Tab reloaded. Closing sidepanel for tab:", sender.tab.id);
      chrome.sidePanel.setOptions({
        tabId: sender.tab.id,
        enabled: false
      }).then(() => {
        return chrome.sidePanel.setOptions({
          tabId: sender.tab.id,
          path: 'sidepanel/sidepanel.html',
          enabled: true
        });
      }).catch(err => console.error("Error toggling sidepanel state on refresh:", err));
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
      } catch (err) {
        console.error('[SW] Error reading asset files:', err);
        sendResponse({ success: false, error: err.toString() });
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
  return true; 
});
