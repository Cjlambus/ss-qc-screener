// QC Engine — evaluates extracted PDF text against Semper Solutus QC standards

// ─── Client Profile ─────────────────────────────────────────────────────────
// Built from ALL form texts submitted for a client before any gap is evaluated.
// Every example generator receives this so examples anchor to what the client
// actually wrote rather than generic placeholders.

export interface ClientProfile {
  // Identity / service
  branch: string;           // e.g. USN, USMC, Army
  mos: string | null;       // e.g. 'AT (Avionics Technician)', '5811'
  jobLabel: string;         // MOS / Rating / AFSC
  jobDescription: string | null;  // Multi-line job description from MH or RFI
  yearsService: string | null;
  locations: string[];      // Deployment locations found across all forms

  // Symptoms the client actually named
  namedSymptoms: string[];  // e.g. ['Depressed', 'anxiety', 'back pain']

  // Onset / timeline
  onsetYear: string | null; // e.g. '2008'
  onsetContext: string | null; // Any context they gave around onset

  // Written content by section (raw client text, not labels)
  functionalImpactWritten: string | null;  // What they wrote in functional impact
  suicidalIdeationWritten: string | null;  // What they wrote about SI
  traumaWritten: string | null;            // What they wrote in trauma section
  deploymentWritten: string | null;        // What they wrote about deployments
  treatmentWritten: string | null;         // What they wrote about treatment
  militaryDutiesWritten: string | null;    // What they wrote about duties (RFI)
  conditionsWritten: string[];             // Conditions/body parts named in any form

  // Scores (PCL-5, GAD-7, PHQ-9 etc.)
  scores: { name: string; score: string; max: string }[];

  // MSK / physical specifics
  mskBodyParts: string[];   // Body parts named in MSK form
  mskOnsetWritten: string | null;

  // GI specifics
  giSymptomsWritten: string | null;

  // Headaches specifics
  headacheOnsetWritten: string | null;
  headacheSeverityWritten: string | null;

  // Strategic flags — cross-reference signals
  hasHighPCL5: boolean;          // PCL-5 >= 50 (clinically significant)
  hasHighPHQ9: boolean;          // PHQ-9 >= 20 (severe depression)
  hasHighGAD7: boolean;          // GAD-7 >= 15 (severe anxiety)
  hasSI: boolean;                // Any suicidal ideation disclosed
  hasTraumaNarrative: boolean;   // Whether they wrote anything in trauma section
  hasDeploymentWritten: boolean; // Whether they wrote anything about deployments
  hasMigraines: boolean;         // Migraines / headaches mentioned anywhere
  hasTBI: boolean;               // TBI mentioned anywhere
  hasChronicPain: boolean;       // Chronic pain mentioned anywhere
  hasNoWork: boolean;            // Unable to work / haven't worked mentioned

  // Job-specific context signals (from MH job description or RFI duties)
  jobIsAviation: boolean;        // Avionics / aviation / flight line work
  jobIsInfantry: boolean;        // Infantry / combat arms
  jobIsMedical: boolean;         // Medical / corpsman / medic
  jobIsIntelligence: boolean;    // Intel / signals / SIGINT
  jobIsLogistics: boolean;       // Logistics / supply / motor transport
  jobHasShiftWork: boolean;      // Mentions mids / rotating shifts / nights
  jobHasHighTempo: boolean;      // Mentions operational tempo / mission readiness / deployment pressure
}

export interface QCGap {
  section: string;
  field: string;
  // ── Five-part output (matches client-facing format) ──────────────────────
  issue: string;            // Internal: short QC flag for CS review
  whatWasWritten: string;   // Quote or summary of what the veteran actually wrote
  whatsMissing: string;     // What additional detail would help the doctor
  whatToAdd: string;        // The type of real-life details to consider adding
  example: string;          // Copy/paste-ready draft in veteran's voice
  helpfulContext: string;   // Educational context — never directive
  severity: "critical" | "moderate";
  guidance: string;         // Legacy field — kept for CS Slack posts
}

