// sidepanel/prompt-library.js
// Prompt Library tab — load, browse, edit, and send prompts

(function () {
  // ─── State ────────────────────────────────────────────────────────────────
  let prompts = [];
  let filtered = [];
  let selectedIdx = -1;
  let isEditMode = false;
  let activeConfirmReset = null;

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const searchInput = document.getElementById('lib-search');
  const categoryFilter = document.getElementById('lib-category-filter');
  const editModeBtn = document.getElementById('lib-edit-mode-toggle');
  const promptList = document.getElementById('lib-prompt-list');
  const detailPanel = document.getElementById('lib-detail-panel');
  const detailEmpty = document.getElementById('lib-detail-empty');
  const detailName = document.getElementById('lib-detail-name');
  const detailCategory = document.getElementById('lib-detail-category');
  const detailTags = document.getElementById('lib-detail-tags');
  const detailSummary = document.getElementById('lib-detail-summary');
  const detailPrompt = document.getElementById('lib-detail-prompt');

  const saveEditBtn = document.getElementById('lib-save-edit-btn');
  const sendChatBtn = document.getElementById('lib-send-chat-btn');
  const createGemBtn = document.getElementById('lib-create-gem-btn');

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    chrome.storage.local.get({ savedPrompts: [] }, ({ savedPrompts }) => {
      // Unify the schema (handle both old "act" format and new "prompt_name" format)
      prompts = savedPrompts.map((sp, idx) => ({
        prompt_name: sp.prompt_name || sp.act || "Unnamed Prompt",
        final_prompt: sp.prompt || sp.final_prompt,
        category: sp.category || 'uncategorized',
        tags: sp.tags || [],
        summary: sp.summary || (sp.prompt ? sp.prompt.substring(0, 60) + '...' : ''),
        originalIdx: idx // Keep track of its place in the storage array for easy saving
      }));
      buildCategoryOptions();
      applyFilter();
    });
  }

  // Listen for external storage updates (e.g. Save Prompt in sidepanel)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.savedPrompts) init();
  });

  function buildCategoryOptions() {
    const cats = [...new Set(prompts.map(p => p.category))].sort();
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      categoryFilter.appendChild(opt);
    });
  }

  // ─── Edit Mode & Deletion Logic ───────────────────────────────────────────
  editModeBtn.addEventListener('click', () => {
    isEditMode = !isEditMode;
    editModeBtn.classList.toggle('active', isEditMode);
    promptList.classList.toggle('edit-mode-active', isEditMode);
  });

  function executeDelete(p) {
    chrome.storage.local.get({ savedPrompts: [] }, (res) => {
      const saved = res.savedPrompts;
      // Remove by array index to be perfectly precise
      saved.splice(p.originalIdx, 1);
      chrome.storage.local.set({ savedPrompts: saved });

      if (filtered[selectedIdx] && filtered[selectedIdx].originalIdx === p.originalIdx) {
        selectedIdx = -1;
        showEmpty();
      }
    });
  }


  // ─── Filter & render list ─────────────────────────────────────────────────
  function applyFilter() {
    const query = searchInput.value.toLowerCase();
    const cat = categoryFilter.value;

    filtered = prompts.filter(p => {
      const matchesText = !query ||
        p.prompt_name.toLowerCase().includes(query) ||
        p.summary.toLowerCase().includes(query) ||
        p.tags.some(t => t.toLowerCase().includes(query));
      const matchesCat = !cat || p.category === cat;
      return matchesText && matchesCat;
    });

    renderList();

    if (selectedIdx >= filtered.length) {
      selectedIdx = -1;
      showEmpty();
    }
  }

  function renderList() {
    // Clean up any orphaned confirm timers if the list re-renders mid-click
    if (activeConfirmReset) { activeConfirmReset(); }

    promptList.innerHTML = '';

    if (filtered.length === 0) {
      promptList.innerHTML = '<p class="lib-empty-msg">No prompts match your search.</p>';
      return;
    }

    filtered.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'lib-card' + (i === selectedIdx ? ' lib-card--active' : '');
      card.dataset.idx = i;

      const tagsHtml = p.tags.map(t => `<span class="lib-tag">${t}</span>`).join('');

      // Notice the new <div class="lib-card-title-group"> wrapper
      card.innerHTML = `
        <div class="lib-card-header">
          <div class="lib-card-title-group">
            <span class="lib-card-name" title="${p.prompt_name}">${p.prompt_name}</span>
            <span class="lib-badge lib-badge--${p.category}">${p.category}</span>
          </div>
          <button class="lib-card-delete-btn" type="button" title="Delete Prompt">&times;</button>
        </div>
        <p class="lib-card-summary">${p.summary}</p>
        <div class="lib-card-tags">${tagsHtml}</div>
      `;

      card.addEventListener('click', () => selectPrompt(i));

      // ── Modern Inline Delete Handler ──
      const delBtn = card.querySelector('.lib-card-delete-btn');

      delBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevents opening the prompt details

        if (card.classList.contains('is-confirming-delete')) {
          // TAP 2: User confirmed!
          if (activeConfirmReset) activeConfirmReset();
          executeDelete(p);
        } else {
          // TAP 1: Trigger confirmation UI
          if (activeConfirmReset) activeConfirmReset(); // Reset any other open card

          card.classList.add('is-confirming-delete');
          delBtn.textContent = 'Confirm';

          const autoTimer = setTimeout(() => resetState(), 3000);

          const outsideClickListener = (evt) => {
            if (!card.contains(evt.target)) resetState();
          };

          function resetState() {
            clearTimeout(autoTimer);
            card.classList.remove('is-confirming-delete');
            delBtn.textContent = '×';
            document.removeEventListener('click', outsideClickListener);
            activeConfirmReset = null;
          }

          activeConfirmReset = resetState;
          setTimeout(() => document.addEventListener('click', outsideClickListener), 10);
        }
      });

      promptList.appendChild(card);
    });
  }

  // ─── Detail panel ─────────────────────────────────────────────────────────
  function selectPrompt(idx) {
    selectedIdx = idx;
    renderList();

    const p = filtered[idx];
    detailEmpty.style.display = 'none';
    detailPanel.style.display = 'flex';

    detailName.textContent = p.prompt_name;
    detailCategory.textContent = p.category;
    detailSummary.textContent = p.summary;

    detailTags.innerHTML = '';
    if (Array.isArray(p.tags)) {
      p.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'lib-tag-badge';
        tagSpan.textContent = tag;
        detailTags.appendChild(tagSpan);
      });
    }

    detailPrompt.value = p.final_prompt;
    saveEditBtn.style.display = 'none';
  }

  function showEmpty() {
    detailPanel.style.display = 'none';
    detailEmpty.style.display = 'flex';
  }

  // ─── Auto-detect modifications ────────────────────────────────────────────
  detailPrompt.addEventListener('input', () => {
    const p = filtered[selectedIdx];
    if (detailPrompt.value !== p.final_prompt) {
      saveEditBtn.style.display = 'inline-flex';
    } else {
      saveEditBtn.style.display = 'none';
    }
  });

  saveEditBtn.addEventListener('click', () => {
    const p = filtered[selectedIdx];
    const newText = detailPrompt.value.trim();
    if (!newText) return;

    p.final_prompt = newText;

    chrome.storage.local.get({ savedPrompts: [] }, (res) => {
      const saved = res.savedPrompts;
      if (saved[p.originalIdx]) {
        saved[p.originalIdx].prompt = newText; // Save back to main storage
        chrome.storage.local.set({ savedPrompts: saved }, () => {
          saveEditBtn.textContent = 'Saved ✓';
          setTimeout(() => {
            saveEditBtn.textContent = 'Save Changes';
            saveEditBtn.style.display = 'none';
          }, 1500);
        });
      }
    });
  });

  // ─── Send to Chat ─────────────────────────────────────────────────────────
  sendChatBtn.addEventListener('click', () => {
    if (selectedIdx < 0) return;
    const promptText = detailPrompt.value; // Send the currently visible text

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'SUBMIT_PROMPT_DIRECT', // Target the new bypass listener
        payload: promptText,
      });
    });

    sendChatBtn.textContent = 'Sent ✓';
    setTimeout(() => { sendChatBtn.textContent = 'Send to Chat'; }, 1500);
  });

  // ─── Create as Gem ────────────────────────────────────────────────────────
  createGemBtn.addEventListener('click', () => {
    if (selectedIdx < 0) return;
    const p = filtered[selectedIdx];

    chrome.runtime.sendMessage({
      action: 'NAVIGATE_AND_PREPOPULATE_GEM',
      payload: {
        name: p.prompt_name,
        instructions: detailPrompt.value, // Send the currently visible text
        description: p.summary,
      },
    });

    createGemBtn.textContent = 'Opening Gem Creator…';
    setTimeout(() => { createGemBtn.textContent = 'Create as Gem →'; }, 2000);
  });

  // ─── Event listeners ──────────────────────────────────────────────────────
  searchInput.addEventListener('input', applyFilter);
  categoryFilter.addEventListener('change', applyFilter);

  // ─── Boot ─────────────────────────────────────────────────────────────────
  init();
})();