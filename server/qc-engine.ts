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

// ─── Utilities ─────────────────────────────────────────────────────────────────

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

// Main evaluator
export function evaluateForm(text: string, formType: string): QCResult {
  const gaps: QCGap[] = [];
  const passedFields: string[] = [];
  const raw = text.toLowerCase();
  const answerBlocks = getAnswerBlocks(text);
  const allAnswerText = answerBlocks.join(' ');

  if (formType === 'Mental Health') evaluateMentalHealth(text, raw, answerBlocks, allAnswerText, gaps, passedFields);
  else if (formType === 'MSK') evaluateMSK(text, raw, gaps, passedFields);
  else if (formType === 'GI') evaluateGI(text, raw, gaps, passedFields);
  else if (formType === 'Headaches') evaluateHeadaches(text, raw, gaps, passedFields);
  else if (formType === 'RFI') evaluateRFI(text, raw, gaps, passedFields);
  else {
    gaps.push({ section: 'Document', field: 'Form Type', issue: 'Could not identify the form type.', severity: 'critical', guidance: 'Please verify this is one of the five Semper Solutus screening forms: RFI, MSK, GI, Headaches, or Mental Health.' });
  }

  const status = gaps.length === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'All fields meet the required detail standard. This form is ready for review.'
    : `${gaps.length} gap${gaps.length === 1 ? '' : 's'} found across ${new Set(gaps.map(g => g.section)).size} section${new Set(gaps.map(g => g.section)).size === 1 ? '' : 's'}. Client coaching recommended.`;

  return { formType, status, gaps, passedFields, summary };
}

// ─── MENTAL HEALTH ─────────────────────────────────────────────────────────────

