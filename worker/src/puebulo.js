// Puebulo share-link importer.
//
// API: GET https://puebulo.com/api/share/<token>   (public, no auth)
// Response shape (verified 2026-05-31):
//   { session: {id, title, startedAt, durationSeconds, score, speakerRoles},
//     recordings: {videoUrl, audioUrl},
//     questions:  [{id, text, askedAtSeconds, kind, ...}],
//     comments:   [...], utterances: [...] }
//
// We transform it into the REPLAYS schema used on /resources. The admin
// just uploads a video and pastes a Pueblo link — this mapper fills
// everything else (slug, date, duration, company, role, logo, seoTitle,
// dek, score, questions) by parsing session.title + session.score.

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

/**
 * Parse Pueblo session.title into {company, role}. Tries common formats:
 *   "Walmart - Senior Data Scientist"  →  company=Walmart, role=Senior Data Scientist
 *   "Senior Data Scientist · Walmart"  →  role=Senior..., company=Walmart  (mirrors our site)
 *   "Senior DS @ Walmart"              →  role=Senior DS, company=Walmart
 *   anything else                      →  role=<title>, company=""
 */
function parseTitle(rawTitle) {
  const title = String(rawTitle || "").trim();
  if (!title) return { company: "", role: "" };
  let m;
  if ((m = title.match(/^(.+?)\s*[-—]\s*(.+)$/))) {
    return { company: m[1].trim(), role: m[2].trim() };
  }
  if ((m = title.match(/^(.+?)\s+·\s+(.+)$/))) {
    return { role: m[1].trim(), company: m[2].trim() };
  }
  if ((m = title.match(/^(.+?)\s+@\s+(.+)$/))) {
    return { role: m[1].trim(), company: m[2].trim() };
  }
  return { company: "", role: title };
}

// REPLAYS score schema (4 canonical bands; verdict derived from `overall`).
const BANDS = [
  { name: "Fail",        range: "< 55",  note: "Clear no — panel passes." },
  { name: "Borderline",  range: "55–64", note: "Committee hesitates; could go either way." },
  { name: "Pass",        range: "65–84", note: "Advances, with reservations to probe next round." },
  { name: "Strong Pass", range: "≥ 85",  note: "Panel advances without hesitation." },
];

function verdictFor(overall) {
  if (overall < 55) return { verdict: "FAIL",        label: BANDS[0].note };
  if (overall < 65) return { verdict: "BORDERLINE",  label: BANDS[1].note };
  if (overall < 85) return { verdict: "PASS",        label: BANDS[2].note };
  return                   { verdict: "STRONG PASS", label: BANDS[3].note };
}

function extractBreakdown(puebloScore) {
  // Pueblo's per-dimension field name varies; try the common ones, normalize
  // to the [name, score, max, note] tuple shape the site renderer reads.
  const arr =
    (Array.isArray(puebloScore.dimensions)  && puebloScore.dimensions)   ||
    (Array.isArray(puebloScore.criteria)    && puebloScore.criteria)     ||
    (Array.isArray(puebloScore.categories)  && puebloScore.categories)   ||
    (Array.isArray(puebloScore.competencies)&& puebloScore.competencies) ||
    [];
  return arr
    .map((d) => [
      d.name || d.label || d.title || "?",
      Number(d.score ?? d.value ?? 0),
      Number(d.max   ?? d.outOf ?? 10),
      String(d.note || d.feedback || d.summary || ""),
    ])
    // drop rows with max=0 (Pueblo emits placeholder "Role Fit" with 0/0)
    .filter(([, , max]) => max > 0);
}

/**
 * Map Pueblo's session.score → REPLAYS score schema, or null if no `overall`.
 */
function mapScore(puebloScore) {
  if (!puebloScore || typeof puebloScore !== "object") return null;
  const overall = Number(
    puebloScore.overall ?? puebloScore.total ?? puebloScore.score ?? NaN,
  );
  if (!Number.isFinite(overall)) return null;
  const max = Number(puebloScore.max ?? 100);
  const { verdict, label } = verdictFor(overall);
  return {
    overall,
    max,
    verdict,
    verdictPct: `${Math.round((overall / max) * 100)}%`,
    label,
    bands: BANDS,
    breakdown: extractBreakdown(puebloScore),
  };
}

