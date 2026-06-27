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