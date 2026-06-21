// utils/json-parser.js
// Defensive sanitization, regex matching, and schema validation

window.parseGeminiResponse = function (rawText) {
    console.log("[Parser] Incoming text block length:", rawText?.length || 0);
    try {
        const normalized = rawText.replace(/\u00a0/g, ' ');
        const firstBrace = normalized.indexOf('{');
        const lastBrace = normalized.lastIndexOf('}');

        console.log("[Parser] Braces located:", { first: firstBrace, last: lastBrace });
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error("Missing JSON structural braces '{' and '}'.");
        }

        const slice = normalized.substring(firstBrace, lastBrace + 1);
        console.log("[Parser] Extraction subset:", slice.substring(0, 120) + " ... " + slice.substring(slice.length - 120));

        const data = JSON.parse(slice);
        console.log("[Parser] Syntax verified. Schema check questions array:", !!data?.questions);
        return data?.questions ? { success: true, data } : { success: false, error: 'Missing "questions" array' };
    } catch (e) {
        // ponytail: raw logging directly to console instead of structured error reporting pipeline
        console.error("[Parser] Parse execution failed:", e.message);
        return { success: false, error: e.message };
    }
}