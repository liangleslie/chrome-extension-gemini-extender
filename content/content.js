// content/content.js
// Main script; coordinates DOM parsing and triggers input simulation

console.log("[Content] Loaded in Gemini webpage context");

async function simulateNativeFileUpload(filePaths) {
    const dataTransfer = new DataTransfer();

    for (const path of filePaths) {
        const url = chrome.runtime.getURL(path);
        const response = await fetch(url);
        const blob = await response.blob();

        const rawFileName = path.split('/').pop();
        const decodedName = decodeURIComponent(rawFileName);

        const mimeType = blob.type || 'text/markdown';
        const file = new File([blob], decodedName, { type: mimeType });

        dataTransfer.items.add(file);
    }

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Content] Attached files via hidden input element.");
    } else {
        const dropTarget = document.querySelector('chat-app') || document.body;
        dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        console.log("[Content] Attached files via drag-and-drop simulation.");
    }
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
  "current_phase": "Information Gathering | Prompt Generation", 
  "questions": [
    { 
      "question": "<Question Text>", 
      "options": ["Option A", "Option B", "Option C"] 
    }
  ], 
  "final_prompt": "<The generated prompt, or null if not confident>" 
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content] Inbound Chrome runtime event received:", request.action);

    if (request.action === "INJECT_FILES") {
        simulateNativeFileUpload(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error("[Content] Payload injection exception:", err);
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
});