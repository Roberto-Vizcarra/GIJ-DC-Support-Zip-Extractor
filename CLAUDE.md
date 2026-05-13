# GIJ (Git Integration for Jira) DC Support Zip Analyzer

## Project Purpose

This project analyzes Atlassian Jira Data Center support zip files to identify, deduplicate, and report all errors related to the **GIJ (Git Integration for Jira)** plugin by BigBrassBand / GitKraken. The output is a professional Word document (.docx) and a companion Markdown (.md) file summarizing the findings with full stack traces included inline.

## How the User Will Use This Project

The user (a GIJ support engineer) will provide one or more support zip directories for analysis. These are extracted Atlassian support zips from Jira DC instances. Each run of the analysis targets a specific customer ticket.

**Typical user prompts:**
> "Analyze the support zip(s) at `<path>`"
> "Here's a new support zip to analyze: `<path>`"
> "I have 3 server folders to analyze in `<path>`"

The user may provide:
- A single support zip directory (single Jira node)
- Multiple support zip directories (multi-node Jira DC cluster)
- A parent directory containing multiple server subdirectories

---

## Analysis Workflow

### Step 1: Locate Log Files

Look for `atlassian-jira.log*` files inside each support zip directory. The typical structure is:

```
<support_zip_dir>/
  application-logs/
    atlassian-jira.log
    atlassian-jira.log.1
    atlassian-jira.log.2
    ...
    atlassian-jira.log.10
```

Scan ALL rotated log files (`.log` through `.log.10` or higher if present).

If the user provides a parent directory, auto-detect server subdirectories by looking for folders containing `application-logs/atlassian-jira.log`.

### Step 2: Identify GIJ Errors

Search for ERROR-level log entries related to BigBrassBand/GIJ. The identifying marker is the package name `bigbrassband` appearing in the log line, combined with `ERROR` level.

**Grep pattern:**
```bash
grep -h "bigbrassband.*ERROR\|ERROR.*bigbrassband" atlassian-jira.log*
```

### Step 2b: Capture Debug Log Context (When Present)

Customers sometimes enable debug-level logging for specific GIJ classes. These logs are NOT errors, but they provide valuable contextual information about application operations — particularly GitHub App integration, webhook processing, and general GIJ service behavior.

**Debug logging classes to look for:**

| Class / Package | Area |
|-----------------|------|
| `com.bigbrassband.jira.git.services.integration.github` | GitHub integration service operations |
| `com.bigbrassband.jira.git.services.githubapp` | GitHub App service layer |
| `com.bigbrassband.jira.git.services.githubapp.GithubAppManagerImpl` | GitHub App manager implementation details |
| `com.bigbrassband.jira.git.rest.webhook.GitHubAppWebHook` | GitHub App webhook processing |
| `com.bigbrassband.jira.git.rest.webhook.GitHubAppWebHookResource` | GitHub App webhook REST resource |
| `com.bigbrassband.jira.git` | General GIJ operations (broad — may be verbose) |
| `com.bigbrassband.jira.git.rest.webhook` | All webhook processing |

**Detection:**
```bash
# Check if debug logging is present for these classes
grep -l "DEBUG.*com\.bigbrassband\.jira\.git\.services\.integration\.github\|DEBUG.*com\.bigbrassband\.jira\.git\.services\.githubapp\|DEBUG.*com\.bigbrassband\.jira\.git\.rest\.webhook" atlassian-jira.log*

# Count debug entries per class
grep -hc "DEBUG.*com\.bigbrassband\.jira\.git\.services\.githubapp" atlassian-jira.log* | paste -sd+ | bc

# Extract unique debug message templates for a class
grep -h "DEBUG.*com\.bigbrassband\.jira\.git\.services\.githubapp" atlassian-jira.log* | sed 's/^[0-9-]* [0-9:,]* //' | sort -u
```

