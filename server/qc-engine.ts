// QC Engine — evaluates extracted PDF text against Semper Solutus QC standards

export interface QCGap {
  section: string;
  field: string;
  issue: string;
  severity: "critical" | "moderate";
  guidance: string;
}

export interface QCResult {
  formType: string;
  status: "pass" | "fail";
  gaps: QCGap[];
  passedFields: string[];
  summary: string;
}

// Narrative quality checks
function isVague(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length <= 2) return true;
  const vaguePhrases = [
    "it hurts", "been a while", "during service", "yes", "no", "n/a", "none",
    "sometimes", "often", "a lot", "very bad", "really bad", "hurts bad",
    "pain", "ache", "sore", "tired", "hard", "difficult"
  ];
  const lower = trimmed.toLowerCase();
  if (vaguePhrases.some(p => lower === p)) return true;
  if (trimmed.length < 20) return true;
  return false;
}

function hasTimeframe(text: string): boolean {
  if (!text) return false;
  return /\b(20\d\d|19\d\d|\d+ (years?|months?|weeks?) ago|since \d|in \d{4}|deployed|during (my )?(first|second|third|deployment|service)|before|after|when I was)\b/i.test(text);
}

function hasLocation(text: string): boolean {
  if (!text) return false;
  return /\b(iraq|afghanistan|kuwait|germany|korea|japan|base|camp|fob|post|fort|ship|deployed|overseas|stateside|back|neck|shoulder|knee|hip|ankle|wrist|elbow|foot|feet|lower|upper|lumbar|cervical|thoracic|left|right|bilateral)\b/i.test(text);
}

function hasSymptomDetail(text: string): boolean {
  if (!text) return false;
  return text.length > 30 && (
    /\b(pain|ache|burning|stabbing|throbbing|numbness|tingling|weakness|stiffness|swelling|pressure|cramping|nausea|diarrhea|constipation|headache|migraine|flashback|nightmare|anxiety|panic|depression|irritab)\b/i.test(text)
  );
}

function hasFunctionalImpact(text: string): boolean {
  if (!text) return false;
  return text.length > 40 && (
    /\b(work|job|sleep|relationship|family|daily|walk|stand|sit|drive|lift|concentrate|focus|social|hobby|exercise|shower|dress|cook|clean|shop|stairs|mile|block|hour|minute|day|week|month)\b/i.test(text)
  );
}

// Extract sections from raw PDF text
function extractSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // Try to capture labeled sections/questions
  const lines = text.split('\n');
  let currentKey = "";
  let currentVal: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match section headers like "Section I", "Q1", "Question 1", etc.
    const sectionMatch = trimmed.match(/^(Section\s+[IVX]+|Q\d+|Question\s+\d+|[A-Z]\.|[IVX]+\.)\s*[-–—:]?\s*(.*)$/i);
    if (sectionMatch) {
      if (currentKey) sections[currentKey] = currentVal.join(' ').trim();
      currentKey = sectionMatch[1].toUpperCase().replace(/\s+/g, '_');
      currentVal = sectionMatch[2] ? [sectionMatch[2]] : [];
    } else if (currentKey) {
      currentVal.push(trimmed);
    }
  }
  if (currentKey) sections[currentKey] = currentVal.join(' ').trim();

  // Also store the raw full text for pattern matching
  sections['__RAW__'] = text;
  return sections;
}