export interface QCResult {
  formType: string;
  status: "pass" | "fail";
  gaps: QCGap[];
  passedFields: string[];
  summary: string;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

// ── Banned word scrubber ────────────────────────────────────────────────────
// Strips clinical/legal/AI language and replaces with veteran-voice alternatives.
// Applied to every client-facing string before it leaves the engine.
const BANNED_REPLACEMENTS: [RegExp, string][] = [
  [/\bhypervigilance\b/gi, 'constantly being on edge'],
  [/\bhypervigilant\b/gi, 'always on edge'],
  [/\boccupational impairment\b/gi, 'hard time keeping a job'],
  [/\boccupational functioning\b/gi, 'ability to work'],
  [/\bpersistent depressive symptoms\b/gi, 'feeling depressed that does not go away'],
  [/\bdiminished social functioning\b/gi, 'hard time being around people'],
  [/\bsymptom manifestation\b/gi, 'how these symptoms show up'],
  [/\btrauma response\b/gi, 'reaction to what happened'],
  [/\bmedically linked\b/gi, 'connected'],
  [/\bnexus\b/gi, 'connection'],
  [/\bservice connection rationale\b/gi, 'reason this connects to service'],
  [/\bclaim strategy\b/gi, 'plan'],
  [/\bcompensable\b/gi, 'ratable'],
  [/\bstrengthens your case\b/gi, 'gives the doctor a clearer picture'],
  [/\bsupports a rating\b/gi, 'helps explain your experience'],
  [/\bhelps get approved\b/gi, 'gives the doctor more context'],
  [/\bsupports service connection\b/gi, 'helps explain what happened in service'],
  [/\bneeded for nexus\b/gi, 'helps provide a clearer picture'],
  [/\bneeded to support your claim\b/gi, 'helps provide a clearer picture'],
  [/\bneeded to strengthen your case\b/gi, 'helps provide a clearer picture'],
  [/\bto support your claim\b/gi, 'to give the doctor a clearer picture'],
  [/\bfor your claim\b/gi, 'for the doctor'],
  [/\byour claim\b/gi, 'your file'],
  [/\bDBQ\b/g, 'medical form'],
  [/\bIMO\b/g, 'medical opinion'],
  [/\bclinically significant\b/gi, 'in the serious range'],
  [/\bsymptomatology\b/gi, 'symptoms'],
  [/\bpresenting symptoms\b/gi, 'symptoms you are dealing with'],
  [/\bpresenting with\b/gi, 'showing'],
  [/\bexhibiting\b/gi, 'showing'],
  [/\bmanifesting\b/gi, 'showing up as'],
  [/\bpervasive\b/gi, 'constant'],
  [/\baggravated\b/gi, 'made worse'],
  [/\baggravation\b/gi, 'getting worse'],
  [/\bpathology\b/gi, 'condition'],
  [/\bpathological\b/gi, 'serious'],
  [/\bdiagnosed with\b/gi, 'dealing with'],
  [/\bdiagnosis\b/gi, 'condition'],
];

function scrubClinical(text: string): string {
  let out = text;
  for (const [pattern, replacement] of BANNED_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// Build a complete QCGap object — enforces all five required fields.
// Pass empty string for optional fields rather than undefined.
function makeGap(
  section: string,
  field: string,
  opts: {
    issue: string;
    whatWasWritten: string;
    whatsMissing: string;
    whatToAdd: string;
    example: string;
    helpfulContext: string;
    severity?: 'critical' | 'moderate';
    guidance?: string;
  }
): QCGap {
  return {
    section,
    field,
    issue: opts.issue,
    whatWasWritten: scrubClinical(opts.whatWasWritten),
    whatsMissing: scrubClinical(opts.whatsMissing),
    whatToAdd: scrubClinical(opts.whatToAdd),
    example: scrubClinical(opts.example),
    helpfulContext: scrubClinical(opts.helpfulContext),
    severity: opts.severity ?? 'moderate',
    guidance: opts.guidance ?? opts.whatsMissing,
  };
}

// Return 'an' before vowel sounds, 'a' otherwise
function article(word: string): string {
  return /^[aeiouAEIOU]/.test(word.trim()) ? 'an' : 'a';
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 1).length;
}

// Collect all "answer blocks" — lines of freeform text that are not form labels,
// headers, checkbox rows, or boilerplate. These are what clients actually typed.
function getAnswerBlocks(text: string): string[] {
  const skipPatterns = [
    /^(section|page|document ref|date of birth|ssn|branch of service|years of service|marital status|veteran name|name:|dob:|date:)/i,
    /^(☐|☑|✓|yes|no|n\/a|\d+\s*$)/i,
    /^(not at all|several days|more than half|nearly every|a little bit|moderately|quite a bit|extremely)/i,
    /^(over the last|rate how much|severity:|total score|≥|criterion|event type|did the event|did you personally)/i,
    /^(substance|use in past|frequency|notes|alcohol|tobacco|cannabis|illicit|prescription misuse)/i,
    /^\s*$/,
    /^[_\-─═]{3,}/,
    /^(q\d+\.|question \d+|#\s+question|\d+\s+\w.{3,40}☐)/i,
    /^(minimal|mild|moderate|severe|moderately severe)/i,
    /^(direct|witnessed|learned|combat exposure|mst|accident|assault)/i,
    /^\d+$/,
    /^[A-Z]\.\s*(Presenting|Trauma|Mental|Military|Substance|Functional|Current|Criterion)/i,
  ];

  const lines = text.split('\n');
  const answers: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length < 5) continue;
    if (skipPatterns.some(p => p.test(t))) continue;
    // Must look like real text (has lowercase letters, not all caps/symbols)
    if (/[a-z]{3,}/.test(t)) {
      answers.push(t);
    }
  }
  return answers;
}

function hasTimeframe(text: string): boolean {
  return /\b(20\d\d|19\d\d|\d{4}|\d+\s*(years?|months?|weeks?)\s*ago|since\s*\d|in\s*\d{4}|during\s*(my\s*)?(deployment|service|active|training|first|second|third)|after\s*(service|deploy|discharge|getting out)|before\s*(i\s*)?(got out|discharged|separated)|when\s*i\s*(was\s*)?(in|deployed|serving))\b/i.test(text);
}

function hasLocation(text: string): boolean {
  return /\b(iraq|afghanistan|kuwait|bahrain|egypt|korea|japan|germany|okinawa|stateside|overseas|base|camp|fob|fort|post|ship|deployed|forward|patrol|convoy|back|neck|shoulder|knee|hip|ankle|wrist|elbow|foot|feet|lower|upper|lumbar|cervical|thoracic|left|right|bilateral|spine|disc)\b/i.test(text);
}

// Onset depth check — requires ALL THREE of:
//   1. A timeframe (year, "X years ago", "during service", etc.)
//   2. A location or contextual setting (deployment country, base, body part, duty context)
//   3. A triggering event or activity (what was happening when the condition started)
// A year alone is not sufficient — "2018" tells the doctor nothing about causation.
function hasOnsetDepth(text: string): boolean {
  if (!hasTimeframe(text)) return false;
  if (!hasLocation(text)) return false;
  // Triggering event or activity — something that connects the timeframe to a cause
  const hasTrigger = /\b(while|during|after|when|following|from|because|due to|as a result|carrying|lifting|running|falling|fall|impact|blast|explosion|IED|convoy|patrol|training|exercise|jump|rappel|ruck|rucksack|brace|bending|twisting|collision|vehicle|rollover|accident|incident|stressor|deployed|deployment|mission|operation|on duty|in the field|working|operating|assignment|sustained|got|took|received|happened|occurred|started after|began after|developed after|developed during|began during|started during)\b/i.test(text);
  return hasTrigger;
}

function hasEmotionalDetail(text: string): boolean {
  return /\b(fear|scared|terrif|shock|helpless|panic|numb|angry|guilt|shame|hypervigilant|startle|dread|horror|overwhelm|worthless|hopeless|isolat|withdraw|avoid|rage|flashback|nightmare|intrusive|trigger|nervous|anxious|depress|grief|loss)\b/i.test(text);
}

function hasFunctionalImpact(text: string): boolean {
  return text.length > 40 && /\b(work|job|sleep|relationship|family|daily|walk|stand|sit|drive|lift|concentrate|focus|social|hobby|exercise|shower|dress|cook|clean|shop|stairs|leave home|go out|interact|isolat|miss work|call out|performance|friends|crowd)\b/i.test(text);
}

// Find the client's answer to a specific question by looking for the question label
// and then capturing the meaningful text in the vicinity (before/after depending on PDF layout)
function findAnswer(text: string, questionPattern: RegExp, searchRadius = 600): string {
  const match = text.match(questionPattern);
  if (!match || match.index === undefined) return '';
  // Look in both directions from the question (PDF text order is unreliable)
  const before = text.substring(Math.max(0, match.index - searchRadius), match.index);
  const after = text.substring(match.index + match[0].length, match.index + match[0].length + searchRadius);
  return (before + ' ' + after).trim();
}

// Detect form type
export function detectFormType(text: string): string {
  const lower = text.toLowerCase();
  const header = lower.substring(0, 800);
  if (header.includes('pre-evaluation psychiatric') || header.includes('psychiatric screening') || header.includes('mental health evaluation')) return 'Mental Health';
  if (header.includes('musculoskeletal') || header.includes('msk screening')) return 'MSK';
  if (header.includes('gastrointestinal') || header.includes('gi screening')) return 'GI';
  if (header.includes('headache screening') || header.includes('headaches screening')) return 'Headaches';
  if (header.includes('veteran medical history') || header.includes('onboarding rfi') || header.includes('request for information')) return 'RFI';
  if (lower.includes('psychiatric') || (lower.includes('ptsd') && lower.includes('mental'))) return 'Mental Health';
  if (lower.includes('musculoskeletal')) return 'MSK';
  if (lower.includes('gastrointestinal')) return 'GI';
  if (lower.includes('headache screening')) return 'Headaches';
  if (lower.includes('veteran medical history') || lower.includes('rfi')) return 'RFI';
  const scores: Record<string, number> = { 'Mental Health': 0, 'MSK': 0, 'GI': 0, 'Headaches': 0, 'RFI': 0 };
  const keywords: Record<string, string[]> = {
    'Mental Health': ['psychiatric', 'ptsd', 'trauma', 'mental health', 'counseling', 'therapy', 'nightmares', 'flashback', 'gad-7', 'phq-9', 'pcl-5'],
    'MSK': ['musculoskeletal', 'joint', 'spine', 'lumbar', 'cervical', 'orthopedic'],
    'GI': ['gastrointestinal', 'bowel', 'ibs', 'gerd', 'reflux', 'diarrhea', 'constipation'],
    'Headaches': ['migraine', 'headache screening'],
    'RFI': ['military history', 'service record', 'veteran medical history'],
  };
  for (const [type, words] of Object.entries(keywords)) {
    for (const word of words) { if (lower.includes(word)) scores[type]++; }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 0) return best[0];
  return 'Unknown';
}

// ─── Client Profile Builder ───────────────────────────────────────────────────
// Reads ALL form texts for a client and produces a unified ClientProfile.
// Call this before any evaluator so examples can anchor to real client data.
export function buildClientProfile(allTexts: { formType: string; text: string }[]): ClientProfile {
  const combined = allTexts.map(f => f.text).join('\n\n');
  const combinedLower = combined.toLowerCase();

  // — Branch
  const branchProfile = (() => {
    for (const { text } of allTexts) {
      const branchLabelIdx = text.search(/Branch\s+of\s+Service/i);
      if (branchLabelIdx !== -1) {
        const window = text.substring(Math.max(0, branchLabelIdx - 150), branchLabelIdx + 100);
        const m = /\b(USMC|USN|USAF|USCG|USA\b|Marine Corps|Marines?|Army|Navy|Air Force|Coast Guard|National Guard|Reserves?)\b/i.exec(window);
        if (m) return m[0].toUpperCase();
      }
    }
    return /\b(usmc|marine corps|marines?|army|navy|air force|coast guard|national guard|reserves?)\b/i.exec(combined)?.[0]?.toUpperCase() || 'the military';
  })();

  // — Years of service
  const yearsServiceMatch = combined.match(/years\s+of\s+service[^\n]{0,20}\n?\s*(\d+)/i)
    || combined.match(/served\s+(\d+)\s+years?/i);
  const yearsService = yearsServiceMatch?.[1] || null;

  // — MOS / job code
  const mosProfile = (() => {
    const patterns = [
      /Primary\s+MOS\s*\/\s*AFSC\s*\/\s*Rating\s*:[^\n]{0,10}\n?\s*([A-Za-z0-9][^\n]{2,60})/i,
      /MOS\s*\/\s*Job\s*Role[^:]{0,80}:\s*\n?\s*([A-Za-z0-9][^\n]{2,80})/i,
      /\bMOS\s*\/\s*AFSC\s*\/\s*Rating\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/i,
      /\bAFSC\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/i,
      /^\s*Rating\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/im,
      /^\s*Rate\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/im,
    ];
    for (const { text } of allTexts) {
      for (const pat of patterns) {
        const m = pat.exec(text);
        if (m) {
          const val = m[1].trim();
          if (!/^\[|^\(|please|describe|enter|list|if any|your mos|e\.g\.|n\/a/i.test(val) && val.length >= 2) return val;
        }
      }
    }
    return null;
  })();

  const jobLabelProfile = (() => {
    const b = branchProfile.toUpperCase();
    if (/navy|coast guard|usn|uscg/i.test(b)) return 'Rating';
    if (/air force|usaf/i.test(b)) return 'AFSC';
    return 'MOS';
  })();

  // — Job description (multi-line, from MH form or RFI Section III)
  const jobDescriptionProfile = (() => {
    for (const { text } of allTexts) {
      // MH form: lines after MOS / Job Role label
      const mosJobIdx = text.search(/MOS\s*\/\s*Job\s*Role[^:]{0,80}:/i);
      if (mosJobIdx !== -1) {
        const afterLabel = text.substring(mosJobIdx);
        const lines = afterLabel.split('\n').slice(1);
        const descLines: string[] = [];
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          if (/^[A-Z]\.|section\s*[0-9IVX]|Date of Birth|Branch of Service|Years of Service|Presenting Concerns/i.test(t)) break;
          if (t.length > 10) descLines.push(t);
          if (descLines.length >= 8) break;
        }
        const desc = descLines.join(' ').trim();
        if (desc.length > 20) return desc.substring(0, 600);
      }
      // RFI: Section III free-text
      const sIIIIdx = text.search(/section\s*III\b|SECTION III\b/i);
      const sIVIdx = text.search(/section\s*IV\b|SECTION IV\b/i);
      if (sIIIIdx !== -1) {
        const sIIIText = text.substring(sIIIIdx, sIVIdx > sIIIIdx ? sIVIdx : sIIIIdx + 2000);
        const answerLines = sIIIText.split('\n').filter(line => {
          const t = line.trim();
          if (!t || t.length < 15) return false;
          if (/^[\u2022]/.test(t)) return false;
          if (/section\s*III|describe your typical|physical demands|shift work|stressor|include/i.test(t)) return false;
          return true;
        }).join(' ').trim();
        if (answerLines.length > 20) return answerLines.substring(0, 600);
      }
    }
    return null;
  })();

  // — Deployment locations
  const locationsProfile: string[] = [];
  if (/\biraq\b/i.test(combined)) locationsProfile.push('Iraq');
  if (/\bkuwait\b/i.test(combined)) locationsProfile.push('Kuwait');
  if (/\bafghanistan\b/i.test(combined)) locationsProfile.push('Afghanistan');
  if (/\bkorea\b/i.test(combined)) locationsProfile.push('Korea');
  if (/\bokinawa\b/i.test(combined)) locationsProfile.push('Okinawa');
  if (/\bgermany\b/i.test(combined)) locationsProfile.push('Germany');
  if (/\bguantanamo\b/i.test(combined)) locationsProfile.push('Guantanamo Bay');
  if (/\bjordan\b/i.test(combined)) locationsProfile.push('Jordan');
  if (/\bdjibouti\b/i.test(combined)) locationsProfile.push('Djibouti');
  if (/\bbahrain\b/i.test(combined)) locationsProfile.push('Bahrain');
  if (/\bphilippines\b/i.test(combined)) locationsProfile.push('Philippines');
  if (/\bvietnam\b/i.test(combined)) locationsProfile.push('Vietnam');
  if (/\bpersian gulf\b/i.test(combined)) locationsProfile.push('Persian Gulf');

  // — Named symptoms: collect distinct words the client used to describe symptoms
  const namedSymptomsRaw: string[] = [];
  for (const { text } of allTexts) {
    // MH: current symptoms field — only grab lines that look like client-written symptom text
    const sympIdx = text.search(/describe current emotional or behavioral symptoms/i);
    if (sympIdx !== -1) {
      // Stop at next section label or 300 chars, whichever comes first
      const nextSectionIdx = text.search(/\bB\.\s*Trauma|Section\s*B|Onset.*Duration|Approximate Onset/i);
      const windowEnd = (nextSectionIdx > sympIdx && nextSectionIdx !== -1) ? nextSectionIdx : sympIdx + 300;
      const snip = text.substring(sympIdx, windowEnd);
      const lines = snip.split('\n').slice(1, 5);
      for (const line of lines) {
        const t = line.trim();
        // Reject: empty, checkboxes, dates (2026-05-11), SSNs (xxx-xx-xxxx), branch codes, doc refs
        if (
          t.length < 3 ||
          /^[\u2610\u2611\u2612]/.test(t) ||
          /^\d{4}-\d{2}-\d{2}/.test(t) ||          // date like 2026-05-11
          /^\d{3}-\d{2}-\d{4}/.test(t) ||          // SSN like 516-06-6936
          /^(USN|USMC|USAF|USCG|USA)$/.test(t) ||  // branch code alone
          /section|document ref|page \d|date of birth|ssn|social security/i.test(t) ||
          /^[A-Z0-9]{4,}-[A-Z0-9]{4,}/i.test(t)   // doc ref ID
        ) continue;
        namedSymptomsRaw.push(t);
      }
    }
    // RFI Section V: condition names
    const condMatch = text.match(/(?:condition|diagnosis|diagnosed with)[^\n]{0,60}:\s*([^\n]{3,80})/gi);
    if (condMatch) condMatch.forEach(m => namedSymptomsRaw.push(m.split(':').pop()?.trim() || ''));
  }
  const namedSymptoms = [...new Set(namedSymptomsRaw.filter(s =>
    s.length > 2 && s.length < 150 &&
    !/^[A-Z0-9]{4,}-[A-Z0-9]{4,}/i.test(s) &&
    !/document ref|page \d|date:|ssn|social security/i.test(s) &&
    !/^\d{3}-\d{2}-\d{4}$/.test(s) &&   // reject raw SSN
    !/^\d{4}-\d{2}-\d{2}$/.test(s)      // reject raw date
  ))];

  // — Onset year and context
  let onsetYear: string | null = null;
  let onsetContext: string | null = null;
  for (const { text } of allTexts) {
    const onsetIdx = text.search(/approximate onset|when did.*symptoms.*begin|symptoms.*first.*start/i);
    if (onsetIdx !== -1) {
      const snip = text.substring(onsetIdx, onsetIdx + 300);
      const yearMatch = snip.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) onsetYear = yearMatch[0];
      // Check if they wrote more than just a year
      const lines = snip.split('\n').slice(1, 5).map(l => l.trim()).filter(l => l.length > 3);
      if (lines.length > 0 && lines[0].length > 5) onsetContext = lines.slice(0, 3).join(' ');
    }
  }

  // — Functional impact written
  let functionalImpactWritten: string | null = null;
  for (const { text } of allTexts) {
    const fiIdx = text.search(/functional impact|how.*symptoms.*affect|impact.*daily|daily.*life.*impact/i);
    if (fiIdx !== -1) {
      const snip = text.substring(fiIdx, fiIdx + 600);
      const lines = snip.split('\n').slice(1, 10).map(l => l.trim()).filter(l =>
        l.length > 10 && !/section|document ref|page \d|\u2610|\u2611/i.test(l)
      );
      if (lines.length > 0) { functionalImpactWritten = lines.join(' ').trim(); break; }
    }
  }
  // Strip form label prefix from functionalImpactWritten if present
  if (functionalImpactWritten) {
    functionalImpactWritten = functionalImpactWritten
      .replace(/^Describe how your symptoms affect daily life[^:]*:[\s]*/i, '')
      .replace(/^How.*symptoms.*affect[^:]*:[\s]*/i, '')
      .trim();
    if (functionalImpactWritten.length < 10) functionalImpactWritten = null;
  }
  // Also grab the freeform text that's clearly from the client (no label match needed)
  if (!functionalImpactWritten) {
    for (const { text } of allTexts) {
      const fiMatch = text.match(/All i want to do is[^\n]{0,300}/i)
        || text.match(/can.?t (work|sleep|function|get out of bed|leave)[^\n]{0,200}/i)
        || text.match(/haven.?t worked[^\n]{0,200}/i);
      if (fiMatch) { functionalImpactWritten = fiMatch[0].trim(); break; }
    }
  }

  // — Suicidal ideation written
  let suicidalIdeationWritten: string | null = null;
  for (const { text } of allTexts) {
    const siMatch = text.match(/thoughts? of (what would|death|dying|suicide|ending)[^\n]{0,300}/i)
      || text.match(/daily thoughts?[^\n]{0,200}/i);
    if (siMatch) { suicidalIdeationWritten = siMatch[0].trim(); break; }
  }

  // — Trauma written
  let traumaWritten: string | null = null;
  for (const { text } of allTexts) {
    const traumaIdx = text.search(/describe briefly|traumatic events?.*describe|if yes.*describe/i);
    if (traumaIdx !== -1) {
      const snip = text.substring(traumaIdx, traumaIdx + 400);
      const lines = snip.split('\n').slice(1, 8).map(l => l.trim()).filter(l =>
        l.length > 10 && !/\u2610|\u2611|section|page \d|document ref/i.test(l)
      );
      if (lines.length > 0) { traumaWritten = lines.join(' ').trim(); break; }
    }
  }

  // — Deployment written
  let deploymentWritten: string | null = null;
  for (const { text } of allTexts) {
    const depIdx = text.search(/specify location|deployment.*detail|concise.*pertinent|if yes.*location/i);
    if (depIdx !== -1) {
      const snip = text.substring(depIdx, depIdx + 400);
      const lines = snip.split('\n').slice(1, 8).map(l => l.trim()).filter(l =>
        l.length > 3 && !/\u2610|\u2611|section|page \d|document ref/i.test(l)
      );
      if (lines.length > 0) { deploymentWritten = lines.join(' ').trim(); break; }
    }
  }

  // — Military duties written (from RFI Section III)
  let militaryDutiesWritten: string | null = null;
  for (const { formType, text } of allTexts) {
    if (formType === 'RFI') {
      const sIIIIdx = text.search(/section\s*III\b/i);
      const sIVIdx = text.search(/section\s*IV\b/i);
      if (sIIIIdx !== -1) {
        const sIIIText = text.substring(sIIIIdx, sIVIdx > sIIIIdx ? sIVIdx : sIIIIdx + 2000);
        const lines = sIIIText.split('\n').filter(l => {
          const t = l.trim();
          return t.length > 15 && !/section\s*III|describe your typical|physical demands|stressor/i.test(t);
        }).join(' ').trim();
        if (lines.length > 20) { militaryDutiesWritten = lines.substring(0, 600); break; }
      }
    }
  }

  // — Conditions named across all forms
  const conditionsWritten: string[] = [];
  const conditionKeywords = /\b(ptsd|tinnitus|hearing loss|back pain|knee pain|shoulder pain|depression|anxiety|sleep apnea|hypertension|diabetes|migraine|headache|acid reflux|gerd|ibs|crohn|sleep disorder|insomnia|nerve damage|neuropathy|tbi|traumatic brain|vertigo|chronic pain)\b/gi;
  const condMatches = combined.match(conditionKeywords) || [];
  condMatches.forEach(c => { const lower = c.toLowerCase(); if (!conditionsWritten.includes(lower)) conditionsWritten.push(lower); });

  // — Scores (PCL-5, GAD-7, PHQ-9)
  const scores: { name: string; score: string; max: string }[] = [];
  const scorePatterns: [RegExp, string, string][] = [
    [/PCL-5[^\n]{0,30}?([0-9]{1,2})\/80/i, 'PCL-5', '80'],
    [/GAD-7[^\n]{0,30}?([0-9]{1,2})\/21/i, 'GAD-7', '21'],
    [/PHQ-9[^\n]{0,30}?([0-9]{1,2})\/27/i, 'PHQ-9', '27'],
    [/PCL-5[^\n]{0,10}Total[^\n]{0,10}?([0-9]{1,2})/i, 'PCL-5', '80'],
    [/GAD-7[^\n]{0,10}Total[^\n]{0,10}?([0-9]{1,2})/i, 'GAD-7', '21'],
    [/PHQ-9[^\n]{0,10}Total[^\n]{0,10}?([0-9]{1,2})/i, 'PHQ-9', '27'],
  ];
  for (const [pat, name, max] of scorePatterns) {
    const m = combined.match(pat);
    if (m && !scores.find(s => s.name === name)) scores.push({ name, score: m[1], max });
  }
  // Fallback: score appears on line BEFORE or AFTER the Total Score label (PDF layout varies)
  const scoreFallbacks: [string, string, string][] = [
    ['GAD-7', '21', '21'],
    ['PHQ-9', '27', '27'],
    ['PCL-5', '80', '80'],
  ];
  for (const [name, maxRange, max] of scoreFallbacks) {
    if (!scores.find(s => s.name === name)) {
      // Score BEFORE label
      const mBefore = combined.match(new RegExp('(\\d{1,2})\\s*\\n[^\\n]*Total\\s+Score\\s*\\(0[–-]' + maxRange + '\\)', 'i'));
      if (mBefore) { scores.push({ name, score: mBefore[1], max }); continue; }
      // Score AFTER label
      const mAfter = combined.match(new RegExp('Total\\s+Score\\s*\\(0[–-]' + maxRange + '\\)[^\\n]*\\n\\s*(\\d{1,2})', 'i'));
      if (mAfter) scores.push({ name, score: mAfter[1], max });
    }
  }

  // — MSK body parts
  const mskBodyParts: string[] = [];
  for (const { formType, text } of allTexts) {
    if (formType === 'MSK') {
      const parts = ['back', 'lumbar', 'cervical', 'neck', 'knee', 'shoulder', 'hip', 'ankle', 'wrist', 'elbow', 'foot', 'spine', 'leg', 'arm'];
      parts.forEach(p => { if (text.toLowerCase().includes(p)) mskBodyParts.push(p); });
    }
  }

  let mskOnsetWritten: string | null = null;
  for (const { formType, text } of allTexts) {
    if (formType === 'MSK') {
      const mskOnsetIdx = text.search(/IV[-\s]*A|when.*injury.*occur|when did this.*start|onset.*musculo/i);
      if (mskOnsetIdx !== -1) {
        const snip = text.substring(mskOnsetIdx, mskOnsetIdx + 400);
        const lines = snip.split('\n').slice(1, 6).map(l => l.trim()).filter(l => l.length > 5);
        if (lines.length > 0) mskOnsetWritten = lines.join(' ').trim();
      }
    }
  }

  let giSymptomsWritten: string | null = null;
  for (const { formType, text } of allTexts) {
    if (formType === 'GI') {
      const giIdx = text.search(/describe.*symptoms|gastrointestinal.*symptoms|Section III/i);
      if (giIdx !== -1) {
        const snip = text.substring(giIdx, giIdx + 400);
        const lines = snip.split('\n').slice(1, 6).map(l => l.trim()).filter(l => l.length > 5);
        if (lines.length > 0) giSymptomsWritten = lines.join(' ').trim();
      }
    }
  }

  let headacheOnsetWritten: string | null = null;
  let headacheSeverityWritten: string | null = null;
  for (const { formType, text } of allTexts) {
    if (formType === 'Headaches') {
      const hOnsetIdx = text.search(/when.*headache.*begin|Q1|Question 1/i);
      if (hOnsetIdx !== -1) {
        const snip = text.substring(hOnsetIdx, hOnsetIdx + 300);
        const lines = snip.split('\n').slice(1, 4).map(l => l.trim()).filter(l => l.length > 3);
        if (lines.length > 0) headacheOnsetWritten = lines.join(' ').trim();
      }
      const hSevIdx = text.search(/Q17|severity.*headache|headache.*severity|rate.*pain/i);
      if (hSevIdx !== -1) {
        const snip = text.substring(hSevIdx, hSevIdx + 300);
        const lines = snip.split('\n').slice(1, 4).map(l => l.trim()).filter(l => l.length > 3);
        if (lines.length > 0) headacheSeverityWritten = lines.join(' ').trim();
      }
    }
  }

  // — Strategic flags
  const pcl5Score = scores.find(s => s.name === 'PCL-5');
  const phq9Score = scores.find(s => s.name === 'PHQ-9');
  const gad7Score = scores.find(s => s.name === 'GAD-7');
  const hasHighPCL5 = pcl5Score ? parseInt(pcl5Score.score) >= 50 : false;
  const hasHighPHQ9 = phq9Score ? parseInt(phq9Score.score) >= 20 : false;
  const hasHighGAD7 = gad7Score ? parseInt(gad7Score.score) >= 15 : false;
  const hasSI = suicidalIdeationWritten !== null ||
    /daily thoughts|thoughts of (what would|death|dying|suicide|ending)|passive suicidal|suicidal ideation/i.test(combined);
  const hasTraumaNarrative = traumaWritten !== null && traumaWritten.length > 30;
  const hasDeploymentWritten = deploymentWritten !== null && deploymentWritten.length > 10;
  const hasMigraines = /migraine|severe headache/i.test(combined);
  const hasTBI = /\bTBI\b|traumatic brain injury|hit.*head|head.*hit|hit.*concrete|hit.*wall|concussion/i.test(combined);
  const hasChronicPain = /chronic pain|constant pain|pain every day|daily pain/i.test(combined);
  const hasNoWork = /haven.?t worked|unable to work|can.?t work|stopped working|not working|no longer work|two years/i.test(combined);

  // — Job-specific context signals
  const jobContext = ((jobDescriptionProfile || '') + ' ' + (militaryDutiesWritten || '') + ' ' + (mosProfile || '')).toLowerCase();
  const jobIsAviation = /avion|aviation|flight line|aircraft|airframe|electronics|radar|sensor|nav system|electronic warfare|rotary|fixed wing|at \(/i.test(jobContext);
  const jobIsInfantry = /infantry|combat arms|11b|0311|rifleman|grunt|machine gun|mortar|sniper|ranger|special forces/i.test(jobContext);
  const jobIsMedical = /corpsman|medic|nurse|medical|combat medicine|68w|hm\b/i.test(jobContext);
  const jobIsIntelligence = /intelligence|intel|sigint|imagery|analyst|cryptolog|35f|35m|0231/i.test(jobContext);
  const jobIsLogistics = /logistics|supply|motor transport|88m|3051|warehousing|distribution/i.test(jobContext);
  const jobHasShiftWork = /mids|midwatch|rotating shift|night shift|12.hour|24.hour|watch standing|duty rotation/i.test(jobContext);
  const jobHasHighTempo = /operational tempo|mission readiness|high tempo|op tempo|deployment pressure|surge|combat readiness|maintenance cycle/i.test(jobContext);

  return {
    branch: branchProfile,
    mos: mosProfile,
    jobLabel: jobLabelProfile,
    jobDescription: jobDescriptionProfile,
    yearsService,
    locations: locationsProfile,
    namedSymptoms,
    onsetYear,
    onsetContext,
    functionalImpactWritten,
    suicidalIdeationWritten,
    traumaWritten,
    deploymentWritten,
    militaryDutiesWritten,
    conditionsWritten,
    scores,
    mskBodyParts,
    mskOnsetWritten,
    giSymptomsWritten,
    headacheOnsetWritten,
    headacheSeverityWritten,
    hasHighPCL5,
    hasHighPHQ9,
    hasHighGAD7,
    hasSI,
    hasTraumaNarrative,
    hasDeploymentWritten,
    hasMigraines,
    hasTBI,
    hasChronicPain,
    hasNoWork,
    jobIsAviation,
    jobIsInfantry,
    jobIsMedical,
    jobIsIntelligence,
    jobIsLogistics,
    jobHasShiftWork,
    jobHasHighTempo,
  };
}

// Main evaluator
export function evaluateForm(text: string, formType: string, allTexts?: { formType: string; text: string }[]): QCResult {
  const gaps: any[] = [];
  const passedFields: string[] = [];
  const raw = text.toLowerCase();
  const answerBlocks = getAnswerBlocks(text);
  const allAnswerText = answerBlocks.join(' ');

  // Build client profile from all available form texts (cross-form context)
  const textsForProfile = allTexts && allTexts.length > 0 ? allTexts : [{ formType, text }];
  const profile = buildClientProfile(textsForProfile);

  if (formType === 'Mental Health') evaluateMentalHealth(text, raw, answerBlocks, allAnswerText, gaps, passedFields, profile);
  else if (formType === 'MSK') evaluateMSK(text, raw, gaps, passedFields, profile);
  else if (formType === 'GI') evaluateGI(text, raw, gaps, passedFields, profile);
  else if (formType === 'Headaches') evaluateHeadaches(text, raw, gaps, passedFields, profile);
  else if (formType === 'RFI') evaluateRFI(text, raw, gaps, passedFields, profile);
  else {
    gaps.push({ section: 'Document', field: 'Form Type', issue: 'Could not identify the form type.', severity: 'critical', guidance: 'Please verify this is one of the five Semper Solutus screening forms: RFI, MSK, GI, Headaches, or Mental Health.' });
  }

  // ── Normalize gaps: fill any missing five-part fields + scrub clinical language ──
  // This runs as a safety net so any gap not yet converted to makeGap() still
  // renders correctly in the new five-section format.
  const normalizedGaps: QCGap[] = gaps.map(g => ({
    ...g,
    whatWasWritten: scrubClinical(g.whatWasWritten || 'This section was left blank.'),
    whatsMissing:   scrubClinical(g.whatsMissing   || g.issue || g.guidance || ''),
    whatToAdd:      scrubClinical(g.whatToAdd      || g.guidance || ''),
    example:        scrubClinical(g.example        || ''),
    helpfulContext: scrubClinical(g.helpfulContext || 'Only include what is true for you. The goal is simply to help the doctor better understand what day-to-day life has actually looked like.'),
    guidance:       scrubClinical(g.guidance       || ''),
    issue:          scrubClinical(g.issue          || ''),
  }));

  const status = normalizedGaps.length === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'All fields meet the required detail standard. This form is ready for review.'
    : `${normalizedGaps.length} gap${normalizedGaps.length === 1 ? '' : 's'} found across ${new Set(normalizedGaps.map(g => g.section)).size} section${new Set(normalizedGaps.map(g => g.section)).size === 1 ? '' : 's'}. Client coaching recommended.`;

  return { formType, status, gaps: normalizedGaps, passedFields, summary };
}

// ─── MENTAL HEALTH ─────────────────────────────────────────────────────────────

// Extract client context from the PDF for use in drafted examples
function extractClientContext(text: string) {
  // Branch: MH form puts the filled-in value on the line BEFORE the label
  // e.g., "                USN\n            Branch of Service: ____"
  // So we look at the 3 lines before the label line as well as after it
  const branch = (() => {
    const branchLabelIdx = text.search(/Branch\s+of\s+Service/i);
    if (branchLabelIdx !== -1) {
      // Grab the 150 chars before the label (previous lines) + 100 chars after
      const window = text.substring(Math.max(0, branchLabelIdx - 150), branchLabelIdx + 100);
      const m = /\b(USMC|USN|USAF|USCG|USA\b|Marine Corps|Marines?|Army|Navy|Air Force|Coast Guard|National Guard|Reserves?)\b/i.exec(window);
      if (m) return m[0].toUpperCase();
    }
    // Fallback: scan entire text
    return /\b(usmc|marine corps|marines?|army|navy|air force|coast guard|national guard|reserves?)\b/i.exec(text)?.[0]?.toUpperCase() || 'the military';
  })();

  // Job code: covers all branches
  // Army/Marines: MOS (e.g. 11B, 0311)
  // Air Force: AFSC (e.g. 1A8X1)
  // Navy/Coast Guard: Rating or Rate (e.g. BM, MM, IT)
  // The RFI form uses the label "Primary MOS / AFSC / Rating" for all branches on one line
  const mos = (() => {
    // Match all known field label formats across RFI and MH forms:
    // RFI: "Primary MOS / AFSC / Rating:"
    // MH:  "MOS / Job Role (with brief description...):"
    // Navy/CG: "Rating:" or "Rate:"
    // Air Force: "AFSC:"
    // Army/Marines: "MOS:"
    const m = /Primary\s+MOS\s*\/\s*AFSC\s*\/\s*Rating\s*:[^\n]{0,10}\n?\s*([A-Za-z0-9][^\n]{2,60})/i.exec(text)
      || /MOS\s*\/\s*Job\s*Role[^:]{0,80}:\s*\n?\s*([A-Za-z0-9][^\n]{2,80})/i.exec(text)
      || /\bMOS\s*\/\s*AFSC\s*\/\s*Rating\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/i.exec(text)
      || /\bAFSC\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/i.exec(text)
      || /^\s*Rating\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/im.exec(text)
      || /^\s*Rate\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/im.exec(text)
      || /\bMOS\s*:[^\n]{0,5}([A-Za-z0-9][^\n]{2,55})/i.exec(text);
    if (!m) return null;
    const val = m[1].trim();
    // Reject if it looks like a form prompt rather than a client answer
    if (/^\[|^\(|please|describe|enter|list|if any|your mos|e\.g\.|n\/a/i.test(val)) return null;
    if (val.length < 2) return null;
    return val;
  })();

  // Branch-appropriate label for the job code
  const jobLabel = (() => {
    const b = branch.toUpperCase();
    if (/navy|coast guard|usn|uscg/i.test(b)) return 'Rating';
    if (/air force|usaf/i.test(b)) return 'AFSC';
    return 'MOS'; // Army, Marines, default
  })();

  // Job description: try two sources in order of preference
  // 1. MH form: multi-line text immediately after "MOS / Job Role" label
  // 2. RFI form: client-typed paragraphs in Section III
  const jobDescription = (() => {
    // Source 1: MH form job description block (lines after MOS/Job Role label)
    const mosJobIdx = text.search(/MOS\s*\/\s*Job\s*Role[^:]{0,80}:/i);
    if (mosJobIdx !== -1) {
      // Grab up to 10 lines after the label line
      const afterLabel = text.substring(mosJobIdx);
      const lines = afterLabel.split('\n').slice(1); // skip the label line itself
      const descLines: string[] = [];
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        // Stop when we hit the next form section/field
        if (/^[A-Z]\.|section\s*[0-9IVX]|Date of Birth|Branch of Service|Years of Service|Presenting Concerns/i.test(t)) break;
        if (t.length > 10) descLines.push(t);
        if (descLines.length >= 8) break; // cap at 8 lines
      }
      const desc = descLines.join(' ').trim();
      if (desc.length > 20) return desc.substring(0, 600);
    }
    // Source 2: RFI Section III free-text duties field
    const sIIIIdx = text.search(/section\s*III\b|SECTION III\b/i);
    const sIVIdx = text.search(/section\s*IV\b|SECTION IV\b/i);
    if (sIIIIdx !== -1) {
      const sIIIText = text.substring(sIIIIdx, sIVIdx > sIIIIdx ? sIVIdx : sIIIIdx + 2000);
      const answerLines = sIIIText
        .split('\n')
        .filter(line => {
          const t = line.trim();
          if (!t || t.length < 15) return false;
          if (/^[•\u2022]/.test(t)) return false;
          if (/section\s*III/i.test(t)) return false;
          if (/describe your typical|physical demands|shift work|stressor|include/i.test(t)) return false;
          return true;
        })
        .join(' ')
        .trim();
      if (answerLines.length > 20) return answerLines.substring(0, 600);
    }
    return null;
  })();

  // Location detection: only scan lines that look like client-typed answers.
  // Strip lines that are clearly form prompts or checkbox labels:
  //   - Lines ending with '?' (questions)
  //   - Lines starting with a question number (e.g. "12." or "Q12")
  //   - Lines containing checkbox markers (☐ ☑ ✓)
  //   - Lines that are just section headers (all-caps short lines)
  //   - Lines with "(e.g.," or "(such as" — these are instructions with examples
  const answerOnlyLines = text
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t.endsWith('?')) return false;                          // question lines
      if (/^(q?\d{1,2}\.)/i.test(t)) return false;             // question numbers
      if (/[\u2610\u2611\u2612\u2713\u2714\u2717\u2718\u25a1\u25a0]/.test(t)) return false; // checkbox lines
      if (/\(e\.g\.,|such as|for example|including but not|please describe|please list|please explain/i.test(t)) return false; // instruction lines
      if (/^section\s+[ivxIVX]+|^section\s+\w/i.test(t)) return false; // section headers
      return true;
    })
    .join('\n');

  const locations: string[] = [];
  if (/\biraq\b/i.test(answerOnlyLines)) locations.push('Iraq');
  if (/\bkuwait\b/i.test(answerOnlyLines)) locations.push('Kuwait');
  if (/\begypt\b/i.test(answerOnlyLines)) locations.push('Egypt');
  if (/\bafghanistan\b/i.test(answerOnlyLines)) locations.push('Afghanistan');
  if (/\bkorea\b/i.test(answerOnlyLines)) locations.push('Korea');
  if (/\bokinawa\b/i.test(answerOnlyLines)) locations.push('Okinawa');
  if (/\bgermany\b/i.test(answerOnlyLines)) locations.push('Germany');
  // Pull meds the client already listed (for Section G hint)
  const medMatch = /(?:Amlodipine|losartan|metformin|tadalafil|pantoprazole|furosemide|simvastatin|benzonatate|montelukast|tamsulosin|hydrochlorothiazide)/gi;
  const medsFound = text.match(medMatch) || [];
  const uniqueMeds = [...new Set(medsFound.map(m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()))];
  return { branch, mos, jobLabel, jobDescription, locations, meds: uniqueMeds };
}

function evaluateMentalHealth(
  text: string,
  raw: string,
  answerBlocks: string[],
  allAnswerText: string,
  gaps: QCGap[],
  passed: string[],
  profile: ClientProfile
) {
  // Use profile (cross-form context) in place of single-form ctx extraction
  const locStr = profile.locations.length > 0 ? profile.locations.join(', ') : 'overseas';
  const firstLoc = profile.locations[0] || 'overseas';
  const branch = profile.branch;
  const mosStr = profile.mos ?? 'their assigned role';
  const jobLabelStr = profile.jobLabel || 'MOS';

  // Helpers for anchoring examples to what the client actually wrote
  const symptomAnchor = profile.namedSymptoms.length > 0
    ? profile.namedSymptoms.slice(0, 3).join(', ')
    : null;
  const fiAnchor = profile.functionalImpactWritten;
  const siAnchor = profile.suicidalIdeationWritten;
  const onsetAnchor = profile.onsetYear;
  const scoresSummary = profile.scores.length > 0
    ? profile.scores.map(s => `${s.name}: ${s.score}/${s.max}`).join(', ')
    : null;

  // Job context hint: grounded in what they wrote about their job
  const jobContextHint = profile.jobDescription
    ? `\n\nBased on what you wrote about your duties: "${profile.jobDescription.substring(0, 300)}${profile.jobDescription.length > 300 ? '...' : ''}" — think about what that role specifically required of you and what you were exposed to as part of that job.`
    : '';

  // ── A: Presenting Concerns ──
  const symptomsAnswer = answerBlocks.find(b =>
    /\b(depress|anxiet|fatigue|stress|anger|panic|mood|sleep|nightmar|flashback|isolat|numb|hypervigilant|ptsd|mental health)\b/i.test(b) &&
    !b.match(/^(section|describe|explain|list|note|specify|if yes)/i)
  ) || '';

  const symptomsHasDetail = wordCount(symptomsAnswer) >= 15 &&
    /\b(every|daily|always|sometimes|often|rarely|never|most|some|few|morning|night|week|day|hour|bad|worse|better|severe|mild|intense|constant|intermittent)\b/i.test(symptomsAnswer);

  if (!symptomsHasDetail) {
    const whatTheyWrote = symptomsAnswer ? `"${symptomsAnswer.trim()}"` : 'nothing';
    // Detect which symptoms they mentioned so we can build the example around them
    const mentionsDepression = /depress/i.test(symptomsAnswer);
    const mentionsAnxiety = /anxiet/i.test(symptomsAnswer);
    const mentionsFatigue = /fatigue/i.test(symptomsAnswer);
    const mentionsAnger = /anger|rage|angry|flip out/i.test(symptomsAnswer || allAnswerText);
    const symptomList = [
      mentionsDepression ? 'depression' : null,
      mentionsAnxiety ? 'anxiety' : null,
      mentionsFatigue ? 'fatigue' : null,
      mentionsAnger ? 'anger/irritability' : null,
    ].filter(Boolean);
    const exampleSymptoms = symptomList.length > 0
      ? symptomList
      : ['depression', 'anxiety', 'fatigue'];

    gaps.push({
      section: 'Section A — Presenting Concerns',
      field: 'Current Symptoms Description',
      issue: `You wrote ${whatTheyWrote} — the doctor needs to know what that actually looks like on a regular day, not just the name of it. How often? How bad? What can you not do because of it?`,
      severity: 'critical',
      whatWasWritten: profile.namedSymptoms.length > 0
        ? `You listed: ${profile.namedSymptoms.join(', ')}.`
        : symptomsAnswer && !symptomsAnswer.includes('\u2610') && !symptomsAnswer.includes('Yes') && !symptomsAnswer.includes('No')
        ? `"${symptomsAnswer.trim()}"`
        : 'This field was left blank.',
      whatsMissing: `The name of a symptom tells the doctor what it is called. What the doctor actually needs is what it feels like for you — how often it happens, how bad it gets, and what it stops you from doing.`,
      whatToAdd: `For each symptom you listed, think about: How often does it happen (every day, a few times a week, constantly)? How bad does it get on a scale of 1 to 10? What can you not do because of it (work, sleep, be around family, leave the house)? What does a bad day actually look like?`,
      helpfulContext: `The more specific you are about each symptom, the better the doctor understands what you are actually dealing with on a daily basis. You do not need medical words — just describe it in plain language like you are telling a friend what a rough day looks like.`,
      guidance: `Describe each symptom like you are explaining it to someone who has never dealt with it. How often does it happen? How bad does it get? What does it stop you from doing?`,
      example: (() => {
        // Build a rich, personalized example anchored to everything we know about this client
        const parts: string[] = [];

        // Opening anchor — use what they named
        if (symptomAnchor) {
          parts.push(`You listed ${symptomAnchor}. For each one, just walk through what it is actually like for you:`);
        } else {
          parts.push('For each symptom you listed, walk through what it is actually like:');
        }

        // Build a job-aware example line
        const jobLine = profile.jobIsAviation
          ? `Working ${profile.yearsService ? profile.yearsService + ' years' : ''} in Navy aviation — the flight line, the mids, the pressure of keeping aircraft mission ready — that kind of stress does not just disappear when you get out.`
          : profile.mos
          ? `Doing that job as ${article(profile.mos)} ${profile.mos} for ${profile.yearsService ? profile.yearsService + ' years' : 'years'} — what you dealt with does not just go away.`
          : '';

        // Draft example using their actual words where possible
        const draftSymptom = symptomAnchor || '[your symptom]';
        const draftLines: string[] = [
          `"My ${draftSymptom} — it is there pretty much [every day / most days / whenever I get triggered]. When it hits, I [say what happens: I shut down, I can not get out of bed, I snap at people, I can not focus on anything, I just go numb]. It has messed with [name what it affects most — my sleep, my relationships, being able to hold down a job, leaving the house]."`,
        ];

        // Pull in their functional impact writing as a model
        if (fiAnchor && fiAnchor.length > 20) {
          draftLines.push(`\nYou already described it well in another section: "${fiAnchor.substring(0, 220)}${fiAnchor.length > 220 ? '...' : ''}" — that is the kind of honesty that needs to be in this section too. Say the same thing here for each symptom.`);
        }

        // Score cross-reference
        if (scoresSummary) {
          draftLines.push(`\nNote: Your scores (${scoresSummary}) are on the severe end. The doctor is going to see those numbers — this section is your chance to put real words to what they mean in your day-to-day life.`);
        }

        // SI cross-reference
        if (profile.hasSI && profile.suicidalIdeationWritten) {
          draftLines.push(`\nYou also mentioned "${profile.suicidalIdeationWritten.substring(0, 150)}" — that is significant. Make sure your symptom description reflects how serious things have gotten.`);
        }

        parts.push(draftLines.join(''));
        if (jobLine) parts.push(jobLine);
        parts.push('Write it in your own words. Short and honest beats long and clinical every time.');
        return parts.join('\n\n');
      })()
    });
  } else {
    passed.push('Section A — Current Symptoms');
  }

  // ── A: Onset ──
  const onsetIdx = text.search(/approximate onset and duration of symptoms/i);
  // Limit the onset window to stop at Section B (or next major label) to prevent false-pass from leakage
  const onsetSectionBIdx = text.search(/\bB\.\s*Trauma\b|\bB\.\s*Stress\b|\bSection\s*B\b/i);
  const onsetWindowEnd = (onsetSectionBIdx > onsetIdx && onsetSectionBIdx !== -1) ? onsetSectionBIdx : onsetIdx + 250;
  const onsetAfter = onsetIdx >= 0 ? text.substring(onsetIdx, onsetWindowEnd) : '';
  const onsetHasTimeframe = hasTimeframe(onsetAfter) &&
    /\b(20\d\d|19\d\d|\d+\s*(years?|months?)\s*ago|since\s*\d|in\s*\d{4}|during\s*(my\s*)?(deployment|service|active)|after\s*(service|deploy|discharge|getting out)|symptoms\s*(start|began|develop)|started\s*(around|in|after|during))\b/i.test(onsetAfter);
  const onsetIsOffTopic = /\b(when i get|around people|stay away|try to avoid|crowds|gun range|try going)\b/i.test(onsetAfter);
  // Try to pull what they actually wrote for the onset field
  const onsetWritten = answerBlocks.find(b =>
    /\b(when i get|around people|stay away|try to avoid|crowds|gun range|try going|since|started|began|after i|when i)\b/i.test(b) &&
    wordCount(b) >= 5
  ) || '';

  // MH onset depth: require year + service connection + what first appeared or what triggered it
  const onsetHasDepth = onsetHasTimeframe &&
    /\b(during|after|while|when|following|since|because|due to|service|active duty|deployed|deployment|getting out|separated|separation|discharge|combat|training|incident|event|happened|occurred|stressor|what happened|began when|started when|triggered)\b/i.test(onsetAfter) &&
    /\b(notice|started noticing|first notice|first started|began to|trouble sleeping|could not sleep|irritabl|on edge|withdraw|isolat|nightmare|flashback|panic|angry|mood|numb|depress|anxiet|stress|shut down|avoid|hypervigilant|startle)\b/i.test(onsetAfter);

  if (!onsetHasTimeframe || onsetIsOffTopic || !onsetHasDepth) {
    // Build targeted message based on what is missing
    const mhOnset_missing: string[] = [];
    if (!onsetHasTimeframe) mhOnset_missing.push("an approximate year or timeframe for when symptoms first started");
    else {
      if (onsetIsOffTopic) mhOnset_missing.push("a timeframe (when symptoms first began) - the current answer describes a trigger situation, not an onset");
      if (!onsetHasDepth) {
        const hasServiceConn = /\b(during|after|while|when|following|since|service|active duty|deployed|getting out|separated|combat|training)\b/i.test(onsetAfter);
        if (!hasServiceConn) mhOnset_missing.push("a connection to your service or post-service period - when relative to your military service did symptoms start");
        const hasFirstSymptom = /\b(notice|started noticing|first notice|trouble sleeping|could not sleep|irritabl|on edge|withdraw|nightmare|flashback|panic|angry|numb|depress|anxiet|shut down|avoid)\b/i.test(onsetAfter);
        if (!hasFirstSymptom) mhOnset_missing.push("what you first noticed - what was the first sign something was wrong, what changed");
      }
    }
    const mhOnset_str = mhOnset_missing.length > 0 ? ` Missing: ${mhOnset_missing.join("; ")}.` : "";
    const onsetNote = onsetIsOffTopic
      ? `What was written describes a trigger situation, not when symptoms first started. This question is asking for a timeframe and onset story, not what situations cause distress today.${mhOnset_str}`
      : (!onsetHasTimeframe
          ? `No timeframe was provided for when symptoms began.`
          : `The onset answer has a year but does not go far enough.${mhOnset_str}`);

    gaps.push({
      section: 'Section A — Onset',
      field: 'Onset and Duration of Symptoms',
      issue: onsetNote,
      severity: 'critical',
      whatWasWritten: onsetWritten && wordCount(onsetWritten) > 1
        ? `"${onsetWritten.trim()}"`
        : onsetAnchor
        ? `You wrote: "${onsetAnchor}" — a start, but the doctor needs more context around it.`
        : 'This field was left blank.',
      whatsMissing: onsetIsOffTopic
        ? `This answer describes what triggers distress today, but the question is asking when symptoms first began. The doctor needs a timeframe and the story of how it started.`
        : !onsetHasTimeframe
        ? `No timeframe was given. The doctor needs to know roughly when things started — a year is fine, does not need to be exact.`
        : `There is a year here but the doctor also needs to understand how it connects to your service and what you first noticed was different.`,
      whatToAdd: `Think about three things: (1) roughly when it started, (2) how that connects to your time in the military or right after getting out, and (3) what you first noticed was off — sleep, mood, temper, pulling away from people, something changed. Write it like you are explaining it to someone who does not know your history.`,
      helpfulContext: `The doctor needs a timeline to understand how long you have been dealing with this and where it started. You do not need to write an essay — even a few sentences that cover when it began and what the first signs were gives them a much clearer picture.`,
      guidance: `Three things needed here: roughly when it started, how it connects to your time in the service, and what you first noticed was different. Just say it in your own words.`,
      example: (() => {
        const parts: string[] = [];

        const yearOpener = onsetAnchor
          ? `You wrote ${onsetAnchor} — that is a start. Now add the context around it:`
          : 'Start with roughly when, then explain what was going on around that time:';
        parts.push(yearOpener);

        // Build a job-aware, personalized draft
        const jobContext = profile.jobIsAviation
          ? `During my time in the Navy as ${article(profile.mos || 'an Avionics Tech')} ${profile.mos || 'Avionics Technician'} — the flight line work, long shifts${profile.jobHasShiftWork ? ', the rotating mids' : ''}, the pressure of keeping aircraft mission ready — the stress built up over time in ways I did not recognize at first.`
          : profile.mos
          ? `Working as ${article(profile.mos)} ${profile.mos} — [say what that role put you through day to day, what built up over time] — that is where I think it started.`
          : `My time in the military — [say what that was like, what built up over time] — that is where I think it started.`;

        const symFirst = symptomAnchor
          ? `Around ${onsetAnchor || '[year]'}, the first thing I really noticed was [describe what changed — your ${symptomAnchor} showed up differently, you stopped sleeping right, you were on edge all the time, something shifted that you could not shake].`
          : `Around ${onsetAnchor || '[year]'}, I started noticing [describe what first felt off — sleep, mood, temper, pulling away from people, something just changed].`;

        const progressLine = `It did not get better on its own. It has been going on for about [X] years now and it is worse than when it started.`;

        // Cross-reference: if scores are high and onset is early, flag the timeline
        const scoreLine = scoresSummary && onsetAnchor
          ? `\nYour scores today (${scoresSummary}) show how much this has built. That timeline — starting around ${onsetAnchor} and getting worse since — is important for the doctor to see.`
          : '';

        // Cross-reference: if TBI present, flag it
        const tbiLine = profile.hasTBI
          ? `\nYou also mentioned a head injury somewhere on your forms — if that happened during your service and contributed to where things started, mention it here.`
          : '';

        parts.push(`"${jobContext}\n\n${symFirst} ${progressLine}"${scoreLine}${tbiLine}`);
        parts.push(`If something specific happened that kicked things off, say that. If it was more of a slow build over time, say that instead. Either way is valid — the doctor just needs to understand the timeline.`);

        if (profile.jobDescription) {
          parts.push(`Think back to what that job actually required of you — you already wrote: "${profile.jobDescription.substring(0, 200)}${profile.jobDescription.length > 200 ? '...' : ''}" — what specifically about that wore on you over time?`);
        }

        return parts.join('\n\n');
      })()
    });
  } else {
    passed.push('Section A — Onset and Duration');
  }

  // ── B: Trauma description ──
  // Extract ONLY the client's answer to Q1 (describe the event) — stop before Q2 label
  // This avoids keyword-matching question labels ("combat exposure", "witness") as if they were client text
  const traumaQ1Answer = (() => {
    const q1Idx = raw.search(/describe the most distressing or traumatic event/i);
    if (q1Idx === -1) return '';
    // Move past the question label itself
    const afterQ1 = raw.indexOf('\n', q1Idx);
    if (afterQ1 === -1) return '';
    // Stop at next question marker (2. Event type / 3. Did the event)
    const q2Idx = raw.search(/2\.?\s*Event\s*type|\b(MST|Accident|Assault)\b/i);
    const window = q2Idx > afterQ1 ? raw.substring(afterQ1, q2Idx) : raw.substring(afterQ1, afterQ1 + 800);
    // Strip blank lines and checkbox noise
    return window
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2 && !/^[\u2610\u2611\u2612\s]+$/.test(l) && !/^\d+\./.test(l))
      .join(' ')
      .trim();
  })();

