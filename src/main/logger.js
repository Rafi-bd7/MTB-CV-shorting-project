const log4js = require("log4js");
const path = require("path");
const os = require("os");
const fs = require("fs");

let docsDir, userDataDir;
const publicDir = "C:\\MTB_CV_Sorter_Logs";

try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
        try { docsDir = app.getPath("documents"); } catch (e) {}
        try { userDataDir = app.getPath("userData"); } catch (e) {}
    }
} catch (e) {}

if (!docsDir) {
    docsDir = path.join(os.homedir(), "Documents");
}
if (!userDataDir) {
    userDataDir = path.join(os.homedir(), "AppData", "Roaming", "MTB_CV_Sorter");
}

// Path 1: User Documents Directory (Handles OneDrive / OS Path on any PC)
const docsLogDir = path.join(docsDir, "MTB_CV_Sorter_Data", "logs");
if (!fs.existsSync(docsLogDir)) {
    try { fs.mkdirSync(docsLogDir, { recursive: true }); } catch (e) {}
}

// Path 2: User AppData Directory (Standard Windows AppData path)
const appDataLogDir = path.join(userDataDir, "logs");
if (!fs.existsSync(appDataLogDir)) {
    try { fs.mkdirSync(appDataLogDir, { recursive: true }); } catch (e) {}
}

// Path 3: Direct C: Drive Root Backup Folder (Easy to find on any PC: C:\MTB_CV_Sorter_Logs)
if (!fs.existsSync(publicDir)) {
    try { fs.mkdirSync(publicDir, { recursive: true }); } catch (e) {}
}

// Path 4: Local EXE / Project Root Directory (if writable)
let localLogDir = path.resolve(__dirname, "..", "..", "logs");
try {
    const { app } = require("electron");
    if (app && app.isPackaged) {
        localLogDir = path.join(path.dirname(process.execPath), "logs");
    }
} catch (e) {}

let isLocalWritable = false;
try {
    if (!fs.existsSync(localLogDir)) {
        fs.mkdirSync(localLogDir, { recursive: true });
    }
    const testFile = path.join(localLogDir, ".test_perm");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    isLocalWritable = true;
} catch (e) {
    isLocalWritable = false;
}

const appenders = {
    out: { type: "console" },
    docsApp: { 
        type: "file", 
        filename: path.join(docsLogDir, 'app.log'),
        maxLogSize: 10485760, // 10MB
        backups: 3,
        compress: true 
    },
    docsTxt: {
        type: "file",
        filename: path.join(docsLogDir, 'software_activity.txt'),
        maxLogSize: 10485760,
        backups: 3,
        compress: false
    },
    appDataTxt: {
        type: "file",
        filename: path.join(appDataLogDir, 'software_activity.txt'),
        maxLogSize: 10485760,
        backups: 3,
        compress: false
    }
};

const activeAppenders = ["out", "docsApp", "docsTxt", "appDataTxt"];

if (fs.existsSync(publicDir)) {
    appenders.publicTxt = {
        type: "file",
        filename: path.join(publicDir, 'software_activity.txt'),
        maxLogSize: 10485760,
        backups: 3,
        compress: false
    };
    activeAppenders.push("publicTxt");
}

if (isLocalWritable) {
    appenders.localApp = {
        type: "file",
        filename: path.join(localLogDir, 'app.log'),
        maxLogSize: 10485760,
        backups: 3,
        compress: true
    };
    appenders.localTxt = {
        type: "file",
        filename: path.join(localLogDir, 'software_activity.txt'),
        maxLogSize: 10485760,
        backups: 3,
        compress: false
    };
    activeAppenders.push("localApp", "localTxt");
}

log4js.configure({
    appenders: appenders,
    categories: {
        default: { appenders: activeAppenders, level: "debug" }
    }
});

const logger = log4js.getLogger();

// Wrapper for custom backward-compatible logActivity
function logActivity(action, details = '') {
    const logEntry = `[USER ACTION] ${action} | Details: ${details}`;
    logger.info(logEntry);
}

function getReportsData() {
    let logPath = path.join(docsLogDir, 'app.log');
    if (!fs.existsSync(logPath)) {
        logPath = path.join(docsLogDir, 'software_activity.txt');
    }
    if (!fs.existsSync(logPath)) {
        logPath = path.join(publicDir, 'software_activity.txt');
    }
    if (!fs.existsSync(logPath)) {
        logPath = path.join(appDataLogDir, 'software_activity.txt');
    }
    if (!fs.existsSync(logPath)) {
        logPath = path.join(localLogDir, 'app.log');
    }

    const data = {
        totalUploads: 0,
        totalSearches: 0,
        totalErrors: 0,
        searchHistory: []
    };
    
    if (!fs.existsSync(logPath)) return data;
    
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach(line => {
        if (!line.trim()) return;
        
        const match = line.match(/^\[(.*?)\] \[(.*?)\] .*? - (.*)$/);
        if (!match) return;
        
        const timestamp = new Date(match[1]).toLocaleString();
        const level = match[2];
        const message = match[3];
        
        if (level === 'ERROR') data.totalErrors++;
        
        if (message.includes('CV Upload') || message.includes('Uploaded')) {
            data.totalUploads++;
        }
        
        if (message.includes('Search Triggered') || message.includes('Search Run') || message.includes('Search Performed')) {
            data.totalSearches++;
        }
        
        if (message.includes('Search Run (Backend)') || message.includes('Search Triggered') || message.includes('Search Performed')) {
            const queryMatch = message.match(/Query: "(.*?)"/);
            const topKMatch = message.match(/TopK: (\d+)|Top K: (\d+)/);
            if (queryMatch) {
                data.searchHistory.push({
                    date: timestamp,
                    query: queryMatch[1],
                    topK: topKMatch ? (topKMatch[1] || topKMatch[2]) : 'N/A',
                    status: 'Completed'
                });
            }
        }
    });
    
    data.searchHistory.reverse();
    return data;
}

module.exports = {
    logger,
    logActivity,
    getReportsData,
    docsLogDir,
    appDataLogDir,
    publicDir,
    localLogDir
};

