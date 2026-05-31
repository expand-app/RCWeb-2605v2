// Puebulo share-link importer.
//
// API: GET https://puebulo.com/api/share/<token>   (public, no auth)
// Response shape (verified 2026-05-31, see worker README for schema):
//   { session: {id, title, startedAt, durationSeconds, score, speakerRoles},
//     recordings: {videoUrl, audioUrl},
//     questions:  [{id, text, askedAtSeconds, kind: 'interviewer'|'candidate', ...}],
//     comments:   [...], utterances: [...] }
//
// We transform it into the REPLAYS schema used on /resources. Pueblo gives
// us only date / duration / video / questions automatically; the rest
// (company, role, score copy, summary, mainIssue, alsoNoting, tags) is
// human-curated in the admin form.

function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return (
    d.getFullYear() +
    "." +
    String(d.getMonth() + 1).padStart(2, "0") +
    "." +
    String(d.getDate()).padStart(2, "0")
  );
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s.-]+/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Parse out a share token from either a raw token, a /share/<t> URL,
// or a full puebulo.com URL.
export function parseToken(input) {
  if (!input) throw new Error("missing input");
  const s = String(input).trim();
  const m = s.match(/share\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  throw new Error(`could not parse Puebulo token from ${JSON.stringify(s)}`);
}

/**
 * Fetch a Puebulo share + transform to a partial REPLAY draft.
 * Returns { draft, raw }. The admin fills out the rest of the REPLAY before saving.
 */
export async function importShare(input) {
  const token = parseToken(input);
  const r = await fetch(
    `https://puebulo.com/api/share/${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } },
  );
  if (r.status === 404) throw new Error("Puebulo: share not found (404)");
  if (r.status === 410) throw new Error("Puebulo: share revoked (410)");
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Puebulo: ${r.status} ${body.slice(0, 200)}`);
  }
  const raw = await r.json();
  const session = raw.session || {};
  const recordings = raw.recordings || {};
  const questions = Array.isArray(raw.questions) ? raw.questions : [];

  // Map questions: keep only interviewer-asked (Pueblo's 'interviewer' kind);
  // candidate's clarifying questions are usually noise for our display.
  const interviewerQs = questions.filter((q) => q.kind !== "candidate");

  const dateStr = fmtDate(session.startedAt);
  // Slug: keep humans free to override; we provide a date-based default.
  const slugSeed = session.title || token;
  const slug = `${slugify(slugSeed)}-${dateStr.replace(/\./g, "-")}`;

  const draft = {
    slug,
    date: dateStr,
    duration: fmtDuration(session.durationSeconds),

    // === Filled by user in admin ===
    company: "",
    location: "",
    role: session.title || "",
    logo: "",
    seoTitle: "",
    dek: "",
    tags: [],

    // === Auto-filled from Pueblo ===
    videoSrc: recordings.videoUrl || "",
    questions: interviewerQs.map((q) => ({
      t: Math.round(q.askedAtSeconds || 0),
      q: (q.text || "").trim(),
      meta: "",
    })),

    // === Score: Pueblo's shape varies. We hand it through raw so admin can
    //     copy fields into our format; final REPLAY.score is built in UI. ===
    score: null,

    // === Free-form narrative; admin must write ===
    summary: "",
    mainIssue: "",
    alsoNoting: "",
  };

  return { draft, raw, pueblo_score_preview: session.score || null };
}
