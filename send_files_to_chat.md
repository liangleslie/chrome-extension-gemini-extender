what I want is to have a button that programmatically attachs [A%20Prompt%20Pattern%20Catalog%20to%20Enhance%20Prompt%20Engineering%20with%20ChatGPT.md](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/assets/A%20Prompt%20Pattern%20Catalog%20to%20Enhance%20Prompt%20Engineering%20with%20ChatGPT.md) and [The%20Prompt%20Report%20A%20Systematic%20Survey%20of%20Prompt%20Engineering%20Techniques.md](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/assets/The%20Prompt%20Report%20A%20Systematic%20Survey%20of%20Prompt%20Engineering%20Techniques.md) to the chat when it is pressed. so that i can test that the attach files function works. remember that the upload_file.py needs to be updated to support the file type of md files.

refer to [upload_file.py](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/reference/utils/upload_file.py) for how files are uploaded and what identifier is returned when uploaded to the UPLOAD endpoint in [constants.py](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/reference/constants.py) .

note the javascript for the gemini_chat [bard_chat.js](file;file:///c%3A/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/reference/bard_chat.js). when a file is attached, lines 2460 to 2477 seems to be called

this is the html code for the file upload element

```html
<images-files-uploader _ngcontent-ng-c2634035408="" data-test-id="uploader-images-files-button-advanced" _nghost-ng-c2248530952="" class="ng-star-inserted"><!----><button _ngcontent-ng-c2248530952="" mat-list-item="" lmmenuitemtheme="" gemtooltipposition="right" role="menuitem" aria-haspopup="dialog" data-test-id="local-images-files-uploader-button" class="mat-mdc-list-item mdc-list-item mat-mdc-tooltip-trigger mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-tooltip-disabled lm-menu-item-theme mat-mdc-list-item-single-line mdc-list-item--with-one-line ng-star-inserted" type="button" aria-label="Upload files. Documents, data, code files" jslog="255324;track:generic_click,impression;BardVeMetadataKey:[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,[]]" aria-disabled="false"><gem-icon _ngcontent-ng-c2248530952="" matlistitemicon="" size="medium" data-test-id="local-images-files-uploader-icon" class="mat-mdc-list-item-icon menu-icon gem-menu-item-icon mdc-list-item__start ng-star-inserted" _nghost-ng-c3914440998=""><mat-icon _ngcontent-ng-c3914440998="" role="img" class="mat-icon notranslate lm-icon-m lumi-symbols mat-ligature-font mat-icon-no-color ng-star-inserted" aria-hidden="true" data-mat-icon-type="font" data-mat-icon-name="attach_file" data-mat-icon-namespace="lumi-symbols" fonticon="attach_file"></mat-icon><!----><!----><!----></gem-icon><!----><!----><span class="mdc-list-item__content"><span class="mat-mdc-list-item-unscoped-content mdc-list-item__primary-text"><div _ngcontent-ng-c2248530952="" class="flex content"><span _ngcontent-ng-c2248530952="" class="item"><span _ngcontent-ng-c2248530952="" class="menu-text gem-menu-item-label">Upload files</span></span><!----><!----><!----></div></span></span><div class="mat-focus-indicator"></div></button><!----><!----><!----><div _ngcontent-ng-c2248530952=""><button _ngcontent-ng-c2248530952="" xapfileselectortrigger="" tabindex="-1" aria-hidden="true" class="hidden-local-file-image-selector-button"></button></div></images-files-uploader>
```

this is the first attempt, improve it and integrate into the chrome extension in the relevant components:

### file-injector.js

```javascript
// content/file-injector.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "INJECT_FILES") {
        simulateNativeFileUpload(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.toString() }));
        return true; // Keep message channel open for async response
    }
});

/**
 * Bypasses the UI file picker entirely by creating an artificial DataTransfer
 * and dispatching it to Gemini's hidden <input type="file"> element.
 */
async function simulateNativeFileUpload(filePaths) {
    const dataTransfer = new DataTransfer();

    for (const path of filePaths) {
        const url = chrome.runtime.getURL(path);
        const response = await fetch(url);
        const blob = await response.blob();
        
        // Decode the %20 spaces back to human readable names for the Gemini UI
        const rawFileName = path.split('/').pop();
        const decodedName = decodeURIComponent(rawFileName);
        
        // Force text/markdown if not provided
        const mimeType = blob.type || 'text/markdown';
        const file = new File([blob], decodedName, { type: mimeType });
        
        dataTransfer.items.add(file);
    }

    // Attempt 1: Target the hidden file input directly
    // Google typically binds a global `<input type="file" multiple>` near the images-files-uploader
    const fileInput = document.querySelector('input[type="file"]');
    
    if (fileInput) {
        fileInput.files = dataTransfer.files;
        // Dispatching a 'change' event tells the Angular/Wiz framework that files were selected
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("Successfully attached files via hidden input.");
    } else {
        // Attempt 2: Fallback to HTML5 Drag-and-Drop Dropzone
        // If the input isn't mounted yet, Gemini accepts drag-and-drop on the main container
        const dropTarget = document.querySelector('chat-app') || document.body;
        
        dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        console.log("Successfully attached files via drag-and-drop simulation.");
    }
}
```

### sidepanel.js

```javascript
document.getElementById('attach-md-btn').addEventListener('click', () => {
    const filesToAttach = [
        "assets/context-docs/A%20Prompt%20Pattern%20Catalog%20to%20Enhance%20Prompt%20Engineering%20with%20ChatGPT.md",
        "assets/context-docs/The%20Prompt%20Report%20A%20Systematic%20Survey%20of%20Prompt%20Engineering%20Techniques.md"
    ];

    // Send a message to the Service Worker to forward to the active tab's Content Script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "INJECT_FILES",
                payload: filesToAttach
            });
        }
    });
});
```

### sidepanel.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Gemini Extended</title>
    <style>
        body { font-family: system-ui, sans-serif; padding: 16px; background: #f8f9fa; }
        .btn-primary {
            background-color: #1a73e8; color: white; border: none;
            padding: 10px 16px; border-radius: 8px; cursor: pointer;
            font-weight: 500; width: 100%; transition: background 0.2s;
        }
        .btn-primary:hover { background-color: #1557b0; }
    </style>
</head>
<body>
    <h3>Prompt Workspace</h3>
    <p style="font-size: 13px; color: #5f6368;">Attach context documents directly to the active Gemini session.</p>
    
    <button id="attach-md-btn" class="btn-primary">
        Attach Prompt Pattern Catalogs
    </button>

    <script src="sidepanel.js"></script>
</body>
</html>
```