  const traumaAnswers = traumaQ1Answer;
  const traumaWords = wordCount(traumaAnswers);
  const traumaHasLocation = hasLocation(traumaAnswers) || /\b(iraq|kuwait|egypt|deploy|overseas|forward|patrol|convoy|base|camp)\b/i.test(traumaAnswers);
  const traumaHasEmotional = hasEmotionalDetail(traumaAnswers);
  const traumaHasPhysical = /\b(fire|explosion|shot|blast|struck|hit|attack|crash|impact|incoming|wound|blood|witness|saw|watch|lightning|hummer|flipped)\b/i.test(traumaAnswers);
  const traumaHasDetail = traumaWords >= 30;

  // Identify which specific events they mentioned so we can tailor the example
  // IMPORTANT: these flags are used only to personalize phrasing where the client CLEARLY named
  // the event. They must NOT be used to fabricate event labels or inject content the client did
  // not write. If a keyword appears only in passing, treat the event as unnamed.
  const mentionsLightning = /lightning|antenna|struck/i.test(traumaAnswers);
  const mentionsHummer = /hummer|flipped|formation/i.test(traumaAnswers);
  // Incoming fire: only flag if the client wrote about it as a specific event they experienced,
  // not just a passing mention of the word. Require additional context words nearby.
  const mentionsIncomingFire = /\b(took fire|taking fire|came under fire|received fire|incoming fire and I|incoming fire while|incoming rounds)\b/i.test(traumaAnswers);

