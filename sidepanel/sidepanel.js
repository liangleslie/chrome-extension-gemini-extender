// sidepanel/sidepanel.js
// Manages sidebar states, accordion timelines, and dynamic multi-turn form rendering

document.addEventListener('DOMContentLoaded', () => {
    let turnCounter = 0;
    let currentChatId = null;
    let localTags = [];

    const tagInputField = document.getElementById('tag-input-field');
    const tagPillsContainer = document.getElementById('tag-pills');
    const hiddenTagsInput = document.getElementById('final-prompt-tags');

    function renderTagPills() {
        if (tagPillsContainer) {
            tagPillsContainer.innerHTML = '';
            localTags.forEach((tag, index) => {
                const pill = document.createElement('span');
                pill.className = 'tag-badge';
                pill.innerHTML = `
                    ${escapeHtml(tag)}
                    <button type="button" class="tag-remove-btn" data-index="${index}">&times;</button>
                `;

                pill.querySelector('.tag-remove-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeTag(index);
                });

                tagPillsContainer.appendChild(pill);
            });
        }

        if (hiddenTagsInput) {
            hiddenTagsInput.value = localTags.join(', ');
        }
        saveSession();
    }

    function addTag(tag) {
        const cleanTag = tag.trim().replace(/^,|,$/g, '');
        if (cleanTag && !localTags.some(t => t.toLowerCase() === cleanTag.toLowerCase())) {
            localTags.push(cleanTag);
            renderTagPills();
        }
    }

    function removeTag(index) {
        localTags.splice(index, 1);
        renderTagPills();
    }

    function escapeHtml(string) {
        return String(string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Setup Tag Input Listeners
    if (tagInputField) {
        tagInputField.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && tagInputField.value === '' && localTags.length > 0) {
                removeTag(localTags.length - 1);
            }
        });

        tagInputField.addEventListener('keyup', (e) => {
            if (e.key === ' ' || e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = tagInputField.value.trim().replace(/,$/, '');
                if (val && val !== ' ' && val !== ',') {
                    addTag(val);
                }
                tagInputField.value = '';
            }
        });

        tagInputField.addEventListener('blur', () => {
            const val = tagInputField.value.trim();
            if (val && val !== ',' && val !== ' ') {
                addTag(val);
            }
            tagInputField.value = '';
        });
    }

    // 2. Populate Dropdown Options dynamically inside transitionToFinalStep()
    function populateCategoryOptions() {
        const dataList = document.getElementById('category-options');
        if (!dataList) return;

        // Scrape category values from Prompt Library saved schemas
        chrome.storage.local.get({ savedPrompts: [] }, (result) => {
            const existingPrompts = result.savedPrompts || [];
            // Add hardcoded defaults just in case
            const baseCategories = ['coding', 'summarization', 'writing', 'education'];
            const allCategories = new Set(baseCategories);

            existingPrompts.forEach(p => {
                if (p.category) allCategories.add(p.category.trim().toLowerCase());
            });

            dataList.innerHTML = '';
            allCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.charAt(0).toUpperCase() + cat.slice(1);
                dataList.appendChild(option);
            });
        });
    }

    let activeSession = {
        prompt_name: '',
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

    // Attach Context Documents — route through SW which reads the extension assets
    attachBtn.addEventListener('click', () => {
        const filesToAttach = [
            "assets/A Prompt Pattern Catalog to Enhance Prompt Engineering with ChatGPT.md",
            "assets/The Prompt Report A Systematic Survey of Prompt Engineering Techniques.md"
        ];
        chrome.runtime.sendMessage({ action: 'INJECT_FILES', payload: filesToAttach });
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
                    activeSession.prompt_name = typeof data.final_prompt === 'object' ? data.final_prompt.prompt_name : promptInput.value;
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

            // Render predefined options
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

                group.appendChild(label);
            });

            // Add custom response option
            const isCustomChecked = selectedAnswers && !q.options.includes(selectedAnswers[qIdx]);
            const customValue = isCustomChecked ? selectedAnswers[qIdx] : '';

            const customLabel = document.createElement('label');
            customLabel.style.cssText = "padding: 10px 12px; background: white; border: 1px solid #dadce0; border-radius: 6px; cursor: pointer; display: flex; gap: 8px; font-size: 12px; align-items: center; transition: all 0.15s;";

            customLabel.innerHTML = `
                <input type="radio" name="turn${currentTurn}_q${qIdx}" value="__custom__" required style="margin: 0;" ${isCustomChecked ? 'checked' : ''} ${selectedAnswers ? 'disabled' : ''}>
                <span style="white-space: nowrap; line-height: 1.4; color: #5f6368;">Other:</span>
                <input type="text" class="custom-response-text" placeholder="Type custom answer..." value="${customValue}" style="flex-grow: 1; border: 1px solid #dadce0; border-radius: 4px; padding: 4px 8px; font-size: 12px; outline: none; transition: border-color 0.2s;" ${(!isCustomChecked && !selectedAnswers) ? 'disabled' : ''} ${selectedAnswers ? 'readonly disabled' : ''}>
            `;

            if (isCustomChecked) {
                customLabel.style.borderColor = '#1a73e8';
                customLabel.style.background = '#e8f0fe';
            }

            const customRadio = customLabel.querySelector('input[type="radio"]');
            const customText = customLabel.querySelector('input[type="text"]');

            group.appendChild(customLabel);

            // Add change listener to all radios in this fieldset
            const radios = group.querySelectorAll('input[type="radio"]');
            if (!selectedAnswers) {
                radios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        // Reset all labels in this fieldset
                        group.querySelectorAll('label').forEach(lbl => {
                            lbl.style.borderColor = '#dadce0';
                            lbl.style.background = 'white';
                        });

                        // Set active style for selected label
                        const activeLabel = radio.closest('label');
                        activeLabel.style.borderColor = '#1a73e8';
                        activeLabel.style.background = '#e8f0fe';

                        // Enable/disable text input depending on choice
                        if (radio.value === '__custom__') {
                            customText.removeAttribute('disabled');
                            customText.setAttribute('required', '');
                            customText.focus();
                        } else {
                            customText.setAttribute('disabled', '');
                            customText.removeAttribute('required');
                            customText.value = '';
                        }

                        // Force form evaluation to update submit button
                        form.dispatchEvent(new Event('change'));
                    });
                });

                // Auto-select Custom radio when text input gets focus or input
                customText.addEventListener('focus', () => {
                    customText.style.borderColor = '#1a73e8';
                    if (!customRadio.checked) {
                        customRadio.checked = true;
                        customRadio.dispatchEvent(new Event('change'));
                    }
                });

                customText.addEventListener('blur', () => {
                    customText.style.borderColor = '#dadce0';
                });

                customText.addEventListener('input', () => {
                    // Update form change event to refresh submit validation
                    form.dispatchEvent(new Event('change'));
                });
            }

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

            const answers = questions.map((q, qIdx) => {
                const selectedRadio = form.querySelector(`input[name="turn${currentTurn}_q${qIdx}"]:checked`);
                if (selectedRadio && selectedRadio.value === '__custom__') {
                    const txtInput = selectedRadio.closest('label').querySelector('input[type="text"]');
                    return txtInput.value.trim();
                }
                return selectedRadio ? selectedRadio.value : '';
            });

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

            const nameInput = document.getElementById('final-prompt-name');
            if (nameInput) {
                nameInput.value = finalPromptData.prompt_name || '';
            }

            const categoryInput = document.getElementById('final-prompt-category');
            if (categoryInput) {
                categoryInput.value = finalPromptData.category || '';
            }

            const tagsInput = document.getElementById('final-prompt-tags');
            if (tagsInput) {
                const tags = finalPromptData.tags;
                tagsInput.value = Array.isArray(tags) ? tags.join(', ') : (tags || '');
                // Sync localTags array and re-render badges
                localTags = Array.isArray(tags) ? [...tags] : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
                renderTagPills();
            }

            const summaryInput = document.getElementById('final-prompt-summary');
            if (summaryInput) {
                summaryInput.value = finalPromptData.summary || '';
            }
        } else {
            finalPromptOutput.value = finalPromptData || '';
        }

        if (typeof populateCategoryOptions === 'function') {
            populateCategoryOptions();
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
        const promptName = document.getElementById('final-prompt-name')?.value.trim() || `Generated Prompt - ${new Date().toLocaleTimeString()}`;
        const promptText = finalPromptOutput.value;
        const categoryVal = document.getElementById('final-prompt-category')?.value || '';
        const summaryVal = document.getElementById('final-prompt-summary')?.value || '';

        const promptRecord = {
            act: promptName,
            prompt: promptText,
            category: categoryVal,
            tags: localTags, // <--- pulled directly from standard badge array
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

                // Refresh categories list upon successful save
                populateCategoryOptions();

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

        activeSession.prompt_name = document.getElementById('final-prompt-name')?.value || '';
        activeSession.promptInputText = promptInput.value;
        activeSession.finalPromptText = finalPromptOutput.value;
        activeSession.category = document.getElementById('final-prompt-category')?.value || '';
        activeSession.tags = localTags.join(', ');
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

                const creatorTabBtn = document.querySelector('.tab-btn[data-target="tab-creator"]');
                const creatorTabContent = document.getElementById('tab-creator');
                const libraryTabBtn = document.querySelector('.tab-btn[data-target="tab-library"]');
                const libraryTabContent = document.getElementById('tab-library');

                if (creatorTabBtn && creatorTabContent && libraryTabBtn && libraryTabContent) {
                    // Remove active from library, add active to creator
                    libraryTabBtn.classList.remove('active');
                    libraryTabContent.classList.remove('active');
                    creatorTabBtn.classList.add('active');
                    creatorTabContent.classList.add('active');
                }

                promptInput.value = session.promptInputText || '';

                finalPromptOutput.value = session.finalPromptText || '';

                const nameInput = document.getElementById('final-prompt-name');
                if (nameInput) nameInput.value = session.prompt_name || '';

                const summaryInput = document.getElementById('final-prompt-summary');
                if (summaryInput) summaryInput.value = session.summary || '';

                const categoryInput = document.getElementById('final-prompt-category');
                if (categoryInput) categoryInput.value = session.category || '';

                const tagsInput = document.getElementById('final-prompt-tags');
                if (tagsInput) tagsInput.value = session.tags || '';
                localTags = session.tags ? session.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
                renderTagPills();

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

                const hasFinalPrompt = session.finalPromptText && session.finalPromptText.trim() !== '';
                const hasTurns = turnCounter > 0;

                // Lock/Unlock based on existence of data
                if (hasTurns) {
                    s2.classList.remove('locked');
                } else {
                    s2.classList.add('locked');
                }

                if (hasFinalPrompt) {
                    s3.classList.remove('locked');
                } else {
                    s3.classList.add('locked');
                }

                // Let DOM settle, then open the most advanced/latest step
                setTimeout(() => {
                    s1.removeAttribute('open');
                    s2.removeAttribute('open');
                    s3.removeAttribute('open');

                    if (hasFinalPrompt) {
                        s3.setAttribute('open', '');
                    } else if (hasTurns) {
                        s2.setAttribute('open', '');
                    } else {
                        s1.setAttribute('open', '');
                    }
                }, 150);

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
    const nameIn = document.getElementById('final-prompt-name');
    if (nameIn) nameIn.addEventListener('input', saveSession);

    const categoryIn = document.getElementById('final-prompt-category');
    if (categoryIn) categoryIn.addEventListener('input', saveSession);

    const summaryIn = document.getElementById('final-prompt-summary');
    if (summaryIn) summaryIn.addEventListener('input', saveSession);

    // (`tagsIn` listener is removed because pill buttons directly invoke saveSession)

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