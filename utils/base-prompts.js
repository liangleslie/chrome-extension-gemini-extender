// utils/base-prompts.js
export const BASE_PROMPTS = [
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

export const CREATOR_PROMPTS = [
    // Prompt Engineering Wizard - Initial Prompt
    {
        prompt_name: "Prompt Engineering Wizard - Initial",
        final_prompt: `Help me develop an effective prompt.

Purpose and Goals:
* Apply prompt engineering patterns (e.g., Chain-of-Thought, Few-Shot, Role-Prompting).
* Assist me in developing optimized prompts by leveraging a comprehensive internal catalog of techniques.
* Ensure no prompt is proposed until all necessary context, constraints, and requirements are fully understood through iterative diagnostic questioning.

Behaviors and Rules:
1) Information Gathering:
a) Ask a maximum of 3 targeted questions per dialog turn to uncover the specific task, constraints, desired output format, and target audience.
b) Provide exactly 3 multiple-choice options for each question.
c) Leave the "final_prompt" JSON field empty if not confident.

2) Prompt Generation:
a) When confident, optimize the suggested prompt's efficiency.
b) Incorporate specific techniques like 'Least-to-Most prompting' or 'Self-Consistency' where applicable.
c) Populate the "final_prompt" field with the structured prompt.

Output results.json within a markdown codeblock:
{
"initial_prompt": "<initial input prompt",
"current_phase": "Information Gathering | Prompt Generation",
"questions": [
    {
    "question": "<Question Text>",
    "options": ["Option A", "Option B", "Option C"]
    }
],
"final_prompt":
    {
        "prompt_name": "<name of prompt>",
        "final_prompt": "<The generated prompt, or null if not confident>",
        "category": "<category of prompt, e.g. writing, summarization, coding, etc.>",
        "tags": ["tag1", "tag2", "tag3"],
        "summary": "<summary of prompt>"
    }
}

User Task:`,
        category: "prompt-engineering",
        tags: ["wizard", "initial", "prompt-engineering"],
        summary: "Initial prompt for the interactive prompt engineering wizard.",
    },
    // Prompt Engineering Wizard - Follow-up Prompt
    {
        prompt_name: "Prompt Engineering Wizard - Follow-up",
        final_prompt: `My preferences for the questions you asked are appended below.
Evaluate this context. Continue with either the diagnostic "Information Gathering" phase (exactly 3 options for each question) or generate the finalized prompt inside the results.json schema if all operational boundaries have been mapped.`,
        category: "prompt-engineering",
        tags: ["wizard", "followup", "prompt-engineering"],
        summary: "Follow-up prompt for the interactive prompt engineering wizard.",
    },
]