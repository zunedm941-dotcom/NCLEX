const fs = require('fs');
const path = require('path');

console.log('Reading source HTML...');
const htmlPath = 'c:/Users/LEGION/Downloads/NCLEX_Exam_Simulator.html';
const content = fs.readFileSync(htmlPath, 'utf8');

const bankStart = content.indexOf('const BANK = [');
const bankEnd = content.indexOf(';\nconst $ =');
const rawBank = JSON.parse(content.substring(bankStart + 13, bankEnd));
console.log(`Loaded ${rawBank.length} questions from HTML.`);

// Category detection rules
const categoryMatchers = [
  {
    name: "Pharmacology & Parenteral Therapies",
    regex: /\b(medication|drug|prescrib|infus|dose|dosage|mg\b|mcg\b|ivpb|iv\b|subq|subcutaneous|intramuscular|oral|tablet|capsule|elixir|insulin|heparin|antibiotic|analgesic|adverse effect|toxic|toxicity|pharmacology|contraindicat|side effect|diuretic|digoxin|warfarin|acetaminophen|ibuprofen|morphine|fentanyl|prednisone|theophylline|dilantin|phenytoin|potassium chloride|inotropic|anticoagulant|chemotherap)\b/i
  },
  {
    name: "Maternal, Newborn & Child Health",
    regex: /\b(child|pediatric|infant|neonate|newborn|fetal|fetus|labor|postpartum|gravida|para|pregnant|pregnancy|delivery|gestation|toddler|preschool|adolescent|trimester|amniotic|lochia|preeclampsia|pre-eclampsia|apgar|circumcision|pediatric|hyperbilirubinemia|phototherapy|fontanel|crowning)\b/i
  },
  {
    name: "Cardiovascular & Respiratory",
    regex: /\b(cardiac|heart|myocardial|infarct|angina|hypertension|blood pressure|ecg\b|ekg\b|ventricular|atrial|arrhythmia|dysrhythmia|tachycardia|bradycardia|pulse|breath|lung|respiratory|respiration|asthma|copd|pneumonia|oxygen|tracheostomy|chest tube|sputum|dyspnea|crackles|wheez|atelectasis|defibrillat|lidocaine)\b/i
  },
  {
    name: "Fluid, Electrolytes & Renal",
    regex: /\b(potassium|sodium|calcium|magnesium|electrolyte|acidosis|alkalosis|ph\b|abg|arterial blood gas|kidney|renal|bun\b|creatinine|urine|urinary|catheter|foley|dialysis|edema|dehydrat|fluid volume|specific gravity|osmolality|hypokalemia|hyperkalemia|hyponatremia|hypernatremia|oliguria)\b/i
  },
  {
    name: "Safety & Infection Control",
    regex: /\b(infection|asepsis|aseptic|ppe\b|precaution|transmission-based|airborne|droplet|contact precaution|sterile|sterility|tuberculosis|isolate|isolation|restraint|fall risk|fall prevention|hazardous|needle|puncture|wash hands|hand hygiene|contaminated|nosocomial|mrsa|c\. diff)\b/i
  },
  {
    name: "Management of Care & Legal/Ethical",
    regex: /\b(delegate|delegation|uap\b|unlicensed assistive|lpn\b|lvn\b|priorit|triage|assign|assignment|consent|informed consent|advance directive|living will|confidential|hipaa|ethics|ethical|legal|negligen|malpractice|supervis|charge nurse|collaborat|advocacy|client rights)\b/i
  },
  {
    name: "Mental Health & Psychosocial Integrity",
    regex: /\b(mental health|psych|psychiatric|depress|depression|schizo|bipolar|anxiety|suicid|hallucinat|delusion|phobia|panic|abuse|addict|substance abuse|alcohol|withdrawal|coping|defense mechanism|grief|therapeutic communication|restlessness|agitation|electroconvulsive|ect\b)\b/i
  },
  {
    name: "Reduction of Risk & Perioperative Care",
    regex: /\b(preoperative|postoperative|surgical|surgery|operating room|or\b|pacu|anesthesia|wound care|dressing change|dehiscence|evisceration|biopsy|hemoglobin|hematocrit|wbc\b|platelet|laboratory|diagnostic test|endoscopy|colonoscopy|paracentesis|lumbar puncture)\b/i
  },
  {
    name: "Physiological Adaptation & Med-Surg",
    regex: /\b(shock|sepsis|burn|burns|rule of nines|trauma|diabetes|diabetic|ketoacidosis|dka|stroke|cva|seizure|epilepsy|cancer|carcinoma|tumor|oncology|gastro|gerd|ulcer|colostomy|ileostomy|bowel|pancreatitis|cirrhosis|hepatitis|thyroid|cushing|addison)\b/i
  }
];

