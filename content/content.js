// content/content.js
// Main script; coordinates DOM parsing and triggers input simulation

(function () {
    if (window.__contentScriptDebugInit) return;
    window.__contentScriptDebugInit = true;

    var DEBUG_MODE = false;

    chrome.storage.local.get({ debugMode: false }, (res) => {
        DEBUG_MODE = res.debugMode;
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.debugMode) DEBUG_MODE = changes.debugMode.newValue;
    });

    // Local function declarations
    function log(...args) { if (DEBUG_MODE) console.log("[Content]", ...args); }
    function warn(...args) { if (DEBUG_MODE) console.warn("[Content]", ...args); }
    function err(...args) { if (DEBUG_MODE) console.error("[Content]", ...args); }

    log("Loaded in Gemini webpage context");

    // Load prompt templates from storage
    let promptTemplates = {};
    let shortcutPromptText = '';

    async function loadPromptTemplates() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ savedPrompts: [], creatorPrompts: [], shortcutPrompts: [] }, (result) => {
                const prompts = result.savedPrompts || [];
                const creatorPrompts = result.creatorPrompts || [];
                const shortcutPrompts = result.shortcutPrompts || [];

                // Build a map by prompt_name for easy lookup
                const map = {};
                const creatorMap = {}
                prompts.forEach(p => {
                    const name = p.prompt_name;
                    if (name && p.final_prompt) {
                        map[name] = p.final_prompt;
                    }
                });
                creatorPrompts.forEach(p => {
                    const name = p.prompt_name;
                    if (name && p.final_prompt) {
                        creatorMap[name] = p.final_prompt;
                    }
                });

                // Get the first shortcut prompt's final_prompt
                if (shortcutPrompts.length > 0 && shortcutPrompts[0].final_prompt) {
                    shortcutPromptText = shortcutPrompts[0].final_prompt;
                }

                promptTemplates = { "prompts": map, "creator_prompts": creatorMap };
                log("Loaded prompt templates from storage:", Object.keys(promptTemplates));
                log("Loaded shortcut prompt:", shortcutPromptText ? "yes" : "no");
                resolve(promptTemplates);
            });
        });
    }

    // Initialize prompt templates on load
    loadPromptTemplates();

    // Listen for storage changes to reload templates
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.savedPrompts || changes.shortcutPrompts)) {
            loadPromptTemplates();
        }
    });

    async function injectFilesIntoGemini(fileDataArray) {
        log("Injecting files via Clipboard...");

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
            err("Could not find chat input.");
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
        log("Paste event dispatched to chat input.");
    }

    function setChatInputText(text) {
        const input = document.querySelector(window.DOM_SELECTORS?.chatInput || 'div[contenteditable="true"]');
        if (!input) {
            err("Target input selector missing in current view");
            return false;
        }
        input.focus();

        const selection = window.getSelection();
        selection.removeAllRanges();
        input.innerHTML = '';
        input.innerText = text;

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        log("Injected prompt payload into prompt textarea.");
        return true;
    }

    function clickSendButton() {
        const sendButton = document.querySelector(window.DOM_SELECTORS?.sendButton || 'button[aria-label*="Send"]');
        if (sendButton) {
            log("Executing synthetic send click.");
            sendButton.click();
            return true;
        }
        err("Action button node absent");
        return false;
    }

    function waitForResponseComplete() {
        return new Promise((resolve) => {
            log("Waiting for typing animation to start...");
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

                log(`[Content Poller #${checks}] State Diagnosis:`, {
                    generationStarted,
                    isGenerating,
                    elements: {
                        stopButtonFound: !!stopButton,
                        micHidden
                    }
                });

                if (checks > maxChecks) {
                    warn("Max wait timeout reached. Proceeding with DOM evaluation.");
                    clearInterval(interval);
                    resolve();
                    return;
                }

                if (!generationStarted) {
                    // Phase 1: Wait for generation indicators to become active
                    if (isGenerating || checks > 6) {
                        log("Generation recognized as active. Waiting for completion...");
                        generationStarted = true;
                    }
                } else {
                    // Phase 2: Wait for generation indicators to disappear
                    if (!isGenerating) {
                        log("Typing cycle finished. Action button enabled.");
                        clearInterval(interval);
                        resolve();
                    }
                }
            }, 500);
        });
    }

    async function handlePromptSubmission(promptText, isInitial) {
        // Ensure prompt templates are loaded
        if (Object.keys(promptTemplates).length === 0) {
            await loadPromptTemplates();
        }

        // Get the appropriate template from storage
        const initialPromptTemplate = promptTemplates["creator_prompts"]["Prompt Engineering Wizard - Initial"];
        const followupPromptTemplate = promptTemplates["creator_prompts"]["Prompt Engineering Wizard - Follow-up"];

        if (!initialPromptTemplate || !followupPromptTemplate) {
            return { success: false, error: "Prompt templates not loaded. Please refresh the page." };
        }

        // Replace the placeholder with actual prompt text
        const wrappedPrompt = isInitial
            ? initialPromptTemplate + "\n" + promptText
            : followupPromptTemplate + "\n" + promptText;

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
        log("Structured-content-containers found:", containers.length);
        const container = containers[containers.length - 1];
        log("Latest structured-content-container target status:", !!container);

        if (!container) {
            return { success: false, error: "Cannot find structured-content-container in response DOM." };
        }

        const codeEl = container.querySelector('code[data-test-id="code-content"]') || container;
        log("Code block target type matched:", codeEl.tagName, "using test-id?", !!container.querySelector('code[data-test-id="code-content"]'));

        const rawResponseText = codeEl.textContent || codeEl.innerText;
        log("Sending raw extracted characters to parser:", rawResponseText.substring(0, 80) + "...");

        const parsedResult = window.parseGeminiResponse(rawResponseText);
        if (parsedResult.success) {
            log("Parser validated JSON. Dispatching message payload to sidepanel UI.");
            chrome.runtime.sendMessage({
                action: 'RENDER_JSON_UI',
                payload: parsedResult.data
            });
            return { success: true };
        } else {
            err("Extraction processing aborted:", parsedResult.error);
            return { success: false, error: parsedResult.error };
        }
    }

    // --- UPDATED: Gem Form Prepopulation Handler ---
    async function handleGemPrepopulation(payload) {
        log("Starting Gem Form Prepopulation...", payload);

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
            warn("Gem Name input missing or not found in time.");
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

        log("Gem Form Prepopulation phase completed.");
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        log("Inbound Chrome runtime event received:", request.action);

        if (request.action === "INJECT_FILES_DATA") {
            injectFilesIntoGemini(request.payload)
                .then(() => sendResponse({ success: true }))
                .catch((err) => {
                    err("File injection pipeline failed:", err);
                    sendResponse({ success: false, error: err.toString() });
                });
            return true;
        }

        if (request.action === "SUBMIT_PROMPT_INITIAL" || request.action === "SUBMIT_PROMPT_FOLLOWUP") {
            const isInitial = request.action === "SUBMIT_PROMPT_INITIAL";
            handlePromptSubmission(request.payload, isInitial)
                .then((result) => sendResponse(result))
                .catch(error => {
                    err("Execution pipeline error:", error);
                    sendResponse({ success: false, error: error.toString() });
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
                .catch(error => {
                    err("Gem prepopulation failed:", error);
                    sendResponse({ success: false, error: error.toString() });
                });
            return true;
        }
    });

    // Floating Peek & FAB Side Panel Launcher Injection
    function initializeFloatingLauncher() {
        // Avoid double injection
        if (document.getElementById('gemini-extender-launcher') || document.getElementById('gemini-extender-shortcut-fab')) return;

        // Notify service worker of page reload to close stale sidepanel window
        chrome.runtime.sendMessage({ action: 'PAGE_RELOADED' }).catch(error => log("PAGE_RELOADED error:", error));

        // Create shortcut FAB element (left side)
        const shortcutFab = document.createElement('div');
        shortcutFab.id = 'gemini-extender-shortcut-fab';
        shortcutFab.innerHTML = `
            <div class="launcher-icon-container">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="color: white;">
                    <path d="M12 20h9M16.5 3.5a2.17 2.17 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
            </div>
            <div class="launcher-text-container">
                <span class="launcher-title">Editor Prompt</span>
                <span class="launcher-subtitle">Inject shortcut</span>
            </div>
        `;

        document.body.appendChild(shortcutFab);

        // Create main launcher element (right side)
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
            shortcutFab.classList.add('collapsed');
            launcher.classList.add('collapsed');
        }, 3500);

        // Click handler for shortcut FAB - inject prompt without sending
        shortcutFab.addEventListener('click', async () => {
            log("Shortcut FAB clicked - injecting editor prompt");
            // Ensure shortcut prompt is loaded
            if (!shortcutPromptText) {
                await loadPromptTemplates();
            }
            if (shortcutPromptText) {
                setChatInputText(shortcutPromptText);
            } else {
                err("No shortcut prompt available in storage");
            }
        });

        // Click handler to open the side panel
        launcher.addEventListener('click', () => {
            clearTimeout(collapseTimeout);
            shortcutFab.classList.add('collapsed');
            launcher.classList.add('collapsed');

            // 1. LIFECYCLE GUARD: Check if the extension was reloaded/invalidated in the background
            if (!chrome.runtime || !chrome.runtime.sendMessage) {
                warn("Extension context invalidated. The script is orphaned.");
                alert("The extension was updated or reloaded in the background.\n\nPlease refresh this page to reconnect the Gemini Workspace launcher.");
                return;
            }

            // 2. BROAD PWA DETECTION: Catch all flavors of standalone/app windows
            const isStandaloneWebApp =
                window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: minimal-ui)').matches ||
                window.matchMedia('(display-mode: window-controls-overlay)').matches ||
                window.navigator.standalone === true;

            // --- PWA ALTERNATIVE PATH ---
            if (isStandaloneWebApp) {
                log("PWA mode detected. Toggling custom injected iframe sidebar.");

                let shadowHost = document.getElementById('gemini-workspace-shadow-host');

                if (shadowHost) {
                    // If it already exists, toggle its visibility
                    const wrapper = shadowHost.shadowRoot.getElementById('workspace-sidebar-wrapper');
                    if (wrapper.classList.contains('open')) {
                        wrapper.classList.remove('open');
                        launcher.setAttribute('data-state', 'closed');
                    } else {
                        wrapper.classList.add('open');
                        launcher.setAttribute('data-state', 'open');
                    }
                } else {
                    // Create a Shadow Host to isolate extension CSS from Gemini's CSS
                    shadowHost = document.createElement('div');
                    shadowHost.id = 'gemini-workspace-shadow-host';
                    document.body.appendChild(shadowHost);

                    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

                    // Inject styles for the iframe container
                    const style = document.createElement('style');
                    style.textContent = `
                        #workspace-sidebar-wrapper {
                            position: fixed;
                            top: 0;
                            right: -350px; /* Hidden off-screen initially */
                            width: 350px;
                            height: 100vh;
                            z-index: 99999999;
                            background: white;
                            box-shadow: -5px 0 25px rgba(0,0,0,0.15);
                            transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        #workspace-sidebar-wrapper.open {
                            right: 0; /* Slide in */
                        }
                        iframe {
                            width: 100%;
                            height: 100%;
                            border: none;
                        }
                    `;
                    shadowRoot.appendChild(style);

                    // Build wrapper and iframe
                    const wrapper = document.createElement('div');
                    wrapper.id = 'workspace-sidebar-wrapper';
                    wrapper.classList.add('open'); // Open immediately on creation

                    const iframe = document.createElement('iframe');
                    // Load your exact extension sidepanel file into the webpage
                    iframe.src = chrome.runtime.getURL('sidepanel/sidepanel.html');

                    wrapper.appendChild(iframe);
                    shadowRoot.appendChild(wrapper);

                    launcher.setAttribute('data-state', 'open');
                }
                return; // Exit early to bypass the standard native sidepanel logic
            }

            // --- STANDARD BROWSER TAB PATH ---
            const currentState = launcher.getAttribute('data-state');
            if (currentState === 'open') {
                launcher.setAttribute('data-state', 'closed');
                chrome.runtime.sendMessage({ action: 'CLOSE_SIDEPANEL' }).catch(() => { });
            } else {
                chrome.runtime.sendMessage({ action: 'OPEN_SIDEPANEL' }, (response) => {
                    if (response && response.success) {
                        launcher.setAttribute('data-state', 'open');
                    } else {
                        launcher.setAttribute('data-state', 'closed');
                    }
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
})();