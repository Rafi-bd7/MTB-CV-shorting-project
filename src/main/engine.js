const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const logger = require('./logger');

// Load Transformers.js for exact local vector embeddings
let pipelineModule;
let embedderPipeline = null;

async function initEmbedder() {
    if (!embedderPipeline) {
        try {
            pipelineModule = await import('@xenova/transformers');
            embedderPipeline = await pipelineModule.pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', {
                quantized: true, // Use quantized for speed
            });
        } catch (e) {
            console.error('Failed to load Transformers.js', e);
        }
    }
    return embedderPipeline;
}

// Helper to chunk text into smaller parts for better embedding
function chunkText(text, maxChars = 500) {
    if (!text) return [];
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const p of paragraphs) {
        if (currentChunk.length + p.length > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += p + ' ';
    }
    if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
    
    const finalChunks = [];
    for (const c of chunks) {
        if (c.length > maxChars * 1.5) {
            let str = c;
            while(str.length > 0) {
                finalChunks.push(str.substring(0, maxChars));
                str = str.substring(maxChars);
            }
        } else {
            finalChunks.push(c);
        }
    }
    return finalChunks.length > 0 ? finalChunks : [text.substring(0, maxChars)];
}

async function getEmbeddingsForChunks(embedder, text) {
    if (!embedder) return [];
    const chunks = chunkText(text, 500);
    const embeddings = [];
    for (const chunk of chunks) {
        try {
            const output = await embedder(chunk, { pooling: 'mean', normalize: true });
            embeddings.push(Array.from(output.data));
        } catch(e) {
            console.error('Chunk embedding error', e);
        }
    }
    return embeddings;
}

// OpenAI is initialized dynamically in functions that need it.

const DATA_DIR = path.join(os.homedir(), 'Documents', 'MTB_CV_Sorter_Data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'cv_database.json');

[DATA_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let db = { cvs: [] };

function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|td|th|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cleanCandidateName(rawName) {
  if (!rawName) return 'Candidate';
  let str = String(rawName);

  // If HTML tags are present, convert to text with newlines
  str = str.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|td|th|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ');
  
  // Separate joined words without space, e.g. "Awana Karim RaisaAge: 27.8" or "Arfat HossenAge: 29.3"
  str = str.replace(/([a-zA-Z\.\s])(Age\s*[:\-\d])/gi, '$1\n$2');
  str = str.replace(/([a-zA-Z\.\s])(Phone|Mobile|Contact|Email|Address|Gender|DOB|Exp|Experience|Job Matching)\s*[:\-]/gi, '$1\n$2:');
  str = str.replace(/([a-zA-Z\.\s])(\d{1,2}\.\d\s*(Years?|Yrs?))/gi, '$1\n$2');

  // Split into lines and take the first valid line
  const lines = str.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
  
  let candidateLine = '';
  for (const line of lines) {
    if (/^(age|phone|mobile|email|address|contact|gender|dob|col_\d+|row\s*\d+|photo|image|sl\.?|no\.?)\b/i.test(line)) {
      continue;
    }
    const parts = line.split(/\b(Age|Address|Phone|Email|Mobile|Contact|Exp|Experience|Gender|DOB|Date of Birth|Job Matching)\s*[:\-]/i);
    let potential = parts[0].trim();
    potential = potential.replace(/[:\|\-–,]+$/, '').trim();
    if (potential.length > 1) {
      candidateLine = potential;
      break;
    }
  }

  if (!candidateLine && lines.length > 0) {
    candidateLine = lines[0].split(/\b(Age|Address|Phone|Email|Mobile|Contact|Exp|Experience|Gender|DOB|Job Matching)\b/i)[0].trim();
  }

  candidateLine = (candidateLine || 'Candidate').replace(/\s+/g, ' ').trim();
  candidateLine = candidateLine.replace(/[,\-–:]+$/, '').trim();

  return candidateLine || 'Candidate';
}

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      db.cvs = data.cvs || [];
      let updated = false;
      db.cvs.forEach(cv => {
        const cleaned = cleanCandidateName(cv.candidate_name);
        if (cv.candidate_name !== cleaned) {
          cv.candidate_name = cleaned;
          updated = true;
        }
      });
      if (updated) {
        saveDb();
      }
    }
  } catch (e) {
    db.cvs = [];
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 0), 'utf-8');
  } catch (e) {}
}

loadDb();

function getFileHash(filepath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

// ── Extraction ────────────────────────────────────────────────────────
async function extractText(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  let text = '';
  try {
    if (ext === '.pdf') {
      const data = await pdfParse(fs.readFileSync(filepath));
      text = data.text || '';
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filepath) });
      text = result.value || '';
    } else if (ext === '.doc') {
      text = fs.readFileSync(filepath).toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      // Lazy load Tesseract to prevent UI freeze
      const Tesseract = require('tesseract.js');
      const res = await Tesseract.recognize(filepath, 'eng');
      text = res.data.text || '';
    } else if (ext === '.txt') {
      text = fs.readFileSync(filepath, 'utf-8');
    }
  } catch (e) {
    console.error(`Extract error ${filepath}:`, e.message);
  }
  return text.trim();
}

