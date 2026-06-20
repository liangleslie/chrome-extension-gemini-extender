// content/content.js
// Main script; coordinates DOM parsing and triggers input simulation

console.log("Content script loaded in Gemini workspace");

async function simulateNativeFileUpload(filePaths) {
    const dataTransfer = new DataTransfer();

    for (const path of filePaths) {
        const url = chrome.runtime.getURL(path);
        const response = await fetch(url);
        const blob = await response.blob();
        
        const rawFileName = path.split('/').pop();
        const decodedName = decodeURIComponent(rawFileName);
        
        const mimeType = blob.type || 'text/markdown';
        const file = new File([blob], decodedName, { type: mimeType });
        
        dataTransfer.items.add(file);
    }

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log("[Extension] Attached files via hidden input.");
    } else {
        const dropTarget = document.querySelector('chat-app') || document.body;
        dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
        dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        console.log("[Extension] Attached files via drag-and-drop simulation.");
    }
}

function setChatInputText(text) {
    const input = document.querySelector(window.DOM_SELECTORS.chatInput);
    if (!input) {
        console.error("[Extension] Chat input not found");
        return false;
    }
    input.focus();
    
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, text);
    
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

function clickSendButton() {
    const sendButton = document.querySelector(window.DOM_SELECTORS.sendButton);
    if (sendButton) {
        sendButton.click();
        return true;
    }
    console.error("[Extension] Send button not found");
    return false;
}

function waitForResponseComplete() {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const sendButton = document.querySelector(window.DOM_SELECTORS.sendButton);
            if (sendButton && !sendButton.disabled && sendButton.getAttribute('aria-disabled') !== 'true') {
                clearInterval(interval);
                resolve();
            }
        }, 500);
    });
}

async function handlePromptSubmission(promptText) {
    const wrappedPrompt = `Write a generative AI prompt to perform this task: "${promptText}".
   
Respond exclusively with a valid, raw JSON object following this exact schema: { "questions": ["Option A", "Option B", "Option C"] }. Do not wrap the response in markdown code blocks (e.g., do not use \`\`\`json). Do not include any conversational introductions, conclusions, or trailing explanations. Return only the raw JSON string.`;

    if (!setChatInputText(wrappedPrompt)) {
        return { success: false, error: "Failed to set chat input text" };
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (!clickSendButton()) {
        return { success: false, error: "Failed to click send button" };
    }
    
    await waitForResponseComplete();
    
    const bubbles = document.querySelectorAll('message-content, .message-content, .model-response');
    if (bubbles.length === 0) {
        return { success: false, error: "No response bubbles found" };
    }
    
    const lastBubble = bubbles[bubbles.length - 1];
    const rawResponseText = lastBubble.textContent;
    console.log("[Extension] Raw response text:", rawResponseText);
    
    const parsedResult = window.parseGeminiResponse(rawResponseText);
    if (parsedResult.success) {
        chrome.runtime.sendMessage({
            action: 'RENDER_JSON_UI',
            payload: parsedResult.data
        });
        return { success: true };
    } else {
        console.error("[Extension] JSON parsing failed:", parsedResult.error, parsedResult.details);
        return { success: false, error: parsedResult.error };
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Extension] Content script received message:", request);
    
    if (request.action === "INJECT_FILES") {
        simulateNativeFileUpload(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error("[Extension] File injection error:", err);
                sendResponse({ success: false, error: err.toString() });
            });
        return true;
    }
    
    if (request.action === "SUBMIT_PROMPT") {
        handlePromptSubmission(request.payload)
            .then((result) => sendResponse(result))
            .catch(err => {
                console.error("[Extension] Prompt submission error:", err);
                sendResponse({ success: false, error: err.toString() });
            });
        return true;
    }
});
