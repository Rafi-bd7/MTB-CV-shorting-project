const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // File operations
  openFile: (filepath) => ipcRenderer.send('open-file', filepath),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  selectFiles: () => ipcRenderer.invoke('select-files'),
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Backend engine
  getStatus: () => ipcRenderer.invoke('get-status'),
  ingestFiles: (filePaths) => ipcRenderer.invoke('ingest-files', filePaths),
  search: (data) => ipcRenderer.invoke('search', data),
  aiSearch: (data) => ipcRenderer.invoke('ai-search', data),
  summarize: (data) => ipcRenderer.invoke('summarize', data),
  emailDraft: (data) => ipcRenderer.invoke('email-draft', data),
  getCandidates: () => ipcRenderer.invoke('get-candidates'),
  getAnalytics: () => ipcRenderer.invoke('get-analytics'),
  analyzeKeyword: (keyword, topK) => ipcRenderer.invoke('analyze-keyword', { keyword, topK }),
  clearDb: () => ipcRenderer.invoke('clear-db'),
  deleteFile: (identifier) => ipcRenderer.invoke('delete-file', identifier),
  cancelSearch: () => ipcRenderer.invoke('cancel-search'),
  singleCvMatch: (data) => ipcRenderer.invoke('single-cv-match', data),
  jobFitAnalyze: (data) => ipcRenderer.invoke('job-fit-analyze', data),
  logActivity: (action, details) => ipcRenderer.invoke('log-activity', { action, details }),
  logMessage: (level, ...args) => ipcRenderer.send('log-message', level, ...args),
  getReportsData: () => ipcRenderer.invoke('get-reports-data'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
});
