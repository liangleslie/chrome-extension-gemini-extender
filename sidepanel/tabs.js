// sidepanel/tabs.js
// Handles navigation, URL parameter routing, and tab switching

function switchTab(targetId) {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Remove active state from all buttons and panels
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    // Find and activate the target button and panel
    const btn = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
    const targetPanel = document.getElementById(targetId);

    if (btn) btn.classList.add('active');
    if (targetPanel) targetPanel.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check for URL query parameter on load (e.g., sidepanel.html?tab=settings)
    const urlParams = new URLSearchParams(window.location.search);
    const requestedTab = urlParams.get('tab');

    if (requestedTab === 'creator') {
        switchTab('tab-creator');
    } else if (requestedTab === 'settings') {
        switchTab('tab-settings');
    } else {
        // Defaults to library
        switchTab('tab-library');
    }

    // 2. Add manual click handlers for UI buttons
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            switchTab(targetId);

            // Update URL silently without reloading
            const url = new URL(window.location);
            const tabName = targetId.replace('tab-', '');
            url.searchParams.set('tab', tabName);
            window.history.replaceState({}, '', url);
        });
    });
});