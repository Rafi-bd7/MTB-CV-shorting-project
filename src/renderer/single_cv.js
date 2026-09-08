// single_cv.js - Handles the Single CV Match feature
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    const navSingleCv = document.getElementById('nav-single-cv');
    const sectionSingleCv = document.getElementById('section-single-cv');
    const navItems = document.querySelectorAll('.nav-item');
    const pageSections = document.querySelectorAll('.page-section');

    navSingleCv.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(item => item.classList.remove('active'));
        pageSections.forEach(sec => sec.classList.remove('active'));
        
        navSingleCv.classList.add('active');
        sectionSingleCv.classList.add('active');
    });

    // Elements
    const dropZone = document.getElementById('single-cv-drop-zone');
    const fileInput = document.getElementById('single-cv-file');
    const filenameDisplay = document.getElementById('single-cv-filename');
    const filesContainer = document.getElementById('single-cv-files-container');
    const modeQuickBtn = document.getElementById('single-mode-quick');
    const modeAiBtn = document.getElementById('single-mode-ai');
    const matchBtn = document.getElementById('btn-single-match');
    const cancelMatchBtn = document.getElementById('btn-cancel-single-match');
    const loadingOverlay = document.getElementById('single-loading');
    const resultArea = document.getElementById('single-cv-result');
    const matchScoreCircle = document.getElementById('single-match-score');
    const starRatingBox = document.getElementById('single-star-rating-box');
    const tokenBurnCorner = document.getElementById('single-token-burn-corner');
    const matchDetails = document.getElementById('single-match-details');
    const jobSpecInput = document.getElementById('single-job-spec');
    
    // State - AI Search is DEFAULT
    let currentMode = 'ai'; 
    let uploadedFiles = []; // Array of { name, path }
    let activeFileIndex = 0;
    let isEvaluationCancelled = false;

    // Set initial mode UI
    modeAiBtn.classList.add('active');
    modeQuickBtn.classList.remove('active');

    // Mode Toggle
    modeQuickBtn.addEventListener('click', () => {
        currentMode = 'quick';
        modeQuickBtn.classList.add('active');
        modeAiBtn.classList.remove('active');
    });

    modeAiBtn.addEventListener('click', () => {
        currentMode = 'ai';
        modeAiBtn.classList.add('active');
        modeQuickBtn.classList.remove('active');
    });

    // Helper: File Icon based on extension
    function getFileIcon(filename) {
        const ext = (filename || '').split('.').pop().toLowerCase();
        if (ext === 'pdf') return 'fa-file-pdf';
        if (ext === 'doc' || ext === 'docx') return 'fa-file-word';
        if (['jpg', 'jpeg', 'png'].includes(ext)) return 'fa-file-image';
        return 'fa-file-lines';
    }

    // Helper: Render Uploaded Files List
    function renderUploadedFilesList() {
        if (!filesContainer) return;

        if (uploadedFiles.length === 0) {
            filesContainer.style.display = 'none';
            filenameDisplay.textContent = '';
            return;
        }

        filesContainer.style.display = 'flex';
        filesContainer.innerHTML = `
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.4rem; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fa-solid fa-folder-open" style="color: var(--accent);"></i> Uploaded CVs (${uploadedFiles.length}) — Click to Select Active:</span>
                <button type="button" id="btn-clear-all-cvs" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; cursor:pointer;"><i class="fa-solid fa-trash"></i> Clear All</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${uploadedFiles.map((f, idx) => `
                    <div class="cv-item-card ${idx === activeFileIndex ? 'active' : ''}" data-index="${idx}">
                        <div class="cv-item-left">
                            <i class="fa-solid ${idx === activeFileIndex ? 'fa-circle-dot' : 'fa-circle'} cv-item-radio"></i>
                            <i class="fa-solid ${getFileIcon(f.name)} cv-item-file-icon"></i>
                            <div class="cv-item-info">
                                <span class="cv-item-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                                <span class="cv-item-badge">${idx === activeFileIndex ? 'Selected for Evaluation' : 'Click to select'}</span>
                            </div>
                        </div>
                        <div class="cv-item-actions">
                            <button type="button" class="cv-item-delete" data-del-index="${idx}" title="Remove file">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        if (uploadedFiles[activeFileIndex]) {
            filenameDisplay.textContent = `Active Candidate: ${uploadedFiles[activeFileIndex].name}`;
        } else {
            filenameDisplay.textContent = '';
        }

        // Attach item click handlers
        const cards = filesContainer.querySelectorAll('.cv-item-card');
        cards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.cv-item-delete')) return;
                const idx = parseInt(card.getAttribute('data-index'));
                activeFileIndex = idx;
                renderUploadedFilesList();
            });
        });

        // Attach delete handlers
        const deleteBtns = filesContainer.querySelectorAll('.cv-item-delete');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const delIdx = parseInt(btn.getAttribute('data-del-index'));
                uploadedFiles.splice(delIdx, 1);
                if (activeFileIndex >= uploadedFiles.length) {
                    activeFileIndex = Math.max(0, uploadedFiles.length - 1);
                }
                renderUploadedFilesList();
            });
        });

        // Clear all handler
        const clearAllBtn = document.getElementById('btn-clear-all-cvs');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                uploadedFiles = [];
                activeFileIndex = 0;
                renderUploadedFilesList();
            });
        }
    }

    // Add Files helper
    function handleAddedFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const filePath = window.api && window.api.getPathForFile ? window.api.getPathForFile(file) : file.path;
            const fileName = file.name;
            
            // Avoid duplicate paths
            const exists = uploadedFiles.some(f => f.path === filePath);
            if (!exists) {
                uploadedFiles.push({
                    name: fileName,
                    path: filePath
                });
            }
        }
        activeFileIndex = uploadedFiles.length - 1;
        renderUploadedFilesList();
    }

    // File selection from input
    fileInput.addEventListener('change', (e) => {
        handleAddedFiles(e.target.files);
        fileInput.value = ''; // Reset input to allow re-selection
    });

    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleAddedFiles(e.dataTransfer.files);
        }
    });

    // Enter Key to trigger evaluation
    jobSpecInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            matchBtn.click();
        }
    });

    // Cancel Button Handler
    if (cancelMatchBtn) {
        cancelMatchBtn.addEventListener('click', () => {
            isEvaluationCancelled = true;
            loadingOverlay.style.display = 'none';
            matchBtn.disabled = false;
        });
    }

    // Helpers for escaping HTML
    function escapeHtml(text) {
        if (!text) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    // Helper: Render Section Card
    function renderSectionCard(title, icon, sectionData) {
        if (!sectionData) return '';
        const details = sectionData.details || 'No details extracted.';
        const gaps = Array.isArray(sectionData.gaps) 
            ? sectionData.gaps.filter(g => g && !['none', 'n/a', 'nil', 'no gaps'].includes(g.trim().toLowerCase())) 
            : [];
        
        let gapsHtml = '';
        if (gaps.length > 0) {
            gapsHtml = `
                <div class="eval-gaps-box">
                    <div class="eval-gaps-heading"><i class="fa-solid fa-triangle-exclamation"></i> Identified Gaps / Lacks:</div>
                    <ul class="eval-gaps-list">
                        ${gaps.map(g => `<li>${escapeHtml(g)}</li>`).join('')}
                    </ul>
                </div>
            `;
        } else {
            gapsHtml = `
                <div class="eval-gaps-box clean">
                    <div class="eval-gaps-heading"><i class="fa-solid fa-circle-check"></i> Fully Met (No Gaps Found)</div>
                </div>
            `;
        }

        return `
            <div class="eval-section-card">
                <div class="eval-section-header">
                    <div class="eval-section-title">
                        <i class="${icon}"></i> ${title}
                    </div>
                </div>
                <div class="eval-details-text">${escapeHtml(details)}</div>
                ${gapsHtml}
            </div>
        `;
    }

    // Action button: Evaluate Match
    matchBtn.addEventListener('click', async () => {
        const jobSpec = jobSpecInput.value.trim();
        
        if (uploadedFiles.length === 0 || !uploadedFiles[activeFileIndex]) {
            if (window.showToast) {
                window.showToast('Please upload and select a candidate CV first.', 'warning');
            }
            return;
        }
        if (!jobSpec) {
            jobSpecInput.classList.remove('input-shake-error');
            void jobSpecInput.offsetWidth;
            jobSpecInput.classList.add('input-shake-error');
            jobSpecInput.focus();
            setTimeout(() => jobSpecInput.classList.remove('input-shake-error'), 500);
            if (window.showToast) {
                window.showToast('Please enter candidate requirements or Job Description.', 'warning');
            }
            return;
        }

        const activeFile = uploadedFiles[activeFileIndex];
        let aiKey = localStorage.getItem('openai_api_key') || '';

        if (currentMode !== 'quick' && !aiKey) {
            if (typeof window.showApiKeyWarning === 'function') window.showApiKeyWarning();
            return;
        }

        // Reset cancellation and prepare loading
        isEvaluationCancelled = false;
        resultArea.style.display = 'none';
        if (starRatingBox) starRatingBox.style.display = 'none';
        if (tokenBurnCorner) tokenBurnCorner.style.display = 'none';
        loadingOverlay.style.display = 'block';
        matchBtn.disabled = true;

        try {
            // Call backend API
            const response = await window.api.singleCvMatch({
                filePath: activeFile.path,
                jobSpec: jobSpec,
                mode: currentMode,
                apiKey: aiKey
            });

            // If cancelled while processing, abort rendering
            if (isEvaluationCancelled) {
                return;
            }

            // Handle Response error
            if (response.error) {
                if (window.showToast) {
                    window.showToast('Evaluation error: ' + response.error, 'error');
                }
                loadingOverlay.style.display = 'none';
                matchBtn.disabled = false;
                return;
            }

            // Match Score Circle
            matchScoreCircle.textContent = Math.round(response.score || 0) + '%';
            if (response.score >= 80) matchScoreCircle.style.borderColor = 'var(--success)';
            else if (response.score >= 50) matchScoreCircle.style.borderColor = 'var(--warning)';
            else matchScoreCircle.style.borderColor = 'var(--danger)';

            // Render 5-Star Rating & 5-Level Verdict
            if (starRatingBox) {
                let level = parseInt(response.level) || 3;
                if (level < 1) level = 1;
                if (level > 5) level = 5;

                const levelTitleMap = {
                    1: 'Highly Recommended',
                    2: 'Competent Fit',
                    3: 'Conditional Fit',
                    4: 'Below Expectations',
                    5: 'Strictly Unfit'
                };

                const filledCount = 6 - level; // Level 1: 5 stars, Level 2: 4 stars, Level 3: 3 stars, Level 4: 2 stars, Level 5: 1 star
                let starsHtml = '';
                for (let i = 1; i <= 5; i++) {
                    if (i <= filledCount) {
                        starsHtml += '<i class="fa-solid fa-star star-icon filled"></i>';
                    } else {
                        starsHtml += '<i class="fa-solid fa-star star-icon"></i>';
                    }
                }

                starRatingBox.className = `rating-verdict-box level-${level}`;
                starRatingBox.innerHTML = `
                    <div class="rating-stars-cluster">
                        <div class="stars-track">
                            ${starsHtml}
                        </div>
                    </div>
                    <div class="rating-badge-pill">
                        <span class="rating-level-tag">Level ${level}</span>
                        <span class="rating-title-tag">${levelTitleMap[level] || 'Evaluated'}</span>
                    </div>
                `;
                starRatingBox.style.display = 'inline-flex';
            }

            // Render Compact Token Burn in Top Corner
            if (tokenBurnCorner) {
                if (response.tokenUsage && response.tokenUsage.mode === 'ai' && response.tokenUsage.totalTokens > 0) {
                    tokenBurnCorner.innerHTML = `
                        <div class="compact-token-pill">
                            <i class="fa-solid fa-fire-flame-curved"></i>
                            <span style="font-weight:600;">AI Tokens Burned:</span>
                            <span class="token-count-chip">${response.tokenUsage.totalTokens.toLocaleString()} Tokens</span>
                        </div>
                    `;
                    tokenBurnCorner.style.display = 'inline-flex';
                } else {
                    tokenBurnCorner.style.display = 'none';
                }
            }

            // 1. AI Justification
            let justificationHtml = '';
            if (currentMode === 'ai' && response.justification) {
                justificationHtml = `
                    <div style="margin-bottom: 1.5rem; padding: 1.25rem; background: var(--bg-panel); border-radius: var(--radius-md); border: 1px solid var(--border-light); box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <h4 style="margin:0; color: var(--accent); font-size:1.05rem;"><i class="fa-solid fa-robot"></i> Overall AI Justification</h4>
                        </div>
                        <p style="font-size: 0.95rem; line-height:1.6; margin:0; color: var(--text-main); white-space: pre-wrap;">${response.justification}</p>
                    </div>
                `;
            }

            // 2. Section-by-Section Analysis Cards
            let sectionsHtml = '';
            if (currentMode === 'ai') {
                sectionsHtml = `
                    <div style="margin-bottom: 1.5rem;">
                        <h4 style="margin-top:0; margin-bottom: 0.75rem; color: var(--text-main); font-size: 1.05rem;">
                            <i class="fa-solid fa-layer-group" style="color: var(--accent);"></i> Dimension-by-Dimension Evaluation & Gap Analysis
                        </h4>
                        <div class="eval-sections-container">
                            ${renderSectionCard('Education', 'fa-solid fa-graduation-cap', response.education)}
                            ${renderSectionCard('Experience', 'fa-solid fa-briefcase', response.experience)}
                            ${renderSectionCard('Banks Additional Requirements', 'fa-solid fa-building-columns', response.bankRequirements)}
                            ${renderSectionCard('Responsibilities & Context', 'fa-solid fa-globe', response.responsibilitiesContext)}
                            ${renderSectionCard('Responsibilities', 'fa-solid fa-list-check', response.responsibilities)}
                        </div>
                    </div>
                `;
            }

            // 3. Matched & Missing Keywords Grid
            const matchedTags = response.matchedKeywords && response.matchedKeywords.length > 0 
                ? response.matchedKeywords.map(kw => `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--success); padding: 0.35rem 0.7rem; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3); font-weight:600;"><i class="fa-solid fa-check"></i> ${escapeHtml(kw)}</span>`).join('') 
                : '<span style="color:var(--text-muted); font-size: 0.9rem;">No matching keywords identified.</span>';

            const missingTags = response.missingKeywords && response.missingKeywords.length > 0 
                ? response.missingKeywords.map(kw => `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: var(--danger); padding: 0.35rem 0.7rem; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3); font-weight:600;"><i class="fa-solid fa-xmark"></i> ${escapeHtml(kw)}</span>`).join('')
                : '<span style="color:var(--success); font-size: 0.9rem;"><i class="fa-solid fa-circle-check"></i> None. All essential requirements met.</span>';

            let keywordsGridHtml = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.5rem;">
                    <div style="background: var(--bg-panel); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                        <p style="margin-top:0; margin-bottom: 0.75rem; font-weight:700; color: var(--success);">
                            <i class="fa-solid fa-circle-check"></i> Matched Keywords & Requirements:
                        </p>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                            ${matchedTags}
                        </div>
                    </div>
                    <div style="background: var(--bg-panel); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                        <p style="margin-top:0; margin-bottom: 0.75rem; font-weight:700; color: var(--danger);">
                            <i class="fa-solid fa-circle-xmark"></i> Missing Keywords / Gaps:
                        </p>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                            ${missingTags}
                        </div>
                    </div>
                </div>
            `;

            // 4. Extracted CV Text Viewer
            let cvTextHtml = `
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-light);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                        <h4 style="margin:0;"><i class="fa-solid fa-file-lines" style="color:var(--accent);"></i> CV Extracted Text</h4>
                        <span style="font-size:0.8rem; color:var(--text-muted);">Length: ${response.cvText ? response.cvText.length.toLocaleString() : 0} chars</span>
                    </div>
                    <div style="background: var(--bg-dark); padding: 1rem; border-radius: 6px; font-size: 0.85rem; max-height: 250px; overflow-y: auto; color: var(--text-muted); white-space: pre-wrap; font-family: monospace; border: 1px solid var(--border-light);">${escapeHtml(response.cvText || 'No text extracted.')}</div>
                </div>
            `;

            let detailsHtml = justificationHtml + sectionsHtml + keywordsGridHtml + cvTextHtml;

            matchDetails.innerHTML = detailsHtml;
            
            loadingOverlay.style.display = 'none';
            resultArea.style.display = 'block';
            matchBtn.disabled = false;

        } catch (error) {
            console.error('Single CV Match error:', error);
            if (!isEvaluationCancelled) {
                if (window.showToast) {
                    window.showToast('Evaluation error: ' + error.message, 'error');
                }
            }
            loadingOverlay.style.display = 'none';
            matchBtn.disabled = false;
        }
    });
});
