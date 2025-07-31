# Agent Flows & Internal Logic

## Flow 1: Test Execution (`run_test` tool)

1.  **AGENT receives a command to run a test** (e.g., from the developer's CLI command).
2.  **AGENT validates the input:**
    *   `IF script_path does not exist THEN`
        *   `RETURN Error: "Script file not found."`
        *   `EXIT.`
3.  **AGENT initializes a new test run:**
    *   `CREATE a unique, timestamped directory (e.g., /runs/YYYY-MM-DD-HH-MM-SS).`
    *   `SET current_run_id = "YYYY-MM-DD-HH-MM-SS".`
4.  **AGENT starts the Playwright MCP session:**
    *   `INITIATE connection to the Playwright MCP server.`
    *   `CREATE new browser context.`
5.  **AGENT sets up data capture listeners:**
    *   `ATTACH listener for console events ('page.on('console')').`
        *   `ON console event:`
        *   `  APPEND event message to console.log file in the run directory.`
    *   `ATTACH listener for network requests ('page.on('request')').`
        *   `ON request event:`
        *   `  APPEND request/response data to network.log file.`
6.  **AGENT begins executing the Playwright script line by line.**
    *   `FOR EACH action in script:`
        *   `LOG the action to actions.json in the run directory.`
        *   `CALL tool_take_screenshot({ timing: 'before', action_name: current_action }).`
        *   `EXECUTE the Playwright action (e.g., page.click()).`
        *   `IF execution returns an error THEN`
            *   `LOG the error.`
            *   `CALL tool_take_screenshot({ timing: 'on_error' }).`
            *   `SET test_status = 'FAIL'.`
            *   `BREAK loop.`
        *   `ELSE`
            *   `CALL tool_take_screenshot({ timing: 'after', action_name: current_action }).`
7.  **AGENT finalizes the test run:**
    *   `GENERATE Playwright trace file and save to run directory.`
    *   `CLOSE browser session.`
    *   `IF test_status is not 'FAIL' THEN`
        *   `SET test_status = 'PASS'.`
    *   `RETURN final test_status and path to artifacts directory.`
    *   `EXIT.`

---

## Flow 2: Artifact Retrieval (`get_artifact` tool)

1.  **AGENT is activated via a prompt from the main Claude session** (e.g., "show me the console log").
2.  **Claude's NLU determines the user wants a specific tool** and calls `get_artifact` with parsed parameters (e.g., `{ run_id: "...", type: "console", filter: "error" }`).
3.  **AGENT validates the `run_id`:**
    *   `IF run directory for run_id does not exist THEN`
        *   `RETURN Error: "Test run not found."`
        *   `EXIT.`
4.  **AGENT executes a SWITCH statement on the `type` parameter:**
    *   **CASE "screenshot":**
        *   `READ the actions.json file from the run directory.`
        *   `FIND the screenshot file matching the name/timing parameter (e.g., "after_click_submit.png").`
        *   `IF file exists THEN`
            *   `RETURN the image data (e.g., as a base64 string) or file path.`
        *   `ELSE`
            *   `RETURN Error: "Screenshot not found."`
    *   **CASE "console":**
        *   `READ the console.log file from the run directory.`
        *   `IF a filter is provided (e.g., "error") THEN`
            *   `PARSE the log and extract only lines matching the filter.`
            *   `RETURN the filtered lines.`
        *   `ELSE`
            *   `RETURN the entire content of the console.log file.`
    *   **CASE "network":**
        *   `(Similar logic as console, reading network.log and applying filters).`
    *   **DEFAULT:**
        *   `RETURN Error: "Invalid artifact type requested."`
5.  **The returned data is passed back into the main Claude conversation context.**