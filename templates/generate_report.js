/**
 * GIJ BigBrassBand Error Analysis Report Generator
 *
 * Usage:
 *   node generate_report.js <input_json> <output_dir>
 *
 * Input JSON format:
 * {
 *   "title": "GIJ (BigBrassBand) Error Analysis Report",
 *   "supportZipName": "Jira_support_2026-05-12-16-44-22",
 *   "logPeriod": "2026-05-12 04:51 to 16:45 (PDT, UTC-0700)",
 *   "totalErrors": 28521,
 *   "servers": [                          // Array of 1+ servers
 *     {
 *       "name": "Single Server",          // or "jira-svr01 (10.190.72.157)" for multi
 *       "patterns": [
 *         {
 *           "title": "Error Retrieving Pull/Merge Requests",
 *           "occurrences": 28379,
 *           "affectedRepos": "397 (all indexed GitLab repositories)",
 *           "affectedRepoCount": "397 repositories",
 *           "timeRange": "2026-05-12 04:51:41 to 16:45:52 (PDT)",
 *           "exception": "WrappedGitlabAPIException: External service error",
 *           "rootCause": "GitLab GraphQL API does not recognize fields...",
 *           "frequency": "Every reindex cycle (~10 minutes), once per repository",
 *           "errorMessageTemplate": "Error retrieving pull/merge requests for the repository '<repo_name>' (repoId=<id>)",
 *           "stackTrace": "com.bigbrassband.jira.git.exceptions...\n\tat ...",
 *           "stackTraceLabel": "Full Stack Trace:"    // optional, defaults to "Full Stack Trace:"
 *         }
 *       ]
 *     }
 *   ],
 *   "notes": [
 *     {
 *       "label": "Velocity Allowlisting Warnings",
 *       "text": "Numerous WARN-level messages matching 'VelocityHelper'..."
 *     }
 *   ]
 * }
 */

const docx = require("docx");
const fs = require("fs");
const path = require("path");

const {
    Document, Packer, Paragraph, TextRun,
    Table, TableRow, TableCell,
    WidthType, HeadingLevel, AlignmentType, ShadingType
} = docx;

// ── Helpers ──────────────────────────────────────────────────────────────────

function createCell(text, opts = {}) {
    const { bold, shading, width, alignment, font } = opts;
    return new TableCell({
        width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
        shading: shading ? { type: ShadingType.SOLID, color: shading } : undefined,
        children: [
            new Paragraph({
                alignment: alignment || AlignmentType.LEFT,
                spacing: { before: 40, after: 40 },
                children: [
                    new TextRun({
                        text: text,
                        bold: bold || false,
                        size: font || 20,
                        font: "Calibri",
                        color: shading === "2E74B5" ? "FFFFFF" : undefined,
                    }),
                ],
            }),
        ],
    });
}

function headerCell(text, width) {
    return createCell(text, { bold: true, shading: "2E74B5", width, font: 20 });
}

function labelCell(text, width) {
    return createCell(text, { bold: true, shading: "F2F2F2", width });
}

function valueCell(text, width, alignment) {
    return createCell(text, { width, alignment });
}

function stackTraceParagraphs(traceText) {
    return traceText.split("\n").map(line =>
        new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [
                new TextRun({
                    text: line,
                    font: "Consolas",
                    size: 16,
                    color: "333333",
                }),
            ],
        })
    );
}

function heading1(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
        children: [
            new TextRun({ text, bold: true, size: 28, font: "Calibri", color: "2E74B5" }),
        ],
    });
}

function heading2(text) {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
        children: [
            new TextRun({ text, bold: true, size: 24, font: "Calibri", color: "2E74B5" }),
        ],
    });
}

function bodyParagraph(runs) {
    return new Paragraph({
        spacing: { after: 200 },
        children: runs.map(r =>
            new TextRun({ font: "Calibri", size: 22, ...r })
        ),
    });
}

// ── Build Pattern Section ────────────────────────────────────────────────────

function buildPatternSection(pattern, index) {
    const elements = [];

    // Pattern heading
    elements.push(heading2(`Error Pattern ${index}: ${pattern.title}`));

    // Details table
    const detailRows = [
        ["Occurrences", String(pattern.occurrences)],
        ["Affected Repositories", pattern.affectedRepos],
        ["Time Range", pattern.timeRange],
        ["Exception", pattern.exception],
        ["Root Cause", pattern.rootCause],
        ["Frequency", pattern.frequency],
    ];

    elements.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: detailRows.map(([label, value]) =>
            new TableRow({
                children: [
                    labelCell(label, 25),
                    valueCell(value, 75),
                ],
            })
        ),
    }));

    // Error message template
    if (pattern.errorMessageTemplate) {
        elements.push(new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [new TextRun({ text: "Error Message:", bold: true, font: "Calibri", size: 22 })],
        }));
        elements.push(new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({
                text: pattern.errorMessageTemplate,
                font: "Consolas", size: 18, color: "333333",
            })],
        }));
    }

    // Stack trace
    const stLabel = pattern.stackTraceLabel || "Full Stack Trace:";
    elements.push(new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: stLabel, bold: true, font: "Calibri", size: 22 })],
    }));
    elements.push(...stackTraceParagraphs(pattern.stackTrace));

    return elements;
}