function autoDek(company, role, durationStr, qCount) {
  const parts = [];
  if (company && role) parts.push(`A ${durationStr} ${company} ${role} mock interview replay`);
  else if (role)       parts.push(`A ${durationStr} ${role} mock interview replay`);
  else                 parts.push(`A ${durationStr} mock interview replay`);
  if (qCount)          parts.push(`${qCount} interviewer questions with timestamps`);
  parts.push("full transcript and Puebulo-style scoring");
  return parts.join(", ") + ".";
}

// Auto-write a basic Chinese summary from Pueblo's structured data. Surfaces
// score + relative strongest/weakest dimension. Operator can override via the
// admin "advanced edit" panel.
function autoSummary(company, role, durationStr, qCount, score) {
  const parts = [];
  if (role && company) parts.push(`${role} @ ${company} 模拟面试,时长 ${durationStr},共 ${qCount} 道题。`);
  else if (role)       parts.push(`${role} 模拟面试,时长 ${durationStr},共 ${qCount} 道题。`);
  else                 parts.push(`模拟面试,时长 ${durationStr},共 ${qCount} 道题。`);
  if (score?.overall != null) {
    parts.push(`Pueblo 评分 ${score.overall}/${score.max}(${score.verdict})。`);
  }
  if (score?.breakdown?.length >= 2) {
    const sorted = [...score.breakdown].sort((a, b) => (a[1]/a[2]) - (b[1]/b[2]));
    const weakest = sorted[0];
    const strongest = sorted[sorted.length - 1];
    parts.push(
      `相对强项 ${strongest[0]} (${strongest[1]}/${strongest[2]}),` +
      `相对弱项 ${weakest[0]} (${weakest[1]}/${weakest[2]})。`,
    );
  }
  parts.push("完整题目时间戳和评分见下,Main Issue 与 Also Worth Noting 由运营人工补充。");
  return parts.join("");
}

// Parse out a share token from raw token / /share/<t> URL / full URL.
export function parseToken(input) {
  if (!input) throw new Error("missing input");
  const s = String(input).trim();
  const m = s.match(/share\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]+$/.test(s)) return s;
  throw new Error(`could not parse Puebulo token from ${JSON.stringify(s)}`);
}

/**
 * Fetch a Puebulo share + transform to a REPLAY draft. The admin uploads
 * its own copy of the video (not Pueblo's expiring URL), so videoSrc stays
 * empty here — caller fills from the OSS PUT.
 */
export async function importShare(input) {
  const token = parseToken(input);
  const r = await fetch(
    `https://puebulo.com/api/share/${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } },
  );
  if (r.status === 404) throw new Error("Pueblo: share not found (404)");
  if (r.status === 410) throw new Error("Pueblo: share revoked (410)");
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Pueblo: ${r.status} ${body.slice(0, 200)}`);
  }
  const raw = await r.json();
  const session = raw.session || {};
  const recordings = raw.recordings || {};
  const questions = Array.isArray(raw.questions) ? raw.questions : [];

  // Map interviewer-asked questions (drop candidate's clarifying ones).
  const interviewerQs = questions.filter((q) => q.kind !== "candidate");

  const dateStr = fmtDate(session.startedAt);
  const durationStr = fmtDuration(session.durationSeconds);
  const { company, role } = parseTitle(session.title);
  const slug = slugify(`${company} ${role}`) + (dateStr ? "-" + dateStr.replace(/\./g, "-") : "");
  const score = mapScore(session.score);

  const draft = {
    slug: slug || slugify(token),
    date: dateStr,
    duration: durationStr,
    company,
    location: "",
    role,
    logo: company ? company[0].toUpperCase() : "",
    seoTitle: role && company
      ? `${role} · ${company} — Mock Interview Replay`
      : (role ? `${role} — Mock Interview Replay` : ""),
    dek: autoDek(company, role, durationStr, interviewerQs.length),
    tags: [],
    videoSrc: "",  // user uploads via OSS; we don't reuse Pueblo's expiring URL
    questions: interviewerQs.map((q) => ({
      t: Math.round(q.askedAtSeconds || 0),
      q: String(q.text || "").trim(),
      meta: q.kind === "interviewer" ? "" : (q.kind || ""),
    })),
    score,
    summary: autoSummary(company, role, durationStr, interviewerQs.length, score),
    // Pueblo doesn't expose narrative coaching notes — leave these blank so
    // the renderer hides those sections; operator can fill via advanced editor.
    mainIssue: null,
    alsoNoting: [],
  };

  return { draft, raw, pueblo_score_preview: session.score || null };
}
