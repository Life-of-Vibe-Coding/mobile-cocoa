/** Regex to match <skill>Use SKILL_NAME</skill> tags in user messages. */
const SKILL_TAG_REGEX = /<skill>Use\s+(.+?)<\/skill>/g;

export type SkillTagSegment =
  | { type: "text"; value: string }
  | { type: "skill"; name: string };

/** Parse user message content into text and skill-chip segments. */
export function parseSkillTags(content: string): SkillTagSegment[] {
  const segments: SkillTagSegment[] = [];
  const re = new RegExp(SKILL_TAG_REGEX.source, "g");
  let lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index);
      if (text) segments.push({ type: "text", value: text });
    }
    segments.push({ type: "skill", name: m[1].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text) segments.push({ type: "text", value: text });
  }
  return segments;
}

export const BASH_LANGUAGES = new Set(["bash", "sh", "shell", "zsh"]);

/** Supports both emoji and non-emoji prefixes. Groups: 1=prefix, 2=label, 3=encodedPath. */
const FILE_ACTIVITY_LINK_REGEX = /^((?:(?:📝\s*)?Writing|(?:✏️\s*)?Editing|(?:📖\s*)?Reading))\s+\[([^\]]+)\]\(file:(.+)\)\s*$/;

/** Split regex to safely parse commands and outputs even if there is interleaved text between them. */
const COMMAND_RUN_SECTION_REGEX = /(?:(?:🖥\s*)?Running command:(?:\r?\n)+`([^`]*)`)|(?:Output:\r?\n```(?:[a-zA-Z0-9-]*)\r?\n([\s\S]*?)\r?\n```(?:(?:\r?\n)+(?:→|->)\s*(Completed|Failed)(?:\s*\((\d+)\))?)?)/g;

/** Status-only lines to filter out or assign to commands. */
const STATUS_ONLY_REGEX = /^(?:→|->)\s*(Completed|Failed)(?:\s*\((\d+)\))?\s*$/;

/** Segment for compact command list: one row per command with optional status (mobile-friendly). */
export type CommandRunSegment = {
  kind: "command";
  command: string;
  output?: string;
  status?: "Completed" | "Failed";
  exitCode?: number;
};

export type FileActivitySegment =
  | { kind: "file"; prefix: string; fileName: string; path: string }
  | { kind: "text"; text: string };

/** Splits content into markdown and command-run segments for mixed rendering (e.g. compact command list + rest as markdown). */
export function parseCommandRunSegments(content: string): Array<{ type: "markdown"; content: string } | CommandRunSegment> {
  const re = new RegExp(COMMAND_RUN_SECTION_REGEX.source, "g");
  const segments: Array<{ type: "markdown"; content: string } | CommandRunSegment> = [];
  let lastEnd = 0;
  let m;
  let currentCommand: CommandRunSegment | null = null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastEnd) {
      const slice = content.slice(lastEnd, m.index).trim();
      const lines = slice.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const isAllStatusLines = lines.length > 0 && lines.every((l) => STATUS_ONLY_REGEX.test(l));
      if (slice.length && !isAllStatusLines) segments.push({ type: "markdown", content: slice });
    }
    if (m[1] !== undefined) {
      currentCommand = {
        kind: "command",
        command: m[1] ?? "",
        output: undefined,
        status: undefined,
        exitCode: undefined,
      };
      segments.push(currentCommand);
    } else if (m[2] !== undefined) {
      if (currentCommand) {
        currentCommand.output = m[2];
        currentCommand.status = (m[3] as "Completed" | "Failed" | undefined) ?? undefined;
        currentCommand.exitCode = m[4] != null ? parseInt(m[4], 10) : undefined;
      } else {
        segments.push({ type: "markdown", content: m[0] ?? "" });
      }
    }
    lastEnd = m.index + (m[0].length ?? 0);
  }
  if (lastEnd < content.length) {
    const slice = content.slice(lastEnd).trim();
    const lines = slice.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const isAllStatusLines = lines.length > 0 && lines.every((l) => STATUS_ONLY_REGEX.test(l));
    if (isAllStatusLines) {
      const statuses = lines
        .map((line) => {
          const mStatus = line.match(STATUS_ONLY_REGEX);
          return mStatus
            ? { status: mStatus[1] as "Completed" | "Failed", exitCode: mStatus[2] != null ? parseInt(mStatus[2], 10) : undefined }
            : null;
        })
        .filter((s): s is { status: "Completed" | "Failed"; exitCode: number | undefined } => s !== null);
      const cmdIndices: number[] = [];
      for (let i = segments.length - 1; i >= 0; i--) {
        if ((segments[i] as CommandRunSegment).kind === "command") cmdIndices.unshift(i);
      }
      for (let i = 0; i < statuses.length && i < cmdIndices.length; i++) {
        const s = statuses[i];
        if (!s) continue;
        const cmd = segments[cmdIndices[i]] as CommandRunSegment;
        cmd.status = s.status;
        cmd.exitCode = s.exitCode;
      }
    } else if (slice.length) {
      segments.push({ type: "markdown", content: slice });
    }
  }
  return segments;
}

export function parseFileActivitySegments(content: string): FileActivitySegment[] {
  const lines = content.split(/\r?\n/);
  const raw: FileActivitySegment[] = lines.map((line) => {
    const match = line.match(FILE_ACTIVITY_LINK_REGEX);
    if (!match) return { kind: "text" as const, text: line };
    const prefix = match[1] ?? "";
    const rawName = (match[2] ?? "").trim();
    const fileName = rawName.replace(/^`(.+)`$/, "$1");
    const encodedPath = (match[3] ?? "").trim();
    let path = encodedPath;
    try {
      path = decodeURIComponent(encodedPath);
    } catch {
      path = encodedPath;
    }
    return { kind: "file" as const, prefix, fileName, path };
  });
  // Merge consecutive text segments so long read-result blocks (e.g. skill files) become one segment for collapse
  const merged: FileActivitySegment[] = [];
  let textAccum: string[] = [];
  const flushText = () => {
    if (textAccum.length > 0) {
      merged.push({ kind: "text", text: textAccum.join("\n") });
      textAccum = [];
    }
  };
  for (const seg of raw) {
    if (seg.kind === "file") {
      flushText();
      merged.push(seg);
    } else {
      textAccum.push(seg.text);
    }
  }
  flushText();
  return merged;
}

/** Max chars to show for read-result content (e.g. skill files) before collapsing. */
export const MAX_READ_RESULT_PREVIEW = 1800;

export type ContentSegment =
  | { type: "thinking"; content: string }
  | { type: "text"; content: string };

/** Parses content into alternating thinking and text segments to maintain chronological order. */
export function parseContentSegments(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  // Only match fully-closed thinking blocks to avoid swallowing trailing content
  // when a <think> tag is unclosed during streaming.
  // WARNING: This regex uses /g, making .exec() stateful via .lastIndex.
  // Do NOT hoist to module scope — a shared /g regex across calls causes
  // silent skipped matches or infinite loops.
  const CLOSED_THINKING_REGEX = /<think(?:_start)?>([\s\S]*?)<\/think(?:_end)?>/gi;
  CLOSED_THINKING_REGEX.lastIndex = 0; // defensive reset
  let lastIndex = 0;
  let match;

  while ((match = CLOSED_THINKING_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) {
        segments.push({ type: "text", content: text.replace(/\n{3,}/g, "\n\n") });
      }
    }
    const thinkContent = match[1].trim();
    if (thinkContent) {
      segments.push({ type: "thinking", content: thinkContent });
    }
    if (match.index === CLOSED_THINKING_REGEX.lastIndex) {
      CLOSED_THINKING_REGEX.lastIndex++;
    }
    lastIndex = CLOSED_THINKING_REGEX.lastIndex;
  }

  // Handle remaining content after the last closed thinking block.
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    // Check for a trailing unclosed <think> tag (common during streaming).
    // Only the content after the unclosed tag goes into a thinking segment;
    // text before it stays as a normal text segment.
    const trailingThinkMatch = remaining.match(/<think(?:_start)?>([\s\S]*)$/i);
    if (trailingThinkMatch && trailingThinkMatch.index != null) {
      const textBefore = remaining.slice(0, trailingThinkMatch.index).trim();
      if (textBefore) {
        segments.push({ type: "text", content: textBefore.replace(/\n{3,}/g, "\n\n") });
      }
      const thinkContent = trailingThinkMatch[1].trim();
      if (thinkContent) {
        segments.push({ type: "thinking", content: thinkContent });
      }
    } else {
      const text = remaining.trim();
      if (text) {
        segments.push({ type: "text", content: text.replace(/\n{3,}/g, "\n\n") });
      }
    }
  }

  // Note: Text segments should NOT be converted to thinking blocks based on what comes after.
  // Each segment type is determined by its own content, not its position relative to other segments.

  const mergedSegments: ContentSegment[] = [];
  for (const seg of segments) {
    if (mergedSegments.length === 0) {
      mergedSegments.push({ ...seg });
    } else {
      const last = mergedSegments[mergedSegments.length - 1];
      if (last.type === seg.type) {
        last.content += "\n\n" + seg.content;
      } else {
        mergedSegments.push({ ...seg });
      }
    }
  }

  return mergedSegments;
}

/** Matches file-activity lines from formatToolUseForDisplay (Writing, Reading, Editing).
 * Requires the file-link markdown pattern (prefix + `[name](file:...)`) or backtick-quoted filename
 * to avoid false positives on natural language like "I'm reading the docs". */
export function hasFileActivityContent(content: string | null | undefined): boolean {
  if (!content || typeof content !== "string") return false;
  // Match: "Writing [file](file:...)" / "📝 Writing [file](file:...)" or "Writing `file`" patterns
  return (
    /(?:📝\s*)?Writing\s+\[|(?:✏️\s*)?Editing\s+\[|(?:📖\s*)?Reading\s+\[/.test(content) ||
    /(?:📝\s*)?Writing\s+`|(?:✏️\s*)?Editing\s+`|(?:📖\s*)?Reading\s+`/.test(content)
  );
}

/** True if content contains markdown fenced code blocks (```). */
export function hasCodeBlockContent(content: string | null | undefined): boolean {
  if (!content || typeof content !== "string") return false;
  return /```/.test(content);
}