// Detect form type from text — ordered most-specific to least-specific
export function detectFormType(text: string): string {
  const lower = text.toLowerCase();
  // Check first 500 chars (title/header area) for strong signals
  const header = lower.substring(0, 800);
  if (header.includes('psychiatric screening') || header.includes('mental health evaluation') || header.includes('pre-evaluation psychiatric')) return 'Mental Health';
  if (header.includes('musculoskeletal') || header.includes('msk screening')) return 'MSK';
  if (header.includes('gastrointestinal') || header.includes('gi screening')) return 'GI';
  if (header.includes('headache screening') || header.includes('headaches screening')) return 'Headaches';
  if (header.includes('veteran medical history') || header.includes('onboarding rfi') || header.includes('request for information')) return 'RFI';
  // Broader search if header match fails
  if (lower.includes('psychiatric') || lower.includes('ptsd') && lower.includes('section') && lower.includes('mental')) return 'Mental Health';
  if (lower.includes('musculoskeletal')) return 'MSK';
  if (lower.includes('gastrointestinal')) return 'GI';
  if (lower.includes('headache screening')) return 'Headaches';
  if (lower.includes('veteran medical history') || lower.includes('rfi')) return 'RFI';
  // Score-based fallback
  const scores: Record<string, number> = { 'Mental Health': 0, 'MSK': 0, 'GI': 0, 'Headaches': 0, 'RFI': 0 };
  const keywords: Record<string, string[]> = {
    'Mental Health': ['psychiatric', 'ptsd', 'trauma', 'mental health', 'counseling', 'therapy', 'nightmares', 'flashback'],
    'MSK': ['musculoskeletal', 'joint', 'spine', 'lumbar', 'cervical', 'orthopedic'],
    'GI': ['gastrointestinal', 'bowel', 'ibs', 'gerd', 'reflux', 'diarrhea', 'constipation'],
    'Headaches': ['migraine', 'headache screening', 'q1.', 'q17', 'q20'],
    'RFI': ['military history', 'service record', 'mos', 'veteran medical history'],
  };
  for (const [type, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (lower.includes(word)) scores[type]++;
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 0) return best[0];
  return 'Unknown';
}

// Main QC evaluator
export function evaluateForm(text: string, formType: string): QCResult {
  const gaps: QCGap[] = [];
  const passedFields: string[] = [];

  const raw = text.toLowerCase();
  const sections = extractSections(text);

  if (formType === 'MSK') {
    evaluateMSK(text, raw, sections, gaps, passedFields);
  } else if (formType === 'GI') {
    evaluateGI(text, raw, sections, gaps, passedFields);
  } else if (formType === 'Headaches') {
    evaluateHeadaches(text, raw, sections, gaps, passedFields);
  } else if (formType === 'Mental Health') {
    evaluateMentalHealth(text, raw, sections, gaps, passedFields);
  } else if (formType === 'RFI') {
    evaluateRFI(text, raw, sections, gaps, passedFields);
  } else {
    gaps.push({
      section: 'Document',
      field: 'Form Type',
      issue: 'Could not identify the form type from this document.',
      severity: 'critical',
      guidance: 'Please verify this is one of the five Semper Solutus screening forms: RFI, MSK, GI, Headaches, or Mental Health.'
    });
  }

  const status = gaps.length === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'All fields meet the required detail standard. This form is ready for review.'
    : `${gaps.length} gap${gaps.length === 1 ? '' : 's'} found across ${new Set(gaps.map(g => g.section)).size} section${new Set(gaps.map(g => g.section)).size === 1 ? '' : 's'}. Client coaching recommended.`;

  return { formType, status, gaps, passedFields, summary };
}

function evaluateMSK(text: string, raw: string, sections: Record<string, string>, gaps: QCGap[], passed: string[]) {
  // Section III — explain fields
  if (raw.includes('section iii') || raw.includes('section 3')) {
    const hasExplain = raw.includes('explain') && text.length > 200;
    if (!hasExplain) {
      gaps.push({
        section: 'Section III',
        field: 'Condition Explanation',
        issue: 'No detailed explanation found for the checked conditions.',
        severity: 'critical',
        guidance: 'For each condition checked, the client needs to explain: where exactly the pain is, when it started, what activity caused or worsened it, and how it affects them today.'
      });
    } else {
      passed.push('Section III — Condition Explanation');
    }
  }

  // Section IV-A — Onset
  const onsetMatch = text.match(/onset|how did|when did|start|begin/i);
  if (onsetMatch) {
    const onsetText = text.substring(raw.indexOf('onset'), raw.indexOf('onset') + 300);
    if (!hasTimeframe(onsetText)) {
      gaps.push({
        section: 'Section IV-A',
        field: 'Onset / History',
        issue: 'No timeframe or year provided for when the condition began.',
        severity: 'critical',
        guidance: 'Client needs to include: the approximate year or timeframe, whether it started during or after service, what activity triggered it, and whether it came on suddenly or gradually.'
      });
    } else {
      passed.push('Section IV-A — Onset');
    }
  }

  // Section IV-C — Pain location
  if (!hasLocation(text)) {
    gaps.push({
      section: 'Section IV-C',
      field: 'Pain Location and Radiation',
      issue: 'No specific body location or radiation pattern described.',
      severity: 'critical',
      guidance: 'Client needs to specify exactly where the pain is (e.g., lower left back, right knee), and whether pain travels anywhere (e.g., down the leg, into the foot).'
    });
  } else {
    passed.push('Section IV-C — Pain Location');
  }

  // Section V — Functional impact
  const funcText = text.match(/function|daily|work|walk|stand|sit|lift|carry|drive/gi);
  if (!funcText || funcText.length < 3) {
    gaps.push({
      section: 'Section V',
      field: 'Functional Impact',
      issue: 'Functional impact section is incomplete — fewer than 3 life areas described.',
      severity: 'critical',
      guidance: 'Client needs to describe how this condition affects at least 3 areas: work/employment, daily household tasks, recreational activities, mobility/transportation, and sleep.'
    });
  } else {
    passed.push('Section V — Functional Impact');
  }
}

function evaluateGI(text: string, raw: string, sections: Record<string, string>, gaps: QCGap[], passed: string[]) {
  // Section III — Onset
  if (!hasTimeframe(text)) {
    gaps.push({
      section: 'Section III',
      field: 'Onset / History',
      issue: 'No timeframe or date provided for when the GI condition began.',
      severity: 'critical',
      guidance: 'Client needs to provide an approximate year or timeframe for when symptoms started — not just a description of the condition itself (e.g., "hemorrhoids" is not an onset date).'
    });
  } else {
    passed.push('Section III — Onset');
  }

  // Section IV — Severity
  const hasSeverity = /\b(mild|moderate|severe)\b/i.test(text);
  if (!hasSeverity) {
    gaps.push({
      section: 'Section IV',
      field: 'Severity Rating',
      issue: 'No severity level indicated (Mild / Moderate / Severe).',
      severity: 'critical',
      guidance: 'Client needs to select Mild, Moderate, or Severe to describe how intense their GI symptoms are.'
    });
  } else {
    passed.push('Section IV — Severity');
  }

  // Symptom description
  if (!hasSymptomDetail(text)) {
    gaps.push({
      section: 'Section III',
      field: 'Symptom Description',
      issue: 'GI symptoms are not described in enough detail.',
      severity: 'moderate',
      guidance: 'Client should describe specific symptoms: type (cramping, bloating, nausea, diarrhea, constipation, reflux), frequency, and what makes them worse or better.'
    });
  } else {
    passed.push('Section III — Symptom Description');
  }
}

function evaluateHeadaches(text: string, raw: string, sections: Record<string, string>, gaps: QCGap[], passed: string[]) {
  // Q1 — Timeframe
  const q1Text = text.substring(0, 500);
  if (!hasTimeframe(q1Text)) {
    gaps.push({
      section: 'Question 1',
      field: 'Headache History Timeframe',
      issue: 'No timeframe or approximate year provided for when headaches began.',
      severity: 'critical',
      guidance: 'Client needs to state approximately when headaches started — the year, or whether it was during or after service.'
    });
  } else {
    passed.push('Q1 — Headache History Timeframe');
  }

  // Q17 — Severity, symptoms, duration, impact
  const q17Idx = raw.indexOf('q17') !== -1 ? raw.indexOf('q17') : raw.indexOf('question 17');
  if (q17Idx !== -1) {
    const q17Text = text.substring(q17Idx, q17Idx + 500);
    const hasSeverityDetail = /\b(severe|moderate|mild|debilitating|intense|throbbing|pounding|nausea|vomiting|sensitivity|light|sound|aura|vision)\b/i.test(q17Text);
    if (!hasSeverityDetail) {
      gaps.push({
        section: 'Question 17',
        field: 'Headache Severity and Symptoms',
        issue: 'Headache description lacks specific symptom detail, severity, duration, and functional impact.',
        severity: 'critical',
        guidance: 'Client needs to describe: severity level, accompanying symptoms (nausea, light sensitivity, vision changes), typical duration of episodes, and what they cannot do during an episode.'
      });
    } else {
      passed.push('Q17 — Headache Severity and Symptoms');
    }
  }

  // Duration consistency check (Q14 vs Q15)
  const durationMatches = text.match(/\b(\d+)\s*(hour|minute|day)/gi);
  if (durationMatches && durationMatches.length >= 2) {
    passed.push('Duration — Multiple duration references found');
  }

  // Frequency (Q20)
  const hasFrequency = /\b(\d+)\s*(time|per|a|each|every)\s*(day|week|month)\b/i.test(text);
  if (!hasFrequency) {
    gaps.push({
      section: 'Question 20',
      field: 'Headache Frequency',
      issue: 'No clear headache frequency stated (how many per week or month).',
      severity: 'moderate',
      guidance: 'Client needs to state how often headaches occur — for example, "2 to 3 times per week" or "approximately 8 per month."'
    });
  } else {
    passed.push('Q20 — Headache Frequency');
  }

  // Functional impact
  if (!hasFunctionalImpact(text)) {
    gaps.push({
      section: 'Functional Impact',
      field: 'Daily Life Impact',
      issue: 'Insufficient detail on how headaches impact daily functioning.',
      severity: 'critical',
      guidance: 'Client should describe what they cannot do during a headache episode — work, drive, use screens, be around noise or light — with specific examples.'
    });
  } else {
    passed.push('Functional Impact — Daily Life Impact');
  }
}

function evaluateMentalHealth(text: string, raw: string, sections: Record<string, string>, gaps: QCGap[], passed: string[]) {
  // Section C — Diagnosis and Medications
  const hasDiagnosis = /\b(diagnosed|diagnosis|ptsd|depression|anxiety|bipolar|disorder)\b/i.test(text);
  const hasMedication = /\b(medication|prescri|prazosin|amitriptyline|tramadol|sumatriptan|sertraline|zoloft|prozac|effexor|trazodone|propranolol|rizatriptan)\b/i.test(text);

  const noneForDiag = /section\s*c[\s\S]{0,300}none/i.test(text) || /prior\s*diagnos[\s\S]{0,100}none/i.test(text);
  const noneForMeds = /medication[\s\S]{0,100}none/i.test(text) || /psychiatric\s*med[\s\S]{0,100}none/i.test(text);

  if (noneForDiag || !hasDiagnosis) {
    gaps.push({
      section: 'Section C',
      field: 'Prior Diagnoses',
      issue: '"None" listed for prior diagnoses — conflicts with conditions reported elsewhere in the file.',
      severity: 'critical',
      guidance: 'Client needs to list their actual diagnosis (e.g., PTSD) in this section. This field cannot read "None" if they have a service-connected mental health condition.'
    });
  } else {
    passed.push('Section C — Prior Diagnoses');
  }

  if (noneForMeds || !hasMedication) {
    gaps.push({
      section: 'Section C',
      field: 'Psychiatric Medications',
      issue: '"None" listed for medications — conflicts with medications reported on other forms.',
      severity: 'critical',
      guidance: 'Client needs to list all current medications with a brief note on what each is for (e.g., "Prazosin — for nightmares and sleep").'
    });
  } else {
    passed.push('Section C — Medications');
  }

  // Trauma detail
  const traumaIdx = raw.indexOf('trauma') !== -1 ? raw.indexOf('trauma') : raw.indexOf('incident');
  if (traumaIdx !== -1) {
    const traumaText = text.substring(traumaIdx, traumaIdx + 600);
    const hasWhere = hasLocation(traumaText);
    const hasWhat = traumaText.length > 80;
    const hasEmotional = /\b(fear|scared|shock|helpless|panic|nightmare|flashback|avoid|numb|angry|guilt|shame|hypervigilant|startle)\b/i.test(traumaText);

    if (!hasWhere || !hasWhat || !hasEmotional) {
      gaps.push({
        section: 'Trauma / Incident Detail',
        field: 'In-Service Traumatic Event',
        issue: 'Trauma description is missing key details: location, specific activity, physical detail, or emotional reaction.',
        severity: 'critical',
        guidance: 'Client needs to describe: where they were (base, country, unit activity), what they were doing, exactly what happened, what they physically experienced, and their emotional reaction at the time and afterward.'
      });
    } else {
      passed.push('Trauma Section — Incident Detail');
    }
  }

  // Section F — Functional Impact
  const funcAreas = {
    sleep: /\b(sleep|insomnia|nightmare|wake|rest|bed)\b/i.test(text),
    work: /\b(work|job|employ|miss|concentrate|focus|performance)\b/i.test(text),
    relationships: /\b(relationship|family|friend|social|isolat|partner|spouse|child|push away)\b/i.test(text),
    daily: /\b(daily|routine|task|function|trigger|avoid|crowd|noise|grocery|drive|leave home)\b/i.test(text)
  };

  const funcAreaCount = Object.values(funcAreas).filter(Boolean).length;
  if (funcAreaCount < 3) {
    const missing = Object.entries(funcAreas).filter(([, v]) => !v).map(([k]) => k);
    gaps.push({
      section: 'Section F',
      field: 'Functional Impact',
      issue: `Functional impact section is thin — only ${funcAreaCount} of 4 required life areas addressed. Missing: ${missing.join(', ')}.`,
      severity: 'critical',
      guidance: 'Client needs to describe how PTSD affects their daily life across all four areas: sleep quality and disturbances, work performance and attendance, relationships and social life, and daily functioning/triggers.'
    });
  } else {
    passed.push('Section F — Functional Impact (all areas covered)');
  }

  // Check for specific detail in functional impact
  if (!hasFunctionalImpact(text)) {
    gaps.push({
      section: 'Section F',
      field: 'Functional Impact Detail',
      issue: 'Functional impact answers lack specific numbers, examples, or frequency.',
      severity: 'moderate',
      guidance: 'Client should include real numbers (hours of sleep, days missed per month, times woken up) and specific examples rather than general statements.'
    });
  }
}

function evaluateRFI(text: string, raw: string, sections: Record<string, string>, gaps: QCGap[], passed: string[]) {
  // Section III — Military duties narrative
  const hasMilDuties = /\b(duty|duties|mos|job|role|unit|platoon|squad|mission|deployed|served|position|rank)\b/i.test(text);
  if (!hasMilDuties || text.length < 300) {
    gaps.push({
      section: 'Section III',
      field: 'Military Service Duties',
      issue: 'Military duties and service description is insufficient.',
      severity: 'critical',
      guidance: 'Client needs to describe their MOS/role, typical duties, unit, and the nature of their deployment or service in enough detail for a medical provider to understand their exposure and activities.'
    });
  } else {
    passed.push('Section III — Military Duties');
  }

  // Section V — Service history narrative
  if (!hasTimeframe(text)) {
    gaps.push({
      section: 'Section V',
      field: 'Service History Timeframe',
      issue: 'No specific dates or timeframes for service events.',
      severity: 'critical',
      guidance: 'Client needs to include dates or approximate years for key service events, deployments, and the onset of each condition.'
    });
  } else {
    passed.push('Section V — Service Timeframes');
  }

  // Section VI — Mental health history
  const hasMHContent = /\b(ptsd|anxiety|depression|trauma|mental|psychiatric|counseling|therapy)\b/i.test(text);
  if (!hasMHContent) {
    gaps.push({
      section: 'Section VI',
      field: 'Mental Health History',
      issue: 'Mental health history section appears empty or lacks required detail.',
      severity: 'critical',
      guidance: 'Client needs to describe any mental health conditions, traumatic events from service, and how these conditions affect their daily life.'
    });
  } else {
    passed.push('Section VI — Mental Health History');
  }

  // Environmental exposures
  if (!hasFunctionalImpact(text)) {
    gaps.push({
      section: 'Section III',
      field: 'Environmental Exposures',
      issue: 'Environmental exposures during service (burn pits, chemicals, toxins) are not addressed.',
      severity: 'moderate',
      guidance: 'Client should note any environmental exposures during service — burn pit exposure, chemicals, radiation, contaminated water — and where and when these occurred.'
    });
  } else {
    passed.push('Section III — Environmental Exposures');
  }
}

// Generate coaching email draft
export function generateEmailDraft(
  clientName: string,
  formType: string,
  gaps: QCGap[]
): { subject: string; body: string } {
  const firstName = clientName.split(' ')[0];
  const criticalGaps = gaps.filter(g => g.severity === 'critical');
  const allGaps = gaps;

  const subject = allGaps.length <= 3
    ? `Your ${formType} Form — ${allGaps.length} Quick Update${allGaps.length === 1 ? '' : 's'} Needed`
    : `Your Forms Are Looking Strong, ${firstName} — A Few Updates Needed`;

  let body = `Hey ${firstName},\n\nYour ${formType} form is looking good overall and we are almost ready to move forward. We just need you to add a few more details in the sections below before we can move you on to the next step. Your team at Semper Solutus will be sending the form back to you so you can update these sections. Once you have filled them in and resubmitted, we will review it right away.\n\n`;

  for (const gap of allGaps) {
    body += `**${formType} Form**\n\n`;
    body += `**${gap.section} — ${gap.field}**\n\n`;
    body += `${gap.issue}\n\n`;
    body += `${gap.guidance}\n\n`;
  }

  body += `That is it. Everything else is in great shape. Once you update ${allGaps.length === 1 ? 'this section' : 'these sections'} and resubmit, we will move you on to the next step.\n\nWe've got you.\n\nThe Semper Solutus Team`;

  return { subject, body };
}