async function extractDocxTable(filepath) {
  try {
    const result = await mammoth.convertToHtml({ buffer: fs.readFileSync(filepath) });
    const tableMatch = (result.value || '').match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return null;
    
    const rowMatches = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rowMatches.length < 2) return null;

    const headers = [...rowMatches[0][1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map((m, i) => htmlToPlainText(m[1]) || `Col_${i+1}`);

    const rows = [];
    for (let i = 1; i < rowMatches.length; i++) {
      const cells = [...rowMatches[i][1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
          .map(m => htmlToPlainText(m[1]));
      if (cells.some(c => c.length > 0)) {
        const rowObj = {};
        headers.forEach((h, idx) => rowObj[h] = cells[idx] || '');
        rows.push(rowObj);
      }
    }
    return { headers, rows };
  } catch (e) {
    return null;
  }
}

// ── Ingestion ─────────────────────────────────────────────────────────
async function processFile(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const fileHash = getFileHash(filepath);
  
  if (db.cvs.some(cv => (cv.source_hash || cv.hash) === fileHash)) {
    return { status: 'skipped', reason: 'Duplicate', filename: path.basename(filepath) };
  }

  const destPath = path.join(UPLOAD_DIR, path.basename(filepath));
  try { fs.copyFileSync(filepath, destPath); } catch (e) {}

  const embedder = await initEmbedder();

  if (ext === '.docx') {
    const tableData = await extractDocxTable(filepath);
    if (tableData && tableData.rows.length > 1) {
      let added = 0;
      for (let i = 0; i < tableData.rows.length; i++) {
        const text = Object.entries(tableData.rows[i]).filter(([k,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n');
        if (text.trim().length < 10) continue;
        
        const rowHash = crypto.createHash('sha256').update(`${fileHash}_${i}`).digest('hex');
        if (db.cvs.some(cv => cv.hash === rowHash)) continue;

        const nameKey = Object.keys(tableData.rows[i]).find(k => /^(candidate\s*name|name|applicant\s*name|full\s*name)$/i.test(k.trim())) 
                     || Object.keys(tableData.rows[i]).find(k => /name/i.test(k.trim()));
        let name = cleanCandidateName((nameKey ? tableData.rows[i][nameKey] : '') || tableData.rows[i]['Name'] || tableData.rows[i]['Candidate Name'] || `Row ${i+1}`);
        let embeddings = [];
        if (embedder) {
           embeddings = await getEmbeddingsForChunks(embedder, text);
        }

        db.cvs.push({
          id: rowHash, hash: rowHash, source_hash: fileHash, filename: path.basename(filepath), filepath: destPath,
          candidate_name: name, text, structured: tableData.rows[i], headers: tableData.headers, is_table_row: true,
          embedding: embeddings.length > 0 ? embeddings[0] : [],
          embeddings
        });
        added++;
      }
      saveDb();
      return { status: 'success', filename: path.basename(filepath), count: added, type: 'table' };
    }
  }

  const text = await extractText(filepath);
  if (text.length < 20) return { status: 'failed', reason: 'No readable text', filename: path.basename(filepath) };

  let embeddings = [];
  if (embedder) {
      embeddings = await getEmbeddingsForChunks(embedder, text);
  }

  db.cvs.push({
    id: fileHash, hash: fileHash, source_hash: fileHash, filename: path.basename(filepath), filepath: destPath,
    candidate_name: path.basename(filepath, ext), text, structured: null, headers: null, is_table_row: false,
    embedding: embeddings.length > 0 ? embeddings[0] : [],
    embeddings
  });
  saveDb();
  return { status: 'success', filename: path.basename(filepath), count: 1, type: 'file' };
}










// ═══════════════════════════════════════════════════════════════════════
// ── DOMAIN SYNONYM DICTIONARY (Finance / Remittance / Compliance) ─────
// ═══════════════════════════════════════════════════════════════════════
const DOMAIN_SYNONYMS = {
  // Remittance & Payments
  'remittance':       ['money transfer', 'international transfer', 'wire transfer', 'fund transfer', 'foreign remittance', 'cross-border payment', 'inward remittance', 'outward remittance'],
  'money transfer':   ['remittance', 'wire transfer', 'fund transfer', 'foreign exchange'],
  'forex':            ['foreign exchange', 'currency exchange', 'fx', 'foreign currency'],
  // Compliance & Regulatory
  'regulatory':       ['compliance', 'regulation', 'kyc', 'aml', 'bfiu', 'central bank', 'bangladesh bank', 'regulatory framework'],
  'compliance':       ['regulatory compliance', 'due diligence', 'aml', 'kyc', 'audit', 'regulatory adherence', 'risk management'],
  'kyc':              ['know your customer', 'customer due diligence', 'cdd', 'identity verification'],
  'aml':              ['anti money laundering', 'anti-money laundering', 'financial crime', 'money laundering'],
  'due diligence':    ['background check', 'verification', 'risk assessment', 'compliance check', 'customer verification'],
  // Accounting & Reconciliation
  'reconcile':        ['reconciliation', 'account reconciliation', 'ledger reconciliation', 'balance check', 'settlement', 'statement matching'],
  'reconciliation':   ['reconcile', 'account matching', 'ledger balance', 'settlement reconciliation'],
  'accounting':       ['accounts', 'bookkeeping', 'ledger', 'general ledger', 'financial accounting', 'tally'],
  // Dispute & Customer Service
  'dispute':          ['complaint resolution', 'dispute resolution', 'grievance', 'issue resolution', 'customer complaint', 'partner dispute'],
  'customer':         ['client', 'customer service', 'customer care', 'client management', 'customer relationship'],
  'complaint':        ['grievance', 'dispute', 'customer issue', 'customer complaint', 'feedback'],
  // Reporting
  'report':           ['reporting', 'management report', 'audit report', 'regulatory report', 'mis report', 'documentation', 'mis'],
  'mis':              ['management information system', 'reporting', 'data reporting', 'management report'],
  'audit':            ['internal audit', 'external audit', 'compliance audit', 'inspection', 'review'],
  // Partner Management
  'partner':          ['correspondent', 'partner bank', 'remittance partner', 'agent', 'third party', 'vendor'],
  'correspondent':    ['correspondent bank', 'partner bank', 'remittance agent', 'exchange house'],
  // Banking General
  'banking':          ['bank', 'financial institution', 'mfs', 'mobile banking', 'digital banking', 'fintech'],
  'finance':          ['financial', 'accounting', 'treasury', 'forex', 'financial services'],
  'payment':          ['transaction', 'settlement', 'clearance', 'fund', 'disbursement'],
  // Communication
  'english':          ['english communication', 'english writing', 'english speaking', 'english proficiency', 'business english'],
  'communication':    ['written communication', 'verbal communication', 'correspondence', 'email writing', 'report writing'],
  // IT & Data
  'ml':               ['machine learning'],
  'nlp':              ['natural language processing'],
  'ai':               ['artificial intelligence'],
  'erp':              ['enterprise resource planning', 'sap', 'oracle erp'],
  'crm':              ['customer relationship management', 'salesforce'],
  'pm':               ['project manager', 'project management'],
  'data':             ['data analysis', 'data entry', 'data management', 'database', 'excel', 'spreadsheet'],
  // Banking Products & Channels
  'card':             ['credit card', 'debit card', 'prepaid card', 'virtual card', 'visa', 'mastercard'],
  'pos':              ['point of sale', 'edc machine', 'mpos', 'card terminal'],
  'atm':              ['automated teller machine', 'cash dispenser', 'cdm', 'cash deposit machine'],
  'adc':              ['alternative delivery channel', 'digital channel', 'internet banking', 'mobile banking', 'sms banking'],
  'loan':             ['credit', 'lending', 'advance', 'mortgage', 'financing', 'facility'],
  'deposit':          ['savings', 'fixed deposit', 'fdr', 'dps', 'term deposit', 'current account'],
  'treasury':         ['money market', 'capital market', 'bond', 'securities', 'repo', 'fx trading'],
  'lc':               ['letter of credit', 'documentary credit', 'trade finance'],
  'npl':              ['non performing loan', 'default', 'classified loan', 'bad debt'],
  'casa':             ['current account savings account', 'low cost deposit'],
  'dse':              ['direct sales executive', 'direct sales', 'field sales'],
  'tat':              ['turn around time', 'turnaround time', 'processing time'],
  'cbs':              ['core banking system', 'core banking solution', 'core banking software'],
  'mfs':              ['mobile financial services', 'mobile money', 'mobile wallet', 'bkash', 'nagad'],
  'aso':              ['app store optimization'],
  'cro':              ['conversion rate optimization'],
  'clv':              ['customer lifetime value'],
  'esg':              ['environmental social governance', 'sustainability'],
  'bcp':              ['business continuity plan', 'disaster recovery'],
  // Banking Engineering & Tech Abbreviations
  'sre':              ['site reliability engineer', 'site reliability engineering', 'reliability'],
  'iam':              ['identity and access management', 'identity access management', 'authentication', 'authorization'],
  'hft':              ['high frequency trading', 'low latency trading'],
  'rpa':              ['robotic process automation', 'uipath', 'automation anywhere', 'blue prism'],
  'stp':              ['straight through processing'],
  'dlt':              ['distributed ledger technology', 'blockchain'],
  'cbdc':             ['central bank digital currency'],
  'los':              ['loan origination system'],
  'lms':              ['loan management system', 'learning management system'],
  'alm':              ['asset liability management'],
  'oms':              ['order management system'],
  'ems':              ['execution management system'],
  'tms':              ['terminal management system', 'treasury management system'],
  'xfs':              ['extensions for financial services', 'cen/xfs'],
  'vapt':             ['vulnerability assessment penetration testing'],
  'siem':             ['security information event management'],
  'waf':              ['web application firewall'],
  'hsm':              ['hardware security module'],
  'pki':              ['public key infrastructure'],
  'iac':              ['infrastructure as code', 'terraform', 'ansible'],
  'k8s':              ['kubernetes'],
  'cicd':             ['continuous integration continuous deployment', 'ci/cd', 'jenkins', 'gitlab ci'],
  'soa':              ['service oriented architecture'],
  'oltp':             ['online transaction processing'],
  'etl':              ['extract transform load', 'data pipeline'],
  'fpga':             ['field programmable gate array'],
};

// ═══════════════════════════════════════════════════════════════════════
// ── SMART CONCEPT MAP (Zero-Shot Skill Expansion) ─────────────────────
// ── Covers: Banking, FinTech, Cards, ADC, Agent Banking, Lending,
// ── Compliance, Treasury, Remittance, Product, Analytics, PR & more ───
// ═══════════════════════════════════════════════════════════════════════
const SMART_CONCEPT_MAP = [
  // ── General Communication & Language ──
  {
    triggers: ['english', 'speaking', 'writing', 'communication', 'articulate', 'linguistic'],
    skills: ['articulate', 'fluent', 'bilingual', 'ielts', 'spoken english', 'written communication', 'verbal communication', 'presentation', 'linguistic', 'correspondence', 'report writing', 'email writing', 'business english', 'public speaking']
  },
  // ── Software & Web Development ──
  {
    triggers: ['web', 'software', 'develop', 'engineer', 'programmer', 'coder', 'app', 'fullstack', 'frontend', 'backend'],
    skills: ['html', 'css', 'python', 'javascript', 'react', 'angular', 'vue', 'node', 'java', 'php', 'c++', 'c#', '.net', 'sql', 'git', 'frontend', 'backend', 'fullstack', 'api', 'rest', 'graphql', 'django', 'laravel', 'spring boot', 'microservices', 'docker', 'kubernetes', 'aws', 'azure', 'devops', 'ci/cd']
  },
  // ── General Leadership & Management ──
  {
    triggers: ['manage', 'lead', 'manager', 'head', 'supervise', 'director', 'executive', 'officer'],
    skills: ['leadership', 'management', 'team lead', 'agile', 'scrum', 'strategic', 'supervisor', 'coordination', 'operation', 'admin', 'stakeholder management', 'kpi', 'budget', 'cross-functional', 'decision making']
  },
  // ── Customer Service & Support ──
  {
    triggers: ['customer', 'complaint', 'query', 'support', 'client', 'service', 'helpdesk'],
    skills: ['customer service', 'customer success', 'client relation', 'bpo', 'call center', 'help desk', 'issue resolution', 'satisfaction', 'crm', 'retention', 'onboarding', 'csat', 'nps', 'customer journey', 'ticketing']
  },
  // ── Finance & Accounting ──
  {
    triggers: ['finance', 'account', 'audit', 'reconcile', 'tax', 'treasury', 'ledger'],
    skills: ['accounting', 'bookkeeping', 'tally', 'ledger', 'general ledger', 'balance sheet', 'audit', 'taxation', 'vat', 'financial modeling', 'cpa', 'acca', 'ca', 'ifrs', 'gaap', 'cost accounting', 'financial statement', 'accounts payable', 'accounts receivable', 'trial balance']
  },
  // ── Design & Creative ──
  {
    triggers: ['design', 'ui', 'ux', 'graphic', 'creative', 'visual'],
    skills: ['figma', 'adobe', 'photoshop', 'illustrator', 'user interface', 'user experience', 'wireframe', 'prototype', 'canva', 'sketch', 'invision', 'typography', 'branding', 'logo']
  },
  // ── General Marketing & Sales ──
  {
    triggers: ['marketing', 'sales', 'promote', 'brand', 'seo', 'campaign', 'acquisition'],
    skills: ['digital marketing', 'social media', 'b2b', 'b2c', 'lead generation', 'campaign', 'seo', 'sem', 'google ads', 'facebook ads', 'content marketing', 'email marketing', 'influencer', 'media buying', 'conversion', 'funnel', 'growth hacking', 'roi']
  },

  // ═══════════════════════════════════════════════════════════════════
  // ── BANKING WORLD SPECIFIC CONCEPTS ────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  // ── Digital Banking & FinTech Marketing ──
  {
    triggers: ['digital banking', 'neobank', 'fintech', 'mobile banking', 'online banking', 'virtual banking', 'digital wallet', 'mfs', 'digital financial'],
    skills: ['mobile banking', 'internet banking', 'app marketing', 'aso', 'user acquisition', 'digital channel', 'neobank', 'challenger bank', 'digital onboarding', 'ux', 'push notification', 'in-app', 'fintech', 'dfs', 'bkash', 'nagad', 'rocket', 'upay', 'digital payment', 'qr code', 'contactless', 'digital deposit', 'e-kyc', 'digital wallet']
  },
  // ── Core Banking Software & Banking Tech Sales ──
  {
    triggers: ['core banking', 'cbs', 'banking software', 'banking solution', 'banking tech', 'fintech sales', 'saas', 'enterprise banking'],
    skills: ['core banking', 'cbs', 'temenos', 't24', 'oracle flexcube', 'finastra', 'infosys finacle', 'banking erp', 'banking api', 'open banking', 'middleware', 'integration', 'soa', 'microservices', 'cloud banking', 'pre-sales', 'rfp', 'bid', 'proposal', 'poc', 'demo', 'implementation', 'uat', 'go-live', 'saas', 'paas']
  },
  // ── Cards & Payment Products ──
  {
    triggers: ['card', 'credit card', 'debit card', 'prepaid', 'visa', 'mastercard', 'pos', 'atm', 'cdm', 'contactless'],
    skills: ['credit card', 'debit card', 'prepaid card', 'virtual card', 'visa', 'mastercard', 'amex', 'jcb', 'unionpay', 'pos', 'edc', 'qr payment', 'mpos', 'atm', 'cdm', 'crm', 'emv', 'chip', 'pin', 'cvv', 'card issuing', 'card acquiring', 'merchant acquiring', 'interchange', 'mdr', 'settlement', 'chargeback', 'loyalty', 'rewards', 'co-branded', 'supplementary', 'annual fee', 'interest free', 'emi']
  },
  // ── Alternative Delivery Channel (ADC) ──
  {
    triggers: ['adc', 'alternative delivery', 'alternative channel', 'digital channel', 'self service'],
    skills: ['adc', 'internet banking', 'mobile banking', 'sms banking', 'ussd', 'atm', 'cdm', 'crm', 'pos', 'qr', 'kiosk', 'ivr', 'chatbot', 'self service', 'digital channel', 'omni channel', 'e-statement', 'e-commerce']
  },
  // ── Agent Banking ──
  {
    triggers: ['agent banking', 'agent', 'sub-agent', 'outlet', 'rural banking', 'branchless'],
    skills: ['agent banking', 'agent network', 'agent recruitment', 'agent management', 'rural banking', 'branchless', 'financial inclusion', 'cico', 'cash-in', 'cash-out', 'sub-agent', 'outlet', 'pos device', 'biometric', 'agent commission', 'dfs', 'unbanked', 'underserved']
  },
  // ── Payment Gateway & Digital Payment ──
  {
    triggers: ['payment gateway', 'payment', 'digital payment', 'transaction', 'settlement', 'clearing', 'e-commerce payment'],
    skills: ['payment gateway', 'ssl commerz', 'shurjopay', 'aamarpay', 'stripe', 'paypal', 'beftn', 'npsb', 'rtgs', 'bach', 'eft', 'clearing house', 'settlement', 'neft', 'swift', 'iban', 'api integration', 'checkout', 'ipn', 'webhook', 'pci-dss', 'tokenization', 'encryption']
  },
  // ── Merchant Acquiring ──
  {
    triggers: ['merchant', 'acquiring', 'pos merchant', 'qr merchant', 'mpos'],
    skills: ['merchant acquiring', 'merchant onboarding', 'pos terminal', 'edc machine', 'qr code', 'mpos', 'merchant discount rate', 'mdr', 'merchant network', 'retail merchant', 'e-commerce merchant', 'aggregator', 'sub-merchant', 'merchant settlement']
  },
  // ── Compliance & Regulatory ──
  {
    triggers: ['compliance', 'regulatory', 'kyc', 'aml', 'bfiu', 'cft', 'risk', 'regtech', 'anti-money'],
    skills: ['compliance', 'kyc', 'aml', 'cft', 'bfiu', 'bangladesh bank', 'central bank', 'regulatory', 'due diligence', 'cdd', 'edd', 'pep', 'sanction screening', 'transaction monitoring', 'suspicious transaction', 'str', 'ctr', 'fatf', 'risk assessment', 'audit', 'internal control', 'sarbanes-oxley', 'basel', 'regtech', 'ofac']
  },
  // ── Remittance & Foreign Exchange ──
  {
    triggers: ['remittance', 'forex', 'foreign exchange', 'money transfer', 'cross-border', 'wire transfer'],
    skills: ['remittance', 'inward remittance', 'outward remittance', 'foreign remittance', 'money transfer', 'wire transfer', 'swift', 'iban', 'nostro', 'vostro', 'correspondent bank', 'exchange house', 'forex', 'fx', 'currency exchange', 'cross-border', 'hawala', 'western union', 'moneygram', 'ria', 'beneficiary', 'sender', 'exchange rate']
  },
  // ── Lending & Credit ──
  {
    triggers: ['loan', 'lending', 'credit', 'mortgage', 'los', 'disbursement', 'sme loan', 'retail loan'],
    skills: ['loan origination', 'los', 'lms', 'credit scoring', 'credit risk', 'cib', 'credit bureau', 'disbursement', 'repayment', 'emi', 'tenor', 'collateral', 'mortgage', 'personal loan', 'home loan', 'auto loan', 'sme loan', 'working capital', 'term loan', 'overdraft', 'credit limit', 'npl', 'default', 'recovery', 'write-off', 'interest rate', 'spread', 'digital lending', 'p2p lending']
  },
  // ── Treasury & Capital Markets ──
  {
    triggers: ['treasury', 'capital market', 'bond', 'securities', 'investment', 'portfolio', 'money market'],
    skills: ['treasury', 'money market', 'capital market', 'bond', 'debenture', 'securities', 'fixed income', 'equity', 'mutual fund', 'portfolio management', 'asset management', 'repo', 'reverse repo', 'yield', 'coupon', 'maturity', 'call money', 'government securities', 'sovereign bond', 'foreign currency reserve', 'fx trading', 'swap', 'derivative']
  },
  // ── Trade Finance ──
  {
    triggers: ['trade finance', 'lc', 'letter of credit', 'import', 'export', 'foreign trade'],
    skills: ['trade finance', 'letter of credit', 'lc', 'documentary credit', 'import', 'export', 'back-to-back lc', 'sight lc', 'deferred lc', 'usance', 'bill of exchange', 'bill of lading', 'incoterms', 'swift mt700', 'bank guarantee', 'lien', 'margin', 'acceptance', 'negotiation', 'discrepancy', 'ucpdc', 'isbp']
  },
  // ── Islamic Banking & Finance ──
  {
    triggers: ['islamic banking', 'shariah', 'mudaraba', 'musharaka', 'murabaha', 'ijara', 'sukuk', 'islamic'],
    skills: ['islamic banking', 'shariah', 'shariah compliance', 'mudaraba', 'musharaka', 'murabaha', 'ijara', 'istisna', 'salam', 'sukuk', 'takaful', 'wadiah', 'qard', 'profit sharing', 'islamic finance', 'shariah audit', 'shariah board', 'riba', 'halal investment']
  },
  // ── SME Banking ──
  {
    triggers: ['sme', 'small business', 'msme', 'cottage', 'entrepreneurship'],
    skills: ['sme banking', 'sme loan', 'msme', 'cottage', 'small enterprise', 'medium enterprise', 'working capital', 'trade loan', 'sme cluster', 'women entrepreneur', 'startup', 'business development', 'supply chain finance', 'factoring', 'invoice discounting']
  },
  // ── Microfinance ──
  {
    triggers: ['microfinance', 'mfi', 'microcredit', 'grameen', 'rural finance'],
    skills: ['microfinance', 'mfi', 'microcredit', 'grameen', 'ngo', 'rural finance', 'financial inclusion', 'group lending', 'weekly installment', 'micro savings', 'micro insurance', 'pksf', 'mra']
  },
  // ── Product Management (Banking & FinTech) ──
  {
    triggers: ['product', 'product manager', 'product owner', 'product development', 'product launch', 'product roadmap', 'mvp'],
    skills: ['product management', 'product owner', 'product roadmap', 'mvp', 'feature adoption', 'user story', 'backlog', 'sprint', 'go-to-market', 'product launch', 'product lifecycle', 'pricing', 'competitive analysis', 'market research', 'a/b testing', 'product analytics', 'prd', 'user retention']
  },
  // ── Banking CRM & Customer Relationship ──
  {
    triggers: ['crm', 'relationship manager', 'key account', 'client relation', 'customer success', 'retention', 'onboarding'],
    skills: ['crm', 'salesforce', 'hubspot', 'relationship management', 'key account', 'hnw', 'high net worth', 'priority banking', 'premium banking', 'wealth management', 'client retention', 'up-selling', 'cross-selling', 'customer lifecycle', 'customer engagement', 'customer experience', 'cx', 'nps', 'csat', 'churn', 'loyalty program']
  },
  // ── Data Analytics & Marketing Analytics ──
  {
    triggers: ['data', 'analytics', 'analyst', 'business intelligence', 'bi', 'insight', 'dashboard', 'report'],
    skills: ['data analysis', 'data analytics', 'bi', 'business intelligence', 'power bi', 'tableau', 'looker', 'excel', 'pivot table', 'sql', 'python', 'r', 'statistics', 'predictive analytics', 'customer segmentation', 'clv', 'ltv', 'attribution', 'cohort analysis', 'a/b testing', 'roi analysis', 'mis', 'etl', 'data warehouse', 'big data']
  },
  // ── Partnership & Alliance ──
  {
    triggers: ['partnership', 'alliance', 'collaboration', 'co-branded', 'affiliate', 'integration partner'],
    skills: ['partnership', 'strategic alliance', 'business development', 'co-branded', 'affiliate', 'joint venture', 'mou', 'agreement', 'integration', 'ecosystem', 'vendor management', 'channel partner', 'distribution', 'bancassurance', 'cross-industry', 'corporate alliance', 'payroll', 'merchant partnership']
  },
  // ── Bancassurance ──
  {
    triggers: ['bancassurance', 'insurance', 'insurtech', 'life insurance', 'general insurance'],
    skills: ['bancassurance', 'life insurance', 'general insurance', 'insurtech', 'premium', 'policy', 'claim', 'underwriting', 'actuary', 'takaful', 'group insurance', 'health insurance', 'micro insurance', 'annuity', 'endowment', 'term insurance']
  },
  // ── Branding, PR & Communications ──
  {
    triggers: ['brand', 'pr', 'public relation', 'communication', 'media', 'creative director', 'copywriter', 'content'],
    skills: ['brand strategy', 'brand identity', 'public relations', 'pr', 'media relations', 'press release', 'crisis communication', 'corporate communication', 'copywriting', 'content creation', 'creative direction', 'media buying', 'media planning', 'event management', 'activation', 'sponsorship', 'csr', 'employer branding', 'influencer', 'video production', 'photography', 'omnichannel']
  },
  // ── Risk Management ──
  {
    triggers: ['risk', 'risk management', 'operational risk', 'credit risk', 'market risk', 'liquidity risk'],
    skills: ['risk management', 'credit risk', 'market risk', 'operational risk', 'liquidity risk', 'risk assessment', 'risk appetite', 'risk register', 'var', 'stress test', 'scenario analysis', 'basel', 'icaap', 'raroc', 'erm', 'enterprise risk', 'bcp', 'disaster recovery', 'fraud detection', 'fraud prevention']
  },
  // ── Wealth Management & Private Banking ──
  {
    triggers: ['wealth', 'private banking', 'investment advisory', 'portfolio', 'asset management', 'hnw'],
    skills: ['wealth management', 'private banking', 'investment advisory', 'portfolio management', 'asset allocation', 'mutual fund', 'fixed deposit', 'dps', 'savings', 'high net worth', 'hnw', 'uhnw', 'financial planning', 'estate planning', 'tax planning', 'discretionary', 'non-discretionary']
  },
  // ── HR & People (Banking) ──
  {
    triggers: ['human resource', 'hr', 'recruitment', 'talent', 'training', 'people'],
    skills: ['hr', 'human resource', 'recruitment', 'talent acquisition', 'talent management', 'training', 'learning and development', 'l&d', 'performance management', 'kpi', 'payroll', 'compensation', 'benefits', 'employee engagement', 'succession planning', 'hris', 'sap hr', 'oracle hr']
  },
  // ── IT & Cybersecurity (Banking) ──
  {
    triggers: ['cybersecurity', 'information security', 'it security', 'network', 'infrastructure', 'system admin'],
    skills: ['cybersecurity', 'information security', 'iso 27001', 'soc', 'siem', 'firewall', 'ids', 'ips', 'penetration testing', 'vulnerability', 'encryption', 'ssl', 'tls', 'pci-dss', 'gdpr', 'data protection', 'network security', 'endpoint security', 'incident response', 'dmarc', 'zero trust']
  },
  // ── Mobile Financial Services (MFS) ──
  {
    triggers: ['mfs', 'mobile financial', 'mobile money', 'mobile wallet', 'digital wallet', 'bkash', 'nagad', 'rocket'],
    skills: ['mfs', 'mobile financial services', 'bkash', 'nagad', 'rocket', 'upay', 'mcash', 'sure cash', 'mobile wallet', 'digital wallet', 'send money', 'cash-in', 'cash-out', 'bill payment', 'merchant payment', 'qr payment', 'p2p transfer', 'agent', 'ussd', 'app', 'interoperability']
  },
  // ── Deposit & Liabilities ──
  {
    triggers: ['deposit', 'liability', 'savings', 'current account', 'fixed deposit', 'dps', 'mobilization'],
    skills: ['deposit mobilization', 'fixed deposit', 'fd', 'fdr', 'dps', 'savings account', 'current account', 'call deposit', 'term deposit', 'deposit rate', 'interest rate', 'casa', 'retail deposit', 'corporate deposit', 'institutional deposit', 'deposit mix']
  },
  // ── Corporate Banking ──
  {
    triggers: ['corporate banking', 'corporate finance', 'corporate client', 'corporate loan'],
    skills: ['corporate banking', 'corporate finance', 'corporate loan', 'syndicated loan', 'project finance', 'structured finance', 'cash management', 'liquidity management', 'escrow', 'lc', 'bank guarantee', 'working capital', 'overdraft', 'corporate deposit', 'payroll banking', 'treasury']
  },
  // ── Retail Banking ──
  {
    triggers: ['retail banking', 'consumer banking', 'retail loan', 'retail asset', 'retail liability'],
    skills: ['retail banking', 'consumer banking', 'personal loan', 'home loan', 'auto loan', 'education loan', 'salary loan', 'credit card', 'debit card', 'savings', 'dps', 'fd', 'retail deposit', 'branch banking', 'direct sales', 'dse', 'cross-selling']
  },
  // ── Operations & Back Office ──
  {
    triggers: ['operation', 'back office', 'processing', 'clearing', 'settlement', 'reconciliation'],
    skills: ['operations', 'back office', 'transaction processing', 'clearing', 'settlement', 'reconciliation', 'nostro', 'vostro', 'swift', 'beftn', 'rtgs', 'npsb', 'bach', 'voucher', 'inter-branch', 'gl', 'eod', 'sod', 'maker-checker', 'four-eye principle']
  },
  // ── Branch Banking & Service Delivery ──
  {
    triggers: ['branch', 'branch manager', 'branch operation', 'service delivery', 'counter'],
    skills: ['branch banking', 'branch management', 'branch operation', 'counter service', 'teller', 'cash management', 'vault', 'customer service', 'account opening', 'locker', 'remittance counter', 'foreign exchange counter', 'service quality', 'queue management', 'turn around time', 'tat']
  },
  // ── Audit & Internal Control ──
  {
    triggers: ['audit', 'internal audit', 'internal control', 'inspection', 'investigation'],
    skills: ['audit', 'internal audit', 'external audit', 'compliance audit', 'it audit', 'forensic audit', 'inspection', 'investigation', 'sox', 'coso', 'ippf', 'cia', 'acca', 'internal control', 'control testing', 'audit report', 'audit finding', 'corrective action', 'root cause analysis']
  },
  // ── Green Banking & Sustainability ──
  {
    triggers: ['green banking', 'sustainability', 'esg', 'climate', 'environment', 'sustainable'],
    skills: ['green banking', 'sustainable finance', 'esg', 'environmental', 'social', 'governance', 'green bond', 'climate finance', 'carbon footprint', 'renewable energy financing', 'csr', 'impact investing', 'sdg', 'equator principles']
  },
  // ── Legal & Documentation ──
  {
    triggers: ['legal', 'law', 'documentation', 'contract', 'agreement', 'litigation'],
    skills: ['legal', 'banking law', 'company law', 'contract law', 'negotiable instrument', 'mortgage', 'lien', 'pledge', 'hypothecation', 'power of attorney', 'litigation', 'arbitration', 'documentation', 'loan documentation', 'security documentation', 'charge creation', 'rjsc', 'notarization']
  },
  // ── General Banking Knowledge ──
  {
    triggers: ['bank', 'banking', 'banker', 'financial institution'],
    skills: ['banking', 'bank', 'commercial bank', 'central bank', 'bangladesh bank', 'schedule bank', 'private bank', 'state-owned bank', 'specialized bank', 'foreign bank', 'nbfi', 'financial institution', 'banking regulation', 'banking license', 'basal', 'capital adequacy', 'tier 1', 'tier 2', 'car', 'provision', 'slr', 'crr']
  },

  // ═══════════════════════════════════════════════════════════════════
  // ── BANKING ENGINEERING & TECHNICAL ROLES ──────────────────────────
  // ═══════════════════════════════════════════════════════════════════

  // ── Core Banking Software Engineering ──
  {
    triggers: ['core banking software', 'banking platform', 'core banking engineer', 'cbs developer', 'banking migration', 'core ledger', 'core banking api', 'core banking configuration'],
    skills: ['core banking', 'cbs', 'temenos', 't24', 'oracle flexcube', 'finastra', 'infosys finacle', 'silverlake', 'path solutions', 'banking platform', 'core ledger', 'general ledger', 'chart of accounts', 'banking migration', 'data migration', 'system integration', 'middleware', 'soa', 'esb', 'enterprise service bus', 'banking api', 'open banking', 'configuration', 'parameterization', 'uat', 'go-live', 'cutover']
  },
  // ── Payment Systems & Infrastructure Engineering ──
  {
    triggers: ['payment system', 'payment infrastructure', 'payment processing', 'transaction processing', 'clearing', 'settlement', 'real-time payment', 'rtp', 'ach', 'card payment'],
    skills: ['payment systems', 'transaction processing', 'payment gateway', 'rtgs', 'beftn', 'npsb', 'bach', 'ach', 'eft', 'clearing house', 'settlement', 'real-time payment', 'rtp', 'iso 8583', 'iso 20022', 'emv', 'card processing', 'authorization', 'switching', 'routing', 'message queue', 'kafka', 'rabbitmq', 'high availability', 'failover', 'disaster recovery', 'pci-dss', 'tokenization', 'hce']
  },
  // ── Blockchain, DeFi & Digital Currency ──
  {
    triggers: ['blockchain', 'smart contract', 'defi', 'digital asset', 'distributed ledger', 'dlt', 'cbdc', 'digital currency', 'crypto', 'nft'],
    skills: ['blockchain', 'ethereum', 'solidity', 'smart contract', 'defi', 'web3', 'decentralized', 'distributed ledger', 'dlt', 'hyperledger', 'corda', 'ripple', 'xrp', 'bitcoin', 'cbdc', 'central bank digital currency', 'digital asset', 'tokenization', 'nft', 'wallet', 'consensus', 'proof of stake', 'proof of work', 'hash', 'cryptography', 'metamask', 'truffle', 'hardhat']
  },
  // ── Banking Security & Cybersecurity Engineering ──
  {
    triggers: ['security engineer', 'penetration test', 'vulnerability', 'iam', 'identity access', 'devsecops', 'banking security', 'data privacy', 'cryptography', 'encryption', 'digital vault', 'pci compliance'],
    skills: ['cybersecurity', 'penetration testing', 'vapt', 'owasp', 'sast', 'dast', 'iam', 'identity access management', 'oauth', 'saml', 'sso', 'mfa', '2fa', 'devsecops', 'siem', 'soc', 'firewall', 'waf', 'ids', 'ips', 'encryption', 'aes', 'rsa', 'tls', 'ssl', 'pki', 'hsm', 'key management', 'data privacy', 'gdpr', 'pci-dss', 'iso 27001', 'nist', 'zero trust', 'vulnerability assessment', 'threat modeling', 'incident response']
  },
  // ── Banking Cloud, DevOps & Infrastructure ──
  {
    triggers: ['cloud', 'devops', 'kubernetes', 'docker', 'ci/cd', 'infrastructure', 'sre', 'site reliability', 'cloud migration', 'cloud native', 'multi-tenant', 'linux', 'system admin'],
    skills: ['aws', 'azure', 'gcp', 'cloud computing', 'kubernetes', 'k8s', 'docker', 'containerization', 'terraform', 'ansible', 'jenkins', 'gitlab ci', 'github actions', 'ci/cd', 'devops', 'sre', 'site reliability', 'infrastructure as code', 'iac', 'linux', 'unix', 'nginx', 'apache', 'load balancer', 'auto scaling', 'monitoring', 'prometheus', 'grafana', 'elk', 'datadog', 'cloud migration', 'lift and shift', 'multi-tenant', 'microservices', 'service mesh', 'istio']
  },
  // ── Banking Data Engineering & Analytics ──
  {
    triggers: ['data engineer', 'data pipeline', 'data warehouse', 'big data', 'data governance', 'etl', 'banking analytics', 'financial data'],
    skills: ['data engineering', 'etl', 'elt', 'data pipeline', 'apache spark', 'hadoop', 'hive', 'kafka', 'airflow', 'nifi', 'data warehouse', 'data lake', 'snowflake', 'redshift', 'bigquery', 'databricks', 'data modeling', 'star schema', 'data governance', 'data quality', 'data lineage', 'metadata management', 'master data', 'big data', 'batch processing', 'stream processing', 'real-time analytics']
  },
  // ── Machine Learning & AI in Banking ──
  {
    triggers: ['machine learning', 'credit scoring', 'fraud detection', 'risk analytics', 'quantitative', 'algorithmic', 'predictive', 'credit risk model'],
    skills: ['machine learning', 'deep learning', 'neural network', 'tensorflow', 'pytorch', 'scikit-learn', 'xgboost', 'random forest', 'logistic regression', 'credit scoring', 'fraud detection', 'anomaly detection', 'nlp', 'natural language processing', 'computer vision', 'ocr', 'feature engineering', 'model training', 'model deployment', 'mlops', 'quantitative analysis', 'algorithmic trading', 'risk modeling', 'monte carlo', 'time series', 'forecasting']
  },
  // ── Banking API & Integration Engineering ──
  {
    triggers: ['api integration', 'open banking', 'middleware', 'esb', 'financial integration', 'b2b banking', 'legacy integration', 'saas banking'],
    skills: ['api', 'rest api', 'restful', 'graphql', 'soap', 'wsdl', 'openapi', 'swagger', 'postman', 'api gateway', 'kong', 'apigee', 'mulesoft', 'esb', 'enterprise service bus', 'middleware', 'integration', 'webhooks', 'event driven', 'message broker', 'kafka', 'rabbitmq', 'activemq', 'microservices', 'soa', 'open banking', 'psd2', 'oauth2', 'api security', 'rate limiting', 'throttling']
  },
  // ── Banking Mobile & Frontend Engineering ──
  {
    triggers: ['mobile banking app', 'mobile wallet', 'mobile payment', 'banking ui', 'banking ux', 'e-banking portal', 'digital onboarding', 'ios', 'android'],
    skills: ['ios', 'swift', 'objective-c', 'android', 'kotlin', 'java', 'react native', 'flutter', 'dart', 'xamarin', 'mobile app', 'push notification', 'biometric', 'fingerprint', 'face id', 'touch id', 'deep link', 'app store', 'play store', 'aso', 'ui/ux', 'responsive design', 'progressive web app', 'pwa', 'angular', 'react', 'vue', 'typescript', 'html5', 'css3', 'bootstrap', 'material design']
  },
  // ── Banking Backend & Server-Side Engineering ──
  {
    triggers: ['backend engineer', 'java developer', 'golang', 'microservices', 'distributed system', 'high availability', 'scalable transaction', 'financial microservices'],
    skills: ['java', 'spring boot', 'spring cloud', 'j2ee', 'hibernate', 'jpa', 'golang', 'go', 'python', 'django', 'flask', 'fastapi', 'node.js', 'express', 'c#', '.net', 'asp.net', 'ruby', 'scala', 'akka', 'microservices', 'distributed systems', 'event sourcing', 'cqrs', 'saga pattern', 'circuit breaker', 'load balancing', 'horizontal scaling', 'caching', 'redis', 'memcached', 'grpc', 'protobuf', 'concurrency', 'multithreading']
  },
  // ── Banking Database & Storage Engineering ──
  {
    triggers: ['database engineer', 'database admin', 'dba', 'oracle', 'sql server', 'core banking database'],
    skills: ['oracle', 'oracle rac', 'oracle exadata', 'sql server', 'mssql', 'postgresql', 'mysql', 'mongodb', 'cassandra', 'couchbase', 'redis', 'elasticsearch', 'sql', 'pl/sql', 't-sql', 'stored procedure', 'trigger', 'indexing', 'query optimization', 'partitioning', 'replication', 'backup', 'recovery', 'high availability', 'rac', 'data guard', 'always on', 'database migration', 'schema design', 'normalization']
  },
  // ── SWIFT & Financial Messaging Engineering ──
  {
    triggers: ['swift', 'iso 20022', 'financial messaging', 'mt message', 'mx message', 'iban'],
    skills: ['swift', 'swift messaging', 'mt103', 'mt202', 'mt700', 'mt940', 'mt950', 'iso 20022', 'mx message', 'pain', 'pacs', 'camt', 'swift gpi', 'swift alliance', 'fin', 'fileact', 'iban', 'bic', 'routing', 'correspondent banking', 'nostro', 'vostro', 'message parsing', 'message validation', 'stp', 'straight through processing']
  },
  // ── Banking QA & Test Engineering ──
  {
    triggers: ['qa engineer', 'test engineer', 'quality assurance', 'automated test', 'performance test', 'banking test'],
    skills: ['qa', 'quality assurance', 'manual testing', 'automation testing', 'selenium', 'cypress', 'appium', 'jmeter', 'loadrunner', 'gatling', 'performance testing', 'load testing', 'stress testing', 'regression testing', 'integration testing', 'api testing', 'postman', 'rest assured', 'bdd', 'tdd', 'cucumber', 'gherkin', 'test plan', 'test case', 'defect tracking', 'jira', 'agile testing', 'security testing', 'penetration testing']
  },
  // ── RPA & Process Automation (Banking) ──
  {
    triggers: ['rpa', 'robotic process', 'automation', 'bot', 'process automation'],
    skills: ['rpa', 'uipath', 'automation anywhere', 'blue prism', 'power automate', 'robotic process automation', 'bot development', 'workflow automation', 'process mining', 'intelligent automation', 'cognitive automation', 'ocr', 'document processing', 'data extraction', 'screen scraping', 'attended bot', 'unattended bot', 'orchestrator']
  },
  // ── Mainframe & Legacy Modernization ──
  {
    triggers: ['mainframe', 'cobol', 'legacy', 'modernization', 'as400', 'ibm'],
    skills: ['mainframe', 'cobol', 'jcl', 'cics', 'db2', 'vsam', 'ims', 'as400', 'rpg', 'ibm', 'z/os', 'tso', 'ispf', 'rexx', 'legacy modernization', 'replatforming', 'refactoring', 'strangler pattern', 'api wrapping', 'batch processing', 'online transaction processing', 'oltp']
  },
  // ── Trading & Securities Systems Engineering ──
  {
    triggers: ['trading system', 'hft', 'high frequency', 'algorithmic trading', 'securities', 'fix protocol', 'market data'],
    skills: ['trading systems', 'fix protocol', 'market data', 'order management', 'oms', 'execution management', 'ems', 'algorithmic trading', 'hft', 'high frequency trading', 'low latency', 'co-location', 'matching engine', 'order book', 'market maker', 'smart order routing', 'back testing', 'quantitative', 'tick data', 'reuters', 'bloomberg', 'fpga', 'c++', 'java', 'python']
  },
  // ── ATM, POS & Self-Service Terminal Engineering ──
  {
    triggers: ['atm software', 'pos software', 'self-service', 'kiosk', 'terminal software', 'cdm software', 'edc'],
    skills: ['atm software', 'ncr', 'diebold', 'wincor', 'xfs', 'cen/xfs', 'pos software', 'edc terminal', 'emv', 'nfc', 'contactless', 'pin pad', 'hsm', 'terminal management', 'tms', 'remote monitoring', 'cash management', 'cdm', 'recycler', 'kiosk', 'self-service', 'queue management', 'digital signage']
  },
  // ── RegTech & Compliance Systems Engineering ──
  {
    triggers: ['regtech', 'regulatory reporting', 'aml tech', 'kyc system', 'compliance system', 'transaction monitoring', 'sanction screening'],
    skills: ['regtech', 'regulatory reporting', 'xbrl', 'aml systems', 'transaction monitoring', 'sanction screening', 'watchlist', 'pep screening', 'adverse media', 'case management', 'str', 'ctr', 'kyc automation', 'e-kyc', 'digital identity', 'biometric verification', 'face recognition', 'liveness detection', 'risk scoring', 'rule engine', 'actimize', 'norkom', 'oracle fccm', 'sas aml']
  },
  // ── Lending & Mortgage Tech Engineering ──
  {
    triggers: ['lending platform', 'loan origination system', 'los', 'mortgage tech', 'credit scoring system', 'digital lending', 'alm developer'],
    skills: ['loan origination system', 'los', 'loan management system', 'lms', 'credit scoring', 'credit decision engine', 'underwriting', 'workflow engine', 'document management', 'e-signature', 'mortgage platform', 'digital lending', 'p2p lending', 'bnpl', 'buy now pay later', 'collections system', 'recovery management', 'alm', 'asset liability management', 'interest rate risk', 'gap analysis', 'duration analysis']
  }
];






// High-value domain-specific phrases that deserve extra scoring bonus
const HIGH_VALUE_PHRASES = [
  // Remittance & Compliance
  'remittance', 'regulatory compliance', 'due diligence', 'account reconciliation',
  'dispute resolution', 'management report', 'customer service', 'aml', 'kyc',
  'money transfer', 'foreign exchange', 'compliance officer', 'risk management',
  'english proficiency', 'report preparation', 'partner management', 'mis report',
  'inward remittance', 'outward remittance', 'correspondent bank', 'bangladesh bank',
  'customer complaint', 'english speaking', 'english writing', 'regulatory report',
  'machine learning', 'data analysis', 'project management', 'financial reporting',
  // Digital Banking & FinTech
  'digital banking', 'mobile banking', 'internet banking', 'fintech', 'neobank',
  'digital wallet', 'digital payment', 'qr payment', 'contactless payment',
  'app marketing', 'user acquisition', 'e-kyc', 'digital onboarding',
  // Cards & ADC
  'credit card', 'debit card', 'prepaid card', 'virtual card', 'pos terminal',
  'merchant acquiring', 'card issuing', 'loyalty program', 'rewards program',
  'agent banking', 'financial inclusion', 'alternative delivery channel',
  // Lending & Credit
  'loan origination', 'credit scoring', 'credit risk', 'digital lending',
  'personal loan', 'home loan', 'sme loan', 'working capital', 'npl',
  // Core Banking & Tech
  'core banking', 'banking software', 'banking api', 'open banking', 'cloud banking',
  'payment gateway', 'api integration', 'pci-dss',
  // Treasury & Trade
  'treasury management', 'capital market', 'trade finance', 'letter of credit',
  'portfolio management', 'asset management',
  // Islamic Banking
  'islamic banking', 'shariah compliance', 'mudaraba', 'murabaha',
  // Product & Analytics
  'product management', 'product roadmap', 'business intelligence', 'data analytics',
  'customer segmentation', 'predictive analytics',
  // Partnership & Branding
  'strategic alliance', 'bancassurance', 'brand strategy', 'corporate communication',
  'crisis communication', 'employer branding',
  // Operations
  'branch management', 'cash management', 'transaction processing',
  'internal audit', 'internal control', 'fraud detection',
  // MFS
  'mobile financial services', 'bkash', 'nagad', 'bill payment',
  // General Banking
  'deposit mobilization', 'corporate banking', 'retail banking', 'wealth management',
  'private banking', 'green banking', 'sustainable finance',
  // Banking Engineering & Technical
  'core banking software', 'banking platform', 'payment systems', 'transaction processing',
  'blockchain', 'smart contract', 'defi', 'distributed ledger', 'cbdc',
  'penetration testing', 'identity access management', 'devsecops', 'zero trust',
  'kubernetes', 'docker', 'ci/cd', 'site reliability', 'cloud migration',
  'data pipeline', 'data warehouse', 'etl', 'data governance', 'big data',
  'machine learning', 'deep learning', 'fraud detection', 'credit scoring',
  'rest api', 'api gateway', 'microservices', 'open banking', 'middleware',
  'react native', 'flutter', 'mobile app', 'progressive web app',
  'spring boot', 'distributed systems', 'event sourcing', 'cqrs',
  'oracle rac', 'postgresql', 'mongodb', 'elasticsearch',
  'swift messaging', 'iso 20022', 'iso 8583', 'straight through processing',
  'selenium', 'automation testing', 'performance testing', 'load testing',
  'uipath', 'robotic process automation', 'process mining',
  'mainframe', 'cobol', 'legacy modernization',
  'fix protocol', 'algorithmic trading', 'high frequency trading',
  'atm software', 'pos software', 'emv', 'nfc',
  'regtech', 'transaction monitoring', 'sanction screening', 'e-kyc',
  'loan origination system', 'mortgage platform', 'asset liability management',
];








// Common stop words to skip in keyword matching
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'i','we','you','he','she','it','they','my','your','his','her','its','our',
  'their','that','this','these','those','as','so','if','then','not','no',
  'strong','mandatory','ensure','manage','prepare','resolve','skills','ability',
  'good','very','also','must','need','required','including','such','etc',
]);





// ── Search (Upgraded) ─────────────────────────────────────────────────
// ── Levenshtein Distance (Fuzzy / Spell-correction) ─────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// Find the closest matching word in a vocabulary (for spell correction)
function fuzzyCorrect(word, vocabulary, maxDist = 2) {
  if (word.length < 4) return word; // skip short words
  let best = word, bestDist = Infinity;
  for (const v of vocabulary) {
    if (Math.abs(v.length - word.length) > maxDist) continue; // quick length filter
    const d = levenshtein(word, v);
    if (d < bestDist && d <= maxDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

async function localSearch(jobSpec, topK = 100, fileFilters = []) {
  if (db.cvs.length === 0) return [];
  const embedder = await initEmbedder();

  // Step 1: Expand query with domain synonyms
  let expandedQuery = jobSpec.toLowerCase();
  const synonymExpansions = [];

  Object.keys(DOMAIN_SYNONYMS).forEach(key => {
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedKey}\\b`, 'gi');
    if (regex.test(expandedQuery)) {
      const syns = DOMAIN_SYNONYMS[key];
      const synList = Array.isArray(syns) ? syns : [syns];
      synonymExpansions.push(...synList);
    }
  });

  // Step 1.5: Smart Concept Expansion
  SMART_CONCEPT_MAP.forEach(concept => {
    const hasTrigger = concept.triggers.some(trigger => {
      const regex = new RegExp(`\\b${trigger}\\b`, 'gi');
      return regex.test(expandedQuery);
    });
    if (hasTrigger) {
      concept.skills.forEach(skill => {
        if (!expandedQuery.includes(skill) && !synonymExpansions.includes(skill)) {
          synonymExpansions.push(skill);
        }
      });
    }
  });

  // Extract user's exact keywords (for accurate percentage)
  const userKeywords = [...new Set(expandedQuery
    .split(/[\s,;.!?()\[\]\/\\\-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w)))];

  // Extract expanded keywords
  const expandedKeywords = [...new Set(synonymExpansions.join(' ')
    .split(/[\s,;.!?()\[\]\/\\\-]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w)))];

  // Combine them for matching, but we'll score percentage against userKeywords
  const allKeywords = [...new Set([...userKeywords, ...expandedKeywords])];

  // Step 3: Compute IDF-style weights
  const keywordWeights = {};
  allKeywords.forEach(kw => {
    const docFreq = db.cvs.filter(cv => cv.text.toLowerCase().includes(kw)).length;
    const idf = docFreq > 0 ? Math.log((db.cvs.length + 1) / (docFreq + 1)) + 1.0 : 2.0;
    keywordWeights[kw] = idf;
  });
  const totalUserWeight = userKeywords.reduce((a, b) => a + (keywordWeights[b] || 1), 0) || 1;
  const totalWeight = allKeywords.reduce((a, b) => a + (keywordWeights[b] || 1), 0) || 1;

  // Step 4: Get semantic embeddings for the query
  const queryLines = jobSpec.split(/[\n.!?]+/).map(l => l.trim()).filter(l => l.length > 10);
  if (queryLines.length === 0) queryLines.push(jobSpec);
  if (synonymExpansions.length > 0) queryLines.push(synonymExpansions.join(' '));

  const queryEmbeddings = [];
  if (embedder) {
    for (const line of queryLines) {
      try {
        const output = await embedder(line.substring(0, 500), { pooling: 'mean', normalize: true });
        queryEmbeddings.push(Array.from(output.data));
      } catch (e) {
        console.error('Embedding error:', e.message);
      }
    }
  }

  // Step 5: Score each CV
  const candidatesToSearch = fileFilters && fileFilters.length > 0 ? db.cvs.filter(cv => fileFilters.includes(cv.filename)) : db.cvs;
  const results = candidatesToSearch.map(cv => {
    const txtLower = cv.text.toLowerCase();

    // A) Semantic vector similarity
    let semanticScore = 0;
    if (queryEmbeddings.length > 0) {
      let totalLineScore = 0;
      const cvEmbeddingsToSearch = (cv.embeddings && cv.embeddings.length > 0)
        ? cv.embeddings
        : (cv.embedding && cv.embedding.length > 0 ? [cv.embedding] : []);

      if (cvEmbeddingsToSearch.length > 0) {
        for (const qEmb of queryEmbeddings) {
          let maxChunkScore = 0;
          for (const chunkEmb of cvEmbeddingsToSearch) {
            const score = cosineSimilarity(qEmb, chunkEmb);
            if (score > maxChunkScore) maxChunkScore = score;
          }
          totalLineScore += maxChunkScore;
        }
        semanticScore = totalLineScore / queryEmbeddings.length;
      }
    }

    // B) IDF-weighted keyword score
    let weightedMatchScore = 0;
    const matchedKeywords = [];
    let matchedUserKeywordCount = 0;

    allKeywords.forEach(kw => {
      const escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKw}\\b`);
      if (regex.test(txtLower)) {
        weightedMatchScore += keywordWeights[kw];
        matchedKeywords.push(kw);
        if (userKeywords.includes(kw)) {
          matchedUserKeywordCount++;
        }
      }
    });
    
    // Normalize against ALL keywords for the score, so expansions give a boost
    const normalizedKeywordScore = (weightedMatchScore / totalWeight) * 0.45;

    // C) High-value phrase bonus
    let phraseBonus = 0;
    const matchedPhrases = [];
    HIGH_VALUE_PHRASES.forEach(phrase => {
      const escapedPhrase = phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedPhrase}\\b`);
      if (regex.test(txtLower)) {
        phraseBonus += 0.04;
        if (!matchedPhrases.includes(phrase)) matchedPhrases.push(phrase);
      }
    });
    phraseBonus = Math.min(phraseBonus, 0.28);

    // D) Term frequency bonus
    let freqBonus = 0;
    matchedKeywords.slice(0, 8).forEach(kw => {
      const escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const matches = txtLower.match(new RegExp(`\\b${escapedKw}\\b`, 'g'));
      const count = matches ? matches.length : 0;
      if (count > 1) freqBonus += Math.min((count - 1) * 0.006, 0.02);
    });
    freqBonus = Math.min(freqBonus, 0.06);

    // E) Total Score
    let totalScore;
    if (matchedKeywords.length === 0 && normalizedKeywordScore === 0) {
      totalScore = (semanticScore * 0.90) + phraseBonus;
    } else {
      totalScore = (semanticScore * 0.45) + normalizedKeywordScore + phraseBonus + freqBonus;
    }
    totalScore = Math.min(totalScore, 0.99);

    // Calculate match percentage based purely on user's exact keywords so it doesn't artificially drop
    const matchPct = userKeywords.length > 0 
        ? Math.round((matchedUserKeywordCount / userKeywords.length) * 100) 
        : (matchedKeywords.length > 0 ? 50 : 0);

    return {
      cv,
      score: totalScore,
      matched_keywords: matchedKeywords.slice(0, 15),
      matched_phrases: matchedPhrases.slice(0, 8),
      keyword_match_pct: Math.min(matchPct, 100)
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ── API Exports ───────────────────────────────────────────────────────
let isSearchCancelled = false;

module.exports = {
  cancelSearch: () => { isSearchCancelled = true; },
  getStatus: () => ({ status: 'ok', total_cvs: db.cvs.length }),
  ingestFiles: async (filePaths) => {
    logger.logActivity('CV Upload (Backend)', `Starting ingestion of ${filePaths.length} file(s).`);
    const results = [];
    for (const fp of filePaths) results.push(await processFile(fp));
    return { results };
    return { results };
  },
  search: async (jobSpec, topK, fileFilters, apiKey) => {
    logger.logActivity('Search Run (Backend)', `Mode: Quick | TopK: ${topK} | Query: "${jobSpec.substring(0, 50)}..."`);
    isSearchCancelled = false;
    const top = await localSearch(jobSpec, topK, fileFilters);
    if (isSearchCancelled) return { results: [], cancelled: true };
    return {
      results: top.map(r => ({
        ...r.cv,
        similarity_score: Math.round(r.score * 1000) / 10,
        ai_score: null,
        embedding: undefined,
        embeddings: undefined,
        matched_keywords: r.matched_keywords,
        matched_phrases: r.matched_phrases,
        keyword_match_pct: r.keyword_match_pct
      }))
    };
  },
  aiSearch: async (jobSpec, topK, fileFilters, apiKey) => {
    if (!apiKey) throw new Error('OpenAI API Key is required. Please set it in Settings.');
    const openai = new OpenAI({ apiKey });
    isSearchCancelled = false;
    const top = await localSearch(jobSpec, Math.min(topK * 2, 200), fileFilters);
    if (!top.length) return { results: [] };
    const candidates = top.slice(0, topK).map(r => ({ ...r.cv, similarity_score: Math.round(r.score * 1000) / 10, embedding: undefined, embeddings: undefined }));
    const results = [];
    let totalTokens = 0;
    
    for (const cv of candidates) {
      if (isSearchCancelled) {
        console.log(`[AI Search Cancelled] Tokens so far: ${totalTokens}`);
        return { results, totalTokens, cancelled: true };
      }
      try {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an intelligent CV search assistant. Output only valid raw JSON.' },
            { role: 'user', content: `Score candidate strictly against the User Query.\nQuery: "${jobSpec}"\nName: ${cv.candidate_name}\nData: ${cv.text.substring(0,3000)}\n\nCRITICAL SCORING: Evaluate purely on how well the candidate matches the specific intent of the User Query. Expand acronyms (e.g. ML=Machine Learning, NLP=Natural Language Processing). If it is a sentence (e.g. "someone for software project"), match the core requirements (software, project management). Do NOT penalize for unrelated background if they match the query.\nJSON Format: {"score": 0-100, "justification": "text with **bold** matching keywords explaining why they match the query", "personal_info": {"name": "extract or N/A", "age": "extract or N/A", "email": "extract or N/A", "phone": "extract or N/A", "address": "extract or N/A", "education": "highest degree or N/A", "experience": "years/summary or N/A"}, "skills": [], "summary": "...", "status": "Excellent Match|Good Match|Poor Match", "strengths": [], "gaps": []}` }
          ],
          response_format: { type: 'json_object' }, temperature: 0.3
        });
        
        if (res.usage && res.usage.total_tokens) {
          totalTokens += res.usage.total_tokens;
        }

        const parsed = JSON.parse(res.choices[0].message.content);
        results.push({ ...cv, ai_score: parsed.score || 0, justification: parsed.justification || '', personal_info: parsed.personal_info || {}, skills: parsed.skills || [], summary: parsed.summary || '', ai_status: parsed.status || 'Unknown', strengths: parsed.strengths || [], gaps: parsed.gaps || [] });
      } catch (e) {
        results.push({ ...cv, ai_score: 0, justification: 'Error', skills: [], summary: '', ai_status: 'Error' });
      }
    }
    results.sort((a, b) => b.ai_score - a.ai_score);
    console.log(`[AI Search Token Burn] Query: "${jobSpec}" | Candidates: ${candidates.length} | Total Tokens: ${totalTokens}`);
    return { results, totalTokens };
  },
  summarizeCandidate: async ({ candidateName, text, apiKey }) => {
    try {
      if (!apiKey) return { status: 'error', message: 'API Key missing' };
      const openai = new OpenAI({ apiKey });
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'Output JSON: summary, skills, experience_years, education, key_achievements' }, { role: 'user', content: `Name: ${candidateName}\nProfile: ${text.substring(0,4000)}` }],
        response_format: { type: 'json_object' }
      });
      return { status: 'success', ...JSON.parse(res.choices[0].message.content) };
    } catch (e) { return { status: 'error', message: e.message }; }
  },

  emailDraft: async (jobSpec, candidates, apiKey) => {
    const emails = [];
    if (!apiKey) return [{ candidate_name: 'System', subject: 'Error', body: 'API Key is required. Please add it in Settings.' }];
    const openai = new OpenAI({ apiKey });
    for (const cv of candidates) {
      try {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: 'Output JSON: subject, body' }, { role: 'user', content: `Draft interview invite. Name: ${cv.candidate_name}, Role: ${jobSpec}` }],
          response_format: { type: 'json_object' }
        });
        emails.push({ candidate_name: cv.candidate_name, ...JSON.parse(res.choices[0].message.content) });
      } catch (e) { emails.push({ candidate_name: cv.candidate_name, subject: 'Invite', body: 'Error generating' }); }
    }
    return emails;
  },
  getCandidates: () => {
    const seen = {};
    db.cvs.forEach(c => { if(!seen[c.filename]) seen[c.filename] = { filename: c.filename, hash: c.source_hash||c.hash, count:0 }; seen[c.filename].count++; });
    return { candidates: Object.values(seen), total: db.cvs.length };
  },
  getAnalytics: () => {
    const formats = { pdf: 0, docx: 0, image: 0, other: 0 };
    const seen = new Set();
    db.cvs.forEach(c => {
      const h = c.source_hash||c.hash;
      if (!seen.has(h)) {
        seen.add(h);
        const ext = c.filename.split('.').pop().toLowerCase();
        if (ext === 'pdf') formats.pdf++; else if (['doc','docx'].includes(ext)) formats.docx++; else if (['jpg','png'].includes(ext)) formats.image++; else formats.other++;
      }
    });
    return { formats, total: db.cvs.length };
  },
  analyzeKeyword: async (keyword, topK) => {
    const top = await localSearch(keyword, topK);
    return { results: top.map(r => ({ ...r.cv, score: Math.round(r.score * 100), embedding: undefined, embeddings: undefined, matched_keywords: r.matched_keywords, matched_phrases: r.matched_phrases })) };
  },
  clearDatabase: () => { 
    logger.logActivity('Database Cleared (Backend)', 'All CV data was erased.');
    db.cvs = []; 
    saveDb(); 
    return { status: 'cleared' }; 
  },
  deleteFile: (filenameOrHash) => {
    logger.logActivity('File Deleted (Backend)', `Deleted candidate hash/name: ${filenameOrHash}`);
    db.cvs = db.cvs.filter(c => c.filename !== filenameOrHash && c.source_hash !== filenameOrHash && c.hash !== filenameOrHash);
    saveDb();
    return { status: 'deleted' };
  }
};



