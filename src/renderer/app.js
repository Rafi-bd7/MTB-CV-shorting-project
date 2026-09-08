// ── Global Logging Interceptor ───────────────────────────────────────
['log', 'warn', 'error', 'info', 'debug'].forEach(level => {
    const original = console[level];
    console[level] = function(...args) {
        if (window.api && typeof window.api.logMessage === 'function') {
            window.api.logMessage(level, ...args);
        }
        original.apply(console, args);
    };
});

window.logActivity = function(action, details) {
    if (window.api && typeof window.api.logActivity === 'function') {
        window.api.logActivity(action, details);
    } else {
        console.log(`[ACTIVITY] ${action} - ${details}`);
    }
};

let currentSearchMode = 'quick';
let lastResults = [];
let cvDataMap = {};
let analyticsDataMap = {};

// ── Window Controls ──────────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

// ── Theme Toggle ─────────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
    themeIcon.className = 'fa-solid fa-sun';
}

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    // Re-render charts if they exist to update colors
    if (document.getElementById('nav-analytics').classList.contains('active')) {
        loadAnalytics();
    }
});

// ── Navigation ───────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        const sectionId = `section-${item.dataset.section}`;
        document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');

        if (sectionId === 'section-candidates') loadCandidates();
        if (sectionId === 'section-analytics') loadAnalytics();
        if (sectionId === 'section-reports') window.loadReportsData();
    });
});

// ── Engine Status ────────────────────────────────────────────────────
async function checkStatus() {
    try {
        const res = await window.api.getStatus();
        document.getElementById('status-dot').classList.remove('offline');
        document.getElementById('backend-status').innerText = 'Ready';
        document.getElementById('total-cvs').innerText = res.total_cvs;
        document.getElementById('hero-total').innerText = res.total_cvs;
    } catch (e) {
        console.error('Status Error:', e);
        document.getElementById('status-dot').classList.add('offline');
        document.getElementById('backend-status').innerHTML = 'Offline <span style="font-size:0.6rem;color:red;">(' + e.message + ')</span>';
    }
}

async function updateFileFilter() {
    try {
        const container = document.getElementById('file-filter-container');
        if (!container) return;
        const res = await window.api.getCandidates();
        
        const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
        const currentSelections = Array.from(checkedBoxes).map(cb => cb.value);
        
        // Prevent unnecessary DOM rebuilds that freeze the UI
        const currentDataHash = res.candidates ? JSON.stringify(res.candidates.map(c => c.filename + c.count)) : '';
        if (window.lastFileFilterHash === currentDataHash && currentDataHash !== '') {
            return;
        }
        window.lastFileFilterHash = currentDataHash;
        
        container.innerHTML = '';
        if (res.candidates && res.candidates.length > 0) {
            res.candidates.forEach((c, idx) => {
                const sl = idx + 1;
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '0.5rem';
                
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = c.filename;
                cb.id = 'filter-cb-' + sl;
                if (currentSelections.includes(c.filename)) cb.checked = true;
                
                const lbl = document.createElement('label');
                lbl.htmlFor = cb.id;
                lbl.innerText = `[SL-${sl}] ${c.filename} (${c.count} records)`;
                lbl.style.margin = '0';
                lbl.style.cursor = 'pointer';
                lbl.style.fontSize = '0.85rem';
                lbl.style.fontWeight = 'normal';
                
                div.appendChild(cb);
                div.appendChild(lbl);
                container.appendChild(div);
            });
        } else {
             container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">No files uploaded yet.</div>';
        }
    } catch (e) {
        console.error('Failed to update file filter', e);
    }
}
setInterval(updateFileFilter, 15000);
updateFileFilter();
setInterval(checkStatus, 15000);
checkStatus();
loadCandidates(); // Load candidates on startup since the table is now in Rank & Match

// ── Upload System ────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).map(f => window.api.getPathForFile(f));
    if (files.length > 0) handleFiles(files);
    fileInput.value = ''; // Reset for future uploads
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files).map(f => window.api.getPathForFile(f));
        handleFiles(files);
    }
});

