# Developer Flows for the Testing Agent

## Flow 1: First-Time Setup

1.  **Developer clones the project repository.**
2.  **Developer runs `npm install`** to install all dependencies, including the Claude Code SDK and Playwright.
3.  **Developer configures the environment** by creating a `.env` file with their Anthropic API key.
4.  **Developer registers the custom agent and MCP server** with their local Claude Code instance:
    *   `claude agent add ./agents/testing-agent.yml`
    *   `claude mcp add playwright --url http://localhost:6543` (assuming the MCP server is running locally).
5.  **Developer starts the Playwright MCP server** in a separate terminal process.

---

## Flow 2: The "Happy Path" (Test Passes)

1.  **Developer prompts the primary AI assistant:** "Please create a login form feature and a Playwright test script to verify a successful login."
2.  **Claude generates two files:** `login-form.js` and `test-login.spec.ts`.
3.  **Developer saves the files** into their project directory.
4.  **Developer runs the Testing Agent** from the terminal:
    *   `claude-agent test test-login.spec.ts`
5.  **The terminal displays real-time progress:**
    *   `[INFO] Starting Test Agent...`
    *   `[INFO] Executing test: test-login.spec.ts`
    *   `[INFO] Action: Navigating to page... DONE`
    *   `[INFO] Action: Filling username... DONE`
    *   `[INFO] Action: Filling password... DONE`
    *   `[INFO] Action: Clicking submit... DONE`
    *   `[SUCCESS] Test Passed. Artifacts saved to /runs/2025-07-31-22-30-00`
6.  **Developer reports back to Claude:** "The test passed, the feature is working."

---

## Flow 3: The Debugging Loop (Test Fails)

1.  **Developer follows steps 1-4 from Flow 2.**
2.  **The Testing Agent runs the test, but an assertion fails.**
3.  **The terminal displays an error:**
    *   `...`
    *   `[INFO] Action: Clicking submit... DONE`
    *   `[ERROR] Assertion Failed: Expected element '#dashboard' to be visible.`
    *   `[FAIL] Test Failed. Artifacts saved to /runs/2025-07-31-22-35-15`
4.  **Developer informs the primary AI:** "I ran the test, but it failed."
5.  **Claude responds:** "I see. Please provide the console log for any errors and a screenshot of the page after the submit button was clicked."
6.  **Developer now queries the Testing Agent** for the specific artifacts. (This step can also be automated where the agent listens to the conversation).
    *   `claude-agent get-artifact --run 2025-07-31-22-35-15 --type console --filter error`
    *   `claude-agent get-artifact --run 2025-07-31-22-35-15 --type screenshot --name after_click_submit`
7.  **The agent retrieves the requested information** and prints it to the console or saves it to a file.
8.  **Developer copies this information** and provides it to the primary AI assistant.
9.  **Claude analyzes the data and provides a code fix.**
10. **IF Claude's fix is correct THEN:**
    *   Developer applies the fix and re-runs the test (`claude-agent test test-login.spec.ts`).
    *   The test now passes, and the developer proceeds as in Flow 2.
11. **ELSE (IF Claude's fix is wrong):**
    *   The test fails again.
    *   The developer repeats the debugging loop from step 4.