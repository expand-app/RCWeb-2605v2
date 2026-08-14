// Staging file for RESUME_ROLES_BY_DIR.pd — the 4 resume tracks of the new
// `pd` (AI 产品) direction. Injected by scripts/add_pd_direction.py, then
// this file is deleted.
//
// Company name is Puebulo per user confirmation (the spec doc's placeholder
// "Larkfield AI Labs" was explicitly overridden — 「公司就是Puebulo」).
// Structure mirrors RESUME_ROLES_BY_DIR.se.

module.exports = {
  pm: {
    name: 'Product Manager',
    sub: 'AI Product Track',
    tag: 'Role · PM',
    company: 'Puebulo',
    location: 'Austin, TX',
    title: 'Product Manager Intern',
    date: 'Jan 2026 – Apr 2026',
    bullets: [
      'Led 0→1 product definition for an AI interview-coaching platform — ran user interviews and converted a vague "I want more practice" request into a decision-guiding user story, scoping an MVP shipped to production in 12 weeks',
      'Specified the full product surface in natural language and drove implementation through an AI coding agent, covering 30+ edge cases surfaced in structured pre-build review and cutting mid-build scope changes',
      'Owned three post-launch iterations (recording reliability, scoring stability, real-time voice mock interview), each defined by a measurable acceptance bar rather than a feature list',
      'Drove model-tier selection across a 1,000+ call-per-session inference pipeline based on call frequency × output value, cutting per-session cost ~80% with no quality regression'
    ]
  },
  pa: {
    name: 'Product Analyst',
    sub: 'Analytics & Unit Economics Track',
    tag: 'Role · PA',
    company: 'Puebulo',
    location: 'Austin, TX',
    title: 'Product Analyst Intern',
    date: 'Jan 2026 – Apr 2026',
    bullets: [
      'Built the unit-economics model for an AI product, decomposing 1,000+ inference calls per 30-minute session into five call classes and isolating the 95% of calls that drove under 5% of user-facing value',
      'Reconciled server-side session statistics against model-assigned scores, surfacing a silent gate failure that let 3-minute sessions receive full scores',
      'Defined acceptance metrics for a probabilistic system — reproducibility, refusal rate, insufficient-data rate — where deterministic pass/fail testing did not apply',
      'Ran tier-level comparisons on latency and time-to-first-token, demonstrating that a cheaper model tier improved perceived responsiveness for streaming feedback'
    ]
  },
  ux: {
    name: 'Product Designer',
    sub: 'Multimodal Interaction Track',
    tag: 'Role · UX',
    company: 'Puebulo',
    location: 'Austin, TX',
    title: 'Product Design (UX) Intern',
    date: 'Jan 2026 – Apr 2026',
    bullets: [
      'Designed end-to-end flows for a multimodal interview product spanning live capture, post-session replay, and AI-driven mock interview',
      'Worked directly on running builds instead of static mockups — specified interfaces in natural language, generated them through an AI agent, and iterated against real usage',
      'Restructured the session-review interface to align transcript, speaker timeline, and per-question feedback into a single scannable view',
      'Specified voice-interaction states (listening / speaking / interrupted) for a real-time AI interviewer and removed intrusive status warnings that broke conversational immersion'
    ]
  },
  aie: {
    name: 'AI Product Engineer',
    sub: 'AI-Native Delivery Track',
    tag: 'Role · AIE',
    company: 'Puebulo',
    location: 'Austin, TX',
    title: 'AI Product Engineer Intern',
    date: 'Jan 2026 – Apr 2026',
    bullets: [
      'Delivered and shipped a production web application to AWS entirely through AI-assisted development — specifying, reviewing, and debugging rather than hand-writing implementation',
      'Directed integration of streaming speech-to-text with speaker diarization, reconnect buffering, and echo suppression for speakerphone use',
      'Specified and validated a real-time voice interview built on WebRTC against a realtime speech model — ephemeral-token auth, server-side turn detection, barge-in, and function-call session termination',
      'Root-caused a site-wide stale-UI incident traced to a year-long CDN cache on page HTML, and added cache invalidation to the deploy pipeline'
    ]
  }
};
