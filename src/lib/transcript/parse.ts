export interface ParsedUtterance {
  sequenceNo: number;
  speakerLabel: string | null;
  content: string;
}

const SPEAKER_LINE = /^([A-Za-z][A-Za-z0-9 ._'-]{0,59}):\s*(.*)$/;

/**
 * Deliberately format-agnostic rather than branching on source_type: lines
 * matching "Speaker: text" become separate utterances with that speaker;
 * everything else is a continuation of the previous speaker's line. If no
 * speaker-colon line is found anywhere (the common case for a pasted email
 * or document), the whole text collapses into a single speakerless
 * utterance instead of one noisy row per line.
 */
export function parseUtterances(rawText: string): ParsedUtterance[] {
  const lines = rawText.split(/\r?\n/);
  const drafts: { speakerLabel: string | null; content: string }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(SPEAKER_LINE);
    if (match) {
      drafts.push({ speakerLabel: match[1].trim(), content: match[2].trim() });
    } else if (drafts.length > 0) {
      const last = drafts[drafts.length - 1];
      last.content = last.content ? `${last.content}\n${line}` : line;
    } else {
      drafts.push({ speakerLabel: null, content: line });
    }
  }

  if (drafts.length === 0) {
    return [];
  }

  const hasAnySpeaker = drafts.some((d) => d.speakerLabel !== null);
  if (!hasAnySpeaker) {
    return [{ sequenceNo: 0, speakerLabel: null, content: rawText.trim() }];
  }

  return drafts.map((d, i) => ({
    sequenceNo: i,
    speakerLabel: d.speakerLabel,
    content: d.content,
  }));
}
