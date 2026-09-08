const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { logger } = require('./logger');
// Override console to use log4js
console.log = (...args) => logger.info(...args);
console.error = (...args) => logger.error(...args);
console.warn = (...args) => logger.warn(...args);
console.info = (...args) => logger.info(...args);
console.debug = (...args) => logger.debug(...args);

ipcMain.on('log-message', (event, level, ...args) => {
    // Pipe frontend logs through log4js
    if (level === 'error') logger.error('[UI]', ...args);
    else if (level === 'warn') logger.warn('[UI]', ...args);
    else logger.info('[UI]', ...args);
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    autoHideMenuBar: true,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a1a',
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  logger.info('[SYSTEM] MTB Sortify Application Started successfully.');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Window Controls ──────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// ── Open File/URL in OS ──────────────────────────────────────────────
ipcMain.on('open-file', (event, filepath) => {
  shell.openPath(filepath);
});
ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

// ── File Dialog ──────────────────────────────────────────────────────
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'CV Files', extensions: ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png'] }
    ]
  });
  return result.filePaths || [];
});

// ── Backend Engine (Node.js) ─────────────────────────────────────────
const engine = require('./engine');

ipcMain.handle('get-status', async () => {
  return engine.getStatus();
});

ipcMain.handle('ingest-files', async (event, filePaths) => {
  return engine.ingestFiles(filePaths);
});

ipcMain.handle('search', async (event, { jobSpec, topK, fileFilters, apiKey }) => {
  return engine.search(jobSpec, topK, fileFilters, apiKey);
});

ipcMain.handle('ai-search', async (event, { jobSpec, topK, fileFilters, apiKey }) => {
  return engine.aiSearch(jobSpec, topK, fileFilters, apiKey);
});

ipcMain.handle('summarize', async (event, { candidateName, text, filename, filepath, apiKey }) => {
  return engine.summarizeCandidate({ candidateName, text, filename, filepath, apiKey });
});

ipcMain.handle('email-draft', async (event, { jobSpec, candidates, apiKey }) => {
  return engine.emailDraft(jobSpec, candidates, apiKey);
});

ipcMain.handle('get-candidates', async () => {
  return engine.getCandidates();
});

ipcMain.handle('get-analytics', async () => {
  return engine.getAnalytics();
});

ipcMain.handle('analyze-keyword', async (event, { keyword, topK }) => {
  return engine.analyzeKeyword(keyword, topK);
});

ipcMain.handle('clear-db', async () => {
  return engine.clearDatabase();
});

ipcMain.handle('delete-file', async (event, identifier) => {
  return engine.deleteFile(identifier);
});

ipcMain.handle('cancel-search', async () => {
  return engine.cancelSearch();
});

const singleCvEngine = require('./single_cv_engine');
ipcMain.handle('single-cv-match', async (event, data) => {
  return singleCvEngine.matchSingleCv(data);
});

const jobFitEngine = require('./job_fit_engine');
ipcMain.handle('job-fit-analyze', async (event, data) => {
  return jobFitEngine.runJobFitAnalysis(data);
});

// ── Backend Logging ──────────────────────────────────────────────────
const customLogger = require('./logger');
ipcMain.handle('log-activity', async (event, { action, details }) => {
  customLogger.logActivity(action, details);
  return { success: true };
});

ipcMain.handle('get-reports-data', async () => {
  return customLogger.getReportsData();
});

ipcMain.handle('open-log-folder', async () => {
  const fs = require('fs');
  const candidates = [
    customLogger.publicDir,
    customLogger.docsLogDir,
    customLogger.appDataLogDir,
    customLogger.localLogDir
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(dir)) {
      shell.openPath(dir);
      return { success: true, path: dir };
    }
  }
  return { success: false, message: 'Log folder not found' };
});

ipcMain.handle('open-log-file', async () => {
  const fs = require('fs');
  const candidates = [
    path.join(customLogger.publicDir, 'software_activity.txt'),
    path.join(customLogger.docsLogDir, 'software_activity.txt'),
    path.join(customLogger.appDataLogDir, 'software_activity.txt'),
    path.join(customLogger.localLogDir, 'software_activity.txt'),
    path.join(customLogger.docsLogDir, 'app.log')
  ];
  for (const file of candidates) {
    if (file && fs.existsSync(file)) {
      shell.openPath(file);
      return { success: true, path: file };
    }
  }
  return { success: false, message: 'Log file not found' };
});
