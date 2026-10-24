import { extractText, getDocumentProxy } from "unpdf";

const GOOGLE_DOC_LINK = /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/g;
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".rtf"];

/** Vercel rejects request bodies over 4.5 MB. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Keeps a single pasted dump from crowding the model's context window. */
const MAX_TEXT_CHARS = 200_000;

export type Source = {
  kind: "file" | "gdoc";
  label: string;
  /** What happened while reading, shown back to the user verbatim. */
  note: string;
  text: string | null;
};

export type Intake = {
  /** Whatever the user typed, with doc links stripped out. */
  instruction: string;
  sources: Source[];
};

function truncate(body: string) {
  return body.length > MAX_TEXT_CHARS ? body.slice(0, MAX_TEXT_CHARS) : body;
}

function describe(body: string, truncated: boolean, prefix = "") {
  const size = `${body.length.toLocaleString()} characters`;
  const detail = truncated
    ? `${size}, truncated to ${MAX_TEXT_CHARS.toLocaleString()} for the model`
    : size;
  return prefix ? `${prefix}, ${detail}` : detail;
}

async function readGoogleDoc(id: string): Promise<Source> {
  const label = `docs.google.com/document/d/${id}`;
  const sharingHint = 'Set sharing to "anyone with the link".';

  const response = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, {
    redirect: "follow",
  });

  if (!response.ok) {
    return { kind: "gdoc", label, note: `Could not read (${response.status}). ${sharingHint}`, text: null };
  }

  if (response.headers.get("content-type")?.includes("text/html")) {
    return { kind: "gdoc", label, note: `Google returned a sign-in page. ${sharingHint}`, text: null };
  }

  const body = await response.text();
  if (!body.trim()) {
    return { kind: "gdoc", label, note: "The doc is empty.", text: null };
  }

  const kept = truncate(body);
  return { kind: "gdoc", label, note: describe(body, kept !== body), text: kept };
}

/**
 * The gateway only carries text and image content parts, so a PDF has to be
 * flattened to text here rather than handed to the model as a document.
 */
async function readPdf(file: File) {
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text, totalPages };
}

async function readFile(file: File): Promise<Source> {
  const name = file.name.toLowerCase();
  const base = { kind: "file" as const, label: file.name };

  if (file.size === 0) {
    return { ...base, note: "The file is empty.", text: null };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ...base,
      note: `${(file.size / 1024 / 1024).toFixed(1)} MB is over the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`,
      text: null,
    };
  }

  if (name.endsWith(".pdf")) {
    try {
      const { text, totalPages } = await readPdf(file);
      const pages = `${totalPages} page${totalPages === 1 ? "" : "s"}`;

      if (!text.trim()) {
        return {
          ...base,
          note: `${pages}, but no text layer. This looks like a scan, so it needs OCR.`,
          text: null,
        };
      }

      const kept = truncate(text);
      return { ...base, note: describe(text, kept !== text, pages), text: kept };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "unknown error";
      return { ...base, note: `Could not read this PDF (${message}).`, text: null };
    }
  }

  if (TEXT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    const body = await file.text();
    const kept = truncate(body);
    return { ...base, note: describe(body, kept !== body), text: kept };
  }

  return { ...base, note: "Only PDF and plain-text formats can be read. Export this as a PDF.", text: null };
}

export async function collect(form: FormData): Promise<Intake> {
  const typed = typeof form.get("text") === "string" ? (form.get("text") as string) : "";
  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
  const docIds = [...new Set(Array.from(typed.matchAll(GOOGLE_DOC_LINK), (match) => match[1]))];

  const sources = await Promise.all([
    ...docIds.map((id) => readGoogleDoc(id)),
    ...files.map((file) => readFile(file)),
  ]);

  return { instruction: typed.replace(GOOGLE_DOC_LINK, "").trim(), sources };
}

/** Lays the readable sources out as one delimited block for the prompt. */
export function toPromptText(sources: Source[]) {
  return sources
    .filter((source) => source.text)
    .map((source) => `<document title="${source.label}">\n${source.text}\n</document>`)
    .join("\n\n");
}