  const traumaMissing: string[] = [];
  if (!traumaHasLocation) traumaMissing.push('the specific location where it happened');
  if (!traumaHasDetail) traumaMissing.push('a step-by-step account of what happened');
  if (!traumaHasEmotional) traumaMissing.push('your emotional and psychological reaction — how it felt in the moment and after');

  // Determine which trauma path to take based on what they wrote and their profile
  const traumaIsBlank = traumaWords < 5;
  const highScoresNoTrauma = (profile.hasHighPCL5 || profile.hasHighPHQ9) && traumaIsBlank;

  if (traumaMissing.length > 0 || traumaIsBlank) {
    // Build event-specific prompts based on what they mentioned
    const event1Note = mentionsLightning
      ? 'You mentioned witnessing a Marine get struck by lightning while taking down an antenna.'
      : mentionsHummer
      ? 'You mentioned a Humvee in the formation flipping over and rushing to help.'
      : traumaIsBlank
      ? ''
      : 'You mentioned something happened — but the doctor needs the full story.';

    // Strategic issue text — if high scores + blank trauma, flag it directly
    const issueText = highScoresNoTrauma
      ? `This section is blank, but your scores (${scoresSummary || 'PCL-5/PHQ-9'}) are in the severe range. The doctor is going to ask: what happened? You have two options here — describe a specific event or events, OR explain the kind of accumulated stress and pressure your job put you through over time. Either is a valid path. But leaving this blank is not.`
      : traumaIsBlank
      ? `This section is blank. The doctor needs to understand what you went through during your service — either a specific event, or the kind of ongoing pressure and stress your job put you under over time.`
      : `What is written is a start, but the doctor needs more. Missing: ${traumaMissing.join('; ')}.`;

    gaps.push({
      section: 'Section B — Trauma and Stress Exposure',
      field: 'Traumatic Event Description',
      issue: issueText,
      severity: 'critical',
      whatWasWritten: traumaIsBlank
        ? 'This section was left blank.'
        : `"${traumaAnswers.trim()}"`,
      whatsMissing: traumaIsBlank && highScoresNoTrauma
        ? `Your scores are in the severe range, but this section is blank. The doctor is going to look at those numbers and need to understand what drove them. This is the section where you explain that.`
        : traumaIsBlank
        ? `This section is blank. The doctor needs to understand what you experienced during or connected to your service — whether that is a specific event or the kind of ongoing pressure your job put you under.`
        : `What is here is a start, but the doctor needs more of the story — where it happened, what specifically occurred, and how it affected you after.`,
      whatToAdd: traumaIsBlank
        ? `You have two options here. Option 1: If something specific happened, write it out — where you were, what happened, and how it stayed with you after. Option 2: If it was more of a slow buildup — the pace of the job, the pressure, what you saw or dealt with day after day over your whole service — describe that. Walk through what that environment was actually like.`
        : `Walk through it like you are telling the story to someone who was not there. Where were you, what were you doing, what happened, and what did it do to you afterward? One sentence per step is enough — you do not need to write a novel.`,
      helpfulContext: `This section is not about blame or proving anything — it is simply giving the doctor context so they understand what you went through. Both specific events and accumulated stress from a high-pressure job are recognized as valid experiences. Only include what is true for you.`,
      guidance: traumaIsBlank
        ? `Two paths: (1) If a specific thing happened, write it out like you are telling the story — where, what, how it hit you after. (2) If it was more of a slow grind — the job, the pace, the pressure, what you were exposed to day after day — describe that instead. Both are legitimate.`
        : `Write out what happened like you are telling someone the story. Where were you, what were you doing, what happened, and how did it hit you after? Your own words.`,
      example: (() => {
        const parts: string[] = [];

        if (traumaIsBlank) {
          // Path 1: specific event
          const locHint = profile.locations.length > 0 ? profile.locations[0] : '[where you were stationed or deployed]';
          const jobHint = profile.mos ? `as ${article(profile.mos)} ${profile.mos}` : 'in my role';

          // Path 2: occupational stress (especially relevant for aviation, high-tempo jobs)
          const occStressExample = profile.jobIsAviation
            ? `"Path 2 — if it was more of a buildup than one event:\nWorking the flight line ${profile.yearsService ? 'for ' + profile.yearsService + ' years' : ''} as ${article(profile.mos || 'an AT')} ${profile.mos || 'Avionics Technician'} — the pace never let up. ${profile.jobHasShiftWork ? 'Rotating mids, days, swings — your body never adjusted. ' : ''}Every aircraft that left the deck had to be right, and that weight was on you. Over time, the accumulated stress of that environment — the pressure, the pace, what you saw and dealt with day after day — is what I believe broke me down mentally. It was not one moment. It was years of it."\n\nNote: The occupational stress argument is legitimate and the doctor can use it. But you need to describe it in enough detail that they understand what you were actually dealing with.`
            : profile.mos
            ? `"Path 2 — if it was more of a slow grind than a single event:\nWorking as ${article(profile.mos)} ${profile.mos} — [describe what that job put you through over time: the pace, the pressure, what you were exposed to, what you had to carry]. It was not one thing. It was the accumulation of it all over [X] years that I believe is what got to me."\n\nNote: Accumulated occupational stress is a valid path if a single incident does not apply. The doctor needs detail though.`
            : `"Path 2 — if it was more of a slow grind:\nMy service was not one big event. It was the accumulation of [describe: the pace, the pressure, what you were exposed to, what you had to deal with day after day] over [X] years. That is what I believe broke me down."`;

          parts.push(`This section is blank right now. You have two paths — pick whichever is true for you:\n\n"Path 1 — if something specific happened:\n[Give the event a short name]\nIt happened at [${locHint}]. I was there ${jobHint}. [Say what happened in your own words — walk through it]. After that, I [say how it stuck with you — could not stop thinking about it, stopped sleeping, went on edge, something changed]."`
          );
          parts.push(occStressExample);

          if (highScoresNoTrauma) {
            const _pcl5 = profile.scores.find(s => s.name === 'PCL-5');
            parts.push(`Your PCL-5 score${_pcl5 ? ' of ' + _pcl5.score + '/80' : ''} is in the severe range. That score does not come from nothing — the doctor is going to want to understand what drove it. This is the section where you explain that.`);
          }

          if (profile.hasTBI) {
            parts.push(`You also mentioned a head injury on your forms. If that happened during your service and contributed to how things have been, include it here.`);
          }
        } else {
          // They wrote something, just not enough detail
          const locHint = profile.locations.length > 0 ? ` — could be ${profile.locations[0]} or wherever this happened` : '';
          const jobHint = profile.mos ? `, I was working as ${article(profile.mos)} ${profile.mos}` : '';
          parts.push(`${event1Note} Just tell it like it happened — your words, not a template:\n\n"[Short name for what happened]\nWe were at [where${locHint}]. It was [time of day/approximate date]${jobHint}. [Walk through it step by step — what you saw, what you did, what went through your head]. After it happened I [say how it stuck with you — could not stop thinking about it, did not sleep, stayed on edge, something shifted]."\n\nIf more than one thing happened, write a separate paragraph for each one.`);
          if (profile.jobDescription) {
            parts.push(`Think about what your job as ${profile.mos || 'a service member'} had you dealing with. What did that role put you in the middle of that most people never see?`);
          }
        }

        return parts.join('\n\n');
      })()
    });
  } else {
    passed.push('Section B — Trauma Description');
  }

  // ── B: Triggers ──
  const triggerYes = /do reminders or triggers cause distress[\s\S]{0,100}yes/i.test(text);
  const triggerAnswer = answerBlocks.find(b =>
    /\b(trigger|gun range|crowd|people|noise|remind|avoid|panic|distress|remind)\b/i.test(b) &&
    !b.match(/^(section|do reminders)/i)
  ) || '';
  const triggerHasResponse = wordCount(triggerAnswer) >= 10 &&
    /\b(feel|heart|sweat|shake|panic|leave|avoid|anger|rage|shut|freeze|physical|react|response)\b/i.test(triggerAnswer);

  // Pull what they actually wrote about triggers
  const triggerWritten = triggerAnswer || '';
  const mentionsGunRange = /gun range/i.test(triggerWritten);
  const mentionsCrowds = /crowd|big groups|around people/i.test(triggerWritten + allAnswerText);

  if (triggerYes && !triggerHasResponse) {
    const triggerNote = triggerWritten
      ? `What was written — "${triggerWritten.trim()}" — describes the situation that triggers distress, but does not explain what happens physically and emotionally when you encounter that trigger.`
      : `No trigger response was described.`;

    gaps.push({
      section: 'Section B — Triggers',
      field: 'Trigger Response Description',
      issue: triggerNote,
      severity: 'moderate',
      whatWasWritten: triggerWritten
        ? `"${triggerWritten.trim()}"`
        : 'This section was left blank.',
      whatsMissing: `The doctor needs to understand not just what triggers you, but what actually happens when you hit one. What does your body do? What does your mind do? How long does it take to feel normal again?`,
      whatToAdd: `Think about what happens physically when you get triggered — does your heart race, do you sweat, do you feel like you need to get out immediately? What do you do — leave the situation, go quiet, get angry? How long does it take to calm down? Those details help the doctor understand the severity of what you are dealing with.`,
      helpfulContext: `Only describe what is true for you. There is no right or wrong reaction — the goal is just helping the doctor understand what you actually go through when something sets you off.`,
      guidance: `The doctor needs to know what actually happens to you when you hit a trigger — not just what the trigger is. Describe your physical reaction (heart pounding, sweating, shaking, chest tightening), your emotional reaction (rage, panic, dread, shutting down), and what you do (leave the area, isolate, stay on high alert for hours). Also note how long it takes to calm down.`,
      example: `Here is a draft — replace with your own experience:

"${mentionsGunRange ? 'At the gun range, when people get too close or handle weapons carelessly,' : mentionsCrowds ? 'When I am in a large crowd or a loud public space,' : 'When I encounter something that reminds me of what I went through,'} my body immediately goes into a high-alert state. My heart starts pounding. I feel a wave of tension through my whole body and I have to get out of the situation immediately. Once I remove myself I [describe — stay on edge for hours / can't calm down / replay the moment over and over / go silent and withdraw]. It can take [amount of time — hours, the rest of the day] before I feel like myself again. Even knowing the threat is not real, I cannot stop my body from reacting as if it is."

Update this with what you actually experience — the more specific you are, the better.`
    });
  } else {
    passed.push('Section B — Trigger Response');
  }

  // ── C: Prior diagnoses ──
  const cSectionText = findAnswer(text, /c\.\s*mental health history/i, 800);
  const hasDiagnosis = /\b(ptsd|depression|anxiety disorder|bipolar|mdd|major depressive|general anxiety|panic disorder|adjustment disorder|diagnosed|diagnosis)\b/i.test(cSectionText);
  const diagBlank = !hasDiagnosis && (
    /prior\/?current psychiatric diagnoses[\s\S]{0,50}(\n\n|\nB\.|\nD\.)/i.test(text) ||
    cSectionText.trim().length < 10
  );

  if (diagBlank || !hasDiagnosis) {
    gaps.push({
      section: 'Section C — Mental Health History',
      field: 'Prior / Current Psychiatric Diagnoses',
      issue: 'This field was left blank. The doctor needs to know whether you have ever received a formal mental health diagnosis — from the VA, a civilian provider, or even an informal screening.',
      severity: 'critical',
      whatWasWritten: 'This field was left blank.',
      whatsMissing: `The doctor needs to know if you have ever been formally told by a doctor or provider that you have PTSD, depression, anxiety, or any other mental health condition. If not, they need to know that too.`,
      whatToAdd: `Either write down any mental health condition you have been diagnosed with and who diagnosed you, or clearly state that you have never received a formal diagnosis. Either answer is fine — a blank field is the only problem.`,
      helpfulContext: `This does not change anything about your situation — it just gives the doctor a complete picture of your mental health history so they can do their job properly. If you are not sure if something counts as a formal diagnosis, include it anyway and let the doctor sort it out.`,
      guidance: `If you have been diagnosed with PTSD, depression, anxiety, or any other mental health condition, list each one here along with who diagnosed you (VA, private doctor, etc.). If you have never received a formal diagnosis, that is okay — write that clearly so the doctor knows you are filing based on symptoms.`,
      example: `Choose whichever applies to you:

Option A — If you have a diagnosis:
"I was diagnosed with PTSD by [the VA / my primary care doctor / a private therapist] around [approximate year]. I have also been told I have [depression / anxiety / any other condition] — diagnosed by [who]."

Option B — If you have never been formally diagnosed:
"I have not received a formal psychiatric diagnosis. I am filing based on the symptoms I have described throughout this form, which are consistent with PTSD and depression as a result of my service."

Either way, do not leave this blank — the doctor needs something in this field.`
    });
  } else {
    passed.push('Section C — Prior Diagnoses');
  }

  // ── C: Psychiatric medications ──
  const psychMedAnswer = findAnswer(text, /psychiatric medications\s*\(past or current\)/i, 400);
  const hasPsychMedContent = /\b(sertraline|zoloft|prozac|fluoxetine|effexor|venlafaxine|trazodone|prazosin|hydroxyzine|buspirone|lithium|seroquel|quetiapine|risperdal|abilify|lexapro|escitalopram|citalopram|wellbutrin|bupropion|mirtazapine|amitriptyline|clonazepam|lorazepam|xanax|alprazolam|klonopin|none)\b/i.test(psychMedAnswer);

  if (!hasPsychMedContent) {
    gaps.push({
      section: 'Section C — Mental Health History',
      field: 'Psychiatric Medications',
      issue: 'This field was left blank. The doctor needs to know about any medications specifically prescribed for your mental health — past or current — separate from your general medications.',
      severity: 'critical',
      whatWasWritten: 'This field was left blank.',
      whatsMissing: `The doctor needs to know if you have been prescribed anything specifically for your mental health — antidepressants, sleep medication for nightmares, anxiety medication, anything like that. This is separate from other prescriptions.`,
      whatToAdd: `List any mental health medications you are currently taking or have taken in the past. If you have never been on any, just write that clearly. You do not need to list start dates or grades of effectiveness — just the name and what it was for is enough.`,
      helpfulContext: `This helps the doctor understand what treatment you have or have not received for your mental health. It is not about judgment — whether you have been on medication or not, both answers give the doctor useful context.`,
      guidance: `List any medications prescribed for mental health conditions — things like antidepressants, sleep aids for PTSD nightmares, anxiety medication, or mood stabilizers. This is a separate list from your blood pressure or diabetes medications. If you have never been prescribed anything for mental health, write that clearly.`,
      example: `Choose whichever applies to you:

Option A — If you take or have taken mental health medications:
"I am currently prescribed [medication name] for [depression / anxiety / sleep / PTSD]. I was previously prescribed [medication name] around [approximate year] but [stopped / it was changed to something else]."

Option B — Common mental health medications for reference (ask your doctor or pharmacy if any of these sound familiar):
For sleep/nightmares: Prazosin, Trazodone
For depression/PTSD: Sertraline (Zoloft), Fluoxetine (Prozac), Venlafaxine (Effexor), Escitalopram (Lexapro)
For anxiety: Hydroxyzine, Buspirone

Option C — If you have never been prescribed mental health medications:
"I have not been prescribed any psychiatric medications. I have been managing symptoms without medication."

Do not leave this blank — even "None" is an acceptable answer.`
    });
  } else {
    passed.push('Section C — Psychiatric Medications');
  }

  // ── D: Combat/deployment details ──
  const deploymentAnswer = answerBlocks.filter(b =>
    /\b(deploy|egypt|kuwait|iraq|combat|tour|overseas|sent to|served|9\/11|counter|terrorist)\b/i.test(b) &&
    !b.match(/^(military factors|if yes, specify|high-stress|combat exposure|event type|did the event|did you personally|☐|2\.\s*event)/i) &&
    !/☐\s*(combat|mst|accident|assault)/i.test(b) &&
    wordCount(b) >= 5
  ).join(' ');

  const deploymentHasSubstantiveDetail = wordCount(deploymentAnswer) >= 20 &&
    /\b(patrol|IED|firefight|mortar|convoy|attack|encounter|mission|in combat|under fire|took fire|hostile|enemy|casualt|explosion|blast|shot at|wounded|witness|ambush|improvised|what happened|what i did|my role|my job|responsible for|specific|dangerous|intense|worst)\b/i.test(deploymentAnswer);
  const deploymentTooVague = !deploymentHasSubstantiveDetail;

  // Pull what they wrote for context
  const deployWritten = deploymentAnswer ? `"${deploymentAnswer.trim().substring(0, 150)}"` : 'nothing';

