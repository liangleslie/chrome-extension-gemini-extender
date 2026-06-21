Agent Refactoring Task: Progressive Accordion UI & Contextual Flow Refinement

You are a senior frontend engineer and browser-automation architect. Your task is to refactor our existing Chrome Extension codebase (manifest.json compliant) to introduce a progressive, collapsing accordion UI in the sidepanel and implement a context-preserving multi-turn prompt pipeline in our content script. review the existing [content.js](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/content/content.js) [sidepanel.js](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/sidepanel/sidepanel.js) [next%20step%20spec.md](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/next%20step%20spec.md) [sidepanel.html](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/sidepanel/sidepanel.html)

🎯 Architectural Issues in the Current Code

State Loss on Re-render: Currently, renderDynamicUI(data) clears out controls.innerHTML entirely whenever a new JSON payload arrives. This destroys previous question history and selection contexts.

LLM Context Contamination: When users submit selections in the sidebar, handlePromptSubmission wraps the answers inside the entire system instructions block again. This forces Gemini to restart its diagnostic cycle instead of progressing.

No Dynamic Question Nesting: Follow-up questions (Step 2b, 2c, etc.) overwrite Step 2a instead of appending as a chronological timeline of resolved decision nodes.

🛠️ Step 1: Sidepanel Progressive Accordion Structure

Update sidepanel.html to define three permanent workflow containers matching our accordion states. Use native HTML5 <details> and <summary> tags with CSS pointer-events to prevent users from manually skipping ahead.

File Update: sidepanel/sidepanel.html

```html
Modify the panel structure to establish our chronological workspace lanes:<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Gemini Extended Sidebar</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 16px;
            background: #f8f9fa;
            color: #202124;
            margin: 0;
        }
        
        /* Accordion Styles */
        .step-accordion {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        details {
            background: white;
            border: 1px solid #dadce0;
            border-radius: 8px;
            overflow: hidden;
            transition: all 0.2s ease;
        }
        
        details[open] {
            border-color: #1a73e8;
            box-shadow: 0 1px 3px 0 rgba(60,64,67,0.3);
        }
        
        summary {
            list-style: none;
            padding: 14px 16px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #ffffff;
            user-select: none;
        }
        
        summary::-webkit-details-marker {
            display: none;
        }
        
        /* Prevent manual expanding of locked/unfocused steps */
        details.locked > summary {
            cursor: not-allowed;
            pointer-events: none;
            opacity: 0.6;
            background: #f1f3f4;
        }
        
        .step-content {
            padding: 16px;
            border-top: 1px solid #dadce0;
        }

        .btn-primary {
            background-color: #1a73e8;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            width: 100%;
            transition: background 0.2s;
        }
        
        .btn-primary:hover:not(:disabled) {
            background-color: #1557b0;
        }

        .btn-primary:disabled {
            background-color: #dadce0;
            color: #80868b;
            cursor: not-allowed;
        }

        /* Diagnostic Selection Summary */
        .resolved-selection {
            font-size: 12px;
            color: #5f6368;
            margin-top: 4px;
            font-weight: normal;
        }
    </style>
</head>
<body>
    <div class="step-accordion">
        
        <!-- STEP 1: Workspace Prompt Input -->
        <details id="step-1" open>
            <summary>
                <span>Step 1: Initialize Workspace</span>
            </summary>
            <div class="step-content">
                <p style="font-size:12px; color:#5f6368; margin-top:0;">Describe what you want to build to begin the interactive prompt optimization workspace.</p>
                <textarea id="prompt-input" style="width:100%; height:80px; padding:8px; border:1px solid #dadce0; border-radius:6px; box-sizing:border-box; font-family:inherit; resize:vertical;" placeholder="E.g., A Manifest V3 Chrome Extension that scrapes recipe blogs and downloads them as markdown files..."></textarea>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button id="attach-md-btn" style="padding:8px; background:#f1f3f4; border:1px solid #dadce0; border-radius:6px; font-size:11px; cursor:pointer;">Attach Context Docs</button>
                    <button id="send-initial-btn" class="btn-primary" style="flex:1;">Generate Configuration</button>
                </div>
            </div>
        </details>

        <!-- STEP 2: Diagnostic Dialog Sequence (Contains 2a, 2b, etc.) -->
        <details id="step-2" class="locked">
            <summary>
                <span>Step 2: Refine Requirements</span>
                <span id="step-2-count" style="font-size:11px; background:#e8f0fe; color:#1a73e8; padding:2px 8px; border-radius:10px; display:none;">0 Turns</span>
            </summary>
            <div class="step-content" id="step-2-container" style="display:flex; flex-direction:column; gap:16px;">
                <!-- Chronological turn blocks (2a, 2b...) will append here dynamically -->
                <div id="diagnostics-timeline" style="display:flex; flex-direction:column; gap:16px;"></div>
            </div>
        </details>

        <!-- STEP 3: Optimized System Prompt Output -->
        <details id="step-3" class="locked">
            <summary>
                <span>Step 3: Export Prompt</span>
            </summary>
            <div class="step-content">
                <p style="font-size:12px; color:#5f6368; margin-top:0;">Your production-ready prompt has been generated and compiled with your selections.</p>
                <textarea id="final-prompt-output" readonly style="width:100%; height:120px; padding:8px; border:1px solid #dadce0; border-radius:6px; box-sizing:border-box; background:#f8f9fa; font-family:monospace; font-size:11px;"></textarea>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button id="copy-prompt-btn" class="btn-primary">Copy to Clipboard</button>
                    <!-- ponytail: database features deferred; write local export placeholder -->
                    <button id="save-db-btn" style="padding:10px; background:#34a853; color:white; border:none; border-radius:8px; font-weight:500; cursor:pointer;">Save Prompt</button>
                </div>
            </div>
        </details>

    </div>

    <script src="sidepanel.js"></script>
</body>
</html>
```

