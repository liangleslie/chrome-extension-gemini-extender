# Master Specification: Gemini Enterprise Extended (Phases 1 & 2)

This master specification details the functional architecture, implementation strategy, and file system structure for a Chrome Extension (Manifest V3) designed to enhance the Google Gemini web interface.

---

## 🏗️ Section 1: System Architecture Overview

The extension utilizes a modular Manifest V3 architecture to pass messages safely across execution contexts, bridging the isolated Chrome Sidebar UI with the live Gemini webpage DOM.

```
[ Side Panel UI ] <---> [ Background Service Worker ] <---> [ Content Script ] <---> [ Gemini DOM ]
 (Prompt Builder)             (Message Router)                 (DOM Injector)

```

---

## 📋 Section 2: Core Modules

### 2.1 Menu Restoration Module (Part 1)

* **Objective**: Inject missing consumer-facing features natively into the Gemini Enterprise sidebar navigation component.
* **Technical Logic**: The extension runs a `MutationObserver` looking for Gemini's main navigation drawer wrapper element.
* **Behavior Handling**:
* *Standard Link Items*: Acts as a native single-page app router link or anchor tag.
* *Action-Oriented Items*: Intercepts or structures an asynchronous request matching Gemini's internal protocol buffer/gRPC serialization format to trigger the feature natively without page reloads.

### 2.2 Sidebar Workspace & Resilient UI Loop (Part 2)

* **Workspace Input Layer**: The Chrome Side Panel provides a custom text area environment. When a prompt is submitted, the extension silently attaches a formatting instruction wrapper:

> **Appended Wrapper Instruction:**
> `[User Prompt Context] ... Respond exclusively with a valid, raw JSON object following this exact schema: { "questions": ["Option A", "Option B", "Option C"] }. Do not wrap the response in markdown code blocks (e.g., do not use \```json). Do not include any conversational introductions, conclusions, or trailing explanations. Return only the raw JSON string.`

* **The Extract-Clean-Validate Loop**: To account for edge cases where the LLM appends conversational text or markdown code fences, the script implements an aggressive parsing workflow:

```
[Gemini Finishes Typing] 
       │
       ▼
[Extract textContent from chat bubble]
       │
       ▼
[Pass through Sanitizer] ───► (Strips accidental markdown code fences, trailing text, or spaces)
       │
       ▼
[Execute JSON.parse()]
       ├──► SUCCESS: Dispatches JSON payload to Side Panel UI
       └──► FAILURE: Executes Regex fallback filter -> Try again -> Fallback to error UI

```

---

## 📂 Section 3: Recommended Project Structure

To maintain clean separation of concerns, scalability, and code modularity, the project should be organized using the following directory layout:

```text
gemini-enterprise-extended/
├── manifest.json                 # Extension metadata, permissions, and script registration
├── assets/                       # Static branding elements
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── background/                   # Central message bus (Service Worker)
│   └── service-worker.js         # Routes data between the UI panels and content scripts
├── content/                      # Content scripts executing inside the Gemini webpage context
│   ├── content.js                # Main script; coordinates DOM parsing and triggers input simulation
│   ├── menu-restorer.js          # Part 1: Implements MutationObserver and injects custom navigation
│   └── dom-selectors.js         # Central repository for fragile CSS classes/ARIA labels
├── sidepanel/                    # Part 2: Interactive Sidebar UI panel
│   ├── sidepanel.html            # Layout for prompt builder text area and dynamic button grid
│   ├── sidepanel.css             # Scoped styles styled to mimic Gemini's design palette
│   └── sidepanel.js              # Manages sidebar states, event listeners, and dynamic UI rendering
└── utils/                        # Shared Javascript modules
    └── json-parser.js            # Defensive sanitization, regex matching, and schema validation

```

### 🗂️ Detailed Directory Breakdown

#### Root File

* **`manifest.json`**: Declares Manifest V3 compatibility, registers permissions (`sidePanel`, `storage`, `activeTab`), maps the background service worker, matches content scripts to `[https://gemini.google.com/](https://gemini.google.com/)*`, and designates `sidepanel.html` as the default sidebar workspace.

#### Content Folder (`/content`)

* **`content.js`**: Listens for system instructions from the service worker. It handles the manual task of dropping text into Gemini's `contenteditable` container, firing synthetic keyboard/mouse click events to send messages, and tracking when the assistant finishes generating content.
* **`menu-restorer.js`**: Specifically handles the Part 1 requirements. It watches for layout re-renders and handles injecting layout modifications or firing the necessary internal requests.
* **`dom-selectors.js`**: Maps structural elements using robust criteria (e.g., `[role="textbox"]`, `[aria-label="Send message"]`) so updates can be applied in one central place when Google changes its layout.

#### Side Panel Folder (`/sidepanel`)

* **`sidepanel.html` / `.css**`: Structures the prompt construction canvas, dynamic control layout, and execution panel.
* **`sidepanel.js`**: Monitors UI inputs, communicates requests out to the background worker, and dynamically creates native HTML `<button>` nodes when structured payloads successfully arrive.

#### Utilities Folder (`/utils`)

* **`json-parser.js`**: Contains the resilient logic detailed in Phase 2. Keeps the content script slim by cleanly extracting raw JSON components out of text responses before they are processed by the UI layers.