  if (deploymentTooVague) {
    gaps.push({
      section: 'Section D — Military Service and Post-Service Adjustment',
      field: 'Combat / Deployment Details',
      issue: `What was written — ${deployWritten} — only lists locations and the word "combat tours." The doctor needs to know what you actually experienced during those deployments: your role, what you were exposed to, and what the most stressful or dangerous situations were.`,
      severity: 'critical',
      whatWasWritten: deploymentAnswer
        ? `"${deploymentAnswer.trim().substring(0, 200)}${deploymentAnswer.length > 200 ? '...' : ''}"`
        : 'This section was left blank.',
      whatsMissing: `The doctor needs to understand what you were actually doing during your service — not just where you were. What was your job? What did a typical day look like? What was the hardest or most stressful part? That context is what gives the doctor a real picture of what you were exposed to.`,
      whatToAdd: `For each deployment or period of service, try to describe: what your role was and what you were responsible for, what a normal day looked like, and what was most stressful or difficult about that time. You do not need to relive anything — just enough to give the doctor context around what your service actually involved.`,
      helpfulContext: `The doctor is trying to understand your service history in a way that puts your symptoms in context. The more you can paint a picture of what your day-to-day looked like — the pace, the pressure, what you were responsible for — the better they can connect the dots.`,
      guidance: `For each deployment, say what your job was, what a normal day looked like, and what was hardest or most stressful about that time. Real and specific beats long and vague.`,
      example: (() => {
        const parts: string[] = [];
        const locHint = locStr !== 'overseas' ? locStr : '[where you were]';

        // Build a job-specific deployment draft
        if (profile.jobIsAviation) {
          const shiftLine = profile.jobHasShiftWork ? 'Rotating mids and day shifts. ' : '';
          parts.push(`Here is a starting point based on your background as ${article(profile.mos || 'an AT')} ${profile.mos || 'Avionics Technician'} — fill in your actual experience:\n\n"[${locHint}, approximate year]:\n${shiftLine}I was responsible for [say what you were actually working on — which aircraft systems, what you maintained, what you were accountable for]. When an aircraft went down, it was on us to get it back up. The pressure of that — knowing a jet could not fly if we missed something — was constant. A typical day was [say what it actually looked like — how long, what the pace was, what kept you going]. The hardest part for me was [say what it was — the pace, what you saw, what you had to deal with, what did not leave you when you went home]."

[If you had another deployment, write a separate section for it with the same format.]`);
        } else if (profile.mos) {
          parts.push(`Write it out for each deployment in your own words:\n\n"[${locHint}, approximate year]:\nI was out there as ${article(profile.mos)} ${profile.mos}. Day to day I was [say what you were actually doing — what a normal shift looked like, what you were responsible for, what kept you busy]. The conditions were [say what it was really like — the pace, the pressure, whether you felt safe, what was grinding on you]. What got to me most was [something specific you dealt with, saw, or had to carry from that time]."

[Next deployment — same format.]`);
        } else {
          parts.push(`Write it out for each deployment:\n\n"[${locHint}, approximate year]:\nDay to day I was [say what you actually did]. The conditions were [say what it was like]. What got to me most was [say what was hardest]."

[Next deployment — same format.]`);
        }

        // Cross-reference job description if available
        if (profile.jobDescription) {
          parts.push(`You described your duties as: "${profile.jobDescription.substring(0, 200)}${profile.jobDescription.length > 200 ? '...' : ''}" — think about what that actually put you through during those deployments. What did that job expose you to that most people never deal with?`);
        }

        return parts.join('\n\n');
      })()
    });
  } else {
    passed.push('Section D — Combat/Deployment Details');
  }

  // ── D: Support system ──
  const supportAnswer = answerBlocks.find(b =>
    /\b(friends?|family|network|support|community|church|group|help|veteran|counselor|therapist|wife|husband|spouse|partner|parent|sibling|neighbor)\b/i.test(b)
  ) || '';
  const supportHasDetail = wordCount(supportAnswer) >= 12 &&
    /\b(help|talk|lean|rely|call|visit|meet|weekly|daily|often|close|strong|spouse|parent|child|friend|battle buddy)\b/i.test(supportAnswer);
  const supportWritten = supportAnswer ? `"${supportAnswer.trim()}"` : 'nothing';

  if (!supportHasDetail) {
    gaps.push({
      section: 'Section D — Military Service and Post-Service Adjustment',
      field: 'Current Support System',
      issue: `What was written — ${supportWritten} — is too general. Saying "good network of friends and family" does not tell the doctor who is actually in your life, how involved they are, or how your symptoms have affected those relationships.`,
      severity: 'moderate',
      guidance: `Describe specifically who is in your support system: Is it a spouse or partner? Close friends? Parents? Fellow veterans or battle buddies? A faith community? Then explain how often you actually interact with them and whether your mental health symptoms have changed those relationships — for better or worse.`,
      example: `Here is a draft — adjust with your actual people and situation:

"My support system includes [my wife / my parents / a few close friends / some guys I served with]. I [see them / talk to them] [daily / a few times a week / when things get really bad]. That said, my symptoms have made it harder to stay connected — I [pull away when I'm struggling / don't like to talk about what I'm going through / keep people at a distance because I don't want to burden them / have a shorter fuse and have pushed people away at times]. There are days where I isolate completely and don't reach out to anyone. Even with people I trust, I rarely open up about what is actually going on with me."

If you feel like you do not have much support, say that — it is important information for the doctor.`
    });
  } else {
    passed.push('Section D — Support System');
  }

  // ── F: Functional Impact ──
  const funcAnswer = answerBlocks.filter(b =>
    /\b(work|sleep|relationship|family|daily|crowd|avoid|walk away|flip|lose|mind|function|activity|can't|cannot|struggle|hard|difficult)\b/i.test(b) &&
    !b.match(/^(section|describe how|any suicidal|work full|work part|employed|unemployed|retired|disabled|how much have|have these|interfered with|do reminders|describe current support|explain|if yes)/i) &&
    !/☐|\bYes\b.*\bNo\b|how often|how much|over the last|rate how|past month|past week|in the last/i.test(b) &&
    wordCount(b) >= 8
  ).join(' ');

  const funcAreas = {
    work: /\b(work|job|employ|performance|miss|call out|concentrate|focus|fired|quit|coworker|boss|productivity)\b/i.test(funcAnswer),
    sleep: /\b(sleep|insomnia|nightmare|wake|rest|bed|tired|fatigue|exhausted|hours?)\b/i.test(funcAnswer),
    relationships: /\b(relationship|family|friend|social|isolat|partner|spouse|child|push away|withdraw|argument|fight|anger|people)\b/i.test(funcAnswer),
    daily: /\b(daily|routine|task|trigger|crowd|noise|grocery|drive|leave home|go out|public|store|activity|function|errand)\b/i.test(funcAnswer),
  };
  const funcCount = Object.values(funcAreas).filter(Boolean).length;
  const funcMissing = Object.entries(funcAreas).filter(([, v]) => !v).map(([k]) => k);
  const funcWritten = funcAnswer ? `"${funcAnswer.trim().substring(0, 200)}"` : 'nothing';

  if (funcCount < 3 || wordCount(funcAnswer) < 20) {
    const missedLabels: Record<string, string> = {
      work: 'work and job performance',
      sleep: 'sleep quality and nightmares',
      relationships: 'relationships with family and friends',
      daily: 'daily activities and things you now avoid',
    };
    const missingDescriptions = funcMissing.map(k => missedLabels[k]).join('; ');

    gaps.push({
      section: 'Section F — Functional Impact',
      field: 'Daily Life Impact',
      issue: `What was written — ${funcWritten} — covers only ${funcCount} life area${funcCount === 1 ? '' : 's'} and is too brief. The doctor needs a complete picture of how symptoms affect every major part of your life. Missing: ${missingDescriptions}.`,
      severity: 'critical',
      whatWasWritten: funcAnswer
        ? `"${funcAnswer.trim().substring(0, 300)}${funcAnswer.length > 300 ? '...' : ''}"`
        : 'This section was left blank.',
      whatsMissing: funcMissing.length > 0
        ? `The doctor needs to see how your symptoms affect every major part of your life. What is missing here: ${funcMissing.map(k => ({ work: 'how it affects work', sleep: 'how it affects sleep', relationships: 'how it affects your relationships', daily: 'how it affects your daily routine' }[k])).join(', ')}.`
        : `What is written is too brief. The doctor needs enough detail to understand what day-to-day life actually looks like for you right now.`,
      whatToAdd: `Think about each area of your life and say what has changed. Work — are you working, and if not why not, or if yes what has gotten harder? Sleep — how many hours, do you wake up, what do mornings feel like? Relationships — what has changed with family or friends? Daily life — what do you avoid now that used to be normal? Short and honest is exactly what the doctor needs.`,
      helpfulContext: `The doctor uses this section to understand how your symptoms actually show up in real life. Numbers and labels only go so far — this is where you paint the picture of what your days look like right now. Only write what is actually true for you.`,
      guidance: `Go area by area and say what is actually different now. Work, sleep, relationships, daily stuff. Short and real beats long and vague.`,
      example: (() => {
        const parts: string[] = [];

        // Open with what they already wrote if possible
        if (fiAnchor && fiAnchor.length > 20) {
          parts.push(`You already said it well: "${fiAnchor.substring(0, 250)}${fiAnchor.length > 250 ? '...' : ''}" — keep going with that same honesty for each area below:`);
        } else {
          parts.push('Go through each area of your life and say what is actually different now:');
        }

        // Build a personalized draft using what we know
        const workLine = profile.hasNoWork
          ? `Work: I have not been able to work for [say how long]. My [${symptomAnchor || 'symptoms'}] make it [say what specifically makes work impossible — can not stay focused, get overwhelmed around people, the anxiety/depression takes over, I cannot make myself go].`
          : `Work: I [am working / stopped working / can only handle part time]. The reason is [say what gets in the way].`;

        const sleepLine = `Sleep: My sleep is [say what it is actually like — how many hours you get, whether you wake up, what mornings feel like, whether you feel rested at all].`;

        const relLine = `Relationships: [Say what has changed — I pulled away from people, my temper has pushed people away, my [wife / family / friends] can see something is wrong, I stopped reaching out].`;

        const dailyLine = `Day to Day: I [say what you stopped doing or avoid now — leaving the house, being around groups, things that used to be normal, activities I used to enjoy].`;

        parts.push(`"${workLine}\n\n${sleepLine}\n\n${relLine}\n\n${dailyLine}"`);

        // Cross-reference SI if present
        if (profile.hasSI && profile.suicidalIdeationWritten) {
          parts.push(`You also mentioned: "${profile.suicidalIdeationWritten.substring(0, 150)}" — if that is part of your day to day right now, it belongs in this section too. The doctor needs the full picture.`);
        }

        // Cross-reference scores
        if (scoresSummary) {
          parts.push(`Your scores (${scoresSummary}) back up that things are serious. This section is where you show the doctor what those numbers look like in real life.`);
        }

        parts.push('Only write what is actually true for you.');
        return parts.join('\n\n');
      })()
    });
  } else {
    passed.push('Section F — Functional Impact (all areas covered)');
  }

  // ── F: Violence/aggression ──
  const violenceYes = /history of violence or aggression[\s\S]{0,80}yes/i.test(text);
  const violenceAnswer = answerBlocks.find(b =>
    /\b(fight|fights|violent|aggress|assault|altercation|incident|physical)\b/i.test(b) &&
    wordCount(b) < 8
  );
  const violenceWritten = violenceAnswer ? `"${violenceAnswer.trim()}"` : '';

  if (violenceYes && violenceAnswer && wordCount(violenceAnswer) < 8) {
    gaps.push({
      section: 'Section F — Functional Impact',
      field: 'History of Violence or Aggression',
      issue: `What was written — ${violenceWritten} — is a single word with no context. The doctor needs to understand when this happened, what triggered it, what the situation looked like, and how it has affected your life. Without that context, a one-word answer cannot be used to support your case.`,
      severity: 'critical',
      guidance: `Describe the incidents with enough detail that a doctor can understand the pattern: When did they happen (during service, after getting out, or both)? What type of situations set you off? Were there legal consequences? Has this behavior gotten better, worse, or stayed the same? How has it affected your relationships or employment?`,
      example: `Here is a draft structure — fill in your actual situation:

"Since [getting out of the service / during and after service], I have had [a few / multiple / ongoing] incidents where I lost control of my anger. This typically happens when [describe the trigger — someone gets in my space unexpectedly / I am in a high-stress situation / I feel disrespected / a situation reminds me of something from my deployment]. During these incidents I [describe what happens — raise my voice / get into physical altercations / break things / have to remove myself before I do something]. The incidents that stand out are [describe one or two specific situations without naming others if possible — e.g., 'an altercation at a bar in 2008,' 'a confrontation with a coworker,' 'a fight at a family gathering']. ${violenceWritten.includes('fight') ? 'The fights I have been involved in were mostly [describe — bar fights, altercations where I felt threatened, situations that escalated because I could not de-escalate myself].' : ''} These incidents have [had no legal consequences / resulted in a [charge / warning / restraining order]] and have affected my [relationships / job / reputation in ways I am not proud of]."

The doctor is not judging you — this context helps connect your behavior directly to PTSD and makes your case stronger.`
    });
  } else {
    passed.push('Section F — Violence/Aggression History');
  }

  // ── G: Other medical conditions ──
  const gCondIdx = text.search(/other \(non-mental health\) active medical conditions/i);
  const gNarrow = gCondIdx >= 0 ? text.substring(gCondIdx, gCondIdx + 200) : '';
  const medConditionsHasContent = /\b(hypertension|high blood pressure|diabetes|type 2|heart disease|coronary|kidney|renal|asthma|copd|sleep apnea|arthritis|neuropathy|tinnitus|gout|hepatitis|cancer|chronic pain|back pain|spine|disc|herniation|hypothyroid|hyperthyroid|cholesterol|hyperlipidemia|benign prostatic|bph|acid reflux|gerd|ibs|crohn|colitis)\b/i.test(gNarrow);

  // Build medication hints based on what they listed
  const medHints: string[] = [];
  if (/amlodipine|losartan|lisinopril|hydrochlorothiazide/i.test(text)) medHints.push('Amlodipine / Losartan / Hydrochlorothiazide → likely High Blood Pressure (Hypertension)');
  if (/metformin|glipizide|jardiance|ozempic|insulin/i.test(text)) medHints.push('Metformin → likely Type 2 Diabetes');
  if (/simvastatin|atorvastatin|rosuvastatin|lipitor|crestor/i.test(text)) medHints.push('Simvastatin → likely High Cholesterol (Hyperlipidemia)');
  if (/pantoprazole|omeprazole|famotidine|nexium/i.test(text)) medHints.push('Pantoprazole → likely Acid Reflux / GERD');
  if (/tamsulosin|finasteride/i.test(text)) medHints.push('Tamsulosin → likely Benign Prostatic Hyperplasia (enlarged prostate)');
  if (/furosemide|lasix/i.test(text)) medHints.push('Furosemide → often prescribed for fluid retention related to heart or kidney conditions');
  if (/montelukast|albuterol|fluticasone/i.test(text)) medHints.push('Montelukast → likely Asthma or allergies');
  if (/benzonatate/i.test(text)) medHints.push('Benzonatate → likely a respiratory condition (cough/bronchitis)');

  if (!medConditionsHasContent) {
    gaps.push({
      section: 'Section G — Current Medications and Medical Conditions',
      field: 'Other Active Medical Conditions',
      issue: `The medical conditions field was left blank, but your medications list tells a different story. You listed medications that are typically prescribed for specific conditions — those conditions need to be named here so the doctor has a complete medical picture.`,
      severity: 'moderate',
      guidance: `Look at each medication you listed and identify what condition it is treating. Your prescribing doctor or pharmacist can tell you if you are unsure. List each condition by name — the doctor needs to know about all of your active health issues, not just your mental health.`,
      example: `Based on the medications you already listed, here are likely conditions to name — confirm with your doctor or pharmacy:

${medHints.length > 0 ? medHints.map(h => `• ${h}`).join('\n') : '• Review each medication with your pharmacist to identify the condition it treats.'}

Here is how to format your answer:
"My current non-mental health medical conditions include:
• [Condition name] — treated with [medication]
• [Condition name] — treated with [medication]
[Continue for each condition]"

If you have conditions that do not have a medication (such as back pain, tinnitus, or a service-connected injury), list those too.`
    });
  } else {
    passed.push('Section G — Other Medical Conditions');
  }

  // ── CAPS-5: Traumatic Event Detail ──
  const caps5Answer = answerBlocks.filter(b =>
    /\b(incoming|fire|hummer|formation|flipped|rushed|antenna|lightning|marine|struck|witness|combat|explosion|blast|shot|attack)\b/i.test(b)
  ).join(' ');

  const capsWords = wordCount(caps5Answer);
  const capsHasEmotional = hasEmotionalDetail(caps5Answer);
  const capsHasDetail = capsWords >= 40;

  // Pull what they wrote for context
  const capsWritten = caps5Answer ? `"${caps5Answer.trim().substring(0, 200)}"` : 'nothing';
  // Only name a specific event if the client clearly described it — never inject a label
  // from a passing keyword mention. For incoming fire, a vague mention is not enough.
  const capsEvent = mentionsHummer ? 'the Humvee rollover'
    : mentionsLightning ? 'the lightning strike'
    : 'the event you described';

  if (!capsHasDetail || !capsHasEmotional) {
    gaps.push({
      section: 'Section 5 — CAPS-5 Traumatic Event',
      field: 'Most Distressing Traumatic Event — Full Detail',
      issue: capsWords < 40
        ? `What was written — ${capsWritten} — is one or two sentences. This is the single most important narrative section in the entire form. One or two sentences cannot carry the weight this section needs. The doctor needs a complete, detailed account.`
        : `What was written describes the event but is missing your emotional and psychological reaction — how it felt in your body and mind in the moment, and how it has stayed with you since.`,
      severity: 'critical',
      guidance: `This is the most important section in the form. Write everything you remember about the event that affected you most. Do not summarize — describe. Cover: exactly where you were, what you were doing right before it happened, what happened step by step, what you physically saw/heard/smelled/felt, what you did in the moment, and how you felt immediately after and in the weeks and months that followed.`,
      example: `Based on what you mentioned (${capsEvent}), here is a full draft structure — fill in your actual memory:

"The event that has stayed with me most is [name the event in your own words — describe what it was, not a label].

We were in [location — country, base, on patrol, etc.]. It was [time of day / approximate date / how far into the deployment]. I was [describe what you were doing right before — your position, your job in that moment, who was around you].

Then [describe what happened step by step — do not skip details. What did you see? What sounds did you hear? What did you smell? What did your body feel? What did you do — did you run toward it, take cover, freeze, call for help?].

In the immediate moments after, I [describe what you did — rendered aid, tried to keep people calm, went into automatic mode, stood there in shock]. I remember [describe a specific detail that has stuck with you — something you saw, heard, or thought that you cannot get out of your mind].

After that day, I [describe what changed — could not sleep / started having nightmares / became hypervigilant / could not talk about it / replayed it over and over]. It has been [weeks / months / years] and I still [describe how the memory still shows up for you today — intrusive thoughts, nightmares, feeling like it just happened, avoiding things that remind you of it]."

Do not worry about making it sound perfect. Write it the way you would tell it to someone you trust — the doctor needs to understand what you went through, not a polished report.`
    });
  } else {
    passed.push('CAPS-5 — Traumatic Event Description');
  }
}

// ─── MSK ──────────────────────────────────────────────────────────────────────

function evaluateMSK(text: string, raw: string, gaps: any[], passed: string[], profile: ClientProfile) {
  const locStr = profile.locations.length > 0 ? profile.locations.join(', ') : 'overseas';

  // Scope all checks to Section IV onward to avoid false-passes from Section I service dates/locations
  const sectionIVStart = text.search(/section\s*IV\b|SECTION IV\b|condition.by.condition|describe.*detail.*each/i);
  const mskAnswerText = sectionIVStart !== -1 ? text.substring(sectionIVStart) : text;

  // -- IV-A: Onset --
  // False-pass guard: service years (1985, 1986, etc.) appear in Section I header.
  // Require a timeframe within the Section IV+ answer region.
  // MSK IV-A onset depth: require year + location/body area/context + triggering activity or incident
  if (!hasOnsetDepth(mskAnswerText)) {
    const onsetIdx = text.search(/onset|when did|how long|history of/i);
    const onsetSnip = onsetIdx >= 0 ? text.substring(onsetIdx, onsetIdx + 400).trim() : '';
    // Identify specifically what is missing
    const msk_missing: string[] = [];
    if (!hasTimeframe(mskAnswerText)) msk_missing.push("an approximate year or timeframe for when it started");
    else {
      if (!hasLocation(mskAnswerText)) msk_missing.push("where the condition started or what context you were in at the time (body part, location, duty environment)");
      const hasMSKTrigger = /\b(while|during|after|when|following|because|due to|carrying|lifting|running|falling|fall|impact|blast|explosion|IED|convoy|patrol|training|exercise|jump|rappel|ruck|rucksack|bending|twisting|collision|vehicle|rollover|accident|incident|deployed|deployment|mission|on duty|in the field|operating|assignment|sustained|got|took|happened|occurred|started after|began after|developed after|developed during|began during|started during)\b/i.test(mskAnswerText);
      if (!hasMSKTrigger) msk_missing.push("the specific activity or incident that triggered the condition - what were you doing when it started");
    }
    const msk_missingStr = msk_missing.length > 0 ? ` Missing: ${msk_missing.join("; ")}.` : "";
    const onsetNote = (onsetSnip && wordCount(onsetSnip) > 5)
      ? `The onset answer does not have enough detail for the doctor to connect this condition to service.${msk_missingStr}`
      : `No onset information was provided. This field was left blank or skipped.`;

    gaps.push({
      section: 'Section IV-A',
      field: 'Onset and History',
      issue: onsetNote,
      severity: 'critical',
      guidance: `Go beyond just the year. State: (1) approximately when it started; (2) where you were or what you were doing at the time - deployed, in training, back stateside, doing a specific physical task; (3) the activity or incident that triggered it - a specific lift, a fall, carrying heavy gear, a vehicle blast, repetitive physical stress over time. These three elements together are what let the doctor write the nexus to your service.`,
      example: `Here is a draft format to follow:

"This condition started around [year]. At the time I was [on active duty / recently separated / deployed to (location) / stationed at (base)]. The pain began [suddenly after a specific incident / gradually over time from repeated physical stress]. I first noticed it when [describe in your own words what was happening — what activity, situation, or incident first caused or revealed this condition]. Before that this was not a problem. Since then the condition has [stayed the same / gotten progressively worse / spread to other areas]."

Be specific about the activity or incident. That is the bridge between your service and your condition.`
    });
  } else passed.push('Section IV-A -- Onset');

  // -- IV-C: Pain location --
  // False-pass guard: deployment locations (Persian Gulf, Indian Ocean) appear in Section I.
  // hasLocation() would match those. Scope to Section IV answer text.
  if (!hasLocation(mskAnswerText)) {
    gaps.push({
      section: 'Section IV-C',
      field: 'Pain Location and Radiation',
      issue: `No specific body location is described. The doctor cannot evaluate the condition without knowing exactly where the pain is and whether it travels to other areas.`,
      severity: 'critical',
      guidance: `Describe the exact location of the pain, which side (left, right, or both), whether it radiates or travels anywhere else, and what type of pain it is (sharp, dull, burning, aching, stabbing).`,
      example: `Here is a draft:

"The pain is located in my [lower back / neck / right knee / left shoulder / both hips]. It is on the [left / right / both sides]. The pain [stays in one location / travels down into my leg toward my foot / radiates into my shoulder and down my arm]. It feels [sharp / dull and aching / burning / like constant pressure / like electric shocks]. It is worse [in the morning / after sitting for long periods / after standing / after physical activity] and there is [no position that fully relieves it]. On a typical day the pain is around a [X] out of 10. On a bad day it reaches [X] out of 10."

Be as specific as you can. The more precisely you describe the location and character of the pain, the more the doctor can connect it to your service injury.`
    });
  } else passed.push('Section IV-C -- Pain Location');

  // -- Section V: Functional Impact --
  const funcText = text.match(/\b(work|walk|stand|sit|lift|carry|drive|sleep|daily|activity|routine|bend|climb|stairs|reach|dress|shower|cook|shop|exercise|recreation)\b/gi);
  if (!funcText || funcText.length < 3) {
    gaps.push({
      section: 'Section V',
      field: 'Functional Impact',
      issue: `The functional impact section is too brief. The doctor needs to understand what this condition actually prevents you from doing day to day, not just that it causes pain.`,
      severity: 'critical',
      guidance: `Describe how this condition affects at least three areas of your life: ability to work, daily household tasks, mobility, recreational or physical activities you used to do, and sleep. Be specific about what you can no longer do or what now requires help.`,
      example: `Here is a draft:

"Work: My condition affects my ability to [sit for long periods / stand for long periods / lift anything over [X] pounds / concentrate due to constant pain]. I have [missed work / had to change jobs / reduced my hours / become unable to work] because of this.

Daily Tasks: I struggle with [bending down / climbing stairs / getting in and out of a vehicle / reaching overhead / carrying groceries / yard work / cooking / dressing myself]. Things that were routine now take much longer or require help.

Sleep: The pain [prevents me from getting comfortable / wakes me multiple times a night]. I get about [X] hours on a good night. I have to [sleep in a specific position / use extra pillows / get up and move around] just to manage the pain.

Recreation and Physical Activity: I used to [run / work out / play sports / hike / fish]. I can no longer do [describe what you gave up] at all, or I can only do limited versions of these activities before the pain stops me."

Fill in each section with what is actually true for you.`
    });
  } else passed.push('Section V -- Functional Impact');

  // -- Symptom Progression --
  // False-pass guard: "worsened", "constant", "chronic", "flare" appear in the form PROMPT bullets
  // ("Describe how symptoms have changed OVER TIME (worsened, spread, increased frequency...)").
  // Scope to Section IV answer text and require a sentence-level match.
  const hasProgression = (() => {
    // Must appear in the answer region and in a sentence context (not just as a parenthetical example)
    if (!/\b(better|worse|same|worsening|improving|deteriorating|flare|constant|chronic|increasing|decreasing|spread|aggravat)\b/i.test(mskAnswerText)) return false;
    // Require it appears in a sentence with at least 6 surrounding words (not just a prompt)
    const progressMatch = mskAnswerText.match(/.{0,60}\b(gotten worse|getting worse|progressively worse|stayed the same|worsening|deteriorating|flare.up|flared|constant|spread to|aggravated).{0,60}/i);
    return !!(progressMatch && wordCount(progressMatch[0]) >= 5);
  })();
  if (!hasProgression) {
    gaps.push({
      section: 'Section IV-B',
      field: 'Symptom Progression',
      issue: `No description of how this condition has changed over time. The doctor needs to know the direction (better, worse, or same), how it changed, and a sense of the timeframe - for example, whether it has been gradually worsening over years or cycling through flare-ups and relief periods.`,
      severity: 'moderate',
      guidance: `Describe three things: (1) the direction - is it getting worse, staying the same, or fluctuating? (2) how it changed - did pain spread to new areas, increase in frequency, become more severe, require more medication? (3) a timeframe - over how many months or years has this change happened? Also name what triggers a flare-up and what you cannot do during one.`,
      example: `Here is a draft:

"Since this condition started around [year], it has [gotten progressively worse over the past [X] years / stayed about the same / fluctuated with better and worse periods]. In the beginning it was [describe initial severity - occasional pain, manageable, minor]. Over time it has [spread from (area) to (area), increased in frequency from occasional to daily, become more severe and harder to manage without medication, begun interfering with sleep]. Things that trigger a flare-up now include [long drives, sitting or standing for more than [X] minutes, physical labor, cold weather, stress, certain movements]. During a flare-up the pain goes from a [X] to a [X] out of 10 and lasts [hours / days]. I am [unable to work / forced to rest / relying on medication just to get through the day]. Nothing has given me consistent long-term relief."

Progression tells the doctor this is not a one-time injury - it is an ongoing condition that has been getting worse over time.`
    });
  } else passed.push('Section IV-B -- Symptom Progression');
}

// ─── GI ───────────────────────────────────────────────────────────────────────

function evaluateGI(text: string, raw: string, gaps: any[], passed: string[], profile: ClientProfile) {

  // GI form is primarily checkboxes. In the PDF extraction all checkboxes render as ☐
  // regardless of whether they were checked. We therefore detect client answers by:
  //   (a) typed text in specific answer fields (onset date, pain score)
  //   (b) presence of client-typed narrative in answer-only positions

  // Helper: does the client appear to have typed anything in a given section?
  const clientTypedInSection = (pattern: RegExp, minWords = 2): boolean => {
    const snip = findAnswer(text, pattern, 1200);
    return !!snip && wordCount(snip) >= minWords;
  };

  // -- Section III: Onset --
  // False-pass guard: "Symptom onset" appears in the checkbox LABEL — require a typed date/year
  const hasTypedOnsetDate = /approximate symptom onset\s*:?\s*(\d{4}|\d+\/\d+|during|after|since|service|\w+ \d{4})/i.test(text);
  if (!hasTypedOnsetDate) {
    gaps.push({
      section: 'Section III',
      field: 'Onset and History',
      issue: `No timeframe was provided for when GI symptoms started. The doctor needs to know when this condition began and whether it connects to your service.`,
      severity: 'critical',
      guidance: `Provide an approximate year or timeframe for when GI symptoms first started. State whether symptoms began during service or after, and note any possible connection to deployment diet, stress, medications, or environment.`,
      example: `Here is a draft:

"My GI symptoms started around [year]. At the time I was [on active duty / recently discharged / deployed to (location)]. I first noticed [describe the first symptom — cramping, frequent urgent bathroom trips, constant heartburn, stomach pain]. The symptoms [came on suddenly / built up gradually over several months]. I believe this may be connected to [describe a possible cause if you know one: MRE diet during deployment, high stress environment, medications prescribed during service, contaminated water exposure, drastic change in diet]. Since then the symptoms have [stayed the same / gotten progressively worse / come and go in flare-ups]."`
    });
  } else passed.push('Section III — Onset');

  // -- Section III: Symptom Description --
  // False-pass guard: GI symptom words appear in checkbox LABELS ("Nausea", "Abdominal bloating", etc.)
  // The GI form is almost entirely checkboxes. We cannot tell from PDF text whether a checkbox
  // was checked. We require a typed pain score number OR a multi-word typed narrative beyond the labels.
  const hasPainScore = /pain severity\s*(?:\(0[^)]*\))?\s*:?\s*\d/i.test(text);
  const hasTypedSymptomNarrative = (() => {
    const narrativeMatch = findAnswer(text, /describe|history|explain|tell us|onset|began|started|since/i, 800);
    return !!(narrativeMatch && wordCount(narrativeMatch) >= 8 &&
      /\b(cramp|bloat|nausea|diarrhea|constipation|reflux|heartburn|pain|urgency|gas|vomit|bowel|stomach|abdomen|acid|IBS)\b/i.test(narrativeMatch));
  })();
  const hasGISymptoms = hasPainScore || hasTypedSymptomNarrative;
  if (!hasGISymptoms) {
    gaps.push({
      section: 'Section III',
      field: 'Symptom Description',
      issue: `The GI symptoms are not described specifically. The doctor needs to know what is actually happening in your body — not just that you have a stomach issue. The type, frequency, and triggers all matter.`,
      severity: 'moderate',
      guidance: `List each specific GI symptom you experience. Describe how often it happens, what triggers or worsens it, and what (if anything) gives relief. Do not generalize — the more specific you are, the clearer the medical picture.`,
      example: `Here is a draft:

"My GI symptoms include [choose all that apply: cramping, urgent or uncontrollable bowel movements, bloating, acid reflux, heartburn, nausea, chronic diarrhea, constipation, gas, bleeding]. These symptoms occur [daily / several times a week / in flare-ups that last [X] days at a time]. They are triggered or made worse by [certain foods, stress, eating too fast, alcohol, spicy or fatty food, lying down after eating, anxiety]. I have tried managing them with [diet changes, over-the-counter medication, prescription medication, avoiding trigger foods] with [limited / moderate / no lasting] success."`
    });
  } else passed.push('Section III — Symptom Description');

