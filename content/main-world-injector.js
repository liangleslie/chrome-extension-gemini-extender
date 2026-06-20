(async () => {
    try {
        const scriptEl = document.currentScript;
        if (!scriptEl) return;
        const fileUrls = JSON.parse(scriptEl.dataset.fileUrls);

        // Fetch assets and populate DataTransfer
        const dataTransfer = new DataTransfer();
        for (const url of fileUrls) {
            const response = await fetch(url);
            const blob = await response.blob();
            const rawFileName = url.split('/').pop();
            const decodedName = decodeURIComponent(rawFileName);
            const file = new File([blob], decodedName, { type: blob.type || 'text/markdown' });
            dataTransfer.items.add(file);
        }

        // Intercept file input click using a capture phase listener on window
        const clickHandler = (e) => {
            const target = e.target;
            if (target && target.tagName === 'INPUT' && target.type === 'file') {
                e.preventDefault();
                e.stopPropagation();
                target.files = dataTransfer.files;
                target.dispatchEvent(new Event('change', { bubbles: true }));
                console.log("[Extension MainWorld] Successfully intercepted dynamic file input click.");
                window.removeEventListener('click', clickHandler, { capture: true });
            }
        };
        window.addEventListener('click', clickHandler, { capture: true });

        // Locate or open upload menu
        let trigger = document.querySelector('.hidden-local-file-image-selector-button') ||
                      document.querySelector('[data-test-id="local-images-files-uploader-button"]');

        if (!trigger) {
            console.log("[Extension MainWorld] File selector trigger button not found. Searching for plus/attachment button to open upload menu...");
            
            // Look for plus/upload/attachment button
            const plusBtn = document.querySelector('button[aria-label*="Upload"]') ||
                            document.querySelector('button[aria-label*="Attach"]') ||
                            document.querySelector('button[aria-label*="Add"]') ||
                            document.querySelector('[data-test-id*="uploader"]') ||
                            document.querySelector('images-files-uploader button') ||
                            document.querySelector('button[aria-haspopup="menu"]');
                            
            if (plusBtn) {
                console.log("[Extension MainWorld] Found plus/attachment button. Clicking it to open menu...");
                plusBtn.click();
                
                // Wait for the menu to open and elements to mount
                await new Promise(resolve => setTimeout(resolve, 300));
                
                trigger = document.querySelector('.hidden-local-file-image-selector-button') ||
                          document.querySelector('[data-test-id="local-images-files-uploader-button"]');
            } else {
                console.warn("[Extension MainWorld] Plus/attachment button not found.");
            }
        }

        if (trigger) {
            console.log("[Extension MainWorld] Triggering click on selector button.");
            trigger.click();
        } else {
            console.error("[Extension MainWorld] File selector trigger button not found even after opening menu.");
            window.removeEventListener('click', clickHandler, { capture: true });
        }

        // Cleanup click handler after a short timeout in case it wasn't triggered
        setTimeout(() => {
            window.removeEventListener('click', clickHandler, { capture: true });
        }, 2000);

    } catch (err) {
        console.error("[Extension MainWorld] Error in main-world injector:", err);
    }
})();
