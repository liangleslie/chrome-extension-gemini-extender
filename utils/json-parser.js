// utils/json-parser.js
// Defensive sanitization, regex matching, and schema validation

window.parseGeminiResponse = function(rawText) {
    try {
        // 1. Strip markdown fences if present
        let cleanText = rawText.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
        
        // 2. Remove any conversational leading/trailing text by finding the first '{' and last '}'
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }
        
        // 3. Parse JSON
        const parsedData = JSON.parse(cleanText);
        
        // 4. Schema validation (checking for 'questions' array)
        if (parsedData && Array.isArray(parsedData.questions)) {
            return { success: true, data: parsedData };
        } else {
            return { success: false, error: 'Invalid schema: missing "questions" array' };
        }
    } catch (e) {
        return { success: false, error: 'Failed to parse JSON', details: e.message };
    }
}
