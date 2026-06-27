// sidepanel/settings.js

let logSettings = (...args) => { if (DEBUG_MODE) console.log("[Settings]", ...args); };
let warnSettings = (...args) => { if (DEBUG_MODE) console.warn("[Settings]", ...args); };
let errSettings = (...args) => { if (DEBUG_MODE) console.error("[Settings]", ...args); };

document.addEventListener('DOMContentLoaded', () => {
    const debugToggle = document.getElementById('debug-mode-toggle');
    const resetBtn = document.getElementById('reset-ext-btn');

    // Load initial settings
    chrome.storage.local.get({ debugMode: false }, (res) => {
        debugToggle.checked = res.debugMode;
    });

    // Save toggle changes
    debugToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ debugMode: e.target.checked });
    });

    // Reset Extension to Factory Defaults
    resetBtn.addEventListener('click', () => {
        const confirmed = confirm("Are you sure? This will delete all custom prompts and session histories.");
        if (confirmed) {
            chrome.storage.local.get({ basePrompts: [] }, (data) => {
                const prompts = data.basePrompts;
                console.log("Prompts retrieved from central storage:", prompts);

                chrome.storage.local.clear(() => {
                    chrome.storage.local.set({
                        savedPrompts: prompts,
                        basePrompts: prompts,
                        debugMode: false
                    }, () => {
                        alert("Extension reset successfully.");
                        window.location.reload(); // Reload the sidepanel to refresh the UI
                    });
                });
            });
        }
    });
});