const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const logger = require('./logger');
const xlsx = require('xlsx');

// Extraction logic (supports pdf, docx, excel, image)
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
        } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
            const workbook = xlsx.readFile(filepath);
            let excelText = '';
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                excelText += xlsx.utils.sheet_to_txt(sheet) + '\n';
            });
            text = excelText;
        } else if (ext === '.txt') {
            text = fs.readFileSync(filepath, 'utf-8');
        }
    } catch (e) {
        console.error(`Extract error ${filepath}:`, e.message);
    }
    return text.trim();
}

async function analyzeCandidate(filePath, cvText, jobSpec, actualApiKey) {
    if (!cvText || cvText.length < 20) {
        return {
            filePath,
            filename: path.basename(filePath),
            score: 0,
            justification: 'Could not extract enough text from the document.',
            error: true
        };
    }

    const openai = new OpenAI({ apiKey: actualApiKey });
    const prompt = `You are an expert HR Recruitment & CV Analysis System.
Evaluate this candidate against the given Job Description.
Return a strict JSON object with:
- "score": percentage (0-100) indicating how perfectly the candidate matches the JD.
- "justification": a short summary of why they match or what they lack.

Job Description:
${jobSpec}

Candidate CV (Extracted Text):
${cvText.substring(0, 10000)}
`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You evaluate CVs against JDs and output strict JSON." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const result = JSON.parse(completion.choices[0].message.content);
        const tokens = completion.usage ? completion.usage.total_tokens : 0;
        return {
            filePath,
            filename: path.basename(filePath),
            score: result.score || 0,
            justification: result.justification || '',
            tokens: tokens,
            error: false
        };
    } catch (err) {
        console.error('AI analysis error for', filePath, err);
        return {
            filePath,
            filename: path.basename(filePath),
            score: 0,
            justification: 'Error during AI analysis.',
            tokens: 0,
            error: true
        };
    }
}

async function analyzeCandidateOllama(filePath, cvText, jobSpec) {
    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'phi3',
                prompt: `You are an HR expert. Analyze this CV against the Job Description. Return a JSON object with "score" (0-100) and "justification" (1 short sentence).\n\nJob Description:\n${jobSpec.substring(0, 3000)}\n\nCandidate CV:\n${cvText.substring(0, 2000)}`,
                format: 'json',
                stream: false,
                options: {
                    num_predict: 60,
                    temperature: 0.1
                }
            })
        });
        const data = await response.json();
        const rawResponse = (data.response || '').trim();
        
        let result = { score: 0, justification: 'Could not parse response.' };
        try {
            // Step 1: Strip markdown code fences if present (```json ... ```)
            let cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            // Step 2: Extract the JSON object
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                result = JSON.parse(cleaned);
            }
        } catch(e) {
            console.error('Ollama JSON parse error:', e.message, 'Raw:', rawResponse.substring(0, 200));
            // Try to extract score from raw text as last resort
            const scoreMatch = rawResponse.match(/"score"\s*:\s*(\d+)/);
            const justMatch = rawResponse.match(/"justification"\s*:\s*"([^"]+)"/);
            if (scoreMatch) result.score = parseInt(scoreMatch[1]);
            if (justMatch) result.justification = justMatch[1];
        }

        return {
            filePath,
            filename: path.basename(filePath),
            score: Math.min(100, Math.max(0, parseInt(result.score) || 0)),
            justification: String(result.justification || '').substring(0, 200),
            tokens: 0,
            error: false
        };
    } catch (err) {
        console.error('Ollama connection error:', err.message);
        return {
            filePath,
            filename: path.basename(filePath),
            score: 0,
            justification: 'Error connecting to Ollama Local LLM. Please make sure Ollama is installed and running the "phi3" model on your PC.',
            error: true
        };
    }
}

async function runJobFitAnalysis({ filePaths, jobSpec, apiKey, mode }) {
    logger.logActivity(`Job Fit Analysis (Backend)`, `Mode: ${mode || 'ai'} | Files: ${filePaths.length} | Spec: "${jobSpec.substring(0, 50)}..."`);
    try {
        const actualApiKey = apiKey;

        if (mode !== 'quick' && !actualApiKey) {
            return { error: 'API Key is required for Cloud AI. Please set it in Settings.' };
        }

        let totalTokens = 0;
        const results = [];
        // Process sequentially to respect rate limits if many files, or in small batches
        for (const fp of filePaths) {
            if (fs.existsSync(fp)) {
                const text = await extractText(fp);
                let analysis;
                if (mode === 'quick') {
                    // Local LLM (Ollama)
                    analysis = await analyzeCandidateOllama(fp, text, jobSpec);
                } else {
                    // Cloud AI (OpenAI)
                    analysis = await analyzeCandidate(fp, text, jobSpec, actualApiKey);
                }
                
                if (analysis.tokens) totalTokens += analysis.tokens;
                results.push(analysis);
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        return { results, totalTokens };
    } catch (e) {
        console.error('runJobFitAnalysis error:', e);
        return { error: e.message };
    }
}

module.exports = { runJobFitAnalysis };
