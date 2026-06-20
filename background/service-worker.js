// background/service-worker.js
// Central message bus routing data between the UI panels and content scripts

console.log("Service Worker initialized.");

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Service worker received message:", request);
  
  if (request.action === 'SUBMIT_PROMPT' || request.action === 'INJECT_FILES') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true; // Keep message channel open for async response
  }
  return true; 
});