  // -- Section IV: Severity Rating --
  // False-pass guard: "Mild", "Moderate", "Severe" appear in the checkbox LABEL text.
  // Require the word to appear AFTER the "Severity Level:" label, not anywhere in the form.
  const severityAfterLabel = (() => {
    const labelIdx = text.search(/severity level\s*:/i);
    if (labelIdx === -1) return false;
    const afterLabel = text.substring(labelIdx, labelIdx + 400);
    // The label text itself says "Mild – Occasional...", "Moderate – Frequent...", "Severe – Diarrhea..."
    // A checked answer would have the word appear distinctly. Since we cannot detect checkmarks,
    // we flag this as missing unless there is a typed severity word OUTSIDE the label descriptions.
    // Strategy: look for the word appearing somewhere OTHER than next to a dash (the label format uses dashes).
    return /\b(mild|moderate|severe)\b(?!\s*[–\-])/i.test(afterLabel);
  })();
  if (!severityAfterLabel) {
    gaps.push({
      section: 'Section IV',
      field: 'Severity Rating',
      issue: `No severity level was selected or written in. The form requires Mild, Moderate, or Severe. Without this the doctor cannot gauge how significantly this condition affects your daily functioning.`,
      severity: 'critical',
      guidance: `Choose the severity level that honestly describes how GI symptoms affect your daily life. Mild means you can manage them. Moderate means they regularly disrupt your routine. Severe means they frequently prevent you from functioning normally.`,
      example: `Choose the one that fits and explain it briefly:

Mild: "I would rate my GI condition as Mild. Symptoms are present but I can usually manage them without missing work or major changes to my daily routine."

Moderate: "I would rate my GI condition as Moderate. Symptoms are frequent enough that I have to plan around them — I always need to know where the nearest bathroom is, I avoid certain foods and situations, and flare-ups regularly interrupt my work and daily life."

Severe: "I would rate my GI condition as Severe. On bad days I am unable to leave the house. The pain, urgency, and unpredictability are debilitating — I have missed work, social events, and appointments because of this condition on a regular basis."`
    });
  } else passed.push('Section IV — Severity');

  // -- Functional Impact --
  // False-pass guard: "work absences", "social", "daily activity" appear in checkbox LABELS.
  // Require a TYPED narrative with functional impact words, not just label text.
  const hasGIFuncImpact = (() => {
    // Look for typed content in a narrative field (not checkbox label regions)
    // Checkbox labels in Section IV are short phrases. A typed answer would be longer and appear
    // outside those exact label strings. Check the answer block zone.
    const funcSnip = findAnswer(text, /how.*affect|daily.*life|impact|describe.*condition|work.*miss|occupational/i, 800);
    if (funcSnip && wordCount(funcSnip) >= 8 &&
      /\b(work|daily|routine|avoid|cancel|miss|unable|bathroom|emergency|leave|eat|diet|social|plan|embarrass|isolat|sleep|travel)\b/i.test(funcSnip)) return true;
    // Also accept: client wrote a narrative anywhere that goes beyond 3 consecutive non-label words about impact
    return /(?:i (?:have to|cannot|always|must)|my (?:work|job|daily)|(?:miss|avoid|unable to|have had to)).{0,200}(?:bathroom|work|social|travel|leave|eat)/i.test(text);
  })();
  if (!hasGIFuncImpact) {
    gaps.push({
      section: 'Section V',
      field: 'Functional Impact',
      issue: `There is no description of how GI symptoms affect daily life, work, or social activities. The doctor needs to understand the real-world impact of this condition, not just the physical symptoms.`,
      severity: 'critical',
      guidance: `Describe how your GI condition affects your ability to work, socialize, travel, eat normally, and plan your day. Be specific about situations you now avoid or activities you have had to give up.`,
      example: `Here is a draft:

"My GI condition affects my daily life significantly. I [have to plan every outing around bathroom access / cannot eat a full meal before work / avoid restaurants, travel, and social situations because of unpredictable symptoms]. At work, [I have had to leave meetings suddenly / I avoid eating lunch on shift / I have called out due to a flare-up]. Travel is extremely difficult because [I cannot rely on bathroom access / stress makes symptoms worse]. I have stopped accepting certain social invitations because I never know when symptoms will hit. Flare-ups [happen without warning and can last hours], which makes it impossible to commit to normal activities with confidence."`
    });
  } else passed.push('Section V — GI Functional Impact');
}

// ─── HEADACHES ────────────────────────────────────────────────────────────────