🛠️ Step 2: Dynamic Accordion & Timeline Management

Update sidepanel.js to manage the lifecycle of our chronological questionnaire blocks. Each turn returned by the content script's JSON parser must write a fresh card under #diagnostics-timeline (Step 2a, Step 2b, etc.). When a sub-step is submitted, we collapse its options, append a read-only selection label to its header, and await the next iteration.

File Update: sidepanel/sidepanel.js

Refactor selection monitoring, chronological rendering, and event routing:

```js
let turnCounter = 0;

// Set up UI listeners
document.getElementById('attach-md-btn').addEventListener('click', () => {
    const filesToAttach = [
        "assets/context-docs/A%20Prompt%20Pattern%20Catalog%20to%20Enhance%20Prompt%20Engineering%20with%20ChatGPT.md",
        "assets/context-docs/The%20Prompt%20Report%20A%20Systematic%20Survey%20of%20Prompt%20Engineering%20Techniques.md"
    ];
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "INJECT_FILES", payload: filesToAttach });
        }
    });
});

// Initial Submission Flow
document.getElementById('send-initial-btn').addEventListener('click', () => {
    const promptText = document.getElementById('prompt-input').value.trim();
    if (!promptText) return;

    // Transition Step 1 to disabled / collapsed
    const s1Btn = document.getElementById('send-initial-btn');
    s1Btn.disabled = true;
    s1Btn.textContent = "Processing Initial Prompt...";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "SUBMIT_PROMPT_INITIAL",
                payload: promptText
            });
        }
    });
});

// Listen for incoming parsed results
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'RENDER_JSON_UI') {
        const data = request.payload;
        
        // Check if Gemini generated the final prompt or needs more questions
        if (data.final_prompt) {
            transitionToFinalStep(data.final_prompt);
        } else if (data.questions && data.questions.length > 0) {
            appendDiagnosticTurn(data.questions);
        }
    }
});

function appendDiagnosticTurn(questions) {
    turnCounter++;
    
    // Unlock Step 2 container
    const step2 = document.getElementById('step-2');
    step2.classList.remove('locked');
    step2.open = true;
    
    // Auto-collapse Step 1
    document.getElementById('step-1').open = false;
    document.getElementById('send-initial-btn').textContent = "Regenerate Base Prompt";
    document.getElementById('send-initial-btn').disabled = false;

    // Update Turn Indicator in header
    const counterBadge = document.getElementById('step-2-count');
    counterBadge.textContent = `${turnCounter} Dynamic Turns`;
    counterBadge.style.display = 'inline-block';

    const timeline = document.getElementById('diagnostics-timeline');
    const turnBlock = document.createElement('div');
    turnBlock.id = `turn-block-${turnCounter}`;
    turnBlock.style.cssText = "border: 1px solid #dadce0; border-radius: 6px; padding: 12px; background: #fafafa; transition: all 0.2s;";

    const turnHeader = document.createElement('div');
    turnHeader.style.cssText = "font-weight:600; font-size:13px; display:flex; justify-content:space-between; margin-bottom:12px;";
    turnHeader.innerHTML = `<span>Diagnostic Turn ${turnCounter}</span><span style="color:#5f6368; font-weight:normal;">Pending Answer</span>`;
    turnBlock.appendChild(turnHeader);

    // Form system within block
    const form = document.createElement('form');
    form.style.cssText = "display:flex; flex-direction:column; gap:16px;";

    questions.forEach((q, qIdx) => {
        const group = document.createElement('fieldset');
        group.style.cssText = "border:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px;";
        group.innerHTML = `<legend style="font-size:12px; font-weight:600; margin-bottom:6px;">${q.question}</legend>`;

        q.options.forEach((opt) => {
            const label = document.createElement('label');
            label.style.cssText = "padding:8px 12px; background:white; border:1px solid #dadce0; border-radius:6px; cursor:pointer; display:flex; gap:8px; font-size:12px; transition: background 0.15s;";
            label.innerHTML = `
                <input type="radio" name="turn${turnCounter}_q${qIdx}" value="${opt}" required style="margin:0;">
                <span>${opt}</span>
            `;
            
            // ponytail: simple CSS visual focus mapping via JS tracking
            const radio = label.querySelector('input');
            radio.addEventListener('change', () => {
                group.querySelectorAll('label').forEach(lbl => {
                    lbl.style.borderColor = '#dadce0';
                    lbl.style.background = 'white';
                });
                if (radio.checked) {
                    label.style.borderColor = '#1a73e8';
                    label.style.background = '#e8f0fe';
                }
            });

            group.appendChild(label);
        });

        form.appendChild(group);
    });

    // Step-level Submit Button
    const submitBtn = document.createElement('button');
    submitBtn.type = "submit";
    submitBtn.textContent = `Submit Selection Set ${turnCounter}`;
    submitBtn.disabled = true;
    submitBtn.className = "btn-primary";
    form.appendChild(submitBtn);

    // Form selection completeness checker
    form.addEventListener('change', () => {
        submitBtn.disabled = !form.checkValidity();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = "Injecting Context...";

        const formData = new FormData(form);
        const resolvedAnswers = [];

        questions.forEach((q, qIdx) => {
            const selectedVal = formData.get(`turn${turnCounter}_q${qIdx}`);
            resolvedAnswers.push({ question: q.question, answer: selectedVal });
        });

        // Convert the structural turn choices into clean textual context representation
        const contextPayload = resolvedAnswers.map((item, idx) => 
            `My Preference for Question [${idx + 1}] ("${item.question}") is: "${item.answer}"`
        ).join('\n');

        // Send contextual followup to Content script without destroying system schema parameters
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "SUBMIT_PROMPT_FOLLOWUP",
                    payload: contextPayload
                });
            }
        });

        // Collapse this block visually
        form.querySelectorAll('input').forEach(input => input.disabled = true);
        submitBtn.style.display = 'none';
        turnHeader.innerHTML = `<span>Diagnostic Turn ${turnCounter}</span><span style="color:#34a853; font-weight:600;">Submitted</span>`;
        turnBlock.style.opacity = "0.7";
        turnBlock.style.background = "#f1f3f4";
    });

    turnBlock.appendChild(form);
    timeline.appendChild(turnBlock);
}

function transitionToFinalStep(promptText) {
    // Collapse preceding steps
    document.getElementById('step-1').open = false;
    document.getElementById('step-2').open = false;

    // Open & populate Step 3
    const step3 = document.getElementById('step-3');
    step3.classList.remove('locked');
    step3.open = true;

    document.getElementById('final-prompt-output').value = promptText;
}

// Final Step CTA Hooks
document.getElementById('copy-prompt-btn').addEventListener('click', () => {
    const textOut = document.getElementById('final-prompt-output');
    textOut.select();
    document.execCommand('copy');
    
    const btn = document.getElementById('copy-prompt-btn');
    btn.textContent = "Copied to Clipboard!";
    setTimeout(() => { btn.textContent = "Copy to Clipboard"; }, 1500);
});

// ponytail: database storage integration deferred
document.getElementById('save-db-btn').addEventListener('click', () => {
    const promptVal = document.getElementById('final-prompt-output').value;
    console.log("[Storage Placeholder] Prompt value saved locally inside memory space:", promptVal);
    const saveBtn = document.getElementById('save-db-btn');
    saveBtn.textContent = "Saved Successfully!";
    saveBtn.disabled = true;
    setTimeout(() => {
        saveBtn.textContent = "Save Prompt";
        saveBtn.disabled = false;
    }, 2000);
});
```

