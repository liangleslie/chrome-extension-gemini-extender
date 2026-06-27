// utils/json-parser.js
// Defensive sanitization, regex matching, and schema validation

let DEBUG_MODE = false;
chrome.storage.local.get({ debugMode: false }, (res) => { DEBUG_MODE = res.debugMode; });
chrome.storage.onChanged.addListener((changes) => {
    if (changes.debugMode) DEBUG_MODE = changes.debugMode.newValue;
});
const log = (...args) => { if (DEBUG_MODE) console.log("[Parser]", ...args); };
const warn = (...args) => { if (DEBUG_MODE) console.warn("[Parser]", ...args); };
const err = (...args) => { if (DEBUG_MODE) console.error("[Parser]", ...args); };

window.parseGeminiResponse = function (rawText) {
    log("Incoming text block length:", rawText?.length || 0);
    try {
        const normalized = rawText.replace(/\u00a0/g, ' ');
        const firstBrace = normalized.indexOf('{');
        const lastBrace = normalized.lastIndexOf('}');

        log("Braces located:", { first: firstBrace, last: lastBrace });
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error("Missing JSON structural braces '{' and '}'.");
        }

        const slice = normalized.substring(firstBrace, lastBrace + 1);
        log("Extraction subset:", slice.substring(0, 120) + " ... " + slice.substring(slice.length - 120));

        const data = JSON.parse(slice);
        log("Syntax verified. Schema check questions array:", !!data?.questions);
        return data?.questions ? { success: true, data } : { success: false, error: 'Missing "questions" array' };
    } catch (e) {
        // ponytail: raw logging directly to console instead of structured error reporting pipeline
        err("Parse execution failed:", e.message);
        return { success: false, error: e.message };
    }
}