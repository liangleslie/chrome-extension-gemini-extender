// content/content.js
// Main script; coordinates DOM parsing and triggers input simulation

console.log("[Content] Loaded in Gemini webpage context");

async function injectFilesIntoGemini(fileDataArray) {
    console.log("[Content] Injecting files via Clipboard...");

    const dataTransfer = new DataTransfer();

    // Add text representation (required by some clipboard listeners)
    const fileNames = fileDataArray.map(f => f.name).join(', ');
    dataTransfer.setData('text/plain', fileNames);

    // Add files
    for (const fd of fileDataArray) {
        const file = new File([fd.content], fd.name, { type: fd.type || 'text/markdown' });
        dataTransfer.items.add(file);
    }

    const chatInput = document.querySelector('div[contenteditable="true"]');
    if (!chatInput) {
        console.error("[Content] Could not find chat input.");
        return;
    }

    // Ensure focus is established
    chatInput.focus();

    // Construct the event
    const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
    });

    // Dispatch it
    chatInput.dispatchEvent(pasteEvent);

    // Silently continue - if the files appear, you've succeeded.
    console.log("[Content] Paste event dispatched to chat input.");
}

function setChatInputText(text) {
    const input = document.querySelector(window.DOM_SELECTORS?.chatInput || 'div[contenteditable="true"]');
    if (!input) {
        console.error("[Content] Target input selector missing in current view");
        return false;
    }
    input.focus();

    const selection = window.getSelection();
    selection.removeAllRanges();
    input.innerHTML = '';
    input.innerText = text;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("[Content] Injected prompt payload into prompt textarea.");
    return true;
}

function clickSendButton() {
    const sendButton = document.querySelector(window.DOM_SELECTORS?.sendButton || 'button[aria-label*="Send"]');
    if (sendButton) {
        console.log("[Content] Executing synthetic send click.");
        sendButton.click();
        return true;
    }
    console.error("[Content] Action button node absent");
    return false;
}

function waitForResponseComplete() {
    return new Promise((resolve) => {
        console.log("[Content] Waiting for typing animation to start...");
        let generationStarted = false;
        let checks = 0;
        const maxChecks = 60; // 30 seconds safety timeout

        const interval = setInterval(() => {
            // ponytail: match Stop state via button attributes, explicit stop classes, or raw google-symbols stop icons
            const stopButton = document.querySelector('button[aria-label*="Stop"], gem-icon-button.stop, mat-icon[data-mat-icon-name="stop"], mat-icon[fonticon="stop"]');
            const micContainer = document.querySelector('.mic-button-container');

            const micHidden = micContainer ? micContainer.classList.contains('hidden') : false;
            const isGenerating = !!stopButton || micHidden;
            checks++;

            console.log(`[Content Poller #${checks}] State Diagnosis:`, {
                generationStarted,
                isGenerating,
                elements: {
                    stopButtonFound: !!stopButton,
                    micHidden
                }
            });

            if (checks > maxChecks) {
                console.warn("[Content] Max wait timeout reached. Proceeding with DOM evaluation.");
                clearInterval(interval);
                resolve();
                return;
            }

            if (!generationStarted) {
                // Phase 1: Wait for generation indicators to become active
                if (isGenerating || checks > 6) {
                    console.log("[Content] Generation recognized as active. Waiting for completion...");
                    generationStarted = true;
                }
            } else {
                // Phase 2: Wait for generation indicators to disappear
                if (!isGenerating) {
                    console.log("[Content] Typing cycle finished. Action button enabled.");
                    clearInterval(interval);
                    resolve();
                }
            }
        }, 500);
    });
}

