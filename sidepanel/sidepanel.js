// sidepanel/sidepanel.js
// Manages sidebar states, event listeners, and dynamic UI rendering

document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-prompt');
    const dynamicControls = document.getElementById('dynamic-controls');

    submitBtn.addEventListener('click', () => {
        const promptText = promptInput.value.trim();
        if (!promptText) return;

        // Send message to background script to route to content script
        chrome.runtime.sendMessage({
            action: 'SUBMIT_PROMPT',
            payload: promptText
        });
    });

    const attachBtn = document.getElementById('attach-md-btn');
    attachBtn.addEventListener('click', () => {
        const filesToAttach = [
            "assets/A Prompt Pattern Catalog to Enhance Prompt Engineering with ChatGPT.md",
            "assets/The Prompt Report A Systematic Survey of Prompt Engineering Techniques.md"
        ];
        chrome.runtime.sendMessage({
            action: 'INJECT_FILES',
            payload: filesToAttach
        });
    });

    // Listen for incoming messages (e.g., parsed JSON from Gemini)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'RENDER_JSON_UI') {
            renderDynamicUI(request.payload);
        }
    });

    function renderDynamicUI(data) {
        dynamicControls.innerHTML = ''; // Clear existing
        if (data && Array.isArray(data.questions)) {
            data.questions.forEach(q => {
                const btn = document.createElement('button');
                btn.textContent = q;
                // Style it differently for dynamic options
                btn.style.backgroundColor = '#f1f3f4';
                btn.style.color = '#202124';
                btn.style.border = '1px solid #dadce0';
                
                btn.addEventListener('click', () => {
                    // Send this specific question back
                    chrome.runtime.sendMessage({
                        action: 'SUBMIT_PROMPT',
                        payload: q
                    });
                });
                dynamicControls.appendChild(btn);
            });
        }
    }
});
