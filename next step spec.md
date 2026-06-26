Agent Refactoring Task: Progressive Accordion UI \& Contextual Flow Refinement

You are a senior frontend engineer and browser-automation architect. Your task is to refactor our existing Chrome Extension codebase (manifest.json compliant) to introduce a progressive, collapsing accordion UI in the sidepanel and implement a context-preserving multi-turn prompt pipeline in our content script. review the existing [content.js](file;file:///c:/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/content/content.js) [sidepanel.js](file;file:///c:/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/sidepanel/sidepanel.js) [next%20step%20spec.md](file;file:///c:/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/next%20step%20spec.md) [sidepanel.html](file;file:///c:/Users/3002252/Documents/Leslie/projects/chrome-extension-gemini-extender/sidepanel/sidepanel.html)


- merge default prompts into session store

1) add editorial rules checkbox

2) settings page
- Change prompts creator default prompts / update editorial rules
- Location of library post endpoint
- Reset settings
- Edit local prompt database
- Sync local prompts to database
- debug messages (logs are currently too verbose, to cut it down unless selected)

3) landing page
- prompt chooser
- prompt creator

4) prompt creator
- save locally
- save to remote
- push to gem creator

5) prompt selector
- send to chat
- read from local file (assets/prompt_library.db)
- edit the prompt
- send to gem creator (like what you see? Create as gem)

6) gem server - appscript webapp connected to spreadsheet with deployment

