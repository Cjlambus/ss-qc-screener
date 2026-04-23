// QC Engine — evaluates extracted PDF text against Semper Solutus QC standards

export interface QCGap {
  section: string;
  field: string;
  issue: string;
  severity: "critical" | "moderate";
  guidance: string;
  example?: string;  // Drafted first-person example the client can copy and adapt
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

// Extract client context from the PDF for use in drafted examples
function extractClientContext(text: string) {
  const branch = /\b(usmc|marine corps|marines?|army|navy|air force|coast guard|national guard|reserves?)\b/i.exec(text)?.[0]?.toUpperCase() || 'the military';
  const mos = (() => {
    const m = /MOS[^:\n]{0,20}:\s*([^\n]{5,60})/i.exec(text);
    return m ? m[1].trim() : null;
  })();
  const locations: string[] = [];
  if (/\biraq\b/i.test(text)) locations.push('Iraq');
  if (/\bkuwait\b/i.test(text)) locations.push('Kuwait');
  if (/\begypt\b/i.test(text)) locations.push('Egypt');
  if (/\bafghanistan\b/i.test(text)) locations.push('Afghanistan');
  if (/\bkorea\b/i.test(text)) locations.push('Korea');
  if (/\bokinawa\b/i.test(text)) locations.push('Okinawa');
  if (/\bgermany\b/i.test(text)) locations.push('Germany');
  // Pull meds the client already listed (for Section G hint)
  const medMatch = /(?:Amlodipine|losartan|metformin|tadalafil|pantoprazole|furosemide|simvastatin|benzonatate|montelukast|tamsulosin|hydrochlorothiazide)/gi;
  const medsFound = text.match(medMatch) || [];
  const uniqueMeds = [...new Set(medsFound.map(m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()))];
  return { branch, mos, locations, meds: uniqueMeds };
}

function evaluateMentalHealth(
  text: string,
  raw: string,
  answerBlocks: string[],
  allAnswerText: string,
  gaps: QCGap[],
  passed: string[]
) {
  const ctx = extractClientContext(text);
  const locStr = ctx.locations.length > 0 ? ctx.locations.join(', ') : 'overseas';
  const firstLoc = ctx.locations[0] || 'overseas';
  const branch = ctx.branch;
  const mosStr = ctx.mos ? ctx.mos : 'their MOS';

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
      issue: `What was written — ${whatTheyWrote} — is a label, not a description. The doctor needs to understand how each symptom actually shows up in your life: how often, how severe, and what it stops you from doing.`,
      severity: 'critical',
      guidance: `For each symptom you listed, answer three questions: How often does it happen? How bad does it get? What does it stop you from doing? Do not just name the condition — walk the doctor through what it looks like on a typical day.`,
      example: `Here is a draft you can use and adjust in your own words:

"My depression hits most days. I wake up and have no motivation to do anything — not even basic things like getting out of bed or eating. I stopped doing things I used to enjoy. Some weeks I do not leave the house at all. My anxiety is constant. I am always on edge, expecting something bad to happen. I cannot sit still in public places and I avoid crowded areas entirely. My fatigue is not normal tiredness — even after a full night of sleep I wake up exhausted and feel like I am running on empty all day. ${mentionsAnger ? 'My anger comes out of nowhere. Small things set me off and I have to remove myself before I say or do something I will regret.' : ''}"

Update this with your own words and specifics — the doctor needs your real experience, not a general description.`
    });
  } else {
    passed.push('Section A — Current Symptoms');
  }

  // ── A: Onset ──
  const onsetIdx = text.search(/approximate onset and duration of symptoms/i);
  const onsetAfter = onsetIdx >= 0 ? text.substring(onsetIdx, onsetIdx + 600) : '';
  const onsetHasTimeframe = hasTimeframe(onsetAfter) &&
    /\b(20\d\d|19\d\d|\d+\s*(years?|months?)\s*ago|since\s*\d|in\s*\d{4}|during\s*(my\s*)?(deployment|service|active)|after\s*(service|deploy|discharge|getting out)|symptoms\s*(start|began|develop)|started\s*(around|in|after|during))\b/i.test(onsetAfter);
  const onsetIsOffTopic = /\b(when i get|around people|stay away|try to avoid|crowds|gun range|try going)\b/i.test(onsetAfter);
  // Try to pull what they actually wrote for the onset field
  const onsetWritten = answerBlocks.find(b =>
    /\b(when i get|around people|stay away|try to avoid|crowds|gun range|try going|since|started|began|after i|when i)\b/i.test(b) &&
    wordCount(b) >= 5
  ) || '';

  if (!onsetHasTimeframe || onsetIsOffTopic) {
    const onsetNote = onsetIsOffTopic
      ? `What was written — "${onsetWritten.trim()}" — describes a trigger situation, not when symptoms first started. This question is asking for a timeframe, not a trigger.`
      : `No timeframe was provided for when symptoms began.`;

    gaps.push({
      section: 'Section A — Onset',
      field: 'Onset and Duration of Symptoms',
      issue: onsetNote,
      severity: 'critical',
      guidance: `This field is asking: When did your mental health symptoms first start? It needs an approximate year or timeframe and should connect to your service or the period after. It should also note whether symptoms have been ongoing or come and go.`,
      example: `Here is a draft format to follow — fill in your actual years and details:

"My symptoms started around [year] — during / shortly after my deployment to ${firstLoc}. At first it was [describe what you first noticed, e.g., trouble sleeping, irritability, staying alert]. Over time it got worse. Since getting out of the service the symptoms have been [ongoing / getting worse / coming and going in waves]. It has been approximately [X] years since symptoms first started."

If symptoms started gradually over time, say that. If there was a specific event that triggered the start, mention it here. The goal is to give the doctor a clear timeline.`
    });
  } else {
    passed.push('Section A — Onset and Duration');
  }

  // ── B: Trauma description ──
  const traumaAnswers = answerBlocks.filter(b =>
    /\b(witness|fire|deploy|combat|struck|incoming|lightning|antenna|marine|hummer|formation|flipped|rushed|took|taking)\b/i.test(b)
  ).join(' ');

  const traumaWords = wordCount(traumaAnswers);
  const traumaHasLocation = hasLocation(traumaAnswers) || /\b(iraq|kuwait|egypt|deploy|overseas|forward|patrol|convoy|base|camp)\b/i.test(traumaAnswers);
  const traumaHasEmotional = hasEmotionalDetail(traumaAnswers);
  const traumaHasPhysical = /\b(fire|explosion|shot|blast|struck|hit|attack|crash|impact|incoming|wound|blood|witness|saw|watch|lightning|hummer|flipped)\b/i.test(traumaAnswers);
  const traumaHasDetail = traumaWords >= 30;

  // Identify which specific events they mentioned so we can tailor the example
  const mentionsLightning = /lightning|antenna|struck/i.test(traumaAnswers);
  const mentionsIncomingFire = /incoming fire|took fire|taking fire/i.test(traumaAnswers);
  const mentionsHummer = /hummer|flipped|formation/i.test(traumaAnswers);

  const traumaMissing: string[] = [];
  if (!traumaHasLocation) traumaMissing.push('the specific location where it happened');
  if (!traumaHasDetail) traumaMissing.push('a step-by-step account of what happened');
  if (!traumaHasEmotional) traumaMissing.push('your emotional and psychological reaction — how it felt in the moment and after');

  if (traumaMissing.length > 0) {
    // Build event-specific prompts based on what they mentioned
    const event1Note = mentionsLightning
      ? 'You mentioned witnessing a Marine get struck by lightning while taking down an antenna.'
      : mentionsHummer
      ? 'You mentioned a Humvee in the formation flipping over and rushing to help.'
      : 'You mentioned witnessing or being involved in a traumatic incident.';
    const event2Note = mentionsIncomingFire
      ? 'You also mentioned taking incoming fire during a deployment.'
      : '';

    gaps.push({
      section: 'Section B — Trauma and Stress Exposure',
      field: 'Traumatic Event Description',
      issue: `The events you described are mentioned but not explained. What is written is a sentence or two — the doctor needs a full account of each event including exactly where you were, what happened step by step, what you physically experienced, and how you felt. Missing: ${traumaMissing.join('; ')}.`,
      severity: 'critical',
      guidance: `Describe each traumatic event in its own paragraph. Cover all of these: Where were you (country, base, on patrol, in a convoy)? What were you doing right before it happened? What happened, step by step? What did you see, hear, smell, or physically feel? What did you do in the moment? How did you feel right after — and in the days and weeks that followed?`,
      example: `${event1Note} ${event2Note} Here is a draft structure — use your actual memory and words:

"Event 1: [${mentionsLightning ? 'The lightning strike' : 'The incident'}]
We were [stationed at / on patrol in / operating out of] [location, e.g., Iraq, Kuwait]. It was [day/night/approximate time]. I was [describe what you were doing — your position, your job at that moment]. Without warning, [describe exactly what happened — e.g., 'one of the Marines was ordered to take down a radio antenna and was struck by lightning.' Or 'the vehicle in front of us hit something and rolled.']. I [describe what you did — ran over, took cover, froze, radioed for help]. I saw [describe what you physically saw — be specific]. In the moment I felt [describe: terrified, helpless, in shock, running on adrenaline]. For days after, I [couldn't stop thinking about it / had nightmares / couldn't sleep / stayed on edge expecting it to happen again].

Event 2: [Taking Incoming Fire]
This happened during my deployment to [location]. We were [describe the situation — on patrol, at a checkpoint, in the barracks]. [Describe what happened — where the fire came from, what you did, who was around you]. I [took cover / returned fire / helped someone]. Afterward I [describe how you felt — couldn't stop scanning for threats, had trouble sleeping, became hypervigilant]."

Write each event in your own words. Length matters — the more detail you give the doctor, the stronger your case.`
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
      guidance: `For each deployment, describe: What was your specific job and what did you do day to day? Were you in direct combat situations? What types of threats or incidents did you encounter (incoming fire, IED exposure, casualties, missions, etc.)? What was the most dangerous or mentally taxing part of that deployment?`,
      example: `Here is a draft structure based on what you already listed (${locStr}) — fill in your actual experience:

"Deployment 1 — ${ctx.locations[1] || 'Egypt/Kuwait'} (Post-9/11):
I was deployed to [location] as a [${mosStr}]. My day-to-day responsibilities included [describe your actual duties — e.g., maintaining and operating radio communications systems, running comms on patrols and missions, coordinating with command during operations]. During this deployment I was exposed to [describe — incoming fire, mortar attacks, hostile situations, casualties, etc.]. The most stressful part was [be specific — e.g., being on-call during active engagements with no way to know when or where the next threat would come from].

Deployment 2 — ${ctx.locations[ctx.locations.length - 1] || 'Iraq'} (${ctx.locations.includes('Iraq') ? 'Combat Tour' : 'Deployment'}):
In [location], I [describe the situation on the ground — active combat, high-threat environment, specific incidents you witnessed or were part of]. The nature of this deployment was [describe — high operational tempo, continuous threat exposure, witnessing casualties, etc.]. This is where I experienced [reference your traumatic events from Section B]."

Every deployment you listed should have its own description. You do not need exact dates — approximate timeframes are fine.`
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
      guidance: `Go through each area of your life and be specific about what has changed since your service. The doctor is not looking for a summary — they need concrete examples. If you work, how has that been affected? What does your sleep actually look like? How have your relationships changed? What do you now avoid that you used to do without thinking?`,
      example: `Here is a draft covering each area — replace with your real experience:

"Work: I currently [work full time / work part time / am unable to work due to symptoms]. ${!funcAreas.work ? '[Describe how symptoms affect your work — e.g., I have trouble concentrating and staying on task. I have a short fuse with coworkers. I have called out because I could not get myself out of the house. My performance has suffered.]' : ''}

Sleep: [Describe your actual sleep — e.g., I get [X] hours on a good night but I wake up multiple times. I have nightmares [several times a week / almost every night] that are graphic and related to things I experienced in the service. I wake up in a cold sweat and cannot go back to sleep. I am exhausted all day regardless of how long I was in bed.]

Relationships: [Describe how your symptoms have changed your relationships — e.g., I have pulled away from people I used to be close to. I have a short fuse and my [wife / family / friends] have noticed. I do not want to be a burden so I keep things to myself, which has created distance. Arguments happen more often than they used to.]

Daily Life: [Describe what you now avoid or cannot do — e.g., I avoid crowded places like grocery stores, malls, and restaurants. Loud noises put me on edge immediately. I do not go to places where I feel like I cannot see the exits. Some days I do not leave the house at all.]"

Fill in each section with what is actually true for you. More detail is always better here.`
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
  const capsEvent = mentionsHummer ? 'the Humvee rollover'
    : mentionsLightning ? 'the lightning strike'
    : mentionsIncomingFire ? 'taking incoming fire'
    : 'the most distressing event from your service';

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

"The event that has stayed with me most is [name the event — e.g., the day a Marine in my unit was struck by lightning / the day our convoy took incoming fire / the day the vehicle in front of us rolled].

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

function evaluateMSK(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  const ctx = extractClientContext(text);
  const locStr = ctx.locations.length > 0 ? ctx.locations.join(', ') : 'overseas';

  // -- IV-A: Onset --
  if (!hasTimeframe(text)) {
    const onsetIdx = text.search(/onset|when did|how long|history of/i);
    const onsetSnip = onsetIdx >= 0 ? text.substring(onsetIdx, onsetIdx + 200).trim() : '';
    const onsetNote = onsetSnip && wordCount(onsetSnip) > 3
      ? `What was written does not include a timeframe for when the condition began. The doctor needs to know when it started and how it developed.`
      : `No onset information was provided. This field was left blank or skipped.`;

    gaps.push({
      section: 'Section IV-A',
      field: 'Onset and History',
      issue: onsetNote,
      severity: 'critical',
      guidance: `State when this condition first started: the approximate year or timeframe, whether it began during or after service, what activity or incident triggered it, and whether it came on suddenly or built up gradually over time.`,
      example: `Here is a draft format to follow:

"This condition started around [year]. I was [stationed at / deployed to / back home] at the time. The pain began [suddenly after a specific incident / gradually over time]. I first noticed it when [describe the situation: lifting during a training exercise, carrying heavy gear on a long patrol, a fall or vehicle incident, physical training]. At the time I [was / was not] treated by a medic or doctor. Since then the condition has [stayed the same / gotten progressively worse / flared up in cycles]."

If the injury happened during service, say it clearly: "This started while I was on active duty" or "This began during my deployment to [location]."`
    });
  } else passed.push('Section IV-A -- Onset');

  // -- IV-C: Pain location --
  if (!hasLocation(text)) {
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
  const hasProgression = /\b(better|worse|same|worsening|improving|progressing|deteriorating|flare|constant|chronic|increasing|decreasing|spread|aggravat)\b/i.test(text);
  if (!hasProgression) {
    gaps.push({
      section: 'Section IV-B',
      field: 'Symptom Progression',
      issue: `No description of whether the condition has changed over time. The doctor needs to know if it is getting worse, staying the same, or fluctuating.`,
      severity: 'moderate',
      guidance: `Describe the direction of your symptoms since they started: are they getting worse, staying the same, or cycling through flare-ups and relief? What makes them worse? Has the pain spread?`,
      example: `Here is a draft:

"Since this condition started, it has [gotten progressively worse / stayed about the same / fluctuated with good and bad periods]. Things that trigger a flare-up include [long drives, sitting at a desk for more than an hour, physical labor, cold weather, stress]. During a flare-up the pain goes from a [X] to a [X] out of 10 and I am [unable to work / forced to rest / relying on medication to get through the day]. The condition has [spread to include my [area] / stayed in the same location]. Nothing has given me consistent long-term relief."`
    });
  } else passed.push('Section IV-B -- Symptom Progression');
}

// ─── GI ───────────────────────────────────────────────────────────────────────

function evaluateGI(text: string, raw: string, gaps: QCGap[], passed: string[]) {

  // -- Section III: Onset --
  if (!hasTimeframe(text)) {
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
  const hasGISymptoms = /\b(cramp|bloat|nausea|diarrhea|constipation|reflux|heartburn|pain|bleed|urgency|gas|vomit|indigestion|belch|regurgitat|loose stool|bowel|stomach|abdomen|gut|irritable)\b/i.test(text);
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
  if (!/\b(mild|moderate|severe)\b/i.test(text)) {
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
  const hasGIFuncImpact = /\b(work|daily|routine|avoid|cancel|miss|unable|bathroom|emergency|accident|leave|eat|diet|social|plan|embarrass|isolat|sleep|travel)\b/i.test(text);
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

function evaluateHeadaches(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  const ctx = extractClientContext(text);
  const locStr = ctx.locations.length > 0 ? ctx.locations.join(', ') : 'overseas';

  // -- Q1: Timeframe / when headaches began --
  const q1Snip = text.substring(0, 800);
  if (!hasTimeframe(q1Snip)) {
    const q1Written = q1Snip.replace(/\s+/g, ' ').trim();
    const q1Note = q1Written.length > 40
      ? `The response does not include a timeframe for when headaches first started. The doctor needs an approximate year or period and whether they began during service or after.`
      : `No timeframe was provided for when headaches began. This field needs to be completed.`;
    gaps.push({
      section: 'Question 1',
      field: 'Headache History and Timeframe',
      issue: q1Note,
      severity: 'critical',
      guidance: `State when headaches first started: the approximate year or timeframe, whether it was during or after service, what was happening at the time (deployment, training, a specific incident), and whether they came on suddenly or gradually.`,
      example: `Here is a draft:

"My headaches started around [year]. At the time I was [on active duty / recently separated / deployed to ${locStr}]. They began [suddenly after a specific incident such as a blast, head injury, or vehicle rollover / gradually over time during [deployment or training period]]. I first noticed them when [describe the situation — after an IED detonation nearby, after a fall, after a period of extreme stress during a particular assignment]. Before that I rarely had headaches. They have [continued / gotten progressively worse] since then."

If there was a specific incident — a blast, a fall, a vehicle accident — mention it clearly here. That connection to service is what the doctor needs to document.`
    });
  } else passed.push('Q1 — Headache History Timeframe');

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

"The injury occurred during [describe the situation — a vehicle rollover, an IED blast, a training fall, hand-to-hand combat]. I [hit my head on / was thrown against / experienced the blast wave through] [the vehicle interior / the ground / the surrounding structure]. The point of contact was [my forehead / the back of my head / my jaw / the top of my skull]. Immediately after I experienced [ringing in my ears / confusion / brief loss of consciousness / severe headache / blurred vision / nausea]. I [was / was not] evaluated by a medic at the time. My headaches began [immediately / within days / within weeks] of this incident."`
      });
    } else passed.push('Q3 — Injury Location and Detail');
  }

  // -- Q17: Severity, accompanying symptoms, duration, impact --
  const hasSeveritySymptoms = /\b(severe|moderate|mild|debilitating|intense|throb|pound|nausea|vomit|sensitive|light|sound|aura|vision|blur|pressure|tight|throb|dizzy|vertigo)\b/i.test(text);
  if (!hasSeveritySymptoms) {
    const q17Snip = findAnswer(text, /question\s*17|describe.*headache|intensity|symptom|headache like/i);
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
  const hasFrequency = /\b(\d+)\s*(time|per|a|each|every|times?)\s*(day|week|month|year)\b/i.test(text)
    || /\b(daily|weekly|monthly|twice|three times|several times|few times|occasional|frequent|rarely|constant|constant)\b/i.test(text);
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
  const hasHeadacheFuncImpact = /\b(work|drive|screen|light|sound|dark|quiet|lay|rest|cancel|miss|unable|avoid|family|daily|routine|sleep|care|function|productivity|concentration)\b/i.test(text);
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

function evaluateRFI(text: string, raw: string, gaps: QCGap[], passed: string[]) {
  const ctx = extractClientContext(text);
  const locStr = ctx.locations.length > 0 ? ctx.locations.join(', ') : 'overseas';
  const branchStr = ctx.branch || 'the military';
  const mosStr = ctx.mos ? `as a ${ctx.mos}` : 'in their assigned role';

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
      example: `Here is a draft:

"I served in ${branchStr} ${mosStr}. My primary duties included [describe what you did day to day — operating radio equipment on convoys, conducting foot patrols in hostile areas, driving or maintaining vehicles under combat conditions, loading and offloading heavy equipment, providing security at checkpoints, coordinating logistics under fire]. My unit deployed to [${locStr}] where we [describe the operational environment — ran daily missions in high-threat areas, operated in extreme heat with limited rest, were exposed to IED blasts and direct fire contact, worked extended shifts with minimal downtime]. The physical demands of this job included [carrying heavy gear for long distances, operating in body armor for 12 to 18 hours at a time, sleeping in austere field conditions]. The mental demands included [constant threat awareness, decision-making under fire, witnessing casualties, managing high-stress operations with no breaks]."

Describe what your actual service looked like on a typical day. That is what the doctor needs to make the connection.`
    });
  } else passed.push('Section III — Military Duties');

  // -- Section V: Condition-specific narrative (onset, progression, symptoms) --
  if (!hasTimeframe(text)) {
    const v_snip = findAnswer(text, /section\s*V|condition|onset|how long|when did|history of/i);
    const v_note = v_snip && wordCount(v_snip) > 4
      ? `Section V describes the conditions but does not include specific timeframes for when each condition began or how they developed over time. The doctor needs to know approximately when each condition started and whether it traces back to service.`
      : `Section V is incomplete. No timeframes or dates were provided for when conditions began. This section needs to be filled in for each condition being claimed.`;
    gaps.push({
      section: 'Section V',
      field: 'Condition Onset and History',
      issue: v_note,
      severity: 'critical',
      guidance: `For each condition being claimed, provide: approximately when it started (year or timeframe), whether it began during active duty or after separation, what incident or pattern of exposure is believed to have caused or contributed to it, and how it has progressed since then.`,
      example: `Here is a draft template to use for each condition:

"[Condition name]: This condition started around [year]. At the time I was [on active duty / recently separated / deployed to ${locStr}]. I believe it is connected to my service because [describe the connection — repeated exposure to blast concussions, carrying heavy loads daily, sleeping in extreme conditions, chronic stress during deployment, a specific incident]. Since separation the condition has [stayed the same / gotten progressively worse / resulted in medical treatment including (describe treatment)]. It currently affects my ability to [describe current functional impact]."

Complete this for every condition listed in this form. Each one needs its own timeline and story.`
    });
  } else passed.push('Section V — Condition Onset Timeframes');

  // -- Section V continued: symptom narrative depth --
  const hasSymptomDepth = /\b(pain|ache|hurt|burning|numb|tingle|fatigue|dizzy|nausea|chest|breath|sweat|heart|pressure|cramp|spasm|stiff|swell|weak|limit|restrict|disturb|sleep|nightmare|flashback|avoid|isolat|irritab|anger|memory|concentrat|startle|trigger)\b/i.test(text);
  if (!hasSymptomDepth) {
    gaps.push({
      section: 'Section V',
      field: 'Current Symptom Description',
      issue: `Section V does not describe the current symptoms in enough detail. The doctor needs to know what the client is experiencing right now, not just that a condition exists.`,
      severity: 'moderate',
      guidance: `For each condition, describe the current symptoms: what they feel like, how often they occur, what makes them worse, and what they prevent the client from doing. Do not just name the condition — describe the actual experience.`,
      example: `Here is a draft:

"Right now my [condition] causes [describe specific symptoms — constant lower back pain that radiates into my left leg, recurring nightmares about specific events from deployment, daily headaches that force me to stop working, chronic fatigue that makes basic tasks exhausting]. Symptoms are worst [in the morning / after physical activity / when under stress / at night]. I manage them by [describe current management — taking medication, resting, avoiding certain activities, attending therapy]. Despite this the condition [has not improved / continues to limit my ability to work and function normally]."`
    });
  } else passed.push('Section V — Current Symptoms');

  // -- Section VI: Mental Health History --
  const hasMHKeywords = /\b(ptsd|anxiety|depression|trauma|mental|psychiatric|counseling|therapy|nightmare|flashback|hypervigilance|avoid|isolat|mood|anger|irritab|sleep|MST|military sexual|combat stress|moral injury)\b/i.test(text);
  if (!hasMHKeywords) {
    const mh_snip = findAnswer(text, /section\s*VI|mental health|psychiatric|trauma|PTSD/i);
    const mh_note = mh_snip && wordCount(mh_snip) > 4
      ? `Section VI mentions mental health but does not describe specific traumatic events from service, the nature of the mental health condition, or how it currently affects daily life. The doctor needs that level of detail to make the nexus connection.`
      : `Section VI appears to be blank or nearly blank. This section is required. The doctor needs to understand the client’s mental health history, traumatic events from service, and the current effect on daily functioning.`;
    gaps.push({
      section: 'Section VI',
      field: 'Mental Health History and Trauma',
      issue: mh_note,
      severity: 'critical',
      guidance: `Describe the mental health condition being claimed, at least one specific traumatic or high-stress event from service that contributed to it, and how the condition currently affects the client’s daily life. Cover at least: sleep and nightmares, ability to work and concentrate, relationships and social life, and any avoidance behaviors.`,
      example: `Here is a draft:

"I have been dealing with [PTSD / anxiety / depression / a combination of these] since [approximate timeframe — my time in ${locStr} / shortly after I separated / while I was still on active duty]. During my service I experienced [describe a specific event or pattern — repeated exposure to IED blasts and casualties, witnessing the death of fellow service members, combat engagements where I was under direct fire, the constant threat of attacks during convoys through hostile areas]. These events continue to affect me today.

Currently my symptoms include [nightmares about specific events, difficulty sleeping, hypervigilance in public spaces, avoiding crowds and loud sounds, irritability and anger that affects my relationships, difficulty concentrating at work, isolating from friends and family]. I [am currently in therapy / have not sought treatment / have tried medication]. My mental health condition directly affects my ability to [work consistently, maintain relationships, leave the house comfortably, feel safe in normal daily environments]."

Be specific about what you experienced. The doctor’s job is to connect your service to your current condition. Give them the details to do that.`
    });
  } else passed.push('Section VI — Mental Health History');

  // -- Section VIII: Coexisting conditions interaction --
  const hasCoexisting = /\b(secondary|related to|caused by|result of|aggravated by|worsened by|linked to|connection|because of|due to|from|stemming|coexist|interact|compound|combination)\b/i.test(text);
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