function evaluateHeadaches(text: string, raw: string, gaps: any[], passed: string[], profile: ClientProfile) {
  const locStr = profile.locations.length > 0 ? profile.locations.join(', ') : 'overseas';

  // -- Q1: Timeframe / when headaches began --
  const q1Snip = text.substring(0, 800);
  // Q1 onset depth: require year + context/setting + triggering situation
  if (!hasOnsetDepth(q1Snip)) {
    const q1Written = q1Snip.replace(/\s+/g, ' ').trim();
    // Identify what is missing
    const q1_missing: string[] = [];
    if (!hasTimeframe(q1Snip)) q1_missing.push("an approximate year or timeframe for when headaches first started");
    else {
      if (!hasLocation(q1Snip)) q1_missing.push("where you were or what context you were in when headaches began - deployed, in training, back stateside, at a specific location");
      const hasQ1Trigger = /\b(while|during|after|when|following|because|due to|blast|explosion|IED|impact|fall|struck|hit|vehicle|rollover|accident|training|patrol|mission|incident|deployed|deployment|on duty|in the field|happened|occurred|started after|began after)\b/i.test(q1Snip);
      if (!hasQ1Trigger) q1_missing.push("what was happening when headaches first started - a specific incident, an injury, a period of high stress, or a particular assignment");
    }
    const q1_missingStr = q1_missing.length > 0 ? ` Missing: ${q1_missing.join("; ")}.` : "";
    const q1Note = (q1Written.length > 40)
      ? `The headache history does not include enough detail for the doctor to establish a service connection.${q1_missingStr}`
      : `No onset information was provided for when headaches began. This field needs to be completed.`;
    gaps.push({
      section: 'Question 1',
      field: 'Headache History and Timeframe',
      issue: q1Note,
      severity: 'critical',
      guidance: `Go beyond just the year. State: (1) approximately when headaches first started; (2) where you were or what you were doing at the time - deployed, in training, back home; (3) what was happening when they first started - a blast, a fall, a head injury, a specific period of extreme stress, or a training accident. These three elements let the doctor write the nexus.`,
      example: `Here is a draft:

"My headaches started around [year]. At the time I was [on active duty / recently separated / deployed to ${locStr} / in training at (location)]. They began [suddenly after a specific incident / gradually over a period of time]. I first noticed them [describe in your own words what was happening when headaches first started — what you were doing, where you were, what occurred]. Before that I rarely had headaches. They have [continued / gotten progressively worse] since then."

If there was a specific incident - a blast, a fall, a vehicle accident - mention it clearly here. That is what gives the doctor the connection to your service.`
    });
  } else passed.push('Q1 — Headache History Timeframe');

  // -- Q2: When did headaches begin (checkbox group) --
  // All four choices are blank checkboxes (☐) if the client did not select any.
  // Detect whether at least one is checked by looking for ☑ or ✓ near the Q2 prompt.
  const q2Area = (() => {
    const q2Idx = text.search(/did your headaches begin/i);
    return q2Idx >= 0 ? text.substring(q2Idx, q2Idx + 400) : '';
  })();
  const q2Checked = /[☑✓✔]/.test(q2Area) ||
    /\b(during active duty|shortly after separation|years after service|after a specific injury)\b/i.test(q2Area.replace(/\u2610/g, ''));
  // Also pass if Q1 already has a clear timeframe narrative that answers this question
  const q2HasNarrativeAnswer = hasTimeframe(q1Snip);
  if (!q2Checked && !q2HasNarrativeAnswer) {
    gaps.push({
      section: 'Question 2',
      field: 'When Headaches Began (Service Connection Checkbox)',
      issue: `Question 2 asks whether headaches began during active duty, shortly after separation, years after service, or after a specific injury or event. No selection was made. The doctor needs to know the timeframe of onset in order to establish a service connection.`,
      severity: 'critical',
      guidance: `Go back to Question 2 and select the option that best describes when headaches began. If they started during active duty service, select that option. If they began after a specific injury or event (blast, fall, head trauma), select that option and then describe the event in Question 3.`,
      example: `Select the option that fits best:

- During active duty (headaches started while still serving)
- Shortly after separation (started within months of getting out)
- Years after service (started well after separating)
- After a specific injury or event (started after a blast, fall, or head trauma)

If it was after a specific injury, make sure to describe the event in Question 3 as well.`
    });
  } else passed.push('Q2 — Headache Onset Selection');

  // -- Q3: If cause was injury, needs location and detail --
  const injuryMentioned = /\b(injury|injur|blast|explosion|IED|concussion|head trauma|TBI|fall|hit|struck|vehicle|rollover|accident)\b/i.test(text);
  if (injuryMentioned) {
    const injuryDetail = /\b(head|neck|skull|forehead|temple|jaw|face|behind|occipital|frontal|back of|top of)\b/i.test(text);
    if (!injuryDetail) {
      gaps.push({
        section: 'Question 3',
        field: 'Injury Location and Detail',
        issue: `An injury or incident is mentioned but no detail is given about where on the body the injury occurred or exactly what happened. The doctor needs to know what type of injury it was, where it made contact, and how the incident occurred.`,
        severity: 'critical',
        guidance: `Describe where on the body the injury occurred (head, neck, face), what caused it (blast wave, struck head on vehicle interior, fell and hit ground), and what happened physically at the moment of injury. Include whether you lost consciousness, experienced confusion, ringing in the ears, or were evaluated by a medic.`,
        example: `Here is a draft:

"The injury occurred during [describe the situation in your own words — what happened, where you were, what you were doing]. I [describe the physical impact — what happened to your head or body in that moment]. Immediately after I experienced [describe what you felt: ringing in your ears, confusion, loss of consciousness, severe headache, blurred vision, nausea, or other symptoms]. I [was / was not] evaluated by a medic at the time. My headaches began [immediately / within days / within weeks] of this incident."`
      });
    } else passed.push('Q3 — Injury Location and Detail');
  }

  // -- Q17: Severity, accompanying symptoms, duration, impact --
  // False-pass guard: symptom words like "Throbbing pain", "Nausea", "Sensitivity to light" appear
  // as CHECKBOX LABELS in Q16. We must require these words appear in a TYPED narrative, not a label.
  // Strategy: look specifically at what appears AFTER the Q17 prompt.
  // Hoist anyEpisode so it can be used in both q17Answer and hasHeadacheFuncImpact checks
  const anyEpisode = text.match(/(?:it (?:will|starts?|begins?|gets?)|i (?:normally|usually|have to|need to)).{20,400}/i);

  // Q17 answer location note: In the Headaches PDF, Q17's answer field appears AFTER the Q19
  // checkbox list (which comes before Q20 in the layout). The answer may appear near
  // "If yes, explain:" or after Q21. We search a wider radius and also scan the full text
  // for a client-typed sentence that describes a headache episode.
  const q17Answer = (() => {
    // Look ONLY at text AFTER the Q17 prompt to avoid contamination from Q16 checkbox labels.
    // findAnswer() searches bidirectionally — the "before" window reaches Q13/Q16 checkboxes
    // ("Throbbing pain", "Nausea", etc.) which would cause false-passes. Use forward-only extraction.
    const q17Idx = text.search(/describe a typical severe episode|17\..*describe.*typical/i);
    const direct = q17Idx >= 0 ? text.substring(q17Idx, q17Idx + 1200) : '';
    if (direct && wordCount(direct) >= 8) return direct;
    // Also look for the answer near Q21 "If yes, explain" (forward only from Q21 position)
    const q21Idx = text.search(/have supervisors.*commented|supervisors.*coworkers.*commented/i);
    const nearQ21 = q21Idx >= 0 ? text.substring(q21Idx, q21Idx + 600) : '';
    if (nearQ21 && wordCount(nearQ21) >= 8) return nearQ21;
    return anyEpisode ? anyEpisode[0] : null;
  })();
  // Q17 requires: symptom word(s) + duration/functional detail ("lie down", "cannot", "hours", "day", "work")
  // Chris's answer has "severe" and "sleep it off" but lacks: pain scale, symptoms list, specific duration, what he can't do.
  // Require at least 2 of these detail categories to be present in the answer.
  const hasSeveritySymptoms = (() => {
    if (!q17Answer || wordCount(q17Answer) < 10) return false;
    // "Severe" alone is not a symptom descriptor — require a PHYSICAL symptom word
    const hasSymptomWord = /\b(throb|throbbing|pound|pounding|nausea|nauseated|vomit|light sensitiv|sound sensitiv|photophob|phonophob|aura|vision|blur|pressure|tightness|dizzy|vertigo|stabbing|sharp pain|aching)\b/i.test(q17Answer);
    const hasDurationDetail = /\b(hour|hours?|day|overnight|all day|most of|\d+\s*hour|\d+\s*day|last|lasts?|duration|until)\b/i.test(q17Answer);
    const hasFunctionalDetail = /\b(cannot|unable|can.t|have to|need to|must|stop|lie down|lay down|bed|rest|miss|dark|quiet|function|work|drive)\b/i.test(q17Answer);
    const hasSeverityRating = /\b(\d+\s*(?:out of|\/)\s*10|pain scale|\d\/10|level \d)\b/i.test(q17Answer);
    // Need symptom word PLUS at least one other detail category, OR a pain rating
    const detailCount = [hasDurationDetail, hasFunctionalDetail, hasSeverityRating].filter(Boolean).length;
    return hasSymptomWord && detailCount >= 1 && wordCount(q17Answer) >= 15;
  })();
  if (!hasSeveritySymptoms) {
    const q17Snip = q17Answer;
    const q17Note = q17Snip && wordCount(q17Snip) > 4
      ? `The headache description at Question 17 does not include the level of severity, what physical symptoms accompany the headache, how long they typically last, or what the client cannot do during an episode.`
      : `Question 17 is blank or does not describe the headache in enough detail. The doctor needs to understand what a headache episode actually feels like, how severe it is, and how long it lasts.`;
    gaps.push({
      section: 'Question 17',
      field: 'Headache Severity, Symptoms, and Duration',
      issue: q17Note,
      severity: 'critical',
      guidance: `Describe: the severity level (mild, moderate, or severe — or use a pain scale), the physical symptoms that come with the headache (nausea, sensitivity to light or sound, vision changes, dizziness, vomiting), how long a typical episode lasts, and what the client cannot do during an episode.`,
      example: `Here is a draft:

"When a headache hits, the pain is a [X] out of 10 at its worst. I would describe it as [throbbing / a tight band around my head / a stabbing pressure behind my eyes / a pounding that starts at the base of my skull and spreads forward]. Along with the pain I experience [nausea, sensitivity to light, sensitivity to loud sounds, blurred vision, dizziness]. I have to [go into a dark quiet room / lay completely still / hold my head to manage the pain]. A typical episode lasts [X hours / most of the day]. During that time I am [completely unable to work / unable to drive / unable to look at a screen / unable to care for my family normally]."

Be honest about how severe these episodes are. The doctor needs an accurate picture.`
    });
  } else passed.push('Q17 — Headache Severity and Symptoms');

  // -- Q20: Frequency --
  // False-pass guard: "daily", "weekly", "monthly" appear in Q13 CHECKBOX LABELS ("Less than once per month",
  // "1-2 times per month", "5+ times per month") and Q14 labels. We need a typed answer.
  // Q20 on this form asks "how many workdays per month do you miss" — look for a number near that question.
  // Also accept a typed frequency anywhere that reads like a client sentence.
  const hasFrequency = (() => {
    // Typed number near Q20: use forward-only lookup (findAnswer is bidirectional and reaches Q19 checkbox labels).
    // Q20 asks "how many workdays per month do you miss" — only look at text AFTER this question.
    const q20Idx = text.search(/approximately how many workdays|how many workdays per month/i);
    const q20After = q20Idx >= 0 ? text.substring(q20Idx, q20Idx + 300) : '';
    // Strip the question text, zero-width spaces, and question numbers (handling ZWS after periods too)
    const q20Content = q20After
      .replace(/approximately how many workdays[^\n]*/i, '')  // strip Q20 question line
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')           // strip zero-width spaces
      .replace(/\b\d{1,2}\.[\s\u200b]*/g, '')               // strip question numbers like "21." or "21.\u200b"
      .replace(/have supervisors[^\n]*/i, '')                 // strip Q21 question text
      .replace(/\s+/g, ' ')
      .trim();
    // Only pass if a digit (typed answer) remains that isn't just a document ref or page number
    if (q20Content && q20Content.length >= 1 && /\b\d+\b/.test(q20Content) &&
        !/^(\d+\s+of\s+\d+|page|document ref)/i.test(q20Content)) return true;
    if (q20Content && /\b(none|zero|occasionally|rarely|never)\b/i.test(q20Content)) return true;
    // Client-typed sentence with frequency (not just a label)
    // Require it to be part of a sentence (has a subject/verb), not just a bare label
    // Guards:
    //   - "once per month" appears in Q13 label "Less than once per month" — require no "than " before it
    //   - "1–2 times per month", "3–4 times per month" are Q13 checkbox labels — exclude range patterns \d[\u2013-]\d
    return /\b(i miss|miss about|miss approximately|approximately \d|(?<![\u2013\-]\d )(?<!\d[\u2013\-])\d+ times? per|\d+ days? per|every \d+ days?|(?<!than )once (?:a|per) (?:week|month)|twice (?:a|per) (?:week|month))/i.test(text);
  })();
  if (!hasFrequency) {
    gaps.push({
      section: 'Question 20',
      field: 'Headache Frequency',
      issue: `No clear frequency was stated for how often headaches occur. The doctor needs to know how many times per week or per month the client experiences headaches to understand the level of disability.`,
      severity: 'moderate',
      guidance: `State approximately how often headaches occur per week or per month. If frequency varies, describe the range — for example, how many on a good week versus a bad week. If headaches are nearly daily, say so clearly.`,
      example: `Here is a draft:

"I experience headaches approximately [X] times per week / [X] times per month. On a good week I might have [X]. On a bad week or during a flare-up I can have [X] in a single day. Some headaches are manageable but about [X] out of every [X] are severe enough to stop what I am doing entirely."

Even an estimate is helpful. "About 3 to 4 times a week" is better than leaving this blank.`
    });
  } else passed.push('Q20 — Headache Frequency');

  // -- Functional Impact (Q22 region / overall) --
  // False-pass guard: "work", "daily", "concentration", "social" all appear in Q19 CHECKBOX LABELS.
  // Require a typed narrative sentence demonstrating actual functional impact.
  const hasHeadacheFuncImpact = (() => {
    // Require a genuine first-person typed statement about functional limitations
    // "sleep it off" is not functional impact — it is a remedy. Require explicit impact language.
    // Check for a sentence where the subject is "I" and the impact is on an activity/role.
    // "I have to sleep it off" is a coping strategy, not functional impact.
    // Require explicit impact on work, driving, family responsibilities, or social activities.
    // Guard: require first-person subject for ALL alternatives — label text like "or cannot function)?" must not match
    const firstPersonImpact = /(?:i (?:cannot|am unable to|had to (?!sleep)|was forced to|am forced to|cannot|can.t)|(?:miss|missed) (?:work|school)|i (?:cannot function|cannot work|cannot drive|lost my job|had to leave work|left work early|called (?:out|in sick))).{0,250}/i.test(text);
    if (firstPersonImpact) return true;
    // Also accept: Q17 answer that includes specific functional loss beyond just "sleep it off"
    if (q17Answer) {
      const episodeText = anyEpisode ? anyEpisode[0] : '';
      // Must have an impact word in a sentence with first-person subject — not from Q12/Q19 checkbox labels
      // "cannot function" appears in the Q12 question text ("isolate, or cannot function)?") — require "I" before it
      return /\b(lie down|lay down|i cannot function|unable to work|have to stop|stop everything|i cannot drive|unable to drive|have to leave|bed|dark room)\b/i.test(episodeText);
    }
    return false;
  })();
  if (!hasHeadacheFuncImpact) {
    gaps.push({
      section: 'Functional Impact',
      field: 'Daily Life Impact',
      issue: `There is no description of how headaches affect daily functioning, work, or relationships. A list of symptoms alone is not enough — the doctor needs to understand what the client cannot do when a headache strikes.`,
      severity: 'critical',
      guidance: `Describe what the client cannot do during a headache episode across at least two areas: work performance, ability to drive, caring for family, using screens or being around noise and light, sleep, and social or recreational activities. Include how often these disruptions happen.`,
      example: `Here is a draft:

"During a severe headache I am unable to [work / drive / be around bright light or loud sound / look at any screen / care for my kids normally]. I have [missed work / left early / had to call in] because of headaches [X] times in the past [month / year]. At home I [have to shut myself in a dark room / rely on others to take over responsibilities / cannot cook, clean, or manage the household during an episode]. My family has had to adjust their schedule around my headaches regularly. The unpredictability is one of the hardest parts — I never know when one will hit."

If headaches affect your sleep — waking you up at night, preventing rest — include that too.`
    });
  } else passed.push('Functional Impact — Daily Life Impact');
}

// ─── RFI ──────────────────────────────────────────────────────────────────────