async function handleFiles(filePaths) {
    if (typeof window.logActivity === 'function') {
        window.logActivity('CV Upload', `Started uploading ${filePaths.length} file(s).`);
    }
    document.getElementById('progress-area').style.display = 'block';
    const log = document.getElementById('upload-log');
    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('progress-text');
    
    // Smooth reset
    bar.style.transition = 'none';
    bar.style.width = '0%';
    setTimeout(() => { bar.style.transition = 'width 0.3s ease'; }, 50);

    log.innerHTML = '';
    let done = 0;
    
    // Process files one by one for UI updates
    for (const fp of filePaths) {
        const currentFilename = fp.split('\\').pop().split('/').pop();
        txt.innerHTML = `<strong>Scanning:</strong> <span style="color:var(--accent)">${escapeHtml(currentFilename)}</span> (${done} / ${filePaths.length} completed)`;
        
        // Slight artificial delay to allow UI to render the scanning text and animation
        await new Promise(resolve => setTimeout(resolve, 200));

        try {
            const res = await window.api.ingestFiles([fp]);
            const r = res.results[0];
            const li = document.createElement('li');
            
            if (r.status === 'success') {
                const extra = r.type === 'table' ? ` <span style="color:var(--text-muted);font-size:0.8rem;">(${r.count} rows)</span>` : '';
                li.innerHTML = `<i class="fa-solid fa-check-circle" style="color:var(--success)"></i> <span>${escapeHtml(r.filename)}${extra}</span>`;
            } else if (r.status === 'skipped') {
                li.innerHTML = `<i class="fa-solid fa-forward-step" style="color:var(--warning)"></i> <span style="color:var(--text-muted)">Skipped: ${escapeHtml(r.filename)}</span>`;
            } else {
                li.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color:var(--danger)"></i> <span style="color:var(--danger)">Error: ${escapeHtml(r.filename)}</span>`;
            }
            log.appendChild(li);
        } catch (e) {
            const li = document.createElement('li');
            li.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i> <span style="color:var(--danger)">System Error: ${escapeHtml(currentFilename)}</span>`;
            log.appendChild(li);
        }
        
        done++;
        bar.style.width = `${(done / filePaths.length) * 100}%`;
        log.scrollTop = log.scrollHeight;
    }
    
    txt.innerHTML = `<strong style="color:var(--success)"><i class="fa-solid fa-check-double"></i> Processing Complete!</strong> (${filePaths.length} files scanned)`;
    checkStatus();
    loadCandidates();
    updateFileFilter();
}

// ── Search Mode Toggle ───────────────────────────────────────────────
document.getElementById('mode-quick').addEventListener('click', () => {
    currentSearchMode = 'quick';
    document.getElementById('mode-quick').classList.add('active');
    document.getElementById('mode-ai').classList.remove('active');
    document.getElementById('search-mode-hint').innerHTML = '⚡ <strong>Quick Rank:</strong> Semantic + IDF-weighted keywords + domain synonyms (remittance, compliance, KYC, AML…)';
});
document.getElementById('mode-ai').addEventListener('click', () => {
    currentSearchMode = 'ai';
    document.getElementById('mode-ai').classList.add('active');
    document.getElementById('mode-quick').classList.remove('active');
    document.getElementById('search-mode-hint').innerHTML = '🤖 <strong>AI Smart Rank:</strong> GPT-4o-mini analyzes context, skills, and fit.';
});

// ── Main Search ──────────────────────────────────────────────────────
document.getElementById('btn-search').addEventListener('click', async () => {
    const jobSpec = document.getElementById('job-spec').value.trim();
    const topK = parseInt(document.getElementById('top-k').value) || 10;
    
    if (!jobSpec) { alert('Please enter a job specification.'); return; }
    
    if (typeof window.logActivity === 'function') {
        window.logActivity('Search Triggered', `Query: "${jobSpec.substring(0, 50)}..." | Top K: ${topK}`);
    }
    
    if (typeof window.logActivity === 'function') {
        window.logActivity('Search Triggered', `Query: "${jobSpec.substring(0, 50)}..." | Top K: ${topK}`);
    }
    
    const container = document.getElementById('file-filter-container');
    let fileFilters = [];
    if (container) {
        const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
        fileFilters = Array.from(checkedBoxes).map(cb => cb.value);
    }
    
    const apiKey = localStorage.getItem('openai_api_key') || '';
    if (currentSearchMode === 'ai' && !apiKey) {
        if (typeof window.showApiKeyWarning === 'function') window.showApiKeyWarning();
        return;
    }
    
    document.getElementById('search-loading').style.display = 'block';
    document.getElementById('results-area').style.display = 'none';
    document.getElementById('loading-msg').innerText = currentSearchMode === 'ai' ? 'AI is analyzing candidates...' : 'Running local keyword search...';
    
    try {
        let data;
        
        // Expose a way to cancel
        window.isSearchCancelled = false;
        const btnCancel = document.getElementById('btn-cancel-search');
        const cancelHandler = () => {
            window.isSearchCancelled = true;
            if (window.api && window.api.cancelSearch) window.api.cancelSearch();
        };
        if (btnCancel) {
            btnCancel.style.display = 'inline-block';
            btnCancel.addEventListener('click', cancelHandler);
        }
        
        if (currentSearchMode === 'ai') {
            data = await window.api.aiSearch({ jobSpec, topK, fileFilters, apiKey });
        } else {
            data = await window.api.search({ jobSpec, topK, fileFilters, apiKey });
        }
        
        if (btnCancel) {
            btnCancel.style.display = 'none';
            btnCancel.removeEventListener('click', cancelHandler);
        }
        
        if (window.isSearchCancelled || (data && data.cancelled)) {
            document.getElementById('results-area').style.display = 'none';
            return;
        }
        
        if (data.results && data.results.length > 0) {
            lastResults = data.results;
            cvDataMap = {};
            renderResultCards(data.results, jobSpec);
            document.getElementById('results-area').style.display = 'block';
            document.getElementById('results-count').innerText = `${data.results.length} Matches`;
            document.getElementById('btn-shortlist-email').style.display = currentSearchMode === 'ai' ? 'inline-flex' : 'none';
        } else {
            alert('No results found. Have you uploaded any CVs?');
        }
    } catch (e) {
        alert('Search failed: ' + e.message);
    } finally {
        document.getElementById('search-loading').style.display = 'none';
    }
});

// ── Render Result Cards ──────────────────────────────────────────────
function renderResultCards(results, currentJobSpec) {
    const container = document.getElementById('results-cards');
    container.innerHTML = '';

    results.forEach((item, idx) => {
        cvDataMap[idx] = item;
        const score = item.ai_score !== null ? item.ai_score : item.similarity_score;
        const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
        const name = item.candidate_name || item.filename;
        const initial = (name.trim()[0] || '#').toUpperCase();
        const isAI = item.ai_score !== null;
        
        let rankClass = 'normal';
        if (idx === 0) rankClass = 'gold';
        else if (idx === 1) rankClass = 'silver';
        else if (idx === 2) rankClass = 'bronze';

        let subInfo = item.summary || '';
        if (!subInfo && item.structured) {
            const sk = Object.keys(item.structured).find(k => /career|summary|experience/i.test(k));
            if (sk) subInfo = item.structured[sk];
        }
        if (!subInfo) subInfo = (item.text || '').substring(0, 100) + '...';

        const skillsHtml = (item.skills || []).slice(0, 5).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('');
        const statusBadge = isAI && item.ai_status ? `<span class="badge ${item.ai_status === 'Excellent Match' || item.ai_status === 'Shortlisted' ? 'success' : item.ai_status === 'Good Match' || item.ai_status === 'Potential' ? 'warning' : 'danger'}">${escapeHtml(item.ai_status)}</span>` : '';

        // Quick Search: show matched keywords and phrases
        let quickMatchHtml = '';
        if (!isAI) {
            const kwPct = item.keyword_match_pct || 0;
            const kwBadgeColor = kwPct >= 60 ? 'success' : kwPct >= 30 ? 'warning' : 'danger';
            const kwTags = (item.matched_keywords || []).slice(0, 8)
                .map(kw => `<span class="skill-tag kw-tag">${escapeHtml(kw)}</span>`).join('');
            const phraseTags = (item.matched_phrases || []).slice(0, 4)
                .map(ph => `<span class="skill-tag phrase-tag">${escapeHtml(ph)}</span>`).join('');
            quickMatchHtml = `
                <div class="quick-match-row">
                    <span class="badge ${kwBadgeColor}" title="Keyword coverage">
                        <i class="fa-solid fa-key"></i> ${kwPct}% coverage
                    </span>
                    <div class="quick-tags">${phraseTags}${kwTags}</div>
                </div>
            `;
        }

        let personal = item.personal_info || {};
        let pInfoHtml = '';
        if (isAI && Object.keys(personal).length > 0) {
            let parts = [];
            if (personal.age && personal.age !== 'N/A') parts.push(`<i class="fa-solid fa-cake-candles"></i> ${escapeHtml(personal.age)}`);
            if (personal.address && personal.address !== 'N/A') parts.push(`<i class="fa-solid fa-location-dot"></i> ${escapeHtml(personal.address)}`);
            if (personal.phone && personal.phone !== 'N/A') parts.push(`<i class="fa-solid fa-phone"></i> ${escapeHtml(personal.phone)}`);
            if (parts.length > 0) {
                pInfoHtml = `<div class="card-personal-info">${parts.join(' <span style="color:var(--border-light)">|</span> ')}</div>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="card-rank ${rankClass}">Rank #${idx + 1}</div>
            <div class="card-header">
                <div class="card-title-wrap">
                    <div class="card-name" style="display:flex; align-items:center; gap:0.5rem;">
                        ${escapeHtml(name)}
                    </div>
                    <div class="card-source"><i class="fa-solid fa-file"></i> ${escapeHtml(item.filename)}</div>
                    ${pInfoHtml}
                </div>
            </div>
            
            <div class="card-score-row">
                <div style="display:flex; flex-direction:column; gap:0.3rem;">
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:700; text-transform:uppercase;">${isAI ? 'AI Query Match' : 'Keyword Match'}</span>
                    ${statusBadge}
                </div>
                <div class="score-circle ${scoreClass}">${score}${isAI ? '' : '%'}</div>
            </div>

            <div class="card-summary">${escapeHtml(subInfo)}</div>
            ${quickMatchHtml}
            <div class="card-skills">${skillsHtml}</div>

            <div class="card-actions">
                <button class="btn-outline view-btn" data-idx="${idx}"><i class="fa-solid fa-eye"></i> View Profile</button>
                ${isAI ? `<button class="btn-glow small email-btn" data-idx="${idx}"><i class="fa-solid fa-envelope"></i> Email</button>` : ''}
            </div>
        `;
        container.appendChild(card);
    });

    // Attach events
    container.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => showCVModal(parseInt(btn.dataset.idx), cvDataMap, currentJobSpec));
    });
    container.querySelectorAll('.email-btn').forEach(btn => {
        btn.addEventListener('click', () => draftEmailForOne(parseInt(btn.dataset.idx)));
    });
}

// ── Modals ───────────────────────────────────────────────────────────
function showCVModal(idx, mapObj, currentQuery) {
    const item = mapObj[idx];
    if (!item) return;

    document.getElementById('modal-title').innerText = item.candidate_name || item.filename;
    
    let html = '';
    const score = item.ai_score !== null ? item.ai_score : item.similarity_score;
    const isAI = item.ai_score !== null;
    const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    // Score Section
    html += `
        <div class="modal-score-wrap">
            <div class="score-circle ${scoreClass}">${score}${isAI ? '' : '%'}</div>
            <div class="modal-score-info">
                <label>${isAI ? 'AI Fit Assessment' : 'Keyword Match Level'}</label>
                <div class="modal-score-track"><div class="modal-score-fill" style="width:${Math.min(score, 100)}%"></div></div>
                ${isAI && item.ai_status ? `<span class="badge ${item.ai_status === 'Excellent Match' || item.ai_status === 'Shortlisted' ? 'success' : item.ai_status === 'Good Match' || item.ai_status === 'Potential' ? 'warning' : 'danger'}">${escapeHtml(item.ai_status)}</span>` : ''}
            </div>
        </div>
    `;

    // Personal Info
    let personal = item.personal_info || {};
    if (isAI && Object.keys(personal).length > 0) {
        html += `<div class="modal-box modal-personal-grid">
            ${personal.name && personal.name !== 'N/A' ? `<div class="info-item"><i class="fa-solid fa-user"></i> <div><label>Name</label><span>${escapeHtml(personal.name)}</span></div></div>` : ''}
            ${personal.age && personal.age !== 'N/A' ? `<div class="info-item"><i class="fa-solid fa-cake-candles"></i> <div><label>Age</label><span>${escapeHtml(personal.age)}</span></div></div>` : ''}
            ${personal.address && personal.address !== 'N/A' ? `<div class="info-item"><i class="fa-solid fa-location-dot"></i> <div><label>Address</label><span>${escapeHtml(personal.address)}</span></div></div>` : ''}
            ${personal.phone && personal.phone !== 'N/A' ? `<div class="info-item"><i class="fa-solid fa-phone"></i> <div><label>Phone</label><span>${escapeHtml(personal.phone)}</span></div></div>` : ''}
            ${personal.email && personal.email !== 'N/A' ? `<div class="info-item"><i class="fa-solid fa-envelope"></i> <div><label>Email</label><span>${escapeHtml(personal.email)}</span></div></div>` : ''}
        </div>`;
    }

    // AI Justification
    if (item.justification) {
        html += `
            <div class="modal-box" style="border-color:var(--accent);">
                <h3><i class="fa-solid fa-scale-balanced"></i> AI Fit Justification</h3>
                <p style="margin:0; white-space:pre-wrap;">${renderMarkdownBold(item.justification)}</p>
            </div>
        `;
    }

    // AI Summary
    if (item.summary) {
        html += `
            <div class="modal-box">
                <h3><i class="fa-solid fa-align-left"></i> Professional Summary</h3>
                <p style="margin:0; white-space:pre-wrap;">${escapeHtml(item.summary)}</p>
            </div>
        `;
    }

    // Strengths & Gaps
    if ((item.strengths && item.strengths.length) || (item.gaps && item.gaps.length)) {
        html += `<div class="modal-grid-2">`;
        if (item.strengths && item.strengths.length) {
            html += `<div class="modal-box" style="margin-bottom:0;">
                <h3><i class="fa-solid fa-thumbs-up"></i> Key Strengths</h3>
                <ul class="modal-list success">${item.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
            </div>`;
        }
        if (item.gaps && item.gaps.length) {
            html += `<div class="modal-box" style="margin-bottom:0;">
                <h3><i class="fa-solid fa-triangle-exclamation"></i> Identified Gaps</h3>
                <ul class="modal-list warning">${item.gaps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
            </div>`;
        }
        html += `</div>`;
    }

    // Skills
    if (item.skills && item.skills.length) {
        html += `
            <div class="modal-box">
                <h3><i class="fa-solid fa-bolt"></i> Extracted Skills</h3>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                    ${item.skills.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Structured Data or Raw Text
    if (item.structured && Object.keys(item.structured).length > 0) {
        html += `<div class="modal-fields">`;
        for (const [k, v] of Object.entries(item.structured)) {
            if (!v || !String(v).trim()) continue;
            html += `<div class="modal-field"><label>${escapeHtml(k)}</label><span>${highlightText(String(v), currentQuery)}</span></div>`;
        }
        html += `</div>`;
    } else {
        html += `<div class="modal-text">${highlightText(item.text || '', currentQuery)}</div>`;
    }

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('cv-modal').classList.add('active');

    // Modal Actions
    document.getElementById('modal-open-native').onclick = () => window.api.openFile(item.filepath);
    
    const btnSummarize = document.getElementById('btn-modal-summarize');
    btnSummarize.onclick = async () => {
        btnSummarize.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
        try {
            const apiKey = localStorage.getItem('openai_api_key') || '';
            const res = await window.api.summarize({
                candidateName: item.candidate_name || item.filename,
                text: item.text,
                filename: item.filename,
                filepath: item.filepath,
                apiKey
            });
            if (res.status === 'success') {
                mapObj[idx] = { ...item, summary: res.summary, skills: res.skills || [], strengths: res.key_achievements || [] };
                showCVModal(idx, mapObj, currentQuery);
            }
        } catch (e) {
            alert('Summarize failed.');
        }
        btnSummarize.innerHTML = '<i class="fa-solid fa-brain"></i> AI Summarize';
    };

    document.getElementById('btn-modal-email').onclick = () => {
        draftEmailForItems([item], currentQuery);
    };
}

// ── Email Drafts ─────────────────────────────────────────────────────
async function draftEmailForOne(idx) {
    const item = cvDataMap[idx];
    if (item) draftEmailForItems([item], document.getElementById('job-spec').value);
}

document.getElementById('btn-shortlist-email').addEventListener('click', () => {
    const shortlisted = lastResults.filter(r => r.ai_score >= 70 || r.ai_status === 'Excellent Match' || r.ai_status === 'Shortlisted');
    if (!shortlisted.length) { alert('No highly ranked candidates found to email.'); return; }
    draftEmailForItems(shortlisted, document.getElementById('job-spec').value);
});

async function draftEmailForItems(candidates, jobSpec) {
    document.getElementById('email-modal-body').innerHTML = `
        <div style="text-align:center; padding:3rem 0;">
            <i class="fa-solid fa-spinner fa-spin fa-3x" style="color:var(--accent); margin-bottom:1rem;"></i>
            <p>AI is crafting personalized emails...</p>
        </div>
    `;
    document.getElementById('email-modal').classList.add('active');

    try {
        const apiKey = localStorage.getItem('openai_api_key') || '';
        const emails = await window.api.emailDraft({ jobSpec: jobSpec || 'the position', candidates, apiKey });
        let html = '';
        emails.forEach((em, i) => {
            html += `
                <div class="email-draft-card">
                    <div class="email-draft-header">
                        <h4><i class="fa-solid fa-user" style="color:var(--accent); margin-right:0.5rem;"></i> ${escapeHtml(em.candidate_name)}</h4>
                        <button class="btn-outline small" onclick="copyEmail(${i})"><i class="fa-solid fa-copy"></i> Copy</button>
                    </div>
                    <div class="email-subject-line">Subj: ${escapeHtml(em.subject)}</div>
                    <div class="email-body-box" id="email-body-${i}">${escapeHtml(em.body).replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });
        document.getElementById('email-modal-body').innerHTML = html;
    } catch (e) {
        document.getElementById('email-modal-body').innerHTML = `<p style="color:var(--danger)">Failed to generate emails: ${e.message}</p>`;
    }
}

window.copyEmail = function(i) {
    const el = document.getElementById(`email-body-${i}`);
    navigator.clipboard.writeText(el.innerText).then(() => alert('Copied to clipboard!'));
};

// ── PDF Export ───────────────────────────────────────────────────────
document.getElementById('btn-download-pdf').addEventListener('click', () => {
    if (!lastResults || lastResults.length === 0) { alert('No results to download.'); return; }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text("AI Ranked Candidates Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Query: ${document.getElementById('job-spec').value}`, 14, 28);
    doc.text(`Date: ${new Date().toLocaleString()}`, 14, 34);

    const tableData = lastResults.map((item, idx) => {
        const score = item.ai_score !== null ? item.ai_score : item.similarity_score;
        let personal = item.personal_info || {};
        
        // Clean line-by-line Candidate Info
        let name = personal.name && personal.name !== 'N/A' ? personal.name : (item.candidate_name || item.filename);
        let candidateInfo = `Name: ${name}`;
        if (personal.age && personal.age !== 'N/A') candidateInfo += `\nAge: ${personal.age}`;
        if (personal.education && personal.education !== 'N/A') candidateInfo += `\nEdu: ${personal.education}`;
        if (personal.address && personal.address !== 'N/A') candidateInfo += `\nAddr: ${personal.address}`;
        if (personal.phone && personal.phone !== 'N/A') candidateInfo += `\nPhone: ${personal.phone}`;
        if (personal.email && personal.email !== 'N/A') candidateInfo += `\nEmail: ${personal.email}`;
        
        let summary = item.summary || (item.text ? item.text.substring(0, 150) : '');
        
        // Clean AI Justification
        let aiSumm = item.justification ? item.justification.replace(/\*\*/g, '') : '';
        
        // Experience and Status
        let exp = personal.experience && personal.experience !== 'N/A' ? personal.experience : 'N/A';
        let status = item.ai_status ? item.ai_status : 'N/A';
        let expAndStatus = `Status: ${status}\n\nExp: ${exp}`;

        return [
            `Rank #${idx + 1}`,
            candidateInfo,
            score + (item.ai_score !== null ? '' : '%'),
            summary.substring(0, 200) + '...',
            expAndStatus,
            aiSumm.substring(0, 250) + (aiSumm.length > 250 ? '...' : '')
        ];
    });

    doc.autoTable({
        startY: 40,
        head: [['Rank', 'Candidate Info', 'Score', 'Profile Summary', 'Status & Exp.', 'AI Justification']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 
            0: { cellWidth: 15, fontStyle: 'bold', halign: 'center' }, 
            1: { cellWidth: 45 }, 
            2: { cellWidth: 15, fontStyle: 'bold', halign: 'center' }, 
            3: { cellWidth: 70 }, 
            4: { cellWidth: 35 },
            5: { cellWidth: 97 } 
        },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    doc.save("MTB_Ranked_Candidates.pdf");
});

// ── Candidates Database ──────────────────────────────────────────────
async function loadCandidates() {
    try {
        const res = await window.api.getCandidates();
        const tbody = document.querySelector('#candidates-table tbody');
        tbody.innerHTML = '';
        
        if (!res.candidates.length) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No candidates in database.</td></tr>`;
            return;
        }

        res.candidates.forEach((c, idx) => {
            const sl = idx + 1;
            tbody.innerHTML += `
                <tr>
                    <td><strong><i class="fa-solid fa-file-lines" style="color:var(--accent);margin-right:0.5rem;"></i> [SL-${sl}] ${escapeHtml(c.filename)}</strong></td>
                    <td><span class="badge" style="background:rgba(255,255,255,0.1)">${c.count} records</span></td>
                    <td style="font-family:monospace;font-size:0.85em;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;">
                        ${c.hash.substring(0,16)}...
                        <button class="btn-icon small delete-file-btn" data-hash="${c.hash}" data-name="${escapeHtml(c.filename)}" title="Delete File" style="color:var(--danger);cursor:pointer;background:none;border:none;font-size:1.1rem;"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>
            `;
        });
        
        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const hash = e.currentTarget.dataset.hash;
                const name = e.currentTarget.dataset.name;
                
                // Temporary fix to decode ampersands visually in prompt if any
                const decodedName = name.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                
                window.showDangerConfirm(
                    'Delete Candidate?',
                    `Are you sure you want to delete <b>"${decodedName}"</b>?`,
                    'Delete',
                    async () => {
                        await window.api.deleteFile(hash);
                        await loadCandidates();
                        await checkStatus();
                        await updateFileFilter();
                    }
                );
            });
        });
    } catch (e) { console.error('Failed to load candidates', e); }
}

document.getElementById('btn-clear-db').addEventListener('click', () => {
    window.showDangerConfirm(
        'Clear Database?',
        'Are you sure you want to delete <b>ALL</b> candidate data? This cannot be undone and will erase all your uploaded CVs.',
        'Delete All',
        async () => {
            if (typeof window.logActivity === 'function') window.logActivity('Database Cleared', 'All candidate CV data was permanently deleted.');
            await window.api.clearDb();
            loadCandidates();
            checkStatus();
            window.showSuccessAlert('Success!', 'Database cleared successfully.');
        }
    );
});

// ── Analytics ────────────────────────────────────────────────────────
let formatChart, scoreChart;

async function loadAnalytics() {
    try {
        const res = await window.api.getAnalytics();
        document.getElementById('stat-total').innerText = res.total;
        
        const ctx = document.getElementById('formatChart').getContext('2d');
        if (formatChart) formatChart.destroy();
        
        const isLight = document.body.classList.contains('light-theme');
        const textColor = isLight ? '#0f172a' : '#f8fafc';

        formatChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['PDF', 'DOC/DOCX', 'Image', 'Other'],
                datasets: [{
                    data: [res.formats.pdf, res.formats.docx, res.formats.image, res.formats.other],
                    backgroundColor: ['#ef4444', '#3b82f6', '#10b981', '#94a3b8'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: { plugins: { legend: { position: 'bottom', labels: { color: textColor } } }, cutout: '70%' }
        });
    } catch (e) { console.error('Analytics failed', e); }
}

document.getElementById('btn-analyze-keyword').addEventListener('click', async () => {
    const keyword = document.getElementById('analytics-keyword').value.trim();
    const topK = parseInt(document.getElementById('analytics-top-k').value) || 10;
    if (!keyword) return;

    try {
        const data = await window.api.analyzeKeyword(keyword, topK);
        document.getElementById('analytics-results').style.display = 'block';
        
        const tbody = document.getElementById('analytics-table-body');
        tbody.innerHTML = '';
        analyticsDataMap = {};
        
        const labels = [], scores = [];

        data.results.forEach((item, idx) => {
            analyticsDataMap[idx] = item;
            labels.push((item.candidate_name || item.filename).substring(0,15));
            scores.push(item.score);
            
            const sc = item.score >= 70 ? 'success' : item.score >= 40 ? 'warning' : 'danger';
            
            tbody.innerHTML += `
                <tr>
                    <td>#${idx + 1}</td>
                    <td><strong>${escapeHtml(item.candidate_name || item.filename)}</strong></td>
                    <td style="font-size:0.8em;color:var(--text-muted)">${escapeHtml(item.filename)}</td>
                    <td><span class="badge ${sc}">${item.score}%</span></td>
                    <td><button class="btn-outline small" onclick="showCVModal(${idx}, analyticsDataMap, '${keyword}')"><i class="fa-solid fa-eye"></i></button></td>
                </tr>
            `;
        });

        const ctx = document.getElementById('scoreChart').getContext('2d');
        if (scoreChart) scoreChart.destroy();
        const isLight = document.body.classList.contains('light-theme');
        
        scoreChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Match %', data: scores, backgroundColor: '#6366f1', borderRadius: 4 }] },
            options: {
                scales: { 
                    y: { beginAtZero: true, max: 100, grid: { color: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }, ticks: { color: isLight ? '#0f172a' : '#f8fafc' } },
                    x: { grid: { display: false }, ticks: { color: isLight ? '#0f172a' : '#f8fafc', maxRotation: 45, minRotation: 45 } }
                },
                plugins: { legend: { display: false } }
            }
        });

    } catch (e) { alert('Analysis failed'); }
});

// ── Modals Close ─────────────────────────────────────────────────────
document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
});
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('cv-modal').classList.remove('active'));
document.getElementById('email-modal-close').addEventListener('click', () => document.getElementById('email-modal').classList.remove('active'));

// ── Utils ────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdownBold(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent);">$1</strong>');
}

function highlightText(text, query) {
    let s = escapeHtml(text);
    if (query) {
        const words = query.split(/[\s,]+/).filter(w => w.length > 2);
        words.forEach(w => {
            try { s = s.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); } catch (e) {}
        });
    }
    return s;
}

// ── Settings API Key Logic ───────────────────────────────────────────
const apiKeyInput = document.getElementById('settings-api-key-input');
const btnSaveApiKey = document.getElementById('btn-save-api-key');
const btnDeleteApiKey = document.getElementById('btn-delete-api-key');

if (apiKeyInput && btnSaveApiKey && btnDeleteApiKey) {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) apiKeyInput.value = savedKey;

    btnSaveApiKey.addEventListener('click', () => {
        const val = apiKeyInput.value.trim();
        if (val) {
            localStorage.setItem('openai_api_key', val);
            if (typeof window.logActivity === 'function') window.logActivity('Settings Update', 'OpenAI API Key was saved/updated.');
            if (typeof window.showSuccessAlert === 'function') window.showSuccessAlert('API Key Saved', 'Your OpenAI API Key has been saved successfully.');
            else alert('API Key saved successfully.');
        } else {
            if (typeof window.showSuccessAlert === 'function') window.showSuccessAlert('Invalid Input', 'Please enter a valid API Key before saving.');
            else alert('Please enter a valid API Key.');
        }
    });

    btnDeleteApiKey.addEventListener('click', () => {
        localStorage.removeItem('openai_api_key');
        apiKeyInput.value = '';
        if (typeof window.logActivity === 'function') window.logActivity('Settings Update', 'OpenAI API Key was deleted.');
        if (typeof window.showSuccessAlert === 'function') window.showSuccessAlert('API Key Deleted', 'Your OpenAI API Key has been permanently deleted.');
        else alert('API Key deleted.');
    });

    const btnToggleApiKey = document.getElementById('btn-toggle-api-key');
    const iconToggleApiKey = document.getElementById('icon-toggle-api-key');
    if (btnToggleApiKey) {
        btnToggleApiKey.addEventListener('click', () => {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                iconToggleApiKey.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                apiKeyInput.type = 'password';
                iconToggleApiKey.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    }
}

// ── Shared API Key Warning Modal ─────────────────────────────────────
window.showApiKeyWarning = function() {
    const existing = document.getElementById('api-key-warning-modal');
    if (existing) existing.remove();

    const isLight = document.body.classList.contains('light-theme');
    const overlayBg = isLight ? 'rgba(255, 255, 255, 0.3)' : 'rgba(15, 23, 42, 0.6)';

    const modal = document.createElement('div');
    modal.id = 'api-key-warning-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: ${overlayBg}; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        display: flex; justify-content: center; align-items: center;
        z-index: 999999; animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    modal.innerHTML = `
        <div style="
            background: var(--bg-card);
            padding: 3rem;
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255,255,255,0.1);
            max-width: 480px;
            text-align: center;
            border: 1px solid var(--border-light);
            position: relative;
            overflow: hidden;
            animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        ">
            <!-- Decorative gradient orb -->
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle at 50% 0%, rgba(239,68,68,0.12) 0%, transparent 50%); pointer-events: none;"></div>
            
            <div style="
                width: 80px; height: 80px;
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                color: white;
                border-radius: 24px;
                display: flex; justify-content: center; align-items: center;
                margin: 0 auto 2rem;
                font-size: 2.5rem;
                box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.5);
                transform: rotate(-10deg);
                position: relative;
                z-index: 2;
            ">
                <i class="fa-solid fa-key" style="transform: rotate(10deg);"></i>
            </div>
            
            <h2 style="color: var(--text-primary); margin-bottom: 1rem; font-size: 1.8rem; font-weight: 800; letter-spacing: -0.5px; position: relative; z-index: 2;">API Key Required</h2>
            
            <p style="color: var(--text-muted); line-height: 1.7; margin-bottom: 2.5rem; font-size: 1.05rem; position: relative; z-index: 2;">
                You are trying to access a <b style="color: var(--accent);">Cloud AI Feature</b>, but no OpenAI API Key was detected in your system. <br><br>
                Please configure your API key in the settings to unlock advanced capabilities.
            </p>
            
            <div style="display: flex; gap: 1rem; justify-content: center; position: relative; z-index: 2;">
                <button id="btn-close-api-warning" style="
                    padding: 0.85rem 1.5rem;
                    border-radius: 12px;
                    background: var(--bg-lighter);
                    color: var(--text-primary);
                    border: 1px solid var(--border-light);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='var(--border-light)'" onmouseout="this.style.background='var(--bg-lighter)'">Dismiss</button>
                
                <button id="btn-go-to-settings" style="
                    padding: 0.85rem 2rem;
                    background: linear-gradient(135deg, #6366f1, #a855f7);
                    border-radius: 12px;
                    border: none;
                    color: white;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 10px 20px -10px rgba(99, 102, 241, 0.8);
                    transition: all 0.3s;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 15px 25px -10px rgba(99, 102, 241, 0.9)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 20px -10px rgba(99, 102, 241, 0.8)'">
                    <i class="fa-solid fa-gear"></i> Setup API Key
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-close-api-warning').onclick = () => modal.remove();
    document.getElementById('btn-go-to-settings').onclick = () => {
        modal.remove();
        if (typeof switchPage === 'function') {
            switchPage('settings');
        } else {
            const settingsNav = document.querySelector('a.nav-item[data-section="settings"]');
            if (settingsNav) settingsNav.click();
        }
    };
};

// ── Shared Danger Confirm Modal ─────────────────────────────────────
window.showDangerConfirm = function(title, message, confirmText, onConfirm) {
    const existing = document.getElementById('danger-confirm-modal');
    if (existing) existing.remove();

    const isLight = document.body.classList.contains('light-theme');
    const overlayBg = isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(15, 23, 42, 0.7)';

    const modal = document.createElement('div');
    modal.id = 'danger-confirm-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: ${overlayBg}; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        display: flex; justify-content: center; align-items: center;
        z-index: 999999; animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    modal.innerHTML = `
        <div style="
            background: var(--bg-card); padding: 2.5rem; border-radius: 20px;
            box-shadow: 0 20px 40px -10px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.1);
            max-width: 420px; text-align: center; border: 1px solid rgba(239, 68, 68, 0.3);
            position: relative; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            overflow: hidden;
        ">
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle at 50% 0%, rgba(239, 68, 68, 0.1) 0%, transparent 50%); pointer-events: none;"></div>
            
            <div style="
                width: 70px; height: 70px; background: rgba(239, 68, 68, 0.1);
                color: #ef4444; border-radius: 20px; display: flex; justify-content: center; align-items: center;
                margin: 0 auto 1.5rem; font-size: 2.2rem; transform: rotate(0deg);
                box-shadow: 0 5px 15px rgba(239, 68, 68, 0.2); position: relative; z-index: 2;
                animation: shakeIcon 0.5s ease-in-out;
            ">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            
            <h2 style="color: var(--text-primary); margin-bottom: 0.75rem; font-size: 1.5rem; position: relative; z-index: 2;">${title}</h2>
            <p style="color: var(--text-muted); line-height: 1.6; margin-bottom: 2rem; font-size: 1rem; position: relative; z-index: 2;">${message}</p>
            
            <div style="display: flex; gap: 1rem; justify-content: center; position: relative; z-index: 2;">
                <button id="btn-cancel-danger" style="
                    padding: 0.75rem 1.5rem; border-radius: 10px; background: var(--bg-lighter);
                    color: var(--text-primary); border: 1px solid var(--border-light);
                    font-weight: 600; cursor: pointer; transition: all 0.2s;
                " onmouseover="this.style.background='var(--border-light)'" onmouseout="this.style.background='var(--bg-lighter)'">Cancel</button>
                
                <button id="btn-confirm-danger" style="
                    padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #ef4444, #991b1b);
                    border-radius: 10px; border: none; color: white; font-weight: bold;
                    cursor: pointer; box-shadow: 0 10px 20px -10px rgba(239, 68, 68, 0.8);
                    transition: all 0.3s; display: flex; align-items: center; gap: 0.5rem;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 15px 25px -10px rgba(239, 68, 68, 0.9)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 20px -10px rgba(239, 68, 68, 0.8)'">
                    <i class="fa-solid fa-trash-can"></i> ${confirmText}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    if (!document.getElementById('shake-anim-style')) {
        const style = document.createElement('style');
        style.id = 'shake-anim-style';
        style.innerHTML = `
            @keyframes shakeIcon {
                0% { transform: rotate(0deg); }
                25% { transform: rotate(-10deg); }
                50% { transform: rotate(10deg); }
                75% { transform: rotate(-10deg); }
                100% { transform: rotate(0deg); }
            }
        `;
        document.head.appendChild(style);
    }

    document.getElementById('btn-cancel-danger').onclick = () => modal.remove();
    document.getElementById('btn-confirm-danger').onclick = () => {
        modal.remove();
        if (typeof onConfirm === 'function') onConfirm();
    };
};

// ── Shared Success Alert Modal ─────────────────────────────────────
window.showSuccessAlert = function(title, message) {
    const existing = document.getElementById('success-alert-modal');
    if (existing) existing.remove();

    const isLight = document.body.classList.contains('light-theme');
    const overlayBg = isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(15, 23, 42, 0.7)';

    const modal = document.createElement('div');
    modal.id = 'success-alert-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: ${overlayBg}; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; justify-content: center; align-items: center;
        z-index: 999999; animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    modal.innerHTML = `
        <div style="
            background: var(--bg-card); padding: 2.5rem; border-radius: 20px;
            box-shadow: 0 20px 40px -10px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.1);
            max-width: 400px; text-align: center; border: 1px solid rgba(16, 185, 129, 0.3);
            position: relative; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            overflow: hidden;
        ">
            <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, transparent 50%); pointer-events: none;"></div>
            
            <div style="
                width: 70px; height: 70px; background: rgba(16, 185, 129, 0.1);
                color: #10b981; border-radius: 50%; display: flex; justify-content: center; align-items: center;
                margin: 0 auto 1.5rem; font-size: 2.2rem;
                box-shadow: 0 5px 15px rgba(16, 185, 129, 0.2); position: relative; z-index: 2;
                animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            ">
                <i class="fa-solid fa-check"></i>
            </div>
            
            <h2 style="color: var(--text-primary); margin-bottom: 0.75rem; font-size: 1.5rem; position: relative; z-index: 2;">${title}</h2>
            <p style="color: var(--text-muted); line-height: 1.6; margin-bottom: 2rem; font-size: 1rem; position: relative; z-index: 2;">${message}</p>
            
            <div style="display: flex; justify-content: center; position: relative; z-index: 2;">
                <button id="btn-ok-success" style="
                    padding: 0.75rem 2.5rem; background: linear-gradient(135deg, #10b981, #059669);
                    border-radius: 10px; border: none; color: white; font-weight: bold;
                    cursor: pointer; box-shadow: 0 10px 20px -10px rgba(16, 185, 129, 0.8);
                    transition: all 0.3s;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 15px 25px -10px rgba(16, 185, 129, 0.9)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 20px -10px rgba(16, 185, 129, 0.8)'">
                    OK
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    if (!document.getElementById('pop-anim-style')) {
        const style = document.createElement('style');
        style.id = 'pop-anim-style';
        style.innerHTML = `
            @keyframes popIn {
                0% { transform: scale(0.5); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.getElementById('btn-ok-success').onclick = () => modal.remove();
};

window.loadReportsData = async function() {
    try {
        if (!window.api || typeof window.api.getReportsData !== 'function') return;
        
        const data = await window.api.getReportsData();
        
        // Update Mini Dashboard
        document.getElementById('report-total-uploads').innerText = data.totalUploads || 0;
        document.getElementById('report-total-searches').innerText = data.totalSearches || 0;
        document.getElementById('report-total-errors').innerText = data.totalErrors || 0;
        
        // Update Table
        const tbody = document.getElementById('reports-search-history-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (data.searchHistory && data.searchHistory.length > 0) {
            data.searchHistory.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.date}</td>
                    <td style="font-weight: 600; color: var(--text-main);">${item.query}</td>
                    <td>${item.topK}</td>
                    <td><span class="badge success">${item.status}</span></td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No search history found.</td></tr>';
        }
    } catch (e) {
        console.error('Failed to load reports data:', e);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const attachLogBtns = (folderBtnId, fileBtnId) => {
        const folderBtn = document.getElementById(folderBtnId);
        if (folderBtn) {
            folderBtn.addEventListener('click', () => {
                if (window.api && typeof window.api.openLogFolder === 'function') window.api.openLogFolder();
            });
        }
        const fileBtn = document.getElementById(fileBtnId);
        if (fileBtn) {
            fileBtn.addEventListener('click', () => {
                if (window.api && typeof window.api.openLogFile === 'function') window.api.openLogFile();
            });
        }
    };

    attachLogBtns('btn-open-log-folder', 'btn-open-log-file');
    attachLogBtns('btn-reports-open-log-folder', 'btn-reports-open-log-file');
});
