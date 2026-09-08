// job_fit.js - Handles the Job Fit Analyzer feature
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    const navJobFit = document.getElementById('nav-job-fit-analyzer');
    const sectionJobFit = document.getElementById('section-job-fit-analyzer');
    const navItems = document.querySelectorAll('.nav-item');
    const pageSections = document.querySelectorAll('.page-section');

    navJobFit.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(item => item.classList.remove('active'));
        pageSections.forEach(sec => sec.classList.remove('active'));
        
        navJobFit.classList.add('active');
        sectionJobFit.classList.add('active');
    });

    // Elements
    const dropZone = document.getElementById('job-fit-drop-zone');
    const fileInput = document.getElementById('job-fit-files');
    const filesContainer = document.getElementById('job-fit-selected-files');
    const jdInput = document.getElementById('job-fit-jd');
    const analyzeBtn = document.getElementById('btn-job-fit-analyze');
    const loadingOverlay = document.getElementById('job-fit-loading');
    const cancelBtn = document.getElementById('btn-cancel-job-fit');
    const resultsArea = document.getElementById('job-fit-results-area');
    const resultsList = document.getElementById('job-fit-results-list');
    const tokenBadge = document.getElementById('job-fit-tokens-burned');

    let uploadedFiles = [];
    let isEvaluationCancelled = false;
    let jobFitMode = 'quick';

    // Mode Toggle
    const modeAiBtn = document.getElementById('job-fit-mode-ai');
    const modeQuickBtn = document.getElementById('job-fit-mode-quick');
    const modeHint = document.getElementById('job-fit-mode-hint');

    if (modeAiBtn && modeQuickBtn) {
        modeAiBtn.addEventListener('click', () => {
            jobFitMode = 'ai';
            modeAiBtn.classList.add('active');
            modeQuickBtn.classList.remove('active');
            if (modeHint) modeHint.innerHTML = '☁️ <strong>Cloud AI:</strong> Uses GPT-4o-mini for deep context analysis (Burns Tokens).';
        });
        modeQuickBtn.addEventListener('click', () => {
            jobFitMode = 'quick';
            modeQuickBtn.classList.add('active');
            modeAiBtn.classList.remove('active');
            if (modeHint) modeHint.innerHTML = '🖥️ <strong>Local AI:</strong> Uses Ollama (phi3) running on your PC. 100% Free (0 Tokens).';
        });
    }

    // Helper: File Icon
    function getFileIcon(filename) {
        const ext = (filename || '').split('.').pop().toLowerCase();
        if (ext === 'pdf') return 'fa-file-pdf';
        if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
        if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
        if (['jpg', 'jpeg', 'png'].includes(ext)) return 'fa-file-image';
        return 'fa-file-lines';
    }

    // Helper: Render Files List
    function renderUploadedFilesList() {
        if (!filesContainer) return;

        if (uploadedFiles.length === 0) {
            filesContainer.style.display = 'none';
            return;
        }

        filesContainer.style.display = 'flex';
        filesContainer.innerHTML = `
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.4rem; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fa-solid fa-folder-open" style="color: var(--accent);"></i> Selected CVs (${uploadedFiles.length}):</span>
                <button type="button" id="btn-clear-job-fit-cvs" style="background:none; border:none; color:var(--text-muted); font-size:0.75rem; cursor:pointer;"><i class="fa-solid fa-trash"></i> Clear All</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${uploadedFiles.map((f, idx) => `
                    <div class="cv-item-card" style="cursor: default;" data-index="${idx}">
                        <div class="cv-item-left">
                            <i class="fa-solid ${getFileIcon(f.name)} cv-item-file-icon"></i>
                            <div class="cv-item-info">
                                <span class="cv-item-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
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

        // Attach delete handlers
        const deleteBtns = filesContainer.querySelectorAll('.cv-item-delete');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const delIdx = parseInt(btn.getAttribute('data-del-index'));
                uploadedFiles.splice(delIdx, 1);
                renderUploadedFilesList();
            });
        });

        const clearAllBtn = document.getElementById('btn-clear-job-fit-cvs');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                uploadedFiles = [];
                renderUploadedFilesList();
            });
        }
    }

    function handleAddedFiles(fileList) {
        if (!fileList || fileList.length === 0) return;
        if (uploadedFiles.length + fileList.length > 100) {
            if (window.showToast) window.showToast('Maximum 100 CVs allowed.', 'warning');
            return;
        }

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const filePath = window.api && window.api.getPathForFile ? window.api.getPathForFile(file) : file.path;
            const fileName = file.name;
            
            if (!uploadedFiles.some(f => f.path === filePath)) {
                uploadedFiles.push({ name: fileName, path: filePath });
            }
        }
        renderUploadedFilesList();
    }

    fileInput.addEventListener('change', (e) => {
        handleAddedFiles(e.target.files);
        fileInput.value = '';
    });

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

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            isEvaluationCancelled = true;
            loadingOverlay.style.display = 'none';
            analyzeBtn.disabled = false;
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    jdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            analyzeBtn.click();
        }
    });

    analyzeBtn.addEventListener('click', async () => {
        const jobSpec = jdInput.value.trim();
        
        if (uploadedFiles.length === 0) {
            if (window.showToast) window.showToast('Please upload at least one CV.', 'warning');
            return;
        }
        if (!jobSpec) {
            jdInput.classList.remove('input-shake-error');
            void jdInput.offsetWidth;
            jdInput.classList.add('input-shake-error');
            jdInput.focus();
            if (window.showToast) window.showToast('Please enter a Job Description.', 'warning');
            return;
        }

        const apiKey = localStorage.getItem('openai_api_key') || '';
        if (jobFitMode !== 'quick' && !apiKey) {
            if (typeof window.showApiKeyWarning === 'function') window.showApiKeyWarning();
            return;
        }

        isEvaluationCancelled = false;
        resultsArea.style.display = 'none';
        loadingOverlay.style.display = 'block';
        analyzeBtn.disabled = true;

        try {
            const filePaths = uploadedFiles.map(f => f.path);
            const apiKey = localStorage.getItem('openai_api_key') || '';
            const response = await window.api.jobFitAnalyze({
                filePaths,
                jobSpec,
                apiKey: apiKey,
                mode: jobFitMode
            });

            if (isEvaluationCancelled) return;

            if (response.error) {
                if (window.showToast) window.showToast('Evaluation error: ' + response.error, 'error');
                loadingOverlay.style.display = 'none';
                analyzeBtn.disabled = false;
                return;
            }

            if (tokenBadge) {
                const totalTokens = response.totalTokens || 0;
                tokenBadge.innerHTML = `<i class="fa-solid fa-fire"></i> ${totalTokens.toLocaleString()} Tokens Burned`;
            }

            // Render Results
            resultsList.innerHTML = '';
            
            response.results.forEach((res, index) => {
                let borderColor = 'var(--danger)';
                let glowColor = 'rgba(239, 68, 68, 0.05)';
                if (res.score >= 80) {
                    borderColor = 'var(--success)';
                    glowColor = 'rgba(16, 185, 129, 0.05)';
                } else if (res.score >= 50) {
                    borderColor = 'var(--warning)';
                    glowColor = 'rgba(245, 158, 11, 0.05)';
                }

                let rankBadge = '';
                let rankText = `TOP RANK ${index + 1}`;
                if (index === 0) {
                    rankBadge = `<div style="position: absolute; top: -14px; left: 16px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; padding: 4px 16px; border-radius: 20px; font-weight: 900; font-size: 0.8rem; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(245,158,11,0.4); border: 2px solid var(--bg-panel);"><i class="fa-solid fa-crown" style="margin-right: 4px;"></i> ${rankText}</div>`;
                } else if (index === 1) {
                    rankBadge = `<div style="position: absolute; top: -14px; left: 16px; background: linear-gradient(135deg, #94a3b8, #64748b); color: #fff; padding: 4px 16px; border-radius: 20px; font-weight: 900; font-size: 0.8rem; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(148,163,184,0.4); border: 2px solid var(--bg-panel);"><i class="fa-solid fa-medal" style="margin-right: 4px;"></i> ${rankText}</div>`;
                } else if (index === 2) {
                    rankBadge = `<div style="position: absolute; top: -14px; left: 16px; background: linear-gradient(135deg, #b45309, #78350f); color: #fff; padding: 4px 16px; border-radius: 20px; font-weight: 900; font-size: 0.8rem; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(180,83,9,0.4); border: 2px solid var(--bg-panel);"><i class="fa-solid fa-award" style="margin-right: 4px;"></i> ${rankText}</div>`;
                } else {
                    rankBadge = `<div style="position: absolute; top: -14px; left: 16px; background: var(--bg-lighter); color: var(--text-main); padding: 4px 16px; border-radius: 20px; font-weight: 800; font-size: 0.8rem; letter-spacing: 1px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid var(--border-light);"><i class="fa-solid fa-hashtag" style="margin-right: 4px;"></i> ${rankText}</div>`;
                }

                resultsList.innerHTML += `
                    <div class="eval-section-card" style="border-left: 4px solid ${borderColor}; position: relative; margin-bottom: 2rem; background: ${glowColor}; padding-top: 1.5rem; transition: transform 0.2s ease;">
                        ${rankBadge}
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <h3 style="margin-top:0; margin-bottom: 0.5rem; color: var(--text-main); font-size: 1.15rem; font-weight: 700;">
                                    ${escapeHtml(res.filename)}
                                </h3>
                                <p style="font-size: 0.95rem; line-height:1.6; color: var(--text-muted); margin: 0; white-space: pre-wrap;">${escapeHtml(res.justification)}</p>
                            </div>
                            <div class="match-score-circle" style="width: 70px; height: 70px; font-size: 1.3rem; font-weight: 800; border-color: ${borderColor}; background: var(--bg-panel); color: ${borderColor}; flex-shrink: 0; margin-left: 1.5rem; box-shadow: 0 4px 15px ${glowColor};">
                                ${res.score}%
                            </div>
                        </div>
                        <div style="margin-top: 1.25rem;">
                            <button type="button" class="btn-outline small" style="border-color: ${borderColor}; color: ${borderColor}; font-weight: 600;" onclick="window.api.openFile('${res.filePath.replace(/\\/g, '\\\\')}')">
                                <i class="fa-solid fa-folder-open"></i> Open CV
                            </button>
                        </div>
                    </div>
                `;
            });
            
            loadingOverlay.style.display = 'none';
            resultsArea.style.display = 'block';
            analyzeBtn.disabled = false;

        } catch (error) {
            console.error('Job Fit Match error:', error);
            if (!isEvaluationCancelled) {
                if (window.showToast) window.showToast('Evaluation error: ' + error.message, 'error');
            }
            loadingOverlay.style.display = 'none';
            analyzeBtn.disabled = false;
        }
    });
});
