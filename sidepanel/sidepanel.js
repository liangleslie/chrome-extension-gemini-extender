// sidepanel/sidepanel.js
// Manages sidebar states, accordion timelines, and dynamic multi-turn form rendering

document.addEventListener('DOMContentLoaded', () => {
    let turnCounter = 0;

    const s1 = document.getElementById('step-1');
    const s2 = document.getElementById('step-2');
    const s3 = document.getElementById('step-3');

    const promptInput = document.getElementById('prompt-input');
    const sendInitialBtn = document.getElementById('send-initial-btn');
    const attachBtn = document.getElementById('attach-md-btn');

    const step2Count = document.getElementById('step-2-count');
    const timeline = document.getElementById('diagnostics-timeline');

    const finalPromptOutput = document.getElementById('final-prompt-output');
    const copyPromptBtn = document.getElementById('copy-prompt-btn');
    const saveDbBtn = document.getElementById('save-db-btn');

    // Utility: Post message safely directly to the active tab's content script
    function postToContentScript(action, payload) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action, payload });
            }
        });
    }

    // Attach Context Documents
    attachBtn.addEventListener('click', () => {
        const filesToAttach = [
            "assets/A Prompt Pattern Catalog to Enhance Prompt Engineering with ChatGPT.md",
            "assets/The Prompt Report A Systematic Survey of Prompt Engineering Techniques.md"
        ];
        postToContentScript('INJECT_FILES', filesToAttach);
    });

    // Step 1: Submit Initial Base Prompt
    sendInitialBtn.addEventListener('click', () => {
        const promptText = promptInput.value.trim();
        if (!promptText) return;

        sendInitialBtn.disabled = true;
        sendInitialBtn.textContent = "Processing Initial Prompt...";

        postToContentScript('SUBMIT_PROMPT_INITIAL', promptText);
    });

    // Step 2: Receive and render incoming dynamic questions or finalize
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === 'RENDER_JSON_UI') {
            const data = request.payload;
            if (data.final_prompt) {
                transitionToFinalStep(data.final_prompt);
            } else if (data.questions?.length) {
                appendDiagnosticTurn(data.questions);
            }
        }
    });

    function appendDiagnosticTurn(questions) {
        turnCounter++;

        // Unlock Step 2 & auto-collapse Step 1
        s2.classList.remove('locked');
        s2.open = true;
        s1.open = false;

        // Reset Step 1 trigger button safely
        sendInitialBtn.disabled = false;
        sendInitialBtn.textContent = "Regenerate Base Prompt";

        // Update turn indicator badge
        step2Count.textContent = `${turnCounter} Dynamic Turns`;
        step2Count.style.display = 'inline-block';

        const turnBlock = document.createElement('div');
        const currentTurn = turnCounter; // Capture current counter in scope
        turnBlock.id = `turn-block-${currentTurn}`;
        turnBlock.style.cssText = "border: 1px solid #dadce0; border-radius: 8px; padding: 16px; background: #fafafa; display: flex; flex-direction: column; gap: 12px; transition: all 0.2s;";

        const turnHeader = document.createElement('div');
        turnHeader.style.cssText = "font-size: 13px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #dadce0; padding-bottom: 8px;";
        turnHeader.innerHTML = `<div style="font-weight: 600;">Diagnostic Turn ${currentTurn}</div><span style="color:#5f6368; font-size:11px;">Pending Selection</span>`;
        turnBlock.appendChild(turnHeader);

        const form = document.createElement('form');
        form.style.cssText = "display: flex; flex-direction: column; gap: 16px; margin: 0;";

        questions.forEach((q, qIdx) => {
            const group = document.createElement('fieldset');
            group.style.cssText = "border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;";
            group.innerHTML = `<legend style="font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #3c4043;">${q.question}</legend>`;

            q.options.forEach((opt) => {
                const label = document.createElement('label');
                label.style.cssText = "padding: 10px 12px; background: white; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; display: flex; gap: 8px; font-size: 12px; align-items: center; transition: all 0.15s;";
                label.innerHTML = `
                    <input type="radio" name="turn${currentTurn}_q${qIdx}" value="${opt}" required style="margin: 0;">
                    <span style="line-height: 1.4;">${opt}</span>
                `;

                // ponytail: simple interactive option active-state styling
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

        const submitBtn = document.createElement('button');
        submitBtn.type = "submit";
        submitBtn.textContent = `Submit Selection Set ${currentTurn}`;
        submitBtn.className = "btn-primary";
        submitBtn.disabled = true;
        form.appendChild(submitBtn);

        form.addEventListener('change', () => {
            submitBtn.disabled = !form.checkValidity();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting Selections...";

            const formData = new FormData(form);
            const resolvedAnswers = questions.map((q, qIdx) => {
                return `Q: ${q.question}\nA: ${formData.get(`turn${currentTurn}_q${qIdx}`)}`;
            }).join('\n\n');

            postToContentScript('SUBMIT_PROMPT_FOLLOWUP', resolvedAnswers);

            // ponytail: collapse the turn choices entirely and provide a brief selection header summary with a native manual expand trigger
            form.style.display = 'none';

            const userChoices = questions.map((q, qIdx) => formData.get(`turn${currentTurn}_q${qIdx}`)).join(', ');
            turnHeader.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <span style="font-weight: 600;">Diagnostic Turn ${currentTurn}</span>
                        <span style="color:#1a73e8; font-weight:600; font-size:11px; cursor:pointer;" class="toggle-turn-btn">Expand</span>
                    </div>
                    <div style="font-size:11px; color:#5f6368; font-weight:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;" title="${userChoices}">
                        Selected: ${userChoices}
                    </div>
                </div>
            `;

            const toggleBtn = turnHeader.querySelector('.toggle-turn-btn');
            toggleBtn.addEventListener('click', () => {
                if (form.style.display === 'none') {
                    form.style.display = 'flex';
                    toggleBtn.textContent = 'Collapse';
                } else {
                    form.style.display = 'none';
                    toggleBtn.textContent = 'Expand';
                }
            });

            // Collapse this specific turn block visually to mark completion
            form.querySelectorAll('input').forEach(input => input.disabled = true);
            submitBtn.style.display = 'none';
            turnBlock.style.opacity = "0.85";
            turnBlock.style.background = "#f1f3f4";
        });

        turnBlock.appendChild(form);
        timeline.appendChild(turnBlock);
    }

    function transitionToFinalStep(promptText) {
        s1.open = false;
        s2.open = false;
        s3.classList.remove('locked');
        s3.open = true;

        finalPromptOutput.value = promptText;
    }

    // Step 3 CTA Handlers
    copyPromptBtn.addEventListener('click', () => {
        finalPromptOutput.select();
        document.execCommand('copy');
        copyPromptBtn.textContent = "Copied to Clipboard!";
        setTimeout(() => { copyPromptBtn.textContent = "Copy to Clipboard"; }, 1500);
    });

    saveDbBtn.addEventListener('click', () => {
        // ponytail: database storage integration deferred to next iteration
        console.log("[Storage] Saving prompt data locally:", finalPromptOutput.value);
        saveDbBtn.textContent = "Saved Locally!";
        saveDbBtn.disabled = true;
        setTimeout(() => {
            saveDbBtn.textContent = "Save Prompt";
            saveDbBtn.disabled = false;
        }, 1500);
    });
});