// ── Build Summary Table ──────────────────────────────────────────────────────

function buildSummaryTable(data) {
    const allPatterns = data.servers.flatMap(s => s.patterns);
    const rows = [
        new TableRow({
            children: [
                headerCell("Error Pattern", 50),
                headerCell("Occurrences", 20),
                headerCell("Affected Repos", 30),
            ],
        }),
    ];

    for (const p of allPatterns) {
        rows.push(new TableRow({
            children: [
                valueCell(p.title, 50),
                valueCell(String(p.occurrences), 20, AlignmentType.CENTER),
                valueCell(p.affectedRepoCount || p.affectedRepos, 30),
            ],
        }));
    }

    // Total row
    rows.push(new TableRow({
        children: [
            createCell("TOTAL", { width: 50, bold: true }),
            createCell(String(data.totalErrors), { width: 20, bold: true, alignment: AlignmentType.CENTER }),
            createCell("", { width: 30 }),
        ],
    }));

    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// ── Build Cross-Server Table (multi-node only) ──────────────────────────────

function buildCrossServerTable(data) {
    if (data.servers.length <= 1) return null;

    const serverNames = data.servers.map(s => s.name);
    const patternTitles = [...new Set(data.servers.flatMap(s => s.patterns.map(p => p.title)))];

    const headerRow = new TableRow({
        children: [
            headerCell("Error Pattern", 40),
            ...serverNames.map(name => headerCell(name, Math.floor(60 / serverNames.length))),
        ],
    });

    const bodyRows = patternTitles.map(title => {
        return new TableRow({
            children: [
                valueCell(title, 40),
                ...data.servers.map(server => {
                    const match = server.patterns.find(p => p.title === title);
                    return valueCell(
                        match ? String(match.occurrences) : "—",
                        Math.floor(60 / serverNames.length),
                        AlignmentType.CENTER
                    );
                }),
            ],
        });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...bodyRows],
    });
}

// ── Main: Build DOCX ─────────────────────────────────────────────────────────

function buildDocx(data) {
    const isMultiServer = data.servers.length > 1;
    const children = [];

    // Title
    children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
            text: data.title || "GIJ (BigBrassBand) Error Analysis Report",
            bold: true, size: 36, font: "Calibri", color: "2E74B5",
        })],
    }));

    // Subtitle
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({
            text: `Support Zip: ${data.supportZipName}`,
            size: 24, font: "Calibri", color: "666666",
        })],
    }));

    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [new TextRun({
            text: `Log Period: ${data.logPeriod}`,
            size: 22, font: "Calibri", color: "666666",
        })],
    }));

    // Executive Summary
    children.push(heading1("Executive Summary"));

    const patternCount = data.servers.reduce((sum, s) => sum + s.patterns.length, 0);
    const uniquePatternCount = [...new Set(data.servers.flatMap(s => s.patterns.map(p => p.title)))].length;

    children.push(bodyParagraph([
        { text: `Analysis of the atlassian-jira.log files identified ` },
        { text: `${data.totalErrors.toLocaleString()} total BigBrassBand (GIJ) ERROR entries`, bold: true },
        { text: ` falling into ${uniquePatternCount} distinct error pattern${uniquePatternCount !== 1 ? 's' : ''}.` },
        ...(isMultiServer ? [{ text: ` Errors were found across ${data.servers.length} Jira DC nodes.` }] : []),
        { text: ` All errors originate from the GIJ reindex queue thread and recur on every reindex cycle throughout the log period.` },
    ]));

    // Summary table
    children.push(buildSummaryTable(data));

    // Cross-server table (multi-node only)
    if (isMultiServer) {
        children.push(new Paragraph({ spacing: { before: 300, after: 100 },
            children: [new TextRun({ text: "Cross-Server Breakdown:", bold: true, font: "Calibri", size: 22 })],
        }));
        const crossTable = buildCrossServerTable(data);
        if (crossTable) children.push(crossTable);
    }

    // Error Patterns
    for (const server of data.servers) {
        if (isMultiServer) {
            children.push(heading1(`Server: ${server.name}`));
        }

        server.patterns.forEach((pattern, idx) => {
            const globalIdx = isMultiServer ? idx + 1 : idx + 1;
            children.push(...buildPatternSection(pattern, globalIdx));
        });
    }

    // Additional Notes
    if (data.notes && data.notes.length > 0) {
        children.push(heading1("Additional Notes"));
        for (const note of data.notes) {
            children.push(bodyParagraph([
                { text: `${note.label}: `, bold: true },
                { text: note.text },
            ]));
        }
    }

    // Footer
    children.push(new Paragraph({
        spacing: { before: 400 },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
            text: "— End of Report —",
            italics: true, size: 20, font: "Calibri", color: "999999",
        })],
    }));

    return new Document({
        styles: {
            default: { document: { run: { font: "Calibri", size: 22 } } },
        },
        sections: [{
            properties: {
                page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
            },
            children,
        }],
    });
}

