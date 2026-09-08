const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const logger = require('./logger');

// Evaluation Cache to ensure 100% deterministic consistency & zero duplicate token burns
const singleCvCache = new Map();

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

// Extraction logic
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
    return chunks.length > 0 ? chunks : [text.substring(0, maxChars)];
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

function extractKeywords(text) {
    const stopWords = new Set(['a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','i','we','you','he','she','it','they','that','this','these','those','as','so','if','then','not','no','requirement','requirements','must','need','required','good','excellent','strong','skills','experience']);
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    const kw = new Set();
    words.forEach(w => {
        if (w.length > 2 && !stopWords.has(w)) kw.add(w);
    });
    return Array.from(kw);
}

async function matchSingleCv({ filePath, jobSpec, mode, apiKey }) {
    logger.logActivity(`Single CV Match (Backend)`, `Mode: ${mode || 'quick'} | File: ${path.basename(filePath)} | Spec: "${jobSpec.substring(0, 50)}..."`);
    try {
        if (!fs.existsSync(filePath)) {
            return { error: `File not found at path: ${filePath}` };
        }

        const cvText = await extractText(filePath);
        if (!cvText || cvText.length < 20) {
            return { error: `The system could not read this PDF. This usually happens if the PDF is a scanned document or an image saved as a PDF (it has no selectable text). Please convert it to a JPG/PNG image, or upload a normal text-based PDF.` };
        }

        // Cache Key for 100% deterministic consistency & instant retrieval
        const cacheKey = crypto.createHash('sha256').update(cvText.trim().toLowerCase() + ':::' + jobSpec.trim().toLowerCase() + ':::' + mode).digest('hex');
        if (singleCvCache.has(cacheKey)) {
            return JSON.parse(JSON.stringify(singleCvCache.get(cacheKey)));
        }

        if (mode === 'ai') {
            // ==========================================
            // AI SEARCH MODE (OPENAI FULL EVALUATION)
            // ==========================================
            const actualApiKey = apiKey;
            
            if (!actualApiKey) return { error: 'API Key is required for AI Match. Please set it in Settings.' };
            
            const openai = new OpenAI({ apiKey: actualApiKey });
            const prompt = `You are an expert HR Recruitment & CV Analysis System.
Your job is to read the uploaded CV's extracted text—focusing particularly on "Academic Qualification / Education" and "Employment History / Work Experience" sections (or extracting from the whole CV if those specific headings are not present)—and evaluate whether the candidate matches the following Job Requirements / Ideal Candidate Description.

Job Requirements / Candidate Description:
${jobSpec}

Candidate CV Full Data:
${cvText.substring(0, 16000)}

Analyze the candidate's exact information from the CV against each requirement dimension. State clearly how the candidate's information matches, and list any specific gaps, missing requirements, or lacks found in the CV. Do not use generic labels like "potential fit" or "partial fit"—provide direct, factual, and objective analysis.

Evaluate the overall candidate profile against the Job Requirements to determine the exact percentage score (0-100) and suitability level (Level 1 to 5):
- Level 1: Highly Recommended (5 stars)
- Level 2: Competent Fit (4 stars)
- Level 3: Conditional Fit (3 stars)
- Level 4: Below Expectations (2 stars)
- Level 5: Strictly Unfit (1 star)

Output your evaluation in strict JSON format:
{
  "score": 0-100,
  "level": 1,
  "levelTitle": "Level 1: Highly Recommended | Level 2: Competent Fit | Level 3: Conditional Fit | Level 4: Below Expectations | Level 5: Strictly Unfit",
  "isEligible": true,
  "justification": "A comprehensive 2-paragraph objective evaluation summarizing how well the candidate's extracted qualifications and employment history match the job requirements, highlighting verified matches and exact lacks.",
  "education": {
    "details": "Direct factual comparison between the candidate's academic qualifications/degrees/institutions from the CV and the required education in the JD.",
    "gaps": ["List of specific missing degrees, unfulfilled educational requirements, or 'None' if fully met"]
  },
  "experience": {
    "details": "Direct factual comparison between the candidate's employment history, total years of experience, and past roles from the CV versus the required experience.",
    "gaps": ["List of specific experience lacks, missing tenure, or 'None' if fully met"]
  },
  "bankRequirements": {
    "details": "Direct comparison between candidate's banking/financial domain knowledge, certifications, regulatory understanding from the CV versus the job requirements.",
    "gaps": ["List of specific missing banking/regulatory criteria or 'None' if fully met"]
  },
  "responsibilitiesContext": {
    "details": "Direct comparison of candidate's past work context, operational scale, team size, and organizational environment versus the role's scope.",
    "gaps": ["List of specific context or scope gaps or 'None' if fully met"]
  },
  "responsibilities": {
    "details": "Direct comparison between the candidate's actual day-to-day duties/responsibilities listed in their employment history versus the required responsibilities.",
    "gaps": ["List of specific unperformed or missing core responsibilities or 'None' if fully met"]
  },
  "matchedKeywords": ["list of matching skills, keywords, tools, or domain terms found in CV"],
  "missingKeywords": ["list of required skills, keywords, or qualifications missing from CV"]
}`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini", 
                messages: [
                    { role: "system", content: "You are an expert, objective HR Recruitment & CV Analysis engine. You evaluate CVs objectively and professionally against Job Requirements across 5 standardized levels: Level 1: Highly Recommended (5 stars), Level 2: Competent Fit (4 stars), Level 3: Conditional Fit (3 stars), Level 4: Below Expectations (2 stars), Level 5: Strictly Unfit (1 star)." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0,
                seed: 42
            });

            const result = JSON.parse(completion.choices[0].message.content);
            const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

            // Normalize Level (1-5) directly from AI evaluation
            let score = typeof result.score === 'number' ? Math.max(0, Math.min(100, Math.round(result.score))) : 50;
            let level = parseInt(result.level);
            if (isNaN(level) || level < 1 || level > 5) {
                if (score >= 85) level = 1;
                else if (score >= 70) level = 2;
                else if (score >= 55) level = 3;
                else if (score >= 40) level = 4;
                else level = 5;
            }

            const LEVEL_TITLES = {
                1: "Level 1: Highly Recommended",
                2: "Level 2: Competent Fit",
                3: "Level 3: Conditional Fit",
                4: "Level 4: Below Expectations",
                5: "Level 5: Strictly Unfit"
            };

            const evaluationResult = {
                score: score,
                level: level,
                levelTitle: LEVEL_TITLES[level] || result.levelTitle || "Evaluated",
                isEligible: typeof result.isEligible === 'boolean' ? result.isEligible : (level <= 3),
                justification: result.justification || '',
                education: result.education || null,
                experience: result.experience || null,
                bankRequirements: result.bankRequirements || null,
                responsibilitiesContext: result.responsibilitiesContext || null,
                responsibilities: result.responsibilities || null,
                matchedKeywords: result.matchedKeywords || [],
                missingKeywords: result.missingKeywords || [],
                tokenUsage: {
                    totalTokens: usage.total_tokens || 0,
                    promptTokens: usage.prompt_tokens || 0,
                    completionTokens: usage.completion_tokens || 0,
                    mode: 'ai'
                },
                cvText: cvText
            };

            // Store in deterministic cache
            singleCvCache.set(cacheKey, evaluationResult);

            return evaluationResult;

        } else if (mode === 'quick') {
            // ==========================================
            // QUICK SEARCH MODE (100% LOCAL HYBRID MATCH)
            // ==========================================
            const embedder = await initEmbedder();
            if (!embedder) return { error: 'Local AI engine could not load.' };

            let reqPhrases = jobSpec.split(/[\n,;]+/)
                .map(s => s.trim())
                .filter(s => s.length > 2);
            
            if (reqPhrases.length === 0) reqPhrases = [jobSpec];

            const chunks = chunkText(cvText, 400); 
            const chunkEmbeddings = [];
            
            for (const chunk of chunks) {
                const out = await embedder(chunk, { pooling: 'mean', normalize: true });
                chunkEmbeddings.push(Array.from(out.data));
            }

            const matchedReqs = [];
            const missingReqs = [];
            let totalSim = 0;
            
            const BANKING_ROLES = require('./banking_roles.js');
            const semanticThreshold = 0.52; // Slightly lower threshold for better synonym catching
            const lowerCvText = cvText.toLowerCase();

            for (const phrase of reqPhrases) {
                const lowerPhrase = phrase.toLowerCase();
                
                // 1. EXACT KEYWORD MATCHING (100% Accuracy for direct words)
                if (lowerCvText.includes(lowerPhrase)) {
                    matchedReqs.push(phrase);
                    totalSim += 1.0; // Perfect score for exact match
                    continue;
                }

                // 2. BANKING CONTEXT & SYNONYM EXPANSION
                let enrichedPhrase = phrase;
                let matchedRoleDesc = "";
                for (const [role, desc] of Object.entries(BANKING_ROLES)) {
                    if (lowerPhrase.includes(role)) {
                        matchedRoleDesc = desc;
                        break;
                    }
                }

                if (matchedRoleDesc) {
                    enrichedPhrase = `Banking Role: ${phrase}. Responsibilities: ${matchedRoleDesc}`;
                }
                
                // 3. SEMANTIC VECTOR MATCHING
                const out = await embedder(enrichedPhrase, { pooling: 'mean', normalize: true });
                const phraseEmb = Array.from(out.data);
                
                let maxSim = 0;
                for (const cEmb of chunkEmbeddings) {
                    const sim = cosineSimilarity(phraseEmb, cEmb);
                    if (sim > maxSim) maxSim = sim;
                }
                
                totalSim += maxSim;
                
                if (maxSim >= semanticThreshold) {
                    matchedReqs.push(phrase); 
                } else {
                    missingReqs.push(phrase); 
                }
            }

            // Calculate precise score
            let avgSim = totalSim / reqPhrases.length;
            let semanticScore = Math.max(0, (avgSim - 0.4) * (100 / 0.6));
            if (semanticScore > 100) semanticScore = 100;
            
            let matchRatio = matchedReqs.length / reqPhrases.length;
            let finalScore = (semanticScore * 0.3) + (matchRatio * 100 * 0.7);
            
            if (finalScore > 100) finalScore = 100;
            if (finalScore < 0) finalScore = 0;

            let quickLevel = 3;
            if (finalScore >= 85) quickLevel = 1;
            else if (finalScore >= 70) quickLevel = 2;
            else if (finalScore >= 55) quickLevel = 3;
            else if (finalScore >= 40) quickLevel = 4;
            else quickLevel = 5;

            const LEVEL_TITLES = {
                1: "Level 1: Highly Recommended",
                2: "Level 2: Competent Fit",
                3: "Level 3: Conditional Fit",
                4: "Level 4: Below Expectations",
                5: "Level 5: Strictly Unfit"
            };

            const quickResult = {
                score: Math.round(finalScore),
                level: quickLevel,
                levelTitle: LEVEL_TITLES[quickLevel],
                isEligible: quickLevel <= 3,
                matchedKeywords: matchedReqs,
                missingKeywords: missingReqs,
                cvText: cvText,
                justification: "",
                tokenUsage: {
                    totalTokens: 0,
                    promptTokens: 0,
                    completionTokens: 0,
                    mode: 'quick'
                }
            };

            singleCvCache.set(cacheKey, quickResult);
            return quickResult;
        } else {
            return { error: 'Invalid mode.' };
        }

    } catch (e) {
        console.error('single_cv_engine match error:', e);
        return { error: e.message };
    }
}

module.exports = {
    matchSingleCv
};
