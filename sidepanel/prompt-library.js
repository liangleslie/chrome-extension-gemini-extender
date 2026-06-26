// sidepanel/prompt-library.js
// Prompt Library tab — load, browse, edit, and send prompts

(function () {
  // ─── Hardcoded prompt library ─────────────────────────────────────────────
  const BASE_PROMPTS = [
    {
      prompt_name: "Python Fibonacci Generator",
      final_prompt:
        "Write a Python function that generates the Fibonacci sequence up to $n$ elements using a generator to optimize memory usage. Include docstrings and a quick example of how to call it.",
      category: "coding",
      tags: ["python", "generators", "algorithms"],
      summary: "Requests a memory-efficient Python generator for the Fibonacci sequence.",
    },
    {
      prompt_name: "Corporate Meeting Summarizer",
      final_prompt:
        "Please summarize the following meeting notes into three distinct sections: Key Decisions Made, Outstanding Action Items (with owners), and Topics Deferred to Next Week. Keep the tone professional and concise.",
      category: "summarization",
      tags: ["business", "productivity", "notes"],
      summary: "Transforms raw meeting notes into a structured, professional summary.",
    },
    {
      prompt_name: "Sci-Fi Cyberpunk Opening",
      final_prompt:
        "Write the opening paragraph of a cyberpunk noir novel. Introduce a detective character standing in the rain, looking at a neon billboard that is glitching. Focus on sensory details and atmosphere.",
      category: "writing",
      tags: ["creative-writing", "sci-fi", "fiction"],
      summary: "Generates an atmospheric opening paragraph for a cyberpunk story.",
    },
    {
      prompt_name: "Explain Quantum Computing Like I'm 5",
      final_prompt:
        "Explain the concept of quantum computing and qubits to a 10-year-old. Use an everyday analogy like flipping a coin or a light switch to make it easy to grasp, and avoid complex jargon.",
      category: "education",
      tags: ["quantum-physics", "analogy", "explanation"],
      summary: "Simplifies quantum computing concepts for a young or non-technical audience.",
    },
    {
      prompt_name: "Marketing Email for Plant App",
      final_prompt:
        "Draft a promotional email marketing campaign for a new mobile app called 'SproutRoutine' that helps people keep their houseplants alive. The email should have a catchy subject line, highlight the automated watering reminders feature, and include a strong call-to-action to download the app.",
      category: "marketing",
      tags: ["email", "copywriting", "growth"],
      summary: "Creates a promotional launch email for a houseplant care mobile app.",
    },
  ];

  // ─── State ────────────────────────────────────────────────────────────────
  let prompts = [];
  let filtered = [];
  let selectedIdx = -1;
  let isEditMode = false;

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
    chrome.storage.local.get({ promptEdits: {}, savedPrompts: [], deletedBasePrompts: [] }, ({ promptEdits, savedPrompts, deletedBasePrompts }) => {

      // 1. Map base prompts, filter out deleted ones, and flag them as base
      const baseWithEdits = BASE_PROMPTS
        .filter(p => !deletedBasePrompts.includes(p.prompt_name))
        .map(p => {
          const edit = promptEdits[p.prompt_name];
          return edit ? { ...p, ...edit, isBase: true } : { ...p, isBase: true };
        });

      // 2. Convert savedPrompts & flag them as custom
      const customPrompts = savedPrompts.map((sp, idx) => ({
        prompt_name: sp.act || "Unnamed Custom Prompt",
        final_prompt: sp.prompt,
        category: sp.category || 'uncategorized',
        tags: sp.tags || [],
        summary: sp.summary || sp.prompt.substring(0, 60) + '...',
        isBase: false
      }));

      // 3. Merge them together
      prompts = [...baseWithEdits, ...customPrompts];

      buildCategoryOptions();
      applyFilter();
    });
  }

  // Listen for external storage updates (e.g. Save Prompt in sidepanel)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.savedPrompts || changes.promptEdits)) {
      init();
    }
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

  function deletePrompt(p) {
    if (!confirm(`Are you sure you want to delete "${p.prompt_name}"?`)) return;

    chrome.storage.local.get({ savedPrompts: [], deletedBasePrompts: [] }, (res) => {
      if (p.isBase) {
        // Add to blocklist
        const deleted = res.deletedBasePrompts;
        if (!deleted.includes(p.prompt_name)) {
          deleted.push(p.prompt_name);
          chrome.storage.local.set({ deletedBasePrompts: deleted });
        }
      } else {
        // Remove from saved prompts
        const saved = res.savedPrompts.filter(sp => (sp.act || "Unnamed Custom Prompt") !== p.prompt_name);
        chrome.storage.local.set({ savedPrompts: saved });
      }

      // Clear details panel if the deleted prompt was currently being viewed
      if (filtered[selectedIdx] && filtered[selectedIdx].prompt_name === p.prompt_name) {
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

      card.innerHTML = `
        <div class="lib-card-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="lib-card-name">${p.prompt_name}</span>
            <span class="lib-badge lib-badge--${p.category}">${p.category}</span>
          </div>
          <button class="lib-card-delete-btn" title="Delete Prompt">&times;</button>
        </div>
        <p class="lib-card-summary">${p.summary}</p>
        <div class="lib-card-tags">${tagsHtml}</div>
      `;

      card.addEventListener('click', () => selectPrompt(i));

      // Stop card selection when clicking delete, and fire delete logic
      const delBtn = card.querySelector('.lib-card-delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deletePrompt(p);
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
    const masterIdx = prompts.findIndex(mp => mp.prompt_name === p.prompt_name);
    if (masterIdx !== -1) prompts[masterIdx].final_prompt = newText;

    chrome.storage.local.get({ promptEdits: {} }, ({ promptEdits }) => {
      promptEdits[p.prompt_name] = { final_prompt: newText };
      chrome.storage.local.set({ promptEdits }, () => {
        saveEditBtn.textContent = 'Saved ✓';
        setTimeout(() => {
          saveEditBtn.textContent = 'Save Changes';
          saveEditBtn.style.display = 'none';
        }, 1500);
      });
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