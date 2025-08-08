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
5.  **A browser window (Chromium) launches automatically.** The developer can watch in real-time as the Testing Agent executes the user flow described in the script—navigating pages, filling in forms, and clicking buttons. This provides immediate visual confirmation of the agent's actions.

6.  **Simultaneously, the terminal displays real-time progress:**
    *   `[INFO] Starting Test Agent...`
    *   `[INFO] Executing test: test-login.spec.ts`
    *   `[INFO] Action: Navigating to page... DONE`
    *   `[INFO] Action: Filling username... DONE`
    *   `[INFO] Action: Filling password... DONE`
    *   `[INFO] Action: Clicking submit... DONE`
    *   `[SUCCESS] Test Passed. Artifacts saved to /runs/2025-07-31-22-30-00`
7.  **Agent posts to Claude automatically:** The Testing Agent posts a PASS summary (status, `run_id`) directly into the active Claude conversation. No developer message required.

---

## Flow 3: The Debugging Loop (Test Fails, Automated)

1.  **Developer follows steps 1-4 from Flow 2.**
2.  **The Testing Agent runs the test, but an assertion fails.**
3.  **The terminal displays an error:**
    *   `...`
    *   `[INFO] Action: Clicking submit... DONE`
    *   `[ERROR] Assertion Failed: Expected element '#dashboard' to be visible.`
    *   `[FAIL] Test Failed. Artifacts saved to /runs/2025-07-31-22-35-15`
4.  **Agent posts a FAIL summary to Claude automatically** (status, `run_id`, artifact index, proactive critical console errors).
5.  **Claude requests specific artifacts in natural language** (e.g., console errors, after-click screenshot). The request is routed as a tool call directly to the Testing Agent.
6.  **The agent retrieves and returns only the requested artifacts** directly into the Claude conversation (no developer copy/paste).
7.  **Claude analyzes the data and provides a code fix.**
8.  **IF Claude's fix is correct THEN:**
    *   Developer applies the fix and re-runs the test (`claude-agent test test-login.spec.ts`) or instructs the agent to re-run if supported.
    *   The test now passes, and the agent posts a PASS summary as in Flow 2.
9.  **ELSE (IF Claude's fix is wrong):**
    *   The test fails again.
    *   The agent repeats the automated loop starting from step 4.

---

## Flow 4: Optional Agent-Initiated Re-Run

1. **Claude proposes a code fix.**
2. **Agent offers to re-run the test automatically** after the fix is applied (configurable).
3. **Upon confirmation**, the agent re-runs and follows Flow 2 or Flow 3 accordingly.