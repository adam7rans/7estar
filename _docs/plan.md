# Detailed Implementation Plan

This plan is structured in phases for the development team.

## Phase 0: Project Setup & Prerequisites
*   **Objective:** Prepare the development environment and ensure the team has the necessary tools and access.
*   **Key Tasks:**
    1.  Initialize a new Node.js project with TypeScript.
    2.  Install core dependencies: `@anthropic-ai/claude-code-sdk`, `playwright`.
    3.  Set up project structure: `/src`, `/agents`, `/tests`, `/runs`.
    4.  Ensure all team members have access to an Anthropic API key and have the Claude Code CLI installed.
    5.  Set up and run the open-source Playwright MCP server locally.
*   **Success Criteria:** A developer can run a basic "hello world" TypeScript program that successfully authenticates with the Claude API. The Playwright MCP server is running and accessible.

## Phase 1: Core Test Execution Engine
*   **Objective:** Build the foundational, non-agent script that can execute a Playwright test and save all artifacts.
*   **Key Tasks:**
    1.  Create a TypeScript module that accepts a Playwright script path as an argument.
    2.  Configure the Playwright launcher within the module to start the browser in **headed mode** by default, making the process visible to the developer.
    3.  Implement the logic to create a timestamped run directory.
    4.  Implement the Playwright listeners for `console`, `request`, and `pageerror`.
    5.  Implement the logic to save screenshots before and after each action.
    6.  Implement the final trace file generation.
*   **Success Criteria:** A developer can run `npm run execute-test ./tests/example.spec.ts` and see a complete artifact directory created in `/runs`.

## Phase 2: Agent Definition & Basic Tooling
*   **Objective:** Define the custom agent and create the initial TypeScript functions that will act as its tools.
*   **Key Tasks:**
    1.  Create `agents/testing-agent.yml` and write the system prompt.
    2.  Define the first tool in the YAML file: `run_test`.
    3.  Create a TypeScript file (`src/tools.ts`) to house the tool functions.
    4.  Wrap the logic from Phase 1 into a `run_test(script_path)` function in `src/tools.ts`.
    5.  Create a simple CLI entry point (`src/index.ts`) that uses the Claude Code SDK to invoke the agent and its `run_test` tool and open/attach to a Claude session.
*   **Success Criteria:** A developer can run `claude-agent test ./tests/example.spec.ts`, which uses the agent to trigger the test execution engine from Phase 1 and establish a Claude conversation for reporting.

## Phase 3: Interactive Artifact Retrieval (Autonomous)
*   **Objective:** Build the tools and conversation wiring for the agent to autonomously retrieve and deliver artifacts to Claude without human copy/paste.
*   **Key Tasks:**
    1.  Define the `get_artifact` tool in `testing-agent.yml` with parameters for `run_id`, `type`, `filter?`, and `name?`.
    2.  Implement the `get_artifact` function in `src/tools.ts` to read and filter data from the run directory (screenshots, console, network).
    3.  Implement an agent runtime (`src/agent.ts`) that:
        - Posts a post-run summary (status, `run_id`, artifact index) to the Claude conversation.
        - Listens for Claude’s natural-language requests which are routed as tool calls, and responds with only the requested artifacts.
        - Proactively surfaces critical console errors after the run.
    4.  Keep a small CLI wrapper to start/stop sessions; avoid requiring the developer to fetch artifacts manually.
*   **Success Criteria:** After a test completes, Claude can request artifacts in natural language and the agent automatically returns only those items within the same conversation (no manual copy/paste).

## Phase 4: Integrating with Playwright MCP
*   **Objective:** Refactor the test execution engine to be driven by the agent through the Playwright MCP server, enabling more dynamic and interactive control.
*   **Key Tasks:**
    1.  Update the agent's tool definitions to reflect actions that can be sent to the MCP server (e.g., `mcp.page_click`, `mcp.page_screenshot`).
    2.  Refactor the core test execution logic. Instead of running a static script, the agent will now be able to execute steps one by one by calling the MCP tools.
    3.  This phase is advanced and allows for a future where the AI can decide the test steps on the fly, rather than just executing a pre-written script.
*   **Success Criteria:** The agent can run a test by sending a sequence of commands to the Playwright MCP server, achieving the same result as the script-based execution in Phase 2.

## Phase 5: Refinement, Error Handling, and DX
*   **Objective:** Harden the application, improve the command-line interface, and write documentation.
*   **Key Tasks:**
    1.  Implement robust error handling for all file I/O and API calls.
    2.  Improve the CLI output with better formatting, colors, and progress indicators.
    3.  Write comprehensive `README.md` documentation covering setup, usage, and all available commands.
    4.  Add unit and integration tests for the tool functions.
*   **Success Criteria:** The tool is stable, easy to use, and well-documented, making it ready for internal team adoption.