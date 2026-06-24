// sidepanel/sidepanel.js
// Manages sidebar states, accordion timelines, and dynamic multi-turn form rendering

document.addEventListener('DOMContentLoaded', () => {
    let turnCounter = 0;
    let currentChatId = null;

    let activeSession = {
        promptInputText: '',
        turns: [], // Array of { questions: [...], selectedAnswers: [...] or null }
        finalPromptText: '',
        category: '',
        tags: '',
        summary: '',
        stepStates: {
            s1Open: true,
            s2Locked: true,
            s2Open: false,
            s3Locked: true,
            s3Open: false
        }
    };

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
                // Support both object and string schemas for final_prompt
                const hasPrompt = typeof data.final_prompt === 'object' 
                    ? !!data.final_prompt.final_prompt 
                    : !!data.final_prompt;
                if (hasPrompt) {
                    // Update session state
                    activeSession.finalPromptText = typeof data.final_prompt === 'object' ? data.final_prompt.final_prompt : data.final_prompt;
                    activeSession.category = typeof data.final_prompt === 'object' ? (data.final_prompt.category || '') : '';
                    activeSession.tags = typeof data.final_prompt === 'object' ? (Array.isArray(data.final_prompt.tags) ? data.final_prompt.tags.join(', ') : (data.final_prompt.tags || '')) : '';
                    activeSession.summary = typeof data.final_prompt === 'object' ? (data.final_prompt.summary || '') : '';
                    
                    transitionToFinalStep(data.final_prompt);
                    saveSession();
                } else if (data.questions?.length) {
                    // Add turn to session
                    activeSession.turns.push({ questions: data.questions, selectedAnswers: null });
                    appendDiagnosticTurn(data.questions);
                    saveSession();
                }
            } else if (data.questions?.length) {
                // Add turn to session
                activeSession.turns.push({ questions: data.questions, selectedAnswers: null });
                appendDiagnosticTurn(data.questions);
                saveSession();
            }
        }
    });

    function appendDiagnosticTurn(questions, selectedAnswers = null) {
        turnCounter++;
        const currentTurn = turnCounter;

        // Unlock Step 2 & auto-collapse Step 1 (only if rendering an active/new turn)
        if (!selectedAnswers) {
            s2.classList.remove('locked');
            s2.open = true;
            s1.open = false;
        }

        // Reset Step 1 trigger button safely
        sendInitialBtn.disabled = false;
        sendInitialBtn.textContent = "Regenerate Base Prompt";

        // Update turn indicator badge
        step2Count.textContent = `${currentTurn} Dynamic Turns`;
        step2Count.style.display = 'inline-block';

        const turnBlock = document.createElement('div');
        turnBlock.id = `turn-block-${currentTurn}`;
        turnBlock.style.cssText = "border: 1px solid #dadce0; border-radius: 8px; padding: 16px; background: #fafafa; display: flex; flex-direction: column; gap: 12px; transition: all 0.2s;";

        const turnHeader = document.createElement('div');
        turnHeader.style.cssText = "font-size: 13px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #dadce0; padding-bottom: 8px;";
        
        const userChoices = selectedAnswers ? selectedAnswers.join(', ') : '';
        turnHeader.innerHTML = selectedAnswers 
            ? `
                <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <span style="font-weight: 600;">Diagnostic Turn ${currentTurn}</span>
                        <span style="color:#1a73e8; font-weight:600; font-size:11px; cursor:pointer;" class="toggle-turn-btn">Expand</span>
                    </div>
                    <div style="font-size:11px; color:#5f6368; font-weight:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;" title="${userChoices}">
                        Selected: ${userChoices}
                    </div>
                </div>
            `
            : `<div style="font-weight: 600;">Diagnostic Turn ${currentTurn}</div><span style="color:#5f6368; font-size:11px;">Pending Selection</span>`;
        turnBlock.appendChild(turnHeader);

        const form = document.createElement('form');
        form.style.cssText = "display: flex; flex-direction: column; gap: 16px; margin: 0;";
        if (selectedAnswers) {
            form.style.display = 'none'; // Hide by default if already answered
        }

        questions.forEach((q, qIdx) => {
            const group = document.createElement('fieldset');
            group.style.cssText = "border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px;";
            group.innerHTML = `<legend style="font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #3c4043;">${q.question}</legend>`;

            q.options.forEach((opt) => {
                const label = document.createElement('label');
                label.style.cssText = "padding: 10px 12px; background: white; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; display: flex; gap: 8px; font-size: 12px; align-items: center; transition: all 0.15s;";
                
                const isChecked = selectedAnswers && selectedAnswers[qIdx] === opt;
                label.innerHTML = `
                    <input type="radio" name="turn${currentTurn}_q${qIdx}" value="${opt}" required style="margin: 0;" ${isChecked ? 'checked' : ''} ${selectedAnswers ? 'disabled' : ''}>
                    <span style="line-height: 1.4;">${opt}</span>
                `;

                if (isChecked) {
                    label.style.borderColor = '#1a73e8';
                    label.style.background = '#e8f0fe';
                }

                // simple interactive option active-state styling
                const radio = label.querySelector('input');
                if (!selectedAnswers) {
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
                }

                group.appendChild(label);
            });
            form.appendChild(group);
        });

        const submitBtn = document.createElement('button');
        submitBtn.type = "submit";
        submitBtn.textContent = `Submit Selection Set ${currentTurn}`;
        submitBtn.className = "btn-primary";
        submitBtn.disabled = true;
        if (selectedAnswers) {
            submitBtn.style.display = 'none';
        }
        form.appendChild(submitBtn);

        form.addEventListener('change', () => {
            submitBtn.disabled = !form.checkValidity();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting Selections...";

            const formData = new FormData(form);
            const answers = questions.map((q, qIdx) => formData.get(`turn${currentTurn}_q${qIdx}`));
            
            // Save the selected answers to the session
            activeSession.turns[currentTurn - 1].selectedAnswers = answers;
            saveSession();

            const resolvedAnswers = questions.map((q, qIdx) => {
                return `Q: ${q.question}\nA: ${answers[qIdx]}`;
            }).join('\n\n');

            postToContentScript('SUBMIT_PROMPT_FOLLOWUP', resolvedAnswers);

            form.style.display = 'none';

            const choicesStr = answers.join(', ');
            turnHeader.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                        <span style="font-weight: 600;">Diagnostic Turn ${currentTurn}</span>
                        <span style="color:#1a73e8; font-weight:600; font-size:11px; cursor:pointer;" class="toggle-turn-btn">Expand</span>
                    </div>
                    <div style="font-size:11px; color:#5f6368; font-weight:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;" title="${choicesStr}">
                        Selected: ${choicesStr}
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

            form.querySelectorAll('input').forEach(input => input.disabled = true);
            submitBtn.style.display = 'none';
            turnBlock.style.opacity = "0.85";
            turnBlock.style.background = "#f1f3f4";
        });

        // Set up the expand toggle listener for completed/reconstructed turns
        if (selectedAnswers) {
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
            turnBlock.style.opacity = "0.85";
            turnBlock.style.background = "#f1f3f4";
        }

        turnBlock.appendChild(form);
        timeline.appendChild(turnBlock);
    }

    function transitionToFinalStep(finalPromptData) {
        s1.open = false;
        s2.open = false;
        s3.classList.remove('locked');
        s3.open = true;

        if (typeof finalPromptData === 'object' && finalPromptData !== null) {
            finalPromptOutput.value = finalPromptData.final_prompt || '';
            
            const categoryInput = document.getElementById('final-prompt-category');
            if (categoryInput) {
                categoryInput.value = finalPromptData.category || '';
            }
            
            const tagsInput = document.getElementById('final-prompt-tags');
            if (tagsInput) {
                const tags = finalPromptData.tags;
                tagsInput.value = Array.isArray(tags) ? tags.join(', ') : (tags || '');
            }
            
            const summaryInput = document.getElementById('final-prompt-summary');
            if (summaryInput) {
                summaryInput.value = finalPromptData.summary || '';
            }
        } else {
            finalPromptOutput.value = finalPromptData || '';
        }
    }

    // Step 3 CTA Handlers
    copyPromptBtn.addEventListener('click', () => {
        finalPromptOutput.select();
        document.execCommand('copy');
        copyPromptBtn.textContent = "Copied to Clipboard!";
        setTimeout(() => { copyPromptBtn.textContent = "Copy to Clipboard"; }, 1500);
    });

    saveDbBtn.addEventListener('click', () => {
        const promptText = finalPromptOutput.value;
        const categoryVal = document.getElementById('final-prompt-category')?.value || '';
        const tagsText = document.getElementById('final-prompt-tags')?.value || '';
        const summaryVal = document.getElementById('final-prompt-summary')?.value || '';
        
        const tagsArr = tagsText.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);

        const promptRecord = {
            prompt: promptText,
            category: categoryVal,
            tags: tagsArr,
            summary: summaryVal,
            savedAt: new Date().toISOString()
        };

        chrome.storage.local.get({ savedPrompts: [] }, (result) => {
            const list = result.savedPrompts || [];
            list.push(promptRecord);
            chrome.storage.local.set({ savedPrompts: list }, () => {
                console.log("[Storage] Prompt saved to local storage successfully:", promptRecord);
                
                saveDbBtn.textContent = "Saved to Extension!";
                saveDbBtn.disabled = true;
                setTimeout(() => {
                    saveDbBtn.textContent = "Save Prompt";
                    saveDbBtn.disabled = false;
                }, 1500);
            });
        });
    });

    // --- Session Persistence Logic ---

    function getChatIdFromUrl(url) {
        if (!url) return null;
        const match = url.match(/\/app\/(?:c\/)?([a-zA-Z0-9_]+)/);
        if (match) {
            const cid = match[1];
            if (cid.length >= 8 && cid !== 'workspace') {
                return cid.startsWith('c_') ? cid : 'c_' + cid;
            }
        }
        return 'new_chat';
    }

    function saveSession() {
        if (!currentChatId) return Promise.resolve();
        
        activeSession.promptInputText = promptInput.value;
        activeSession.finalPromptText = finalPromptOutput.value;
        activeSession.category = document.getElementById('final-prompt-category')?.value || '';
        activeSession.tags = document.getElementById('final-prompt-tags')?.value || '';
        activeSession.summary = document.getElementById('final-prompt-summary')?.value || '';
        activeSession.stepStates = {
            s1Open: s1.open,
            s2Locked: s2.classList.contains('locked'),
            s2Open: s2.open,
            s3Locked: s3.classList.contains('locked'),
            s3Open: s3.open
        };

        const key = `session_${currentChatId}`;
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: activeSession }, () => {
                resolve();
            });
        });
    }

    function loadSession(chatId) {
        chrome.storage.local.get([`session_${chatId}`], (result) => {
            const session = result[`session_${chatId}`];
            
            // Clear current timeline and reset turnCounter
            timeline.innerHTML = '';
            turnCounter = 0;

            if (session) {
                activeSession = session;
                promptInput.value = session.promptInputText || '';
                
                finalPromptOutput.value = session.finalPromptText || '';
                const categoryInput = document.getElementById('final-prompt-category');
                if (categoryInput) categoryInput.value = session.category || '';
                const tagsInput = document.getElementById('final-prompt-tags');
                if (tagsInput) tagsInput.value = session.tags || '';
                const summaryInput = document.getElementById('final-prompt-summary');
                if (summaryInput) summaryInput.value = session.summary || '';

                if (session.stepStates.s1Open) s1.setAttribute('open', ''); else s1.removeAttribute('open');
                
                if (session.stepStates.s2Locked) s2.classList.add('locked'); else s2.classList.remove('locked');
                if (session.stepStates.s2Open) s2.setAttribute('open', ''); else s2.removeAttribute('open');
                
                if (session.stepStates.s3Locked) s3.classList.add('locked'); else s3.classList.remove('locked');
                if (session.stepStates.s3Open) s3.setAttribute('open', ''); else s3.removeAttribute('open');

                // Reconstruct turn blocks from saved state
                if (Array.isArray(session.turns)) {
                    session.turns.forEach((turn) => {
                        appendDiagnosticTurn(turn.questions, turn.selectedAnswers);
                    });
                }
                
                // Set turn badge count
                turnCounter = Array.isArray(session.turns) ? session.turns.length : 0;
                step2Count.textContent = `${turnCounter} Dynamic Turns`;
                step2Count.style.display = turnCounter > 0 ? 'inline-block' : 'none';
            } else {
                activeSession = {
                    promptInputText: '',
                    turns: [],
                    finalPromptText: '',
                    category: '',
                    tags: '',
                    summary: '',
                    stepStates: {
                        s1Open: true,
                        s2Locked: true,
                        s2Open: false,
                        s3Locked: true,
                        s3Open: false
                    }
                };
                
                promptInput.value = '';
                finalPromptOutput.value = '';
                if (document.getElementById('final-prompt-category')) document.getElementById('final-prompt-category').value = '';
                if (document.getElementById('final-prompt-tags')) document.getElementById('final-prompt-tags').value = '';
                if (document.getElementById('final-prompt-summary')) document.getElementById('final-prompt-summary').value = '';
                
                s1.setAttribute('open', '');
                s2.classList.add('locked');
                s2.removeAttribute('open');
                s3.classList.add('locked');
                s3.removeAttribute('open');
                
                step2Count.style.display = 'none';
            }
        });
    }

    // Auto-save listeners on user interaction
    promptInput.addEventListener('input', saveSession);
    finalPromptOutput.addEventListener('input', saveSession);
    
    // Setup inputs event delegation/checks to capture edits
    const categoryIn = document.getElementById('final-prompt-category');
    if (categoryIn) categoryIn.addEventListener('input', saveSession);
    
    const tagsIn = document.getElementById('final-prompt-tags');
    if (tagsIn) tagsIn.addEventListener('input', saveSession);
    
    const summaryIn = document.getElementById('final-prompt-summary');
    if (summaryIn) summaryIn.addEventListener('input', saveSession);

    // Capture accordion layout toggles
    s1.addEventListener('toggle', saveSession);
    s2.addEventListener('toggle', saveSession);
    s3.addEventListener('toggle', saveSession);

    // Query active tab URL at startup
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
            currentChatId = getChatIdFromUrl(tabs[0].url);
            if (currentChatId) {
                loadSession(currentChatId);
            }
        }
    });

    // Listen for tab URL updates to dynamically switch session
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.url) {
            chrome.tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
                if (activeTabs[0] && activeTabs[0].id === tabId) {
                    const newChatId = getChatIdFromUrl(changeInfo.url);
                    if (newChatId && newChatId !== currentChatId) {
                        saveSession().then(() => {
                            currentChatId = newChatId;
                            loadSession(newChatId);
                        });
                    }
                }
            });
        }
    });
});