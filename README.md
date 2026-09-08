# MTB Sortify — AI Powered Desktop CV Sorting & Ranking Tool

**MTB Sortify** is an enterprise-grade, AI-assisted desktop application developed for the **Software Development & Solutions Department, Digital Banking Division** at **Mutual Trust Bank PLC (MTB)**. It automates candidate curriculum vitae (CV) ingestion, text extraction (PDF/DOCX/OCR), NLP-driven semantic matching against banking job descriptions, ranking, and structured candidate evaluation.

---

## 🚀 Key Features

- **Batch CV Processing**: Ingest and process multiple resumes simultaneously in PDF and Word (`.docx`) formats.
- **Intelligent Text & OCR Ingestion**: Integrates `pdf-parse`, `mammoth`, and `tesseract.js` for scanned documents.
- **AI-Powered Semantic Matching & Scoring**:
  - Local transformer embedding support via `@xenova/transformers`.
  - Cloud LLM integration with OpenAI API (`gpt-4o` / compatible endpoints).
  - Dynamic banking role benchmark matching across IT, operations, finance, and digital banking tracks.
- **Single CV Deep Analysis**: Detailed job-fit analysis, strengths, gaps, and suitability scores for individual candidates.
- **Multi-Path Enterprise Logging**: Configured via `log4js` with persistent daily log rotation and cross-platform desktop log access.
- **Export & Reporting**: Instant export of sorted candidates and evaluation scores to Microsoft Excel (`.xlsx`).

---

## 🛠️ Tech Stack

- **Framework**: Electron (v42+)
- **Runtime**: Node.js
- **Frontend / UI**: HTML5, Vanilla CSS3 (Custom responsive enterprise dark/light banking theme), JavaScript (ES6+)
- **NLP / AI**: `@xenova/transformers`, `openai`
- **Parsing**: `pdf-parse`, `mammoth`, `tesseract.js`, `xlsx`
- **Logging**: `log4js`
- **Packaging**: `electron-builder`

---

## 📋 Prerequisites

Ensure you have the following installed on your system:
- **Node.js**: `v18.x` or higher ([Download Node.js](https://nodejs.org/))
- **npm**: Comes with Node.js (`npm -v`)
- **Git**: For version control

---

## ⚙️ Installation & Running the Application

### 1. Clone the Repository
```bash
git clone https://github.com/Rafi-bd7/MTB-CV-shorting-project.git
cd MTB-CV-shorting-project
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Desktop Application
```bash
npm start
```

### 4. Build Production Executable / Installer (Optional)
To generate an unpacked Windows executable:
```bash
npm run pack
```
To generate the full NSIS Windows installer:
```bash
npm run dist
```

---

## 👤 Author & Acknowledgement

- **Author**: Md. Redwan Mahbub Rafi (Student ID: 2231003)
- **Department**: Computer Science and Engineering, Independent University, Bangladesh (IUB)
- **Internship Organization**: Mutual Trust Bank PLC (MTB)
- **Repository**: [MTB-CV-shorting-project](https://github.com/Rafi-bd7/MTB-CV-shorting-project)
