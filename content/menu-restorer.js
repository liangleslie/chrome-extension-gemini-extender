// content/menu-restorer.js
// Implements MutationObserver and injects custom navigation

console.log("Menu restorer module loaded");

let lastClickedChatId = null;
let lastClickedTime = 0;

// Debug function to print element paths in the console
function printHierarchy(el) {
    let current = el;
    let path = [];
    let depth = 0;
    while (current && current !== document.body && depth < 6) {
        let identifier = current.tagName.toLowerCase();
        if (current.id) identifier += `#${current.id}`;
        if (current.className) {
            const cleanClasses = current.className.split(/\s+/).filter(Boolean).join('.');
            if (cleanClasses) identifier += `.${cleanClasses}`;
        }
        path.push(identifier);
        current = current.parentElement;
        depth++;
    }
    console.log("[MenuRestorer] Click element hierarchy:", path.join(' < '));
}

// Resiliently extracts the chat ID from an element or its ancestors/descendants
function extractChatIdFromElement(el) {
    if (!el) return null;
    let current = el;
    let depth = 0;
    while (current && current !== document.body && depth < 5) {
        // Check if current itself is the <a> tag
        if (current.tagName === 'A') {
            const href = current.getAttribute('href') || current.href;
            // Matches /app/c/c_id or /app/id
            const match = href.match(/\/app\/(?:c\/)?([a-zA-Z0-9_]+)/);
            if (match) {
                let cid = match[1];
                // Exclude common page words that aren't IDs
                if (cid.length >= 8 && cid !== 'workspace') {
                    if (!cid.startsWith('c_')) {
                        cid = 'c_' + cid;
                    }
                    console.log("[MenuRestorer] Successfully extracted chat ID:", cid, "from link:", href);
                    return cid;
                }
            }
        }
        // Check if any descendant of current is the <a> tag
        const link = current.querySelector('a[href*="/app/"]');
        if (link) {
            const href = link.getAttribute('href') || link.href;
            const match = href.match(/\/app\/(?:c\/)?([a-zA-Z0-9_]+)/);
            if (match) {
                let cid = match[1];
                if (cid.length >= 8 && cid !== 'workspace') {
                    if (!cid.startsWith('c_')) {
                        cid = 'c_' + cid;
                    }
                    console.log("[MenuRestorer] Successfully extracted chat ID from descendant link:", cid, "from:", href);
                    return cid;
                }
            }
        }
        current = current.parentElement;
        depth++;
    }
    return null;
}

// Global listener to capture which chat item was clicked
document.body.addEventListener('click', (e) => {
    let target = e.target;
    console.log("[MenuRestorer] Click detected");
    printHierarchy(target);
    
    const cid = extractChatIdFromElement(target);
    if (cid) {
        lastClickedChatId = cid;
        lastClickedTime = Date.now();
        console.log("[MenuRestorer] Active chat ID set to:", lastClickedChatId);
    } else {
        // Clear if we clicked anything else to prevent incorrect matches on other menus
        lastClickedChatId = null;
        lastClickedTime = 0;
    }
}, true);

// Utility to find the Google XSRF (at) token
function getAtToken() {
    if (window.WIZ_global_data && window.WIZ_global_data.SNlM0e) {
        return window.WIZ_global_data.SNlM0e;
    }
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
        const m = s.textContent.match(/"SNlM0e"\s*:\s*"([^"]+)"/);
        if (m) return m[1];
    }
    return null;
}

// Executes an RPC via Google's batchexecute endpoint
async function sendRpc(rpcid, payload, atToken) {
    const url = `https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=${rpcid}&source-path=%2F`;
    const reqData = [[[rpcid, JSON.stringify(payload), null, "generic"]]];
    
    const body = new URLSearchParams();
    body.set('f.req', JSON.stringify(reqData));
    body.set('at', atToken);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: body.toString()
    });

    if (!response.ok) {
        throw new Error(`RPC ${rpcid} failed with HTTP status ${response.status}`);
    }

    return response.text();
}

// Triggers the deletion calls sequentially
async function deleteChatOnServer(chatId) {
    const atToken = getAtToken();
    if (!atToken) {
        throw new Error("XSRF token (at) not found. Are you logged in?");
    }

    console.log("[MenuRestorer] Sending delete RPC 1 (GzXR5e)...");
    await sendRpc('GzXR5e', [chatId], atToken);

    console.log("[MenuRestorer] Sending delete RPC 2 (qWymEb)...");
    await sendRpc('qWymEb', [chatId, [1, null, 0, 1]], atToken);
}