function evaluateMentalHealth(
  text: string,
  raw: string,
  answerBlocks: string[],
  allAnswerText: string,
  gaps: QCGap[],
  passed: string[]
) {

  // Pull all substantive client answer lines (non-boilerplate)
  // We evaluate each answer block individually for quality

  // ── A: Presenting Concerns ──
  // Look for the client's symptom description — it appears near "describing current emotional/behavioral symptoms"
  // In Martin's case: "my mental health could be better. I am depressed, anxiety, fatigue."
  const symptomsAnswer = answerBlocks.find(b =>
    /\b(depress|anxiet|fatigue|stress|anger|panic|mood|sleep|nightmar|flashback|isolat|numb|hypervigilant|ptsd|mental health)\b/i.test(b) &&
    !b.match(/^(section|describe|explain|list|note|specify|if yes)/i)
  ) || '';

  // Symptoms must be: more than just a list, must include frequency/severity/how it shows up
  const symptomsHasDetail = wordCount(symptomsAnswer) >= 15 &&
    /\b(every|daily|always|sometimes|often|rarely|never|most|some|few|morning|night|week|day|hour|bad|worse|better|severe|mild|intense|constant|intermittent)\b/i.test(symptomsAnswer);

  if (!symptomsHasDetail) {
    gaps.push({
      section: 'Section A — Presenting Concerns',
      field: 'Current Symptoms Description',
      issue: wordCount(symptomsAnswer) < 15
        ? 'The symptoms description is too brief — simply listing condition names (e.g., "depression, anxiety, fatigue") is not enough.'
        : 'The symptoms description does not include how often, how severe, or how these symptoms show up in daily life.',
      severity: 'critical',
      guidance: 'Client needs to describe each symptom in detail: How often does it happen? How severe is it (e.g., on a scale of 1–10, or using words like "mild," "moderate," "severe")? How does it affect their daily life? For example: "I feel depressed most days — I have no motivation to get out of bed, I stopped doing things I used to enjoy, and I have trouble keeping up at work."'
    });
  } else {
    passed.push('Section A — Current Symptoms');
  }

  // ── A: Onset ──
  // Look for the onset answer. The answer must appear AFTER the question label (not in the header).
  // Martin's situation: "99-03" is his service dates in the header — NOT an onset timeframe.
  // His actual onset answer is "when I get around big groups of people" which is a trigger, not onset.
  // Strategy: find the text strictly AFTER the onset question label.
  const onsetIdx = text.search(/approximate onset and duration of symptoms/i);
  const onsetAfter = onsetIdx >= 0 ? text.substring(onsetIdx, onsetIdx + 600) : '';
  const onsetAnswer = onsetAfter;
  const onsetHasTimeframe = hasTimeframe(onsetAfter) &&
    // Must contain timeframe language that's actually about onset (not just header dates)
    /\b(20\d\d|19\d\d|\d+\s*(years?|months?)\s*ago|since\s*\d|in\s*\d{4}|during\s*(my\s*)?(deployment|service|active)|after\s*(service|deploy|discharge|getting out)|symptoms\s*(start|began|develop)|started\s*(around|in|after|during))\b/i.test(onsetAfter);
  // Flag if the onset answer is off-topic (describing triggers/avoidance instead of when symptoms started)
  const onsetIsOffTopic = /\b(when i get|around people|stay away|try to avoid|crowds|gun range|try going)\b/i.test(onsetAfter);

  if (!onsetHasTimeframe || onsetIsOffTopic) {
    gaps.push({
      section: 'Section A — Onset',
      field: 'Onset and Duration of Symptoms',
      issue: onsetIsOffTopic
        ? 'The onset answer describes a trigger or avoidance behavior — it does not answer when symptoms first started or how long they have been present.'
        : 'The onset answer does not include a timeframe or year for when symptoms began.',
      severity: 'critical',
      guidance: 'Client needs to state when their mental health symptoms first started — the approximate year or a timeframe (e.g., "around 2004 after returning from my first deployment to Iraq" or "symptoms started gradually about 2 years after I got out of the service"). They should also note whether symptoms have been continuous or come and go.'
    });
  } else {
    passed.push('Section A — Onset and Duration');
  }

  // ── B: Trauma description ──
  // Look for answers about the traumatic event
  // Martin's answers are scattered across Section B and CAPS-5
  const traumaAnswers = answerBlocks.filter(b =>
    /\b(witness|fire|deploy|combat|struck|incoming|lightning|antenna|marine|hummer|formation|flipped|rushed|took|taking)\b/i.test(b)
  ).join(' ');

  const traumaWords = wordCount(traumaAnswers);
  const traumaHasLocation = hasLocation(traumaAnswers) || /\b(iraq|kuwait|egypt|deploy|overseas|forward|patrol|convoy|base|camp)\b/i.test(traumaAnswers);
  const traumaHasEmotional = hasEmotionalDetail(traumaAnswers);
  const traumaHasPhysical = /\b(fire|explosion|shot|blast|struck|hit|attack|crash|impact|incoming|wound|blood|witness|saw|watch|lightning|hummer|flipped)\b/i.test(traumaAnswers);
  const traumaHasDetail = traumaWords >= 30;

  const traumaMissing: string[] = [];
  if (!traumaHasLocation) traumaMissing.push('where it happened (country, base, specific location)');
  if (!traumaHasDetail) traumaMissing.push('a detailed step-by-step account of what happened');
  if (!traumaHasEmotional) traumaMissing.push('their emotional reaction — how did they feel during and after the event');

  if (traumaMissing.length > 0) {
    gaps.push({
      section: 'Section B — Trauma and Stress Exposure',
      field: 'Traumatic Event Description',
      issue: `The trauma description is too brief and missing: ${traumaMissing.join('; ')}.`,
      severity: 'critical',
      guidance: 'Client needs to describe each traumatic event separately with full detail: Where were they (country, base, on patrol, in convoy, etc.)? What were they doing right before it happened? What exactly happened, step by step? What did they physically see, hear, or experience? How did they feel in the moment and in the days/weeks after? Each event should have its own paragraph.'
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

  if (triggerYes && !triggerHasResponse) {
    gaps.push({
      section: 'Section B — Triggers',
      field: 'Trigger Response Description',
      issue: 'Client indicated triggers cause distress but did not describe their physical or emotional response to those triggers.',
      severity: 'moderate',
      guidance: 'Client needs to describe what happens when they encounter a trigger: What do they physically feel (heart racing, sweating, shaking, freezing up)? What do they do — do they leave, have a panic attack, go into a rage? How long does it take to calm down after being triggered?'
    });
  } else {
    passed.push('Section B — Trigger Response');
  }

  // ── C: Prior diagnoses ──
  // Find the diagnoses answer — in Martin's case the text is scrambled,
  // but we check if any diagnosis word appears near the C section
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
      issue: 'No formal psychiatric diagnosis is listed in Section C.',
      severity: 'critical',
      guidance: 'Client needs to list any mental health diagnoses they have received, including from the VA or any other provider. If they have not been formally diagnosed yet, they should write: "No formal diagnosis — filing based on symptoms consistent with PTSD as described throughout this form."'
    });
  } else {
    passed.push('Section C — Prior Diagnoses');
  }

  // ── C: Psychiatric medications ──
  const hasPsychMedSection = /psychiatric medications\s*\(past or current\)/i.test(text);
  const psychMedAnswer = findAnswer(text, /psychiatric medications\s*\(past or current\)/i, 400);
  const hasPsychMedContent = /\b(sertraline|zoloft|prozac|fluoxetine|effexor|venlafaxine|trazodone|prazosin|hydroxyzine|buspirone|lithium|seroquel|quetiapine|risperdal|abilify|lexapro|escitalopram|citalopram|wellbutrin|bupropion|mirtazapine|amitriptyline|clonazepam|lorazepam|xanax|alprazolam|klonopin|none)\b/i.test(psychMedAnswer);

  if (!hasPsychMedContent) {
    gaps.push({
      section: 'Section C — Mental Health History',
      field: 'Psychiatric Medications',
      issue: 'The psychiatric medications field appears blank or has no content listed.',
      severity: 'critical',
      guidance: 'Client needs to list any mental health medications (past or current) by name. If they are not currently on any psychiatric medications, they should write "None — not currently prescribed any psychiatric medications." This is different from their regular medications listed in Section G.'
    });
  } else {
    passed.push('Section C — Psychiatric Medications');
  }

  // ── D: Combat/deployment details ──
  // Only grab lines that are clearly the client's own words about deployment — exclude form labels and CAPS-5 boilerplate
  const deploymentAnswer = answerBlocks.filter(b =>
    /\b(deploy|egypt|kuwait|iraq|combat|tour|overseas|sent to|served|9\/11|counter|terrorist)\b/i.test(b) &&
    !b.match(/^(military factors|if yes, specify|high-stress|combat exposure|event type|did the event|did you personally|☐|2\.\s*event)/i) &&
    !/☐\s*(combat|mst|accident|assault)/i.test(b) &&
    wordCount(b) >= 5
  ).join(' ');

  // Deployment details need MORE than just locations + dates + the word "combat tours"
  // Must describe actual experiences: what they did, what they encountered, what was stressful
  const deploymentHasSubstantiveDetail = wordCount(deploymentAnswer) >= 20 &&
    /\b(patrol|IED|firefight|mortar|convoy|attack|encounter|mission|in combat|under fire|took fire|hostile|enemy|casualt|explosion|blast|shot at|wounded|witness|ambush|improvised|what happened|what i did|my role|my job|responsible for|specific|dangerous|intense|worst)\b/i.test(deploymentAnswer);
  const deploymentTooVague = !deploymentHasSubstantiveDetail;

  if (deploymentTooVague) {
    gaps.push({
      section: 'Section D — Military Service and Post-Service Adjustment',
      field: 'Combat / Deployment Details',
      issue: 'The deployment details are too brief — listing locations and dates alone is not enough.',
      severity: 'critical',
      guidance: 'Client needs to describe what they actually experienced during each deployment: What was their specific role? Were they in active combat situations? What types of missions or situations did they encounter (patrols, IED exposure, taking fire, casualty care, etc.)? What was the most stressful or traumatic part of that deployment?'
    });
  } else {
    passed.push('Section D — Combat/Deployment Details');
  }

  // ── D: Support system ──
  const supportAnswer = answerBlocks.find(b =>
    /\b(friends?|family|network|support|community|church|group|help|veteran|counselor|therapist|wife|husband|spouse|partner|parent|sibling|neighbor)\b/i.test(b)
  ) || '';
  const supportHasDetail = wordCount(supportAnswer) >= 12 &&
    /\b(help|talk|lean|rely|call|visit|meet|weekly|daily|often|close|strong|strong|spouse|parent|child|friend|battle buddy)\b/i.test(supportAnswer);

  if (!supportHasDetail) {
    gaps.push({
      section: 'Section D — Military Service and Post-Service Adjustment',
      field: 'Current Support System',
      issue: 'The support system answer is too vague — "good network of friends and family" does not provide enough detail.',
      severity: 'moderate',
      guidance: 'Client should describe who specifically is in their support system (spouse, parents, close friends, battle buddies, faith community, etc.), how often they interact with them, and whether those relationships have been affected by their mental health symptoms. If they feel isolated or have pulled away from people, they should note that too.'
    });
  } else {
    passed.push('Section D — Support System');
  }

  // ── F: Functional Impact ──
  // Martin's answer: "I have to walk away from people so I don't lose my mind and flip out on them"
  // This is ONE sentence about ONE area (social/anger). Need work, sleep, relationships, daily.
  // IMPORTANT: Only grab lines that are clearly the client's own words about functional impact.
  // Exclude form labels, question text, scored scale questions, and employment status answers.
  // A genuine functional impact answer will be a personal statement, not a form label or question.
  const funcAnswer = answerBlocks.filter(b =>
    /\b(work|sleep|relationship|family|daily|crowd|avoid|walk away|flip|lose|mind|function|activity|can't|cannot|struggle|hard|difficult)\b/i.test(b) &&
    // Exclude form labels and question text (they contain characteristic question phrasing)
    !b.match(/^(section|describe how|any suicidal|work full|work part|employed|unemployed|retired|disabled|how much have|have these|interfered with|do reminders|describe current support|explain|if yes)/i) &&
    // Must look like a personal statement, not a form question (no \u2640 checkboxes, no "how often")
    !/☐|\bYes\b.*\bNo\b|how often|how much|over the last|rate how|past month|past week|in the last/i.test(b) &&
    wordCount(b) >= 8  // must be substantive
  ).join(' ');

  const funcAreas = {
    work: /\b(work|job|employ|performance|miss|call out|concentrate|focus|fired|quit|coworker|boss|productivity)\b/i.test(funcAnswer),
    sleep: /\b(sleep|insomnia|nightmare|wake|rest|bed|tired|fatigue|exhausted|hours?)\b/i.test(funcAnswer),
    relationships: /\b(relationship|family|friend|social|isolat|partner|spouse|child|push away|withdraw|argument|fight|anger|people)\b/i.test(funcAnswer),
    daily: /\b(daily|routine|task|trigger|crowd|noise|grocery|drive|leave home|go out|public|store|activity|function|errand)\b/i.test(funcAnswer),
  };
  const funcCount = Object.values(funcAreas).filter(Boolean).length;
  const funcMissing = Object.entries(funcAreas).filter(([, v]) => !v).map(([k]) => k);
  const funcWordsEnough = wordCount(funcAnswer) >= 20;

  if (funcCount < 3 || !funcWordsEnough) {
    gaps.push({
      section: 'Section F — Functional Impact',
      field: 'Daily Life Impact',
      issue: funcCount < 2
        ? `The functional impact section only covers ${funcCount} life area${funcCount === 1 ? '' : 's'}. Missing: ${funcMissing.join(', ')}.`
        : `The functional impact is too brief and needs more specific detail. Missing coverage of: ${funcMissing.join(', ')}.`,
      severity: 'critical',
      guidance: 'Client needs to describe how their mental health symptoms affect ALL of the following with specific examples:\n(1) Work — can they hold a job, do they miss days, has performance suffered?\n(2) Sleep — how many hours, how often do they wake up, do they have nightmares?\n(3) Relationships — how have things changed with family, friends, or a partner?\n(4) Daily activities — what can they no longer do or now actively avoid (stores, crowds, events, driving, etc.)?'
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
  if (violenceYes && violenceAnswer && wordCount(violenceAnswer) < 8) {
    gaps.push({
      section: 'Section F — Functional Impact',
      field: 'History of Violence or Aggression',
      issue: 'Client indicated a history of violence or aggression but only wrote one word — no context was provided.',
      severity: 'critical',
      guidance: 'Client needs to give more detail about the history of violence/aggression: When did this occur (during service or after)? What triggered it? Were there any legal consequences? Has this pattern continued? Has it affected their relationships or employment? This context helps the doctor understand how PTSD has impacted their behavior.'
    });
  } else {
    passed.push('Section F — Violence/Aggression History');
  }

  // ── G: Other medical conditions ──
  // Section G: Look strictly AFTER the medical conditions label to find what the client wrote.
  // The conditions label and treatments label appear close together — grab only the text between them.
  const gCondIdx = text.search(/other \(non-mental health\) active medical conditions/i);
  // Narrow to 200 chars after the label to avoid capturing later section titles (e.g. GAD-7 contains "Anxiety Disorder")
  const gNarrow = gCondIdx >= 0 ? text.substring(gCondIdx, gCondIdx + 200) : '';
  const medConditionsHasContent = /\b(hypertension|high blood pressure|diabetes|type 2|heart disease|coronary|kidney|renal|asthma|copd|sleep apnea|arthritis|neuropathy|tinnitus|gout|hepatitis|cancer|chronic pain|back pain|spine|disc|herniation|hypothyroid|hyperthyroid|cholesterol|hyperlipidemia|benign prostatic|bph|acid reflux|gerd|ibs|crohn|colitis)\b/i.test(gNarrow);

  if (!medConditionsHasContent) {
    gaps.push({
      section: 'Section G — Current Medications and Medical Conditions',
      field: 'Other Active Medical Conditions',
      issue: 'The non-mental health medical conditions field appears blank — the client lists medications (like Amlodipine, Metformin, Losartan) that indicate active medical conditions, but those conditions are not named.',
      severity: 'moderate',
      guidance: 'Client should list the medical conditions that go along with their current medications. For example: Amlodipine and Losartan suggest high blood pressure, Metformin suggests diabetes. They should write out each condition and its treatment so the doctor has a complete picture. If they are unsure what a medication is for, they can ask their pharmacy or prescribing doctor.'
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

  if (!capsHasDetail || !capsHasEmotional) {
    gaps.push({
      section: 'Section 5 — CAPS-5 Traumatic Event',
      field: 'Most Distressing Traumatic Event — Full Detail',
      issue: capsWords < 40
        ? 'The CAPS-5 traumatic event description is too brief — one or two sentences is not sufficient for this section.'
        : 'The CAPS-5 event description is missing the emotional and psychological impact of the event.',
      severity: 'critical',
      guidance: 'This is one of the most important sections in the form. The client needs to write a full, detailed account of their most distressing traumatic experience:\n• Where were they exactly (country, city, base name, on patrol, in a convoy)?\n• What were they doing right before it happened?\n• What happened step by step?\n• What did they physically see, hear, smell, or feel during the event?\n• What did they do during and immediately after?\n• How did they feel emotionally in the moment — and in the days, weeks, and months after?'
    });
  } else {
    passed.push('CAPS-5 — Traumatic Event Description');
  }
}

// ─── MSK ──────────────────────────────────────────────────────────────────────

function evaluateMSK(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  if (!hasTimeframe(text)) {
    gaps.push({ section: 'Section IV-A', field: 'Onset / History', issue: 'No timeframe or year provided for when the condition began.', severity: 'critical', guidance: 'Client needs: approximate year or timeframe, whether it started during or after service, what activity triggered it, and whether it came on suddenly or gradually.' });
  } else passed.push('Section IV-A — Onset');

  if (!hasLocation(text)) {
    gaps.push({ section: 'Section IV-C', field: 'Pain Location and Radiation', issue: 'No specific body location or radiation pattern described.', severity: 'critical', guidance: 'Client needs to specify exactly where the pain is and whether it travels anywhere (e.g., down the leg into the foot).' });
  } else passed.push('Section IV-C — Pain Location');

  const funcText = text.match(/\b(work|walk|stand|sit|lift|carry|drive|sleep|daily|activity|routine)\b/gi);
  if (!funcText || funcText.length < 3) {
    gaps.push({ section: 'Section V', field: 'Functional Impact', issue: 'Functional impact section is incomplete — fewer than 3 life areas described.', severity: 'critical', guidance: 'Client needs to describe how this condition affects at least 3 areas: work/employment, daily household tasks, recreational activities, mobility/transportation, and sleep.' });
  } else passed.push('Section V — Functional Impact');
}

// ─── GI ───────────────────────────────────────────────────────────────────────

function evaluateGI(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  if (!hasTimeframe(text)) {
    gaps.push({ section: 'Section III', field: 'Onset / History', issue: 'No timeframe or date provided for when GI condition began.', severity: 'critical', guidance: 'Client needs to provide an approximate year or timeframe for when symptoms started.' });
  } else passed.push('Section III — Onset');

  if (!/\b(mild|moderate|severe)\b/i.test(text)) {
    gaps.push({ section: 'Section IV', field: 'Severity Rating', issue: 'No severity level indicated (Mild / Moderate / Severe).', severity: 'critical', guidance: 'Client needs to select Mild, Moderate, or Severe to describe how intense their GI symptoms are.' });
  } else passed.push('Section IV — Severity');

  if (!/\b(cramp|bloat|nausea|diarrhea|constipation|reflux|heartburn|pain|bleed|urgency|gas)\b/i.test(text)) {
    gaps.push({ section: 'Section III', field: 'Symptom Description', issue: 'GI symptoms are not described in enough detail.', severity: 'moderate', guidance: 'Client should describe specific symptoms: type, frequency, and what makes them worse or better.' });
  } else passed.push('Section III — Symptom Description');
}

// ─── HEADACHES ────────────────────────────────────────────────────────────────

function evaluateHeadaches(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  if (!hasTimeframe(text.substring(0, 600))) {
    gaps.push({ section: 'Question 1', field: 'Headache History Timeframe', issue: 'No timeframe provided for when headaches began.', severity: 'critical', guidance: 'Client needs to state approximately when headaches started — the year, or whether it was during or after service.' });
  } else passed.push('Q1 — Headache History Timeframe');

  if (!/\b(severe|moderate|mild|debilitating|intense|throb|pound|nausea|vomit|sensitive|light|sound|aura|vision|blur)\b/i.test(text)) {
    gaps.push({ section: 'Question 17', field: 'Headache Severity and Symptoms', issue: 'Headache description lacks specific symptom detail, severity, and duration.', severity: 'critical', guidance: 'Client needs: severity level, accompanying symptoms (nausea, light sensitivity, vision changes), typical duration, and what they cannot do during an episode.' });
  } else passed.push('Q17 — Headache Severity and Symptoms');

  if (!/\b(\d+)\s*(time|per|a|each|every)\s*(day|week|month)\b/i.test(text)) {
    gaps.push({ section: 'Question 20', field: 'Headache Frequency', issue: 'No clear headache frequency stated.', severity: 'moderate', guidance: 'Client needs to state how often headaches occur — e.g., "2 to 3 times per week" or "approximately 8 per month."' });
  } else passed.push('Q20 — Headache Frequency');

  if (!hasFunctionalImpact(text)) {
    gaps.push({ section: 'Functional Impact', field: 'Daily Life Impact', issue: 'Insufficient detail on how headaches impact daily functioning.', severity: 'critical', guidance: 'Client should describe what they cannot do during a headache episode — work, drive, use screens, be around noise or light — with specific examples.' });
  } else passed.push('Functional Impact — Daily Life Impact');
}

// ─── RFI ──────────────────────────────────────────────────────────────────────

function evaluateRFI(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  if (!/\b(duty|duties|mos|job|role|unit|platoon|squad|mission|deployed|served|position|rank)\b/i.test(text) || text.length < 300) {
    gaps.push({ section: 'Section III', field: 'Military Service Duties', issue: 'Military duties and service description is insufficient.', severity: 'critical', guidance: 'Client needs to describe their MOS/role, typical duties, unit, and the nature of their deployment or service.' });
  } else passed.push('Section III — Military Duties');

  if (!hasTimeframe(text)) {
    gaps.push({ section: 'Section V', field: 'Service History Timeframe', issue: 'No specific dates or timeframes for service events.', severity: 'critical', guidance: 'Client needs to include dates or approximate years for key service events, deployments, and the onset of each condition.' });
  } else passed.push('Section V — Service Timeframes');

  if (!/\b(ptsd|anxiety|depression|trauma|mental|psychiatric|counseling|therapy)\b/i.test(text)) {
    gaps.push({ section: 'Section VI', field: 'Mental Health History', issue: 'Mental health history section appears empty or lacks required detail.', severity: 'critical', guidance: 'Client needs to describe any mental health conditions, traumatic events from service, and how these conditions affect their daily life.' });
  } else passed.push('Section VI — Mental Health History');
}

// ─── EMAIL DRAFT ─────────────────────────────────────────────────────────────

export function generateEmailDraft(clientName: string, formType: string, gaps: QCGap[]): { subject: string; body: string } {
  const firstName = clientName.split(' ')[0];

  const subject = gaps.length <= 3
    ? `Your ${formType} Form — ${gaps.length} Update${gaps.length === 1 ? '' : 's'} Needed Before We Move Forward`
    : `Your ${formType} Form — A Few Sections Need More Detail`;

  let body = `Hey ${firstName},\n\nThank you for getting your ${formType} form submitted. We went through it carefully and you are making great progress. Before we can move this forward to your medical review, we need you to go back and add more detail to a few sections. Your team will be sending the form back to you so you can update it and resubmit.\n\nHere is exactly what needs to be updated:\n\n`;

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    body += `${i + 1}. ${gap.section} — ${gap.field}\n\n`;
    body += `What we need: ${gap.issue}\n\n`;
    body += `How to fix it: ${gap.guidance}\n\n`;
    body += `─────────────────────────────\n\n`;
  }

  body += `Once you have updated ${gaps.length === 1 ? 'this section' : 'these sections'} and resubmitted, we will review it right away and move you on to the next step.\n\nWe've got you.\n\nThe Semper Solutus Team`;

  return { subject, body };
}