function evaluateRFI(text: string, raw: string, gaps: any[], passed: string[], profile: ClientProfile) {
  const locStr = profile.locations.length > 0 ? profile.locations.join(', ') : 'overseas';
  const branchStr = profile.branch || 'the military';
  const mosStr = profile.mos ? `as ${article(profile.mos)} ${profile.mos}` : 'in their assigned role';
  const rfiJobLabel = profile.jobLabel || 'MOS';
  const rfiJobHint = profile.jobDescription
    ? `\n\nNote: Based on what you already wrote about your duties — "${profile.jobDescription.substring(0, 250)}${profile.jobDescription.length > 250 ? '...' : ''}" — think about the specific physical demands and situations that role put you in when you fill in the brackets above.`
    : '';

  // -- Section III: Military Duties --
  const hasDutiesKeywords = /\b(duty|duties|mos|job|role|unit|platoon|squad|mission|deployed|served|position|rank|assigned|billet|operator|infantry|logistics|supply|communications|intel|artillery|aviation|medical|combat|field|convoy|patrol|base|camp)\b/i.test(text);
  if (!hasDutiesKeywords || text.length < 300) {
    const dutySnip = findAnswer(text, /section\s*III|military service|duties|job|MOS|role/i);
    const dutyNote = dutySnip && wordCount(dutySnip) > 4
      ? `The military duties section describes the client’s service but does not provide enough detail about their specific MOS, typical daily duties, unit type, or the physical and environmental demands of their job.`
      : `Section III is not filled in with enough information about the client’s military service and duties. This is the foundation of the entire claim — the doctor needs to understand what the client actually did day to day.`;
    gaps.push({
      section: 'Section III',
      field: 'Military Service Duties',
      issue: dutyNote,
      severity: 'critical',
      guidance: `Describe the MOS or job title, the branch of service, the type of unit, what typical daily duties involved physically and mentally, and the nature of deployments or assignments. The more specific and detailed, the better the doctor can connect the job to the conditions being claimed.`,
      example: `Here is a draft — fill in your actual experience:

"I served in ${branchStr}${profile.mos ? ` as ${article(profile.mos)} ${profile.mos} (${rfiJobLabel})` : ' in my assigned role'}. My primary duties included [describe what your ${profile.mos || 'role'} actually required you to do day to day — what a typical shift, mission, or workday looked like in your own words]. My unit deployed to [${locStr}] where [describe the operational environment in your own words — the conditions, the pace, what the physical and mental demands of that assignment were for someone in your specific job]. The physical demands included [describe what your body had to do consistently in this role]. The mental demands included [describe what was mentally taxing about your specific job or assignments]."${rfiJobHint}

Describe what your actual service looked like on a typical day. Do not copy these bracket prompts — replace each one with your own words. The doctor needs to understand your specific job, not a generic military description.`
    });
  } else passed.push('Section III — Military Duties');

  // -- Section V: Condition-specific narrative (onset, progression, symptoms) --
  // False-pass guard: Service dates in Section I (e.g. 1985-1993, 1986, 1987) will always match
  // hasTimeframe(). We need a timeframe that appears INSIDE Section V answer blocks, not Section I.
  const sectionVStart = text.search(/section\s*V\b|SECTION V\b/i);
  const sectionVIStart = text.search(/section\s*VI\b|SECTION VI\b/i);
  const sectionVText = sectionVStart !== -1
    ? text.substring(sectionVStart, sectionVIStart !== -1 ? sectionVIStart : sectionVStart + 3000)
    : '';
  // Section V has labeled prompt fields with no client content if blank — count actual typed words
  // Prompt lines like "When did symptoms first begin?", "Describe how the condition...", etc.
  // If the client filled in answers, there will be substantive content beyond the prompts.
  const sectionVAnswerWords = (() => {
    // Section V has a very predictable structure: prompt lines followed by blank answer space.
    // When a client fills it in, their answer appears immediately after a prompt line.
    // Strategy: find lines that are NOT prompt/label lines and count those words.
    const lines = sectionVText.split('\n');
    const promptPatterns = [
      // Section headers and form-level instructions
      /^(section|document ref|page \d|complete this|mental health conditions|if you don|note:|leave the|remainder blank|considered, list)/i,
      // Condition block labels
      /^condition #?\d/i,
      // Sub-prompt labels (A. B. C. etc.)
      /^[A-F][.\)]/,
      // Bullet points
      /^[•●\-\*]/,
      // Empty
      /^\s*$/,
      // All the known prompt question lines in Section V
      /^(when did symptoms|did symptoms first occur|were symptoms documented|describe how the condition|describe:|describe \(citing|do your symptoms worsen|if so, how often|duration of flare|triggers\??$|describe a typical|limitations during|repeated use over|instability.*mechanical|giving way|locking or|popping or|recurrent sprains)/i,
      /^(frequency:|severity:|duration:|associated symptoms|occupational limitations|physical activity|sleep:|concentration:|reliability|social or family|attendance|sequelae)/i,
    ];
    const answerLines = lines.filter(line => {
      const trimmed = line.trim();
      if (trimmed.length < 3) return false;
      return !promptPatterns.some(p => p.test(trimmed));
    });
    return wordCount(answerLines.join(' '));
  })();
  // Require a timeframe in actual answer content — strip known prompt phrases that contain
  // timeframe words ("during active service", "after service") from the timeframe check.
  const sectionVTimeframeText = sectionVText
    .replace(/20\d{2}-\d{2}-\d{2}/g, '')  // signature dates
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, '')  // MM/DD/YYYY dates
    .replace(/did symptoms first occur during active service[^\n]*/gi, '')  // prompt line
    .replace(/were symptoms documented or treated during service[^\n]*/gi, '');  // prompt line
  // Onset depth: a year alone is not enough. Require year + location/context + triggering event.
  const hasSectionVOnsetDepth = sectionVAnswerWords >= 25 &&
    hasTimeframe(sectionVTimeframeText) &&
    hasOnsetDepth(sectionVTimeframeText);

  // Identify which element(s) are missing for a targeted gap message
  const sectionVMissingElements: string[] = [];
  if (!hasTimeframe(sectionVTimeframeText)) sectionVMissingElements.push('an approximate year or timeframe for when each condition started');
  else {
    if (!hasLocation(sectionVTimeframeText)) sectionVMissingElements.push('where the condition started or what context you were in at the time (deployment location, base, physical duty environment)');
    const hasTriggerV = /\b(while|during|after|when|following|from|because|due to|as a result|carrying|lifting|running|falling|fall|impact|blast|explosion|IED|convoy|patrol|training|exercise|jump|rappel|ruck|rucksack|brace|bending|twisting|collision|vehicle|rollover|accident|incident|stressor|deployed|deployment|mission|operation|on duty|in the field|working|operating|assignment|sustained|got|took|received|happened|occurred|started after|began after|developed after|developed during|began during|started during)\b/i.test(sectionVTimeframeText);
    if (!hasTriggerV) sectionVMissingElements.push('what was happening when the condition started — the specific activity, incident, or pattern of exposure that triggered it');
  }

  if (!hasSectionVOnsetDepth) {
    const v_snip = sectionVText.trim();
    const missingList = sectionVMissingElements.length > 0
      ? `Missing: ${sectionVMissingElements.join('; ')}.`
      : 'The onset description needs more specificity.';
    const v_note = sectionVAnswerWords < 25
      ? `Section V is incomplete. No onset information was provided for when conditions began. This section needs to be filled in for each condition being claimed.`
      : `Section V provides a year for when conditions started but does not go far enough. A year alone is not enough for the doctor to establish a service connection. ${missingList}`;
    gaps.push({
      section: 'Section V',
      field: 'Condition Onset and History',
      issue: v_note,
      severity: 'critical',
      guidance: `For each condition, go beyond the year. State: (1) where you were or what you were doing when it started — deployed, in training, back stateside, at a specific base; (2) the specific activity, incident, or pattern that first caused or revealed the condition — describe it in your own words; and (3) how the condition has progressed since it started. A year alone gives the doctor a when but not a why. The why is what connects it to your service.`,
      example: `Here is a draft template to use for each condition:

"[Condition name]: This condition started around [year]. At the time I was [on active duty / recently separated / deployed to ${locStr} / stationed at (base)]. It began [suddenly after a specific incident / gradually over time]. I first noticed it when [describe in your own words what was happening — the specific activity, situation, or incident that first caused or revealed this condition]. Before that this was not an issue. Since then the condition has [stayed the same / gotten progressively worse / spread to include (area or symptom)]. It currently affects my ability to [describe functional impact]."

Complete this for every condition listed. Each one needs its own story — not just a year.`
    });
  } else passed.push('Section V — Condition Onset Timeframes');

  // -- Section V continued: symptom narrative depth --
  // False-pass guard: symptom words like "pain", "nightmare", "avoid", "sleep" appear in Section IV
  // (symptom inventory) which clients DO fill in. We need these words in Section V specifically.
  const hasSymptomDepth = sectionVAnswerWords >= 20 &&
    /\b(pain|ache|hurt|burning|numb|tingle|fatigue|dizzy|nausea|chest|breath|sweat|heart|pressure|cramp|spasm|stiff|swell|weak|limit|restrict|disturb|sleep|nightmare|flashback|avoid|isolat|irritab|anger|memory|concentrat|startle|trigger)\b/i.test(sectionVText);

  // Secondary check: detect when functional impact fields are answered with bare numbers only (e.g. "0", "6", "7")
  // or left blank. This catches Condition 4 having completely empty functional impact.
  // Look for patterns like a condition block where the impact lines are all digits or empty.
  const conditionBlocksWithBareNumbers = (() => {
    // Extract individual condition blocks (Condition #1 through #5)
    const conditionBlocks: string[] = [];
    const condRe = /Condition #\d+ Name:[\s\S]{0,4000}?(?=Condition #\d+ Name:|SECTION VI|$)/gi;
    let m;
    while ((m = condRe.exec(sectionVText)) !== null) conditionBlocks.push(m[0]);
    // A condition is "bare-number only" if its functional impact section has no sentence-length answer
    return conditionBlocks.filter(block => {
      const condName = /Condition #\d+ Name:\s*([^\n]{2,})/i.exec(block)?.[1]?.trim();
      if (!condName || condName.length < 2) return false; // empty condition slot — skip
      // Skip if the "name" looks like a form label (e.g. "A. Onset and Initial Presentation")
      // This happens when the client left Condition #N blank and pdftotext reads the next label
      if (/^[A-H]\s*\.\s*(Onset|Course|Current|Functional|Flare|Condition|Section)/i.test(condName)) return false;
      // Check if the functional impact area (after "D.") has any real sentences
      const impactSection = block.substring(block.search(/D\. Condition.*Functional Impact/i));
      if (!impactSection || impactSection.length < 10) return false;
      // Strip prompt lines and check for at least one sentence (15+ words of real text)
      const impactAnswers = impactSection
        .replace(/D\. Condition.*Functional Impact[^\n]*/gi, '')
        .replace(/Describe.*citing specific examples[^\n]*/gi, '')
        .replace(/Occupational limitations[^\n]*/gi, '')
        .replace(/Physical activity[^\n]*/gi, '')
        .replace(/Reliability and attendance[^\n]*/gi, '')
        .replace(/Social or family[^\n]*/gi, '')
        .replace(/Document Ref[^\n]*/gi, '')
        .replace(/\u2022[^\n]*/g, '')
        .replace(/E\. Condition[\s\S]*/i, ''); // stop at flare-up section
      const impactWords = wordCount(impactAnswers.trim());
      // If under 10 real words, this condition has no meaningful functional impact
      return impactWords < 10;
    });
  })();

  const hasBareNumberConditions = conditionBlocksWithBareNumbers.length > 0;

  if (!hasSymptomDepth || hasBareNumberConditions) {
    const bareNames = conditionBlocksWithBareNumbers
      .map(b => /Condition #\d+ Name:\s*([^\n]{2,})/i.exec(b)?.[1]?.trim())
      .filter(Boolean)
      .join(', ');
    gaps.push({
      section: 'Section V',
      field: 'Current Symptom Description',
      issue: hasBareNumberConditions
        ? `One or more conditions are missing functional impact descriptions. ${bareNames ? `The following condition(s) have blank or number-only functional impact fields: ${bareNames}.` : ''} The doctor needs to understand how each condition affects daily work, physical activity, sleep, concentration, and social life — not just a number or blank.`
        : `Section V does not describe the current symptoms in enough detail. The doctor needs to know what the client is experiencing right now, not just that a condition exists.`,
      severity: 'moderate',
      guidance: `For each condition, describe the current symptoms: what they feel like, how often they occur, what makes them worse, and what they prevent the client from doing. Do not just name the condition — describe the actual experience. Specifically for the conditions listed above, replace the blank or number-only answers with real sentences.`,
      example: `Here is a draft for a blank functional impact section:

"This condition affects my work because [describe — I cannot sit for long periods, I have to take frequent breaks, I have called in sick multiple times]. Physical activity is [impossible / very limited / manageable only with rest afterward]. My sleep is affected because [I wake up in pain, I cannot get comfortable, I am mentally exhausted from managing the condition all day]. I find it difficult to concentrate because [the pain / anxiety / symptoms] is always present in the background. My family and social life have suffered because [I cancel plans, I am irritable, I isolate myself, I cannot participate in activities I used to enjoy]."`
    });
  } else passed.push('Section V — Current Symptoms');

  // -- Section VI: Mental Health History --
  // False-pass guard: "PTSD", "anxiety", "depression", "trauma", "mental" all appear in the
  // Section VI HEADER/INSTRUCTIONS ("Describe any history of: Anxiety, Depression, PTSD...").
  // We must scope the check to text AFTER the Section VI prompt, looking for client-typed content.
  const sectionVIIStart = text.search(/section\s*VII\b|SECTION VII\b/i);
  const sectionVIEnd = sectionVIIStart > sectionVIStart ? sectionVIIStart : sectionVIStart + 1500;
  const sectionVIText = sectionVIStart !== -1
    ? text.substring(sectionVIStart, sectionVIEnd)
    : '';
  // The Section VI prompt itself mentions all MH terms. A client answer would appear as a
  // substantive paragraph after those instructions. Require at least 40 typed words in that section.
  const sectionVIAnswerWords = (() => {
    const stripped = sectionVIText
      .replace(/describe any history[^\n]*/gi, '')
      .replace(/anxiety[^\n]*depression[^\n]*ptsd[^\n]*/gi, '')
      .replace(/onset.*origin[^\n]*/gi, '')
      .replace(/in.service stressors[^\n]*/gi, '')
      .replace(/post.service changes[^\n]*/gi, '')
      .replace(/functional impact[^\n]*/gi, '')
      .replace(/with specific descriptive inclusion[^\n]*/gi, '')
      .replace(/\u2022[^\n]*/g, '')  // strip all bullet lines (form prompts)
      .replace(/section\s*VI[^\n]*/gi, '')
      .replace(/section\s*VII[^\n]*/gi, '');
    return wordCount(stripped.trim());
  })();
  // Section VI requires substantive detail — not just any MH keyword mention.
  // Jordan's one sentence "The anxiety prohibits me from concerts" (25 words, has 'anxiety') was passing.
  // Require: enough words (40+) AND both a service/onset reference AND a current impact reference.
  const hasMHServiceRef = /\b(during service|active duty|deployed|deployment|in the marine|in the army|in the military|while serving|when i was in|in.service|combat|training|stressor|exposed|isis|threat|mission|watch|patrol|were there|was there)\b/i.test(sectionVIText);
  const hasMHCurrentImpact = /\b(currently|still|today|now|daily|every day|affect|impact|prevent|unable|cannot|relationship|work|sleep|isolat|avoid|function|struggle|difficult|hard time)\b/i.test(sectionVIText);
  // Require at least one specific event, stressor, or incident named
  const hasMHEventDetail = /\b(witness|saw|watch|killed|died|casualt|explosion|blast|IED|fired|incoming|crash|rollover|attack|ambush|assault|rape|MST|harassment|patrol|convoy|checkpoint|mission|incident|accident|happened|occurred|event|stressor|trauma|specific|what happened|the day|the time|one day|one night)\b/i.test(sectionVIText);
  const hasMHKeywords = sectionVIAnswerWords >= 40 && hasMHServiceRef && hasMHCurrentImpact && hasMHEventDetail &&
    /\b(ptsd|anxiety|depression|trauma|nightmare|flashback|hypervigilance|avoid|isolat|mood|anger|irritab|panic|counsel|therapy|MST|combat stress)\b/i.test(sectionVIText);
  if (!hasMHKeywords) {
    const mh_snip = findAnswer(text, /section\s*VI|mental health|psychiatric|trauma|PTSD/i);
    // Build targeted missing list
    const vi_missing: string[] = [];
    if (!hasMHServiceRef) vi_missing.push("a connection to your military service - when during or after service your symptoms started");
    if (!hasMHEventDetail) vi_missing.push("at least one specific event or stressor from service that contributed to your mental health - not just that you were deployed, but what happened and when");
    if (!hasMHCurrentImpact) vi_missing.push("how symptoms currently affect your daily life - sleep, work, relationships, avoidance behaviors");
    if (sectionVIAnswerWords < 40) vi_missing.push("more detail overall - this section needs a full paragraph, not a sentence or two");
    const vi_missingStr = vi_missing.length > 0 ? ` Missing: ${vi_missing.join("; ")}.` : "";
    const mh_note = (mh_snip && wordCount(mh_snip) > 4)
      ? `Section VI mentions mental health but does not go deep enough for the doctor to establish a nexus.${vi_missingStr}`
      : `Section VI appears to be blank or nearly blank. This section is required. The doctor needs to understand the mental health history, traumatic events from service, and the current effect on daily functioning.`;
    gaps.push({
      section: 'Section VI',
      field: 'Mental Health History and Trauma',
      issue: mh_note,
      severity: 'critical',
      guidance: `Describe the mental health condition being claimed, at least one specific traumatic or high-stress event from service that contributed to it, and how the condition currently affects the client’s daily life. Cover at least: sleep and nightmares, ability to work and concentrate, relationships and social life, and any avoidance behaviors.`,
      example: `Here is a draft:

"I have been dealing with [PTSD / anxiety / depression / a combination of these] since [approximate timeframe — my time in ${locStr} / shortly after I separated / while I was still on active duty]. During my service I experienced [describe in your own words the specific events or patterns from your service that contributed to your mental health — what happened, when, and where]. These events continue to affect me today.

Currently my symptoms include [nightmares about specific events, difficulty sleeping, hypervigilance in public spaces, avoiding crowds and loud sounds, irritability and anger that affects my relationships, difficulty concentrating at work, isolating from friends and family]. I [am currently in therapy / have not sought treatment / have tried medication]. My mental health condition directly affects my ability to [work consistently, maintain relationships, leave the house comfortably, feel safe in normal daily environments]."

Be specific about what you experienced. The doctor’s job is to connect your service to your current condition. Give them the details to do that.`
    });
  } else passed.push('Section VI — Mental Health History');

  // -- Section VIII: Coexisting conditions interaction --
  // False-pass guard: "aggravate or worsen", "overlapping symptoms", "cumulative" appear in the
  // Section VIII BULLET PROMPTS ("Do any of your conditions aggravate or worsen another?").
  // We need the client to have actually typed answers, not just the prompt text to match.
  const sectionVIIIStart = text.search(/section\s*VIII\b|SECTION VIII\b/i);
  // Scope to ONLY Section VIII content — stop at Section IX to avoid counting Section IX answers
  const sectionIXStart = text.search(/section\s*IX\b|SECTION IX\b/i);
  const sectionVIIIEnd = sectionIXStart > sectionVIIIStart ? sectionIXStart : sectionVIIIStart + 1500;
  const sectionVIIIText = sectionVIIIStart !== -1
    ? text.substring(sectionVIIIStart, sectionVIIIEnd)
    : '';
  const sectionVIIIAnswerWords = (() => {
    // Strip ALL known prompt lines and bullet fragments — only client-typed sentences should remain
    const stripped = sectionVIIIText
      .replace(/section\s*VIII[^\n]*/gi, '')
      .replace(/provide the following explanations[^\n]*/gi, '')
      .replace(/do not speculate beyond[^\n]*/gi, '')
      .replace(/to your knowledge[^\n]*/gi, '')
      .replace(/do any of your conditions[^\n]*/gi, '')
      .replace(/mental.*medical.*physical[^\n]*/gi, '')
      .replace(/aggravate or worsen another condition[^\n]*/gi, '')
      .replace(/share overlapping symptoms[^\n]*/gi, '')
      .replace(/contribute to cumulative[^\n]*/gi, '')
      .replace(/if yes.*explain[^\n]*/gi, '')
      .replace(/\u2022[^\n]*/g, '')  // strip all bullet lines
      .replace(/document ref[^\n]*/gi, '');
    return wordCount(stripped.trim());
  })();
  // Keyword check must also exclude prompt text — strip bullets before checking
  const sectionVIIIAnswerOnly = sectionVIIIText
    .replace(/\u2022[^\n]*/g, '')
    .replace(/aggravate or worsen[^\n]*/gi, '')
    .replace(/contribute to cumulative[^\n]*/gi, '')
    .replace(/share overlapping[^\n]*/gi, '')
    .replace(/if yes.*explain[^\n]*/gi, '');
  const hasCoexisting = sectionVIIIAnswerWords >= 15 &&
    /\b(secondary|related to|caused by|result of|aggravated|worsened|linked|connection|because of|due to|stemming|compound|combination|makes.*worse|worse when|when.*flares?|affects? my|contributes? to|interact)\b/i.test(sectionVIIIAnswerOnly);
  if (!hasCoexisting) {
    gaps.push({
      section: 'Section VIII',
      field: 'Coexisting Condition Interaction',
      issue: `Section VIII does not describe how the claimed conditions interact with or affect each other. Most of these conditions are being filed as secondary conditions, which means the doctor needs to understand how they relate to each other and to the primary diagnosis.`,
      severity: 'moderate',
      guidance: `Describe how the conditions listed in this form affect each other. For example: how does PTSD worsen physical pain? How does chronic pain affect mental health? How do sleep disruptions from one condition affect the severity of another? These connections support a secondary filing.`,
      example: `Here is a draft:

"My conditions do not exist in isolation — they compound each other. My [PTSD / anxiety] causes [poor sleep, hypervigilance, and chronic stress], which makes my [physical condition] significantly worse. When my mental health is in a bad cycle, my [pain / GI issues / headaches] flare up more severely and more frequently. Conversely, when my physical symptoms are at their worst, my mental state deteriorates because [I cannot work, I cannot exercise, I am in constant pain, which feeds depression and hopelessness]. These conditions reinforce each other in a cycle that is difficult to break without treating all of them together."

This section matters because it shows the doctor that these conditions are not isolated — they are part of a system. That supports filing them as connected or secondary claims.`
    });
  } else passed.push('Section VIII — Coexisting Condition Interaction');
}

// ─── EMAIL DRAFT ─────────────────────────────────────────────────────────────

export function generateEmailDraft(clientName: string, formType: string, gaps: QCGap[]): { subject: string; body: string } {
  const firstName = clientName.split(' ')[0];

  const subject = gaps.length <= 3
    ? `Your ${formType} Form — ${gaps.length} Update${gaps.length === 1 ? '' : 's'} Needed Before We Move Forward`
    : `Your ${formType} Form — A Few Sections Need More Detail`;

  let body = `Hey ${firstName},\n\nThank you for getting your ${formType} form submitted. We went through it carefully and you are making great progress. Before we can move this forward to your medical review, we need you to go back and add more detail to a few sections. Your team will be sending the form back to you so you can update it and resubmit.\n\nFor each section below, we have included a draft of what you can write. These are starting points — update them with your actual experience and words. The doctor needs your story, not a template.\n\nHere is exactly what needs to be updated:\n\n`;

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    body += `${i + 1}. ${gap.section} — ${gap.field}\n\n`;
    body += `${gap.issue}\n\n`;
    if (gap.guidance) {
      body += `What to add: ${gap.guidance}\n\n`;
    }
    if (gap.example) {
      body += `--- Draft you can use ---\n${gap.example}\n--- End of draft ---\n\n`;
    }
    body += `─────────────────────────────────────────\n\n`;
  }

  body += `Once you have updated ${gaps.length === 1 ? 'this section' : 'these sections'} and resubmitted, we will review it right away and move you on to the next step.\n\nWe've got you.\n\nThe Semper Solutus Team`;

  return { subject, body };
}

// ─── COMBINED EMAIL DRAFT (all forms, one email) ─────────────────────────────

export function generateCombinedEmailDraft(
  clientName: string,
  forms: { formType: string; gaps: QCGap[] }[]
): { subject: string; body: string } {
  const firstName = clientName.split(' ')[0];

  // Only include forms that actually failed
  // Sort: RFI first, Mental Health second, then remaining forms in original order
  const formOrder = ['RFI', 'Mental Health', 'MSK', 'GI', 'Headaches'];
  const failedForms = forms
    .filter(f => f.gaps.length > 0)
    .sort((a, b) => {
      const ai = formOrder.indexOf(a.formType);
      const bi = formOrder.indexOf(b.formType);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  const totalGaps = failedForms.reduce((sum, f) => sum + f.gaps.length, 0);
  const formNames = failedForms.map(f => f.formType).join(', ');

  const subject = failedForms.length === 1
    ? `Your ${failedForms[0].formType} Form — ${totalGaps} Update${totalGaps === 1 ? '' : 's'} Needed Before We Move Forward`
    : `Your Screening Forms — A Few Sections Need More Detail`;

  let body = `Hey ${firstName},\n\nThank you for getting your screening forms submitted. We went through them carefully and you are making great progress. Before we can move this forward to your medical review, we need you to go back and add more detail to a few sections across your forms. Your team will be sending each form back to you so you can update and resubmit.\n\nFor each section below, we have included a draft of what you can write. These are starting points — update them with your actual experience and words. The doctor needs your story, not a template.\n\nHere is exactly what needs to be updated:\n\n`;

  let itemNumber = 1;

  for (const form of failedForms) {
    body += `${'═'.repeat(45)}\n`;
    body += `${form.formType.toUpperCase()} FORM\n`;
    body += `${'═'.repeat(45)}\n\n`;

    for (const gap of form.gaps) {
      body += `${itemNumber}. ${gap.section} — ${gap.field}\n\n`;
      body += `${gap.issue}\n\n`;
      if (gap.guidance) {
        body += `What to add: ${gap.guidance}\n\n`;
      }
      if (gap.example) {
        body += `--- Draft you can use ---\n${gap.example}\n--- End of draft ---\n\n`;
      }
      body += `─────────────────────────────────────────\n\n`;
      itemNumber++;
    }
  }

  body += `Once you have updated ${totalGaps === 1 ? 'this section' : 'these sections'} and resubmitted the forms, we will review them right away and move you on to the next step.\n\nWe've got you.\n\nThe Semper Solutus Team`;

  return { subject, body };
}