function classifyQuestion(q) {
  const fullText = (q.question || '') + ' ' + (q.options ? q.options.map(o => o.text).join(' ') : '') + ' ' + (q.answerText || '');
  for (const matcher of categoryMatchers) {
    if (matcher.regex.test(fullText)) {
      return matcher.name;
    }
  }
  return "Fundamentals of Nursing & Basic Care";
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/‐/g, '-')
    .replace(/–/g, '-')
    .replace(/—/g, '-');
}

function parseCorrectAnswers(q) {
  const isSata = (q.question || '').toLowerCase().includes('select all that apply') || (q.answerText && q.answerText.includes(';'));
  
  if (isSata) {
    const matches = [];
    if (q.answerText) {
      const parts = q.answerText.split(/[;\n\r]+/);
      for (const part of parts) {
        const m = part.trim().match(/^(\d+)[.\s\-]/);
        if (m) {
          matches.push(m[1]);
        }
      }
    }
    const unique = [...new Set(matches)];
    if (unique.length > 0) {
      return { type: 'sata', answers: unique };
    }
    // If answer has single digit or comma separated
    if (q.answer && q.answer.trim()) {
      return { type: 'sata', answers: [q.answer.trim()] };
    }
    return { type: 'sata', answers: [] };
  }

  // Check if numeric fill-in-the-blank
  const isNoOptions = !q.options || q.options.length === 0;
  if (isNoOptions) {
    if (q.answer && q.answer.trim()) {
      return { type: 'numeric', answers: [q.answer.trim()] };
    }
    // If in answerText there is a number
    if (q.answerText) {
      const numMatch = q.answerText.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        return { type: 'numeric', answers: [numMatch[1]] };
      }
    }
    return { type: 'unsupported', answers: [] };
  }

  // Single choice
  if (q.answer && q.answer.trim()) {
    return { type: 'single', answers: [q.answer.trim()] };
  }
  
  // Single choice fallback from answerText
  if (q.answerText) {
    const m = q.answerText.trim().match(/^(\d+)[.\s\-]/);
    if (m) {
      return { type: 'single', answers: [m[1]] };
    }
  }

  // Edge case ID 3
  if (q.id === 3 && q.question.includes('proteinuria is significant')) {
    return { type: 'single', answers: ['3'] };
  }

  return { type: 'single', answers: [] };
}

let typeStats = { single: 0, sata: 0, numeric: 0, unsupported: 0 };
let categoryStats = {};

const processed = rawBank.map((raw, index) => {
  const { type, answers } = parseCorrectAnswers(raw);
  typeStats[type] = (typeStats[type] || 0) + 1;

  const category = classifyQuestion(raw);
  categoryStats[category] = (categoryStats[category] || 0) + 1;

  const cleanQuestion = decodeHtmlEntities(raw.question);
  const cleanAnswerText = decodeHtmlEntities(raw.answerText || '');

  const cleanOptions = (raw.options || []).map(opt => ({
    label: String(opt.label).trim(),
    text: decodeHtmlEntities(opt.text).trim()
  }));

  return {
    id: raw.id || (index + 1),
    type: type,
    category: category,
    question: cleanQuestion,
    options: cleanOptions,
    correctAnswers: answers,
    answerText: cleanAnswerText
  };
});

console.log('Processed questions summary:');
console.log('Type breakdown:', typeStats);
console.log('Category breakdown:', categoryStats);

// Create data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

fs.writeFileSync(path.join(dataDir, 'questions.json'), JSON.stringify(processed), 'utf8');
console.log(`Saved questions.json (${(fs.statSync(path.join(dataDir, 'questions.json')).size / 1024 / 1024).toFixed(2)} MB)`);

const jsWrapper = `// Auto-generated NCLEX Question Bank
(function() {
  window.NCLEX_BANK = ${JSON.stringify(processed)};
})();`;
fs.writeFileSync(path.join(dataDir, 'questions.js'), jsWrapper, 'utf8');
console.log(`Saved questions.js (${(fs.statSync(path.join(dataDir, 'questions.js')).size / 1024 / 1024).toFixed(2)} MB)`);