// Removes the chat row from the sidebar and redirects if the current chat was deleted
function removeChatFromUI(chatId) {
    const strippedId = chatId.startsWith('c_') ? chatId.substring(2) : chatId;

    // Search for row elements by matching different possible URL patterns in DOM links
    const selectors = [
        `a[href*="/app/c/${chatId}"]`,
        `a[href*="/app/${chatId}"]`,
        `a[href*="/app/${strippedId}"]`
    ];
    
    selectors.forEach(selector => {
        const links = document.querySelectorAll(selector);
        links.forEach(link => {
            const row = link.closest('li, [role="listitem"], .chat-row, mat-list-item, .mat-mdc-list-item') || link.parentElement;
            if (row) {
                row.remove();
                console.log(`[MenuRestorer] Removed chat row for ${chatId} from DOM`);
            }
        });
    });

    // If active chat matches the deleted chat, redirect to app home page
    if (window.location.pathname.includes(chatId) || window.location.pathname.includes(strippedId) || 
        window.location.href.includes(chatId) || window.location.href.includes(strippedId)) {
        window.location.href = 'https://gemini.google.com/app';
    }
}

// Inject "Delete" button into the menu panel
function injectDeleteButton(menuPanel) {
    // 1. Verify this is a chat options menu by checking if there was a very recent click on a chat item
    const timeSinceClick = Date.now() - lastClickedTime;
    if (!lastClickedChatId || timeSinceClick > 1000) {
        console.log("[MenuRestorer] Skipping menu injection: No recent active chat click detected (time elapsed:", timeSinceClick, "ms)");
        return;
    }

    // Capture the chatId from the global state, then immediately clear it so it cannot be reused
    const chatId = lastClickedChatId;
    lastClickedChatId = null;
    lastClickedTime = 0;

    console.log("[MenuRestorer] Injecting Delete button for chatId:", chatId);

    // Avoid double injection
    if (menuPanel.querySelector('[data-test-id="delete-button"]')) {
        return;
    }

    // Find any existing menu item to use as template
    const refItem = menuPanel.querySelector('[role="menuitem"]');
    if (!refItem) {
        console.warn("[MenuRestorer] No template menuitem found to clone");
        return;
    }

    // Clone it to preserve Google's Angular/Material class names and styles
    const deleteBtn = refItem.cloneNode(true);
    deleteBtn.setAttribute('data-test-id', 'delete-button');
    deleteBtn.removeAttribute('jslog'); // Clear visual element logging attributes

    // Update label text
    const labelEl = deleteBtn.querySelector('.gem-menu-item-label, .mat-mdc-menu-item-text span');
    if (labelEl) {
        labelEl.textContent = 'Delete';
    }

    // Update icon to trash/delete
    const gemIcon = deleteBtn.querySelector('gem-icon');
    if (gemIcon) {
        gemIcon.setAttribute('fonticonname', 'delete');
    }
    const matIcon = deleteBtn.querySelector('mat-icon');
    if (matIcon) {
        matIcon.setAttribute('fonticon', 'delete');
        matIcon.setAttribute('data-mat-icon-name', 'delete');
        
        // Google's dynamic style sheets handle rendering the icon if fonticon="delete" is set.
        // If the original cloned icon had NO text content (pseudo-element CSS rendering),
        // we must keep textContent empty to prevent literal characters from breaking the layout.
        if (matIcon.textContent.trim()) {
            matIcon.textContent = 'delete';
        } else {
            matIcon.textContent = '';
        }
    }

    // Attach click handler
    deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        console.log("[MenuRestorer] Delete clicked. Target chatId:", chatId);

        const confirmed = confirm("Are you sure you want to delete this chat?");
        if (!confirmed) {
            // Dismiss the popup menu
            document.body.click();
            return;
        }

        try {
            await deleteChatOnServer(chatId);
            removeChatFromUI(chatId);
            // Dismiss the popup menu
            document.body.click();
        } catch (error) {
            console.error("[MenuRestorer] Error deleting chat:", error);
            alert("Failed to delete chat: " + error.message);
        }
    });

    // Append to the list container inside the menu
    const menuContent = menuPanel.querySelector('.mat-mdc-menu-content') || menuPanel;
    menuContent.appendChild(deleteBtn);
    console.log("[MenuRestorer] Custom Delete menu item injected successfully");
}

// Observe DOM insertions for Angular Material menu panels
const observeMenu = () => {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    const menuPanel = addedNode.matches('[role="menu"]') ? addedNode : addedNode.querySelector?.('[role="menu"]');
                    if (menuPanel) {
                        injectDeleteButton(menuPanel);
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[MenuRestorer] MutationObserver started on body");
};

// Initialize observation
observeMenu();