async function handlePromptSubmission(promptText, isInitial) {
    // ponytail: single unified handler ternary bypasses duplicating execution pipelines
    const wrappedPrompt = isInitial ? `Help me develop an effective prompt.

Purpose and Goals:
* Apply prompt engineering patterns (e.g., Chain-of-Thought, Few-Shot, Role-Prompting).
* Assist me in developing optimized prompts by leveraging a comprehensive internal catalog of techniques.
* Ensure no prompt is proposed until all necessary context, constraints, and requirements are fully understood through iterative diagnostic questioning.

Behaviors and Rules:
1) Information Gathering:
a) Ask a maximum of 3 targeted questions per dialog turn to uncover the specific task, constraints, desired output format, and target audience.
b) Provide exactly 3 multiple-choice options for each question.
c) Leave the "final_prompt" JSON field empty if not confident.

2) Prompt Generation:
a) When confident, optimize the suggested prompt's efficiency.
b) Incorporate specific techniques like 'Least-to-Most prompting' or 'Self-Consistency' where applicable.
c) Populate the "final_prompt" field with the structured prompt.

Output results.json within a markdown codeblock:
{ 
  "initial_prompt": "<initial input prompt",
  "current_phase": "Information Gathering | Prompt Generation", 
  "questions": [
    { 
      "question": "<Question Text>", 
      "options": ["Option A", "Option B", "Option C"] 
    }
  ], 
  "final_prompt": 
    {
        "prompt_name": "<name of prompt>",
        "final_prompt": "<The generated prompt, or null if not confident>", 
        "category": "<category of prompt, e.g. writing, summarization, coding, etc.>", 
        "tags": ["tag1", "tag2", "tag3"], 
        "summary": "<summary of prompt>"
    }
}

User Task:
"${promptText}"` : `Here are my preferences for the questions you asked:
${promptText}

Evaluate this context. Continue with either the diagnostic "Information Gathering" phase (exactly 3 options for each question) or generate the finalized prompt inside the results.json schema if all operational boundaries have been mapped.`;

    if (!setChatInputText(wrappedPrompt)) {
        return { success: false, error: "DOM input injection failed." };
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    if (!clickSendButton()) {
        return { success: false, error: "DOM button trigger failed." };
    }

    await waitForResponseComplete();

    // ponytail: query the latest structured-content-container on the page to prevent reloading step 2a
    const containers = document.querySelectorAll('structured-content-container');
    console.log("[Content] Structured-content-containers found:", containers.length);
    const container = containers[containers.length - 1];
    console.log("[Content] Latest structured-content-container target status:", !!container);

    if (!container) {
        return { success: false, error: "Cannot find structured-content-container in response DOM." };
    }

    const codeEl = container.querySelector('code[data-test-id="code-content"]') || container;
    console.log("[Content] Code block target type matched:", codeEl.tagName, "using test-id?", !!container.querySelector('code[data-test-id="code-content"]'));

    const rawResponseText = codeEl.textContent || codeEl.innerText;
    console.log("[Content] Sending raw extracted characters to parser:", rawResponseText.substring(0, 80) + "...");

    const parsedResult = window.parseGeminiResponse(rawResponseText);
    if (parsedResult.success) {
        console.log("[Content] Parser validated JSON. Dispatching message payload to sidepanel UI.");
        chrome.runtime.sendMessage({
            action: 'RENDER_JSON_UI',
            payload: parsedResult.data
        });
        return { success: true };
    } else {
        console.error("[Content] Extraction processing aborted:", parsedResult.error);
        return { success: false, error: parsedResult.error };
    }
}

// --- UPDATED: Gem Form Prepopulation Handler ---
async function handleGemPrepopulation(payload) {
    console.log("[Content] Starting Gem Form Prepopulation...", payload);

    const waitForElement = (selector, timeout = 8000) => {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    };

    // Use the confirmed exact selectors
    const nameSelector = '#gem-name-input';
    const descSelector = '#gem-description-input';
    const instrSelector = 'rich-textarea[aria-label="Input for the actual Gem instruction"]';

    // 1. Populate Name
    const nameInput = await waitForElement(nameSelector);
    if (nameInput && payload.name) {
        nameInput.value = payload.name;
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        console.warn("[Content] Gem Name input missing or not found in time.");
    }

    // 2. Populate Description
    const descInput = document.querySelector(descSelector);
    if (descInput && payload.description) {
        descInput.value = payload.description;
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
        descInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 3. Populate Instructions (Custom Element Handling)
    const instructionsInput = document.querySelector(instrSelector);
    if (instructionsInput && payload.instructions) {
        // Try standard value property first
        if ('value' in instructionsInput) {
            instructionsInput.value = payload.instructions;
        } else {
            // Fallback for custom rich-textareas: find the internal contenteditable div
            const editor = instructionsInput.querySelector('[contenteditable="true"]') || instructionsInput;
            editor.innerText = payload.instructions;
        }

        // Dispatch events from the host element
        instructionsInput.dispatchEvent(new Event('input', { bubbles: true }));
        instructionsInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Sometimes Quill needs keyup/keydown to register external text changes
        instructionsInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    console.log("[Content] Gem Form Prepopulation phase completed.");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content] Inbound Chrome runtime event received:", request.action);

    if (request.action === "INJECT_FILES_DATA") {
        injectFilesIntoGemini(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch((err) => {
                console.error("[Content] File injection pipeline failed:", err);
                sendResponse({ success: false, error: err.toString() });
            });
        return true;
    }

    if (request.action === "SUBMIT_PROMPT_INITIAL" || request.action === "SUBMIT_PROMPT_FOLLOWUP") {
        const isInitial = request.action === "SUBMIT_PROMPT_INITIAL";
        handlePromptSubmission(request.payload, isInitial)
            .then((result) => sendResponse(result))
            .catch(err => {
                console.error("[Content] Execution pipeline error:", err);
                sendResponse({ success: false, error: err.toString() });
            });
        return true;
    }

    if (request.action === "SUBMIT_PROMPT_DIRECT") {
        setChatInputText(request.payload);
        setTimeout(() => clickSendButton(), 300);
        sendResponse({ success: true });
        return true;
    }

    if (request.action === "PREPOPULATE_GEM") {
        handleGemPrepopulation(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error("[Content] Gem prepopulation failed:", err);
                sendResponse({ success: false, error: err.toString() });
            });
        return true;
    }
});

// Floating Peek & FAB Side Panel Launcher Injection
function initializeFloatingLauncher() {
    // Avoid double injection
    if (document.getElementById('gemini-extender-launcher')) return;

    // Notify service worker of page reload to close stale sidepanel window
    chrome.runtime.sendMessage({ action: 'PAGE_RELOADED' }).catch(err => console.log("PAGE_RELOADED error:", err));

    // Create style element
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        #gemini-extender-launcher {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999999;
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(135deg, #1a73e8, #7c4dff);
          color: white;
          border-radius: 28px;
          box-shadow: 0 6px 20px rgba(26, 115, 232, 0.35);
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-sizing: border-box;
          padding: 8px 16px 8px 10px;
          transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          width: 250px;
          height: 56px;
          overflow: hidden;
          user-select: none;
        }
        #gemini-extender-launcher:hover {
          box-shadow: 0 8px 24px rgba(124, 77, 255, 0.5);
          transform: translateY(-2px);
        }
        #gemini-extender-launcher .launcher-icon-container {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          flex-shrink: 0;
          transition: transform 0.3s ease;
        }
        #gemini-extender-launcher:hover .launcher-icon-container {
          transform: rotate(20deg) scale(1.1);
        }
        #gemini-extender-launcher .launcher-text-container {
          display: flex;
          flex-direction: column;
          justify-content: center;
          transition: opacity 0.3s ease, transform 0.3s ease;
          opacity: 1;
          transform: scale(1);
          white-space: nowrap;
        }
        #gemini-extender-launcher .launcher-title {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        #gemini-extender-launcher .launcher-subtitle {
          font-size: 10px;
          opacity: 0.8;
          margin-top: 1px;
        }
        /* Collapsed (FAB) State */
        #gemini-extender-launcher.collapsed {
          width: 56px;
          height: 56px;
          padding: 0;
          justify-content: center;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        #gemini-extender-launcher.collapsed:hover {
          box-shadow: 0 6px 16px rgba(124, 77, 255, 0.5);
        }
        #gemini-extender-launcher.collapsed .launcher-icon-container {
          background: transparent;
          width: 56px;
          height: 56px;
        }
        #gemini-extender-launcher.collapsed .launcher-text-container {
          opacity: 0;
          width: 0;
          pointer-events: none;
          transform: scale(0.8);
          margin: 0;
          overflow: hidden;
        }
        /* Tooltip style */
        #gemini-extender-launcher.collapsed::after {
          content: "Open Gemini Workspace";
          position: absolute;
          right: 68px;
          background: #202124;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform: translateX(10px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        #gemini-extender-launcher.collapsed:hover::after {
          opacity: 1;
          transform: translateX(0);
        }
    `;
    document.head.appendChild(styleEl);

    // Create main launcher element
    const launcher = document.createElement('div');
    launcher.id = 'gemini-extender-launcher';
    launcher.innerHTML = `
        <div class="launcher-icon-container">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="color: white;">
                <path d="M12 2c-.5 0-.9.3-1 .8L9.2 8.2 3.8 10c-.5.1-.8.5-.8 1s.3.9.8 1l5.4 1.8 1.8 5.4c.1.5.5.8 1 .8s.9-.3 1-.8l1.8-5.4 5.4-1.8c.5-.1.8-.5.8-1s-.3-.9-.8-1l-5.4-1.8L13 2.8c-.1-.5-.5-.8-1-.8z" />
                <path d="M19 19c-.3 0-.5.2-.6.5l-.4 1.1-1.1.4c-.3.1-.5.3-.5.6s.2.5.5.6l1.1.4.4 1.1c.1.3.3.5.6.5s.5-.2.6-.5l.4-1.1 1.1-.4c.3-.1.5-.3.5-.6s-.2-.5-.5-.6l-1.1-.4-.4-1.1c-.1-.3-.3-.5-.6-.5z" opacity="0.8"/>
            </svg>
        </div>
        <div class="launcher-text-container">
            <span class="launcher-title">Gemini Workspace</span>
            <span class="launcher-subtitle">Interactive prompt extension</span>
        </div>
    `;

    document.body.appendChild(launcher);

    // Collapsing trigger after 3.5s
    const collapseTimeout = setTimeout(() => {
        launcher.classList.add('collapsed');
    }, 3500);

    // Click handler to open the side panel
    launcher.addEventListener('click', () => {
        clearTimeout(collapseTimeout);
        launcher.classList.add('collapsed');
        const currentState = launcher.getAttribute('data-state');
        if (currentState === 'open') {
            launcher.setAttribute('data-state', 'closed');
            chrome.runtime.sendMessage({ action: 'CLOSE_SIDEPANEL' }).catch(err => { });
        } else {
            launcher.setAttribute('data-state', 'open');
            chrome.runtime.sendMessage({ action: 'OPEN_SIDEPANEL' }, (response) => {
                console.log("[Content] Programmatic side panel request response:", response);
            });
        }
    });
}

// Run launcher initialization when DOM is loaded or immediately if already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFloatingLauncher);
} else {
    initializeFloatingLauncher();
}