**How to handle debug logs:**
1. **Check for their presence** — if none of these classes appear at DEBUG level, skip this section entirely
2. **Do NOT mix with error analysis** — debug entries belong in their own section
3. **Summarize, don't enumerate** — group by class/area and describe the operational flow they reveal
4. **Correlate with errors** — note if debug logs provide context for error patterns (e.g., a webhook debug trace leading up to a failure)
5. **Capture time range** — note when debug logging was active (it's often enabled temporarily for troubleshooting)
6. **Highlight key findings** — flag anything operationally significant: failed auth handshakes, webhook delivery issues, unexpected state transitions, etc.

### Step 3: Filter Out Noise

**EXCLUDE** the following from the analysis — these are debug-mode noise, not real errors:
- Velocity allowlisting warnings: lines containing `VelocityHelper` or `Method needs allowlisting`
- Any WARN-level entries (we only care about ERROR level)

### Step 4: Deduplicate and Categorize

Group errors into **unique error patterns**. Two errors are the "same pattern" if they have:
- The same error message template (ignoring variable parts like repo names, timestamps, IDs)
- The same exception type and stack trace structure

For each unique pattern, capture:
- **Total occurrence count** across all log files
- **Affected repositories** (extract repo names and IDs from error messages)
- **Time range** (first and last occurrence timestamps)
- **Full stack trace** (capture once — they're identical across occurrences)
- **Root cause analysis** (interpret what the error means technically)

### Step 5: Clone Error Context

Clone errors (`Error during .git clone attempt`) do NOT include stack traces or repository names. To identify the affected repository:

1. Look at preceding lines on the same thread (e.g., `bigbrassband-gitplugin-reindex-queue:thread - N`)
2. Check for correlated errors (e.g., if clone errors always follow a specific update error with matching count and timing, they likely affect the same repo)
3. Use `awk` to trace the last repo-specific activity on that thread before the clone error:
```bash
awk '/bigbrassband-gitplugin-reindex-queue:thread - 1/{if($0 !~ /Error during .git clone attempt/) last=$0} /Error during .git clone attempt/{print last; print "---"}' atlassian-jira.log.10
```

### Step 6: Multi-Server Handling

For multi-node Jira DC clusters:
- Identify each server by its **folder name** (e.g., `Jira_jira-svr01_...`, `Jira_jira-svr02_...`)
- Break down findings **per server** — do NOT break down by individual log file
- Include a cross-server summary table showing which errors appear on which nodes
- Note which errors appear on all nodes vs. specific nodes only

For single-server support zips:
- No per-server breakdown needed
- Simpler summary table

### Step 7: Generate Reports

Generate **two output files** placed in the support zip directory (or the parent directory if multiple zips):

1. **`GIJ_BigBrassBand_Error_Analysis.docx`** — Professional Word document
2. **`GIJ_BigBrassBand_Error_Analysis.md`** — Markdown companion

Both files must include **full stack traces inline** in the main document body.

---

## Report Format Specification

### Document Structure

```
Title: GIJ (BigBrassBand) Error Analysis Report
Subtitle: Support Zip name/path
Log Period: <first timestamp> to <last timestamp> (timezone)

1. Executive Summary
   - Total error count
   - Number of unique patterns
   - Summary table: Pattern | Occurrences | Affected Repos
   - (For multi-server: Cross-server summary table)

2. [For multi-server only] Server: <server_folder_name>
   Error Pattern N: <Descriptive Title>

   [For single-server] Error Pattern N: <Descriptive Title>

   (for each unique pattern)
   - Details table:
     - Occurrences
     - Affected Repository/Repositories (with repoId)
     - Time Range (with timezone)
     - Exception type
     - Root Cause analysis
     - Frequency
   - Error Message template
   - Full Stack Trace (monospace/code font)

3. Debug Log Context (only if debug logging detected)
   - Which classes had debug logging enabled
   - Time range debug logging was active
   - Per-class summary of what the debug logs reveal:
     - Operational flow description
     - Key observations (auth handshakes, webhook deliveries, state changes)
     - Correlation with error patterns (if any)

4. Additional Notes
   - What was excluded and why
   - Correlations between patterns
   - Impact assessment

Footer: — End of Report —
```

### Formatting Requirements (docx)

- **Body font:** Calibri 11pt
- **Stack traces:** Consolas 8pt, color #333333
- **Headings:** Blue (#2E74B5), bold
- **Tables:** Header rows with blue (#2E74B5) background, white text. Detail tables use light gray (#F2F2F2) for label cells.
- **Margins:** 1 inch all sides
- **Page size:** Letter (8.5 x 11)

### Markdown Format

The .md file should mirror the .docx structure using:
- `#` headers for sections
- Fenced code blocks (` ``` `) for stack traces
- Pipe tables for summary/detail tables
- Bold for labels

---

## Technical Implementation

### Document Generation

Use the `docx` npm package to generate Word documents programmatically. A reusable template script is provided at `templates/generate_report.js`.

**First-time setup:**
```bash
cd <project_dir>/templates && npm install docx
```

The script accepts a JSON data file as input containing all the analysis results, and outputs both .docx and .md files.

### Handling Large Output

If grep output exceeds bash tool limits (~100K chars), use these strategies:
- Process one log file at a time
- Pipe to `wc -l` for counts first, then extract unique patterns separately
- Use `sort -u` aggressively to deduplicate before examining details
- Get counts per file: `grep -c "pattern" atlassian-jira.log* | grep -v ":0$"`
- Extract repo names separately: `grep -h "pattern" files | sed 's/.*repo_regex.*/\1/' | sort -u`

### Useful Commands Reference

```bash
# Count total errors
grep -hc "bigbrassband.*ERROR\|ERROR.*bigbrassband" atlassian-jira.log* | paste -sd+ | bc

# Get unique error message templates (stripping timestamps and variable parts)
grep -h "bigbrassband.*ERROR\|ERROR.*bigbrassband" atlassian-jira.log* | grep -v "VelocityHelper" | sed 's/^[0-9-]* [0-9:,]* //' | sort -u

# Extract affected repo names for a pattern
grep -h "Error retrieving pull/merge" atlassian-jira.log* | sed "s/.*repository '\([^']*\)' (repoId=\([0-9]*\)).*/\1 (repoId=\2)/" | sort -u

# Get first and last timestamps for a pattern
grep -h "PATTERN" atlassian-jira.log* | sort | head -1
grep -h "PATTERN" atlassian-jira.log* | sort | tail -1

# Extract full stack trace (first occurrence, up to next timestamp line)
grep -A 100 "PATTERN" atlassian-jira.log.10 | head -60

# Trace clone error context
awk '/reindex-queue:thread - 1/{if($0 !~ /clone attempt/) last=$0} /clone attempt/{print last}' atlassian-jira.log.10

# Check correlation between two error patterns
grep -h "pattern1\|pattern2" atlassian-jira.log* | sort
```

---

## Common GIJ Error Patterns (Reference)

These are patterns frequently seen in GIJ support zips. This is NOT exhaustive — always analyze what's actually in the logs rather than assuming these will be present.

| Pattern | Exception | Typical Cause |
|---------|-----------|---------------|
| Error retrieving pull/merge requests | `WrappedGitlabAPIException` | GIJ/GitLab version mismatch (GraphQL fields not supported by this GitLab version) |
| Error updating the repository | `TransportException` / `TooLargeObjectInPackException` | Repository contains objects exceeding JGit's ~2.1GB limit |
| Error during .git clone attempt | (no stack trace) | Clone failed — check preceding thread context for root cause |
| Connection timeout / read timeout | Various timeout exceptions | Network connectivity issue to git hosting service |
| SSH key / authentication errors | `TransportException` | Credential or SSH key configuration issues |
| Rate limiting | API rate limit responses | Too many API calls to git hosting service |
| GitLab API 500 errors | `WrappedGitlabAPIException` | Server-side error on the GitLab instance |

---

## Key Rules

1. **Never duplicate errors** — deduplicate by pattern, report occurrence counts
2. **Organize by server folder** for multi-node — NEVER by individual log file names
3. **Always include full stack traces** inline in the main document body
4. **Generate both .docx AND .md** output files every time
5. **Exclude velocity allowlisting warnings** — they are Jira debug-mode noise
6. **Check clone error context** — trace thread activity to identify affected repos
7. **Provide root cause analysis** — don't just list errors, explain what they mean technically
8. **Place output files** in the support zip directory (or parent directory for multi-zip)
9. **Note the log period** with timezone from the first and last log entries
10. **Count affected repos** — extract and count unique repository names per pattern