🛠️ Step 3: Context-Preserving Chat Flow Refinement

Update content.js to define separate input channels:

SUBMIT_PROMPT_INITIAL: Wraps the initial project description inside your detailed system instructions prompt.

SUBMIT_PROMPT_FOLLOWUP: Drops selections directly into the conversation. This keeps Gemini inside the logical context of Turn 1.

File Update: content/content.js

Refactor system entry gateways and incoming runtime events:

```js
// content/content.js
// Refactored with support for Multi-Turn Sequential Prompt Optimization

console.log("[Content] Loaded and monitoring context maps.");

// Keep existing files helper logic (simulateNativeFileUpload, setChatInputText, clickSendButton, etc.)
// ... (Preserve simulateNativeFileUpload, setChatInputText, clickSendButton, waitForResponseComplete unmodified) ...

async function runInitialDiagnosticTurn(rawPromptText) {
    // Initial wrapper that primes Gemini's behavior schema rules
    const systemPrompt = `Help me develop an effective prompt.

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
"${rawPromptText}"`;

    return executeExecutionCycle(systemPrompt);
}

async function runFollowupDiagnosticTurn(followupPayload) {
    // Send a context-preserving textual feedback without repeating entire core parameters
    const followupPrompt = `Here are my preferences for the questions you asked:
${followupPayload}

Evaluate this context. Continue with either the diagnostic "Information Gathering" phase (exactly 3 options for each question) or generate the finalized prompt inside the results.json schema if all operational boundaries have been mapped.`;

    return executeExecutionCycle(followupPrompt);
}

async function executeExecutionCycle(textInput) {
    if (!setChatInputText(textInput)) {
        return { success: false, error: "DOM input text mapping failed." };
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    if (!clickSendButton()) {
        return { success: false, error: "DOM send action node execution failed." };
    }

    await waitForResponseComplete();

    const container = document.querySelector('structured-content-container');
    console.log("[Content] Structured-content-container query target resolved:", !!container);
    
    if (!container) {
        return { success: false, error: "Cannot locate structured response container in output DOM structure." };
    }

    const codeEl = container.querySelector('code[data-test-id="code-content"]') || container;
    const rawResponseText = codeEl.textContent || codeEl.innerText;
    console.log("[Content] Extracted string text payload sending to parser: ", rawResponseText.substring(0, 100) + "...");

    const parsedResult = window.parseGeminiResponse(rawResponseText);
    if (parsedResult.success) {
        console.log("[Content] JSON validated. Communicating payload rendering event to sidebar.");
        chrome.runtime.sendMessage({
            action: 'RENDER_JSON_UI',
            payload: parsedResult.data
        });
        return { success: true };
    } else {
        console.error("[Content] JSON parse evaluation skipped:", parsedResult.error);
        return { success: false, error: parsedResult.error };
    }
}

// Router Event Listener Mapping
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Content] Inbound Chrome runtime event received:", request.action);

    if (request.action === "INJECT_FILES") {
        simulateNativeFileUpload(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true;
    }

    if (request.action === "SUBMIT_PROMPT_INITIAL") {
        runInitialDiagnosticTurn(request.payload)
            .then((result) => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true;
    }

    if (request.action === "SUBMIT_PROMPT_FOLLOWUP") {
        runFollowupDiagnosticTurn(request.payload)
            .then((result) => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true;
    }
});
```

🧪 Step 4: Verification Unit Test

Run this self-check directly within your console to confirm the Chronological Accordion timelines are generated, grouped, and validating their internal states accurately.

Self-Check Test Runner File: tests/sidebar-state-test.js

```js
function runSidebarDiagnosticsTest() {
    console.assert(typeof appendDiagnosticTurn === 'function', "appendDiagnosticTurn interface is missing!");
    
    // Test Turn 1 Append
    appendDiagnosticTurn([
        {
            question: "Is this validation operational?",
            options: ["Yes, fully", "No, partially", "Pending evaluation"]
        }
    ]);

    const block = document.getElementById('turn-block-1');
    console.assert(!!block, "Step 2 Turn card block container was not appended to chronological DOM!");
    
    const submitBtn = block.querySelector('button[type="submit"]');
    console.assert(submitBtn.disabled === true, "Submit button is active despite incomplete/unselected radio elements!");
    
    // Simulate checking a radio button to verify submit is enabled
    const targetRadio = block.querySelector('input[type="radio"]');
    targetRadio.checked = true;
    targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
    
    console.assert(submitBtn.disabled === false, "Submit button remained disabled after complete turn radios were filled!");
    console.log("✅ All progressive form validation tests successfully executed and resolved.");
}
runSidebarDiagnosticsTest();
```