// ── Main: Build Markdown ─────────────────────────────────────────────────────

function buildMarkdown(data) {
    const isMultiServer = data.servers.length > 1;
    const lines = [];

    lines.push(`# ${data.title || "GIJ (BigBrassBand) Error Analysis Report"}`);
    lines.push("");
    lines.push(`**Support Zip:** ${data.supportZipName}`);
    lines.push(`**Log Period:** ${data.logPeriod}`);
    lines.push("");

    // Executive Summary
    lines.push("## Executive Summary");
    lines.push("");

    const uniquePatternCount = [...new Set(data.servers.flatMap(s => s.patterns.map(p => p.title)))].length;
    lines.push(`Analysis identified **${data.totalErrors.toLocaleString()} total BigBrassBand (GIJ) ERROR entries** falling into ${uniquePatternCount} distinct error pattern${uniquePatternCount !== 1 ? 's' : ''}.${isMultiServer ? ` Errors were found across ${data.servers.length} Jira DC nodes.` : ''} All errors originate from the GIJ reindex queue thread and recur on every reindex cycle throughout the log period.`);
    lines.push("");

    // Summary table
    lines.push("| Error Pattern | Occurrences | Affected Repos |");
    lines.push("|---|---|---|");
    const allPatterns = data.servers.flatMap(s => s.patterns);
    for (const p of allPatterns) {
        lines.push(`| ${p.title} | ${p.occurrences.toLocaleString()} | ${p.affectedRepoCount || p.affectedRepos} |`);
    }
    lines.push(`| **TOTAL** | **${data.totalErrors.toLocaleString()}** | |`);
    lines.push("");

    // Cross-server table
    if (isMultiServer) {
        const serverNames = data.servers.map(s => s.name);
        const patternTitles = [...new Set(data.servers.flatMap(s => s.patterns.map(p => p.title)))];

        lines.push("### Cross-Server Breakdown");
        lines.push("");
        lines.push(`| Error Pattern | ${serverNames.join(" | ")} |`);
        lines.push(`|---|${serverNames.map(() => "---").join("|")}|`);
        for (const title of patternTitles) {
            const counts = data.servers.map(server => {
                const match = server.patterns.find(p => p.title === title);
                return match ? String(match.occurrences) : "—";
            });
            lines.push(`| ${title} | ${counts.join(" | ")} |`);
        }
        lines.push("");
    }

    // Error Patterns
    for (const server of data.servers) {
        if (isMultiServer) {
            lines.push(`## Server: ${server.name}`);
            lines.push("");
        }

        server.patterns.forEach((pattern, idx) => {
            const heading = isMultiServer ? "###" : "##";
            lines.push(`${heading} Error Pattern ${idx + 1}: ${pattern.title}`);
            lines.push("");
            lines.push(`| Field | Value |`);
            lines.push(`|---|---|`);
            lines.push(`| **Occurrences** | ${pattern.occurrences.toLocaleString()} |`);
            lines.push(`| **Affected Repositories** | ${pattern.affectedRepos} |`);
            lines.push(`| **Time Range** | ${pattern.timeRange} |`);
            lines.push(`| **Exception** | \`${pattern.exception}\` |`);
            lines.push(`| **Root Cause** | ${pattern.rootCause} |`);
            lines.push(`| **Frequency** | ${pattern.frequency} |`);
            lines.push("");

            if (pattern.errorMessageTemplate) {
                lines.push("**Error Message:**");
                lines.push("```");
                lines.push(pattern.errorMessageTemplate);
                lines.push("```");
                lines.push("");
            }

            const stLabel = pattern.stackTraceLabel || "Full Stack Trace:";
            lines.push(`**${stLabel}**`);
            lines.push("```java");
            lines.push(pattern.stackTrace);
            lines.push("```");
            lines.push("");
        });
    }

    // Notes
    if (data.notes && data.notes.length > 0) {
        lines.push("## Additional Notes");
        lines.push("");
        for (const note of data.notes) {
            lines.push(`**${note.label}:** ${note.text}`);
            lines.push("");
        }
    }

    lines.push("---");
    lines.push("*— End of Report —*");

    return lines.join("\n");
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

async function main() {
    const inputPath = process.argv[2];
    const outputDir = process.argv[3];

    if (!inputPath || !outputDir) {
        console.error("Usage: node generate_report.js <input.json> <output_dir>");
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

    // Generate DOCX
    const doc = buildDocx(data);
    const buffer = await Packer.toBuffer(doc);
    const docxPath = path.join(outputDir, "GIJ_BigBrassBand_Error_Analysis.docx");
    fs.writeFileSync(docxPath, buffer);
    console.log(`DOCX created: ${docxPath} (${(buffer.length / 1024).toFixed(1)} KB)`);

    // Generate Markdown
    const md = buildMarkdown(data);
    const mdPath = path.join(outputDir, "GIJ_BigBrassBand_Error_Analysis.md");
    fs.writeFileSync(mdPath, md, "utf8");
    console.log(`Markdown created: ${mdPath} (${(md.length / 1024).toFixed(1)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
