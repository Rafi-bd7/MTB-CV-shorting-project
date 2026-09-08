/**
 * MTB Sortify - Help & Support / User Guide Module
 * Bilingual (English & Bengali) Interactive Documentation & Executive User Manual
 */

(function () {
    // State
    let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('guide_lang')) || 'en'; // 'en' or 'bn'
    let currentCategory = 'all';
    let searchQuery = '';

    // Executive User Manual / App Purpose & Operational Workflow Data
    const OVERVIEW_MANUAL_DATA = {
        badge: {
            en: 'Official User Manual & Purpose',
            bn: 'অ্যাপ পরিচিতি ও পূর্ণাঙ্গ ইউজার ম্যানুয়াল'
        },
        title: {
            en: 'What is MTB Sortify & How Does It Work?',
            bn: 'MTB Sortify কী এবং এটি কীভাবে কাজ করে?'
        },
        description: {
            en: 'Mutual Trust Bank (MTB) receives countless CVs for various job circulars. It is practically impossible for a human HR team to manually read, analyze, and evaluate every single resume accurately. <strong>MTB Sortify</strong> is an enterprise-grade AI CV Sorting App designed to eliminate this hardship. It acts as an intelligent assistant that instantly reads thousands of CVs, understands your exact hiring needs, and automatically finds the absolute best candidates for the job, saving time and ensuring 100% accurate, unbiased recruitment.',
            bn: 'মিউচুয়াল ট্রাস্ট ব্যাংক (MTB)-এ বিভিন্ন পদের জন্য প্রতিদিন অসংখ্য CV জমা পড়ে। একজন মানুষের পক্ষে এতগুলো CV পড়ে, যাচাই করে সঠিক প্রার্থী বাছাই করা প্রায় অসম্ভব। এই কষ্ট ও সময়ক্ষেপণ দূর করতেই তৈরি করা হয়েছে <strong>MTB Sortify</strong>। এটি এমন একটি এআই-চালিত CV শর্টিং অ্যাপ, যা আপনার হয়ে হাজার হাজার CV পড়ে নিবে এবং আপনার চাহিদা অনুযায়ী সবচেয়ে যোগ্য ও সেরা প্রার্থীকে মুহূর্তের মধ্যে খুঁজে বের করবে, যা ১০০% নির্ভুল এবং সময়সাশ্রয়ী।'
        },
        workflowTitle: {
            en: 'The Core Pillars of MTB Sortify',
            bn: 'MTB Sortify এর মূল ফিচারসমূহ'
        },
        steps: [
            {
                num: '1',
                title: {
                    en: 'Rank & Match (Bulk Filtering)',
                    bn: '১. Rank & Match (হাজারো প্রার্থীর র‍্যাঙ্কিং)'
                },
                desc: {
                    en: 'Search through thousands of indexed CVs based on your specific preferences and rank them instantly. You can use "Quick Search" or "AI Search" to get 100% accurate results.',
                    bn: 'হাজার হাজার প্রার্থীর ডাটাবেজ থেকে আপনার পছন্দমতো রিকোয়ারমেন্ট দিয়ে সার্চ করে যোগ্য প্রার্থীদের র‍্যাঙ্ক বা ক্রমানুসারে সাজানো যায়। "Quick Search" এবং "AI Search" দিয়ে ১০০% সঠিক ফলাফল পাওয়া যায়।'
                }
            },
            {
                num: '2',
                title: {
                    en: 'Job Fit Analyzer',
                    bn: '২. Job Fit Analyzer (পদের যোগ্যতা যাচাই)'
                },
                desc: {
                    en: 'Define exactly what kind of employee you need. The system will read the full CVs of candidates and determine exactly how fit they are for that specific role.',
                    bn: 'আপনার ঠিক কী ধরনের কর্মী দরকার, তার বিবরণ (Job Description) দিলে সিস্টেমটি প্রার্থীদের সম্পূর্ণ CV পড়ে যাচাই করে যে তারা ওই পদের জন্য কতটুকু যোগ্য।'
                }
            },
            {
                num: '3',
                title: {
                    en: 'Single CV Match',
                    bn: '৩. Single CV Match (একক সিভী মূল্যায়ন)'
                },
                desc: {
                    en: 'Upload a single CV and use AI Search to find out exactly how qualified that particular candidate is for your required position, with detailed gap analysis.',
                    bn: 'নির্দিষ্ট কোনো একক প্রার্থী আপনার পদের জন্য কতটুকু যোগ্য, তা খুব নিখুঁতভাবে বের করা যায় এই ফিচারের মাধ্যমে। প্রার্থীর ঘাটতির পূর্ণাঙ্গ রিপোর্ট পাওয়া যায়।'
                }
            }
        ],
        modulePills: [
            { icon: 'fa-users-viewfinder', en: 'Rank & Match', bn: 'Rank & Match' },
            { icon: 'fa-scale-balanced', en: 'Job Fit Analyzer', bn: 'Job Fit Analyzer' },
            { icon: 'fa-user-check', en: 'Single CV Match', bn: 'Single CV Match' },
            { icon: 'fa-file-export', en: 'Reports & Export', bn: 'রিপোর্টস ও এক্সপোর্ট' }
        ]
    };

    // Detailed Function Documentation Data matching UI categories
    const GUIDE_DATA = [
        {
            id: 'batch_cv_engine',
            category: 'batch',
            icon: 'fa-folder-tree',
            badge: { en: 'Data Extraction', bn: 'ডেটা রিডিং ও পার্সিং' },
            title: {
                en: 'Batch CV Engine: How Data is Read',
                bn: 'ব্যাচ সিভী ইঞ্জিন: সিস্টেম কীভাবে সিভি পড়ে'
            },
            summary: {
                en: 'The core system uses highly advanced libraries to read, extract, and understand every bit of text from various file formats instantly and accurately.',
                bn: 'এই সফটওয়্যারটি সর্বাধুনিক টেকনোলজি ব্যবহার করে যেকোনো ফরম্যাটের ফাইল থেকে নিখুঁতভাবে তথ্য পড়ে নিতে সক্ষম।'
            },
            steps: {
                en: [
                    '<strong>PDF Extraction (pdf-parse):</strong> Effortlessly reads all text layers and formatting from standard PDF resumes with absolute accuracy.',
                    '<strong>Word Documents (mammoth):</strong> Deeply scans and extracts clean, readable text from .docx and .doc files, ignoring complex, messy formatting.',
                    '<strong>Excel Sheets (xlsx):</strong> Can read and export candidate databases, parsing massive rows of data rapidly.',
                    '<strong>Image & Scanned CVs (tesseract.js):</strong> Uses advanced OCR (Optical Character Recognition) AI to literally "read" text from scanned JPG/PNG images.'
                ],
                bn: [
                    '<strong>PDF রিডিং (pdf-parse):</strong> যেকোনো সাধারণ PDF সিভী থেকে ১০০% নিখুঁতভাবে সম্পূর্ণ টেক্সট এক্সট্রাক্ট করে নেয়।',
                    '<strong>Word ফাইল (mammoth):</strong> .docx বা .doc ফাইলের ভেতরের জটিল ফরম্যাটিং বাদ দিয়ে শুধুমাত্র প্রয়োজনীয় ক্লিন টেক্সট সংগ্রহ করে।',
                    '<strong>Excel স্প্রেডশিট (xlsx):</strong> হাজারো কলাম ও সারির ডেটাবেজ মুহূর্তেই পড়ে নিতে এবং রিপোর্ট তৈরি করতে ব্যবহৃত হয়।',
                    '<strong>ছবি বা স্ক্যান করা সিভী (tesseract.js):</strong> OCR প্রযুক্তির মাধ্যমে স্ক্যান করা বা মোবাইল দিয়ে তোলা ছবির (JPG/PNG) ভেতরের লেখাও পড়ে ফেলতে পারে।'
                ]
            },
            proTip: {
                en: 'For the fastest speeds, ask candidates to provide clean PDFs. Images will take slightly longer due to OCR processing.',
                bn: 'সবচেয়ে দ্রুত ফলাফলের জন্য পিডিএফ (PDF) ব্যবহার করুন। ছবির ক্ষেত্রে OCR ব্যবহার হয় বলে একটু বেশি সময় লাগে।'
            }
        },
        {
            id: 'search_modes',
            category: 'search',
            icon: 'fa-bolt',
            badge: { en: 'Core Algorithm', bn: 'মূল অ্যালগরিদম' },
            title: {
                en: 'Search Modes: Quick vs AI',
                bn: 'সার্চ মোড: কুইক বনাম এআই সার্চ'
            },
            summary: {
                en: 'Dual engine options allow you to choose between blazing-fast offline sorting or deep generative AI analysis.',
                bn: 'প্রয়োজন অনুযায়ী দ্রুত অফলাইন সার্চ অথবা ডিপ এআই সার্চ ব্যবহার করে ১০০% সঠিক ফলাফল পান।'
            },
            steps: {
                en: [
                    '<strong>Quick Search (Powered by Ollama):</strong> Uses the lightweight "phi3" local AI model. It runs 100% offline, consumes 0 tokens, and gives instant ranking results for thousands of CVs.',
                    '<strong>AI Search (Powered by OpenAI):</strong> Connects to cloud AI models for deep, human-like understanding of complex job responsibilities and precise gap analysis (Burns tokens).',
                    '<strong>Hybrid Accuracy:</strong> Combines keyword matching and semantic intelligence to ensure candidates are ranked fairly based on merit, not just buzzwords.'
                ],
                bn: [
                    '<strong>Quick Search (Ollama চালিত):</strong> লোকাল AI মডেল (phi3) ব্যবহার করে। এটি সম্পূর্ণ ইন্টারনেট ছাড়াই চলে, ০ টোকেন খরচ হয় এবং হাজারো সিভী থেকে চোখের পলকে রেজাল্ট দেয়।',
                    '<strong>AI Search (OpenAI চালিত):</strong> ডিপ কনটেক্সট যাচাইয়ের জন্য ক্লাউড এআই ব্যবহার করে। এটি প্রার্থীর ক্যারিয়ারের গভীরতা বুঝে ১০০% নিখুঁত ফিট বের করে (টোকেন খরচ হয়)।',
                    '<strong>নিখুঁত র‍্যাঙ্কিং:</strong> কিওয়ার্ড এবং সেমান্টিক বুদ্ধিমত্তার মিশ্রণে প্রার্থীদের শুধু শব্দ নয়, বরং যোগ্যতার ভিত্তিতে র‍্যাঙ্ক করা হয়।'
                ]
            },
            proTip: {
                en: 'Use Quick Search to freely analyze a massive JD against 1000 candidates. Use AI Search only when finalizing the top 10.',
                bn: 'বড় কোনো JD দিয়ে হাজারো প্রার্থীর মধ্যে ফ্রি-তে বাছাই করতে Quick Search ব্যবহার করুন। ফাইনাল সিলেকশনের সময় AI Search ব্যবহার করুন।'
            }
        },
        {
            id: 'single_cv_match',
            category: 'single',
            icon: 'fa-file-shield',
            badge: { en: 'Deep Dive', bn: 'গভীর বিশ্লেষণ' },
            title: {
                en: 'Single CV Match: Individual Profiling',
                bn: 'সিঙ্গেল সিভী ম্যাচ: একক প্রার্থীর যাচাই'
            },
            summary: {
                en: 'The ultimate tool for interview preparation. Evaluate one specific candidate against a strict job requirement to uncover hidden flaws or strengths.',
                bn: 'ইন্টারভিউয়ের প্রস্তুতির জন্য দারুণ ফিচার। একটি নির্দিষ্ট পদের বিপরীতে একজন প্রার্থীর খুঁটিনাটি যাচাই করুন।'
            },
            steps: {
                en: [
                    '<strong>In-Depth Review:</strong> Reads the candidate’s entire history to find alignments with the specific position.',
                    '<strong>Instant Verdict:</strong> Provides a clear percentage match and a descriptive reasoning block.',
                    '<strong>Gap Detection:</strong> Highlights exactly what the candidate lacks (e.g., missing specific banking software skills).',
                    '<strong>Cached Results:</strong> Results are cached instantly. Searching the same CV again takes 0 seconds and 0 tokens.'
                ],
                bn: [
                    '<strong>গভীর পর্যালোচনা:</strong> প্রার্থীর পুরো ক্যারিয়ার হিস্ট্রি পড়ে পদের সাথে তার মিল ও অমিল খুঁজে বের করে।',
                    '<strong>তাৎক্ষণিক ফলাফল:</strong> প্রার্থী কত শতাংশ যোগ্য এবং কেন যোগ্য তার স্পষ্ট ব্যাখ্যা প্রদান করে।',
                    '<strong>গ্যাপ অ্যানালাইসিস:</strong> প্রার্থীর কী কী স্কিল নেই (যেমন- নির্দিষ্ট ব্যাংকিং সফটওয়্যারের অভিজ্ঞতা) তা স্পষ্ট করে তুলে ধরে।',
                    '<strong>ক্যাশড মেমোরি:</strong> একবার সার্চ করা সিভী সিস্টেমে সেভ থাকে, তাই দ্বিতীয়বার সার্চ দিলে সময় ও টোকেন কোনটিই লাগে না।'
                ]
            },
            proTip: {
                en: 'Print this evaluation report and take it to the interview board to ask highly targeted questions.',
                bn: 'এই রিপোর্টটি প্রিন্ট করে ইন্টারভিউ বোর্ডে নিয়ে যান, প্রার্থীর দুর্বলতার জায়গাগুলো ধরে খুব সহজেই প্রশ্ন করতে পারবেন।'
            }
        },
        {
            id: '5_star_ratings',
            category: 'rating',
            icon: 'fa-star',
            badge: { en: 'Scoring System', bn: 'স্কোরিং সিস্টেম' },
            title: {
                en: '5-Star Ratings & Clear Verdicts',
                bn: '৫-স্টার রেটিং এবং স্পষ্ট ফলাফল'
            },
            summary: {
                en: 'A transparent, multi-dimensional scoring system that categorizes candidates perfectly from "Highly Recommended" to "Strictly Unfit".',
                bn: 'স্বচ্ছ এবং বহুমাত্রিক একটি স্কোরিং পদ্ধতি, যার মাধ্যমে প্রার্থীকে রেটিং দিয়ে ক্যাটাগরি করা হয়।'
            },
            steps: {
                en: [
                    '<strong>⭐⭐⭐⭐⭐ Highly Recommended (85-100%):</strong> An absolute perfect fit. Excels in education, experience, and all core duties.',
                    '<strong>⭐⭐⭐⭐☆ Competent Fit (70-84%):</strong> A very strong candidate with minor, manageable skill gaps.',
                    '<strong>⭐⭐⭐☆☆ Conditional Fit (55-69%):</strong> Has potential but requires significant training or lacks exact tenure.',
                    '<strong>⭐⭐☆☆☆ Below Expectations (40-54%):</strong> Missing critical requirements or core banking context.',
                    '<strong>⭐☆☆☆☆ Strictly Unfit (0-39%):</strong> Complete mismatch for the role.'
                ],
                bn: [
                    '<strong>⭐⭐⭐⭐⭐ হাইলি রেকমেন্ডেড (৮৫-১০০%):</strong> পদের জন্য একদম পারফেক্ট। শিক্ষা এবং অভিজ্ঞতায় সেরা প্রার্থী।',
                    '<strong>⭐⭐⭐⭐☆ কম্পিটেন্ট ফিট (৭০-৮৪%):</strong> অত্যন্ত যোগ্য প্রার্থী, তবে খুব সামান্য ঘাটতি থাকতে পারে যা পূরণযোগ্য।',
                    '<strong>⭐⭐⭐☆☆ কন্ডিশনাল ফিট (৫৫-৬৯%):</strong> কাজের সম্ভাবনা আছে তবে ট্রেনিং প্রয়োজন অথবা অভিজ্ঞতায় ঘাটতি আছে।',
                    '<strong>⭐⭐☆☆☆ বিলো এক্সপেক্টেশন (৪০-৫৪%):</strong> পদের জন্য গুরুত্বপূর্ণ ডিগ্রির অভাব রয়েছে।',
                    '<strong>⭐☆☆☆☆ আনফিট (০-৩৯%):</strong> পদের যোগ্যতার সাথে প্রার্থীর কোনো মিল নেই।'
                ]
            },
            proTip: {
                en: 'The system guarantees 0 randomness. The same CV + Job Description will always yield the exact same Star Rating.',
                bn: 'সিস্টেমটি ১০০% ফিক্সড অ্যালগরিদমে চলে। একই সিভী ও জবের ক্ষেত্রে সবসময় হুবহু একই রেটিং আসবে, কোনো পরিবর্তন হবে না।'
            }
        },
        {
            id: 'reports_export',
            category: 'export',
            icon: 'fa-file-pdf',
            badge: { en: 'Output', bn: 'রিপোর্ট আউটপুট' },
            title: {
                en: 'Reports, Excel Export & Automation',
                bn: 'রিপোর্ট, এক্সেল এক্সপোর্ট এবং অটোমেশন'
            },
            summary: {
                en: 'Seamlessly transition from candidate selection to interview scheduling with automated exports and generated emails.',
                bn: 'বাছাই পর্ব শেষ হওয়ার পর খুব সহজেই ক্যান্ডিডেট রিপোর্ট এক্সপোর্ট এবং অটোমেটেড ইমেইল তৈরি করুন।'
            },
            steps: {
                en: [
                    '<strong>Excel Export (.xlsx):</strong> Download the final shortlisted candidates directly into a highly organized Excel spreadsheet containing names, scores, and emails.',
                    '<strong>AI Email Generation:</strong> Automatically draft professional interview invitations or polite rejection letters tailored to the candidate.',
                    '<strong>Native Preview:</strong> Review the original CV formatting at any time without leaving the application.'
                ],
                bn: [
                    '<strong>এক্সেল এক্সপোর্ট (.xlsx):</strong> শর্টলিস্টেড প্রার্থীদের নাম, স্কোর এবং যোগাযোগের ঠিকানাসহ সুন্দরভাবে সাজানো এক্সেল ফাইল ডাউনলোড করুন।',
                    '<strong>অটোমেটেড ইমেইল:</strong> প্রার্থীর নাম যুক্ত করে এক ক্লিকেই ইন্টারভিউ কল বা রিজেকশনের প্রফেশনাল ইমেইল তৈরি করে ফেলুন।',
                    '<strong>ফাইল প্রিভিউ:</strong> সফটওয়্যার থেকে বের না হয়েই যেকোনো সময় প্রার্থীর মূল সিভী (PDF/Word) ওপেন করে দেখতে পারবেন।'
                ]
            },
            proTip: {
                en: 'Apply your score filters first. The Excel export will strictly respect your current filters, keeping your sheets clean.',
                bn: 'প্রথমে স্কোর ফিল্টার করে নিন। এরপর এক্সপোর্ট বাটনে চাপলে শুধু ফিল্টার করা যোগ্য প্রার্থীদের লিস্টই এক্সেলে সেভ হবে।'
            }
        },
        {
            id: 'tips_shortcuts',
            category: 'tips',
            icon: 'fa-keyboard',
            badge: { en: 'Productivity', bn: 'প্রোডাক্টিভিটি' },
            title: {
                en: 'Pro-Tips & Keyboard Shortcuts',
                bn: 'প্রোডাক্টিভিটি টিপস এবং শর্টকাটস'
            },
            summary: {
                en: 'Master MTB Sortify like a pro. Use these hidden tricks to dramatically speed up your recruitment workflow.',
                bn: 'এই শর্টকাটগুলো ব্যবহার করে রিক্রুটমেন্টের কাজের গতি কয়েকগুণ বাড়িয়ে নিন এবং প্রো-ইউজার হয়ে উঠুন।'
            },
            steps: {
                en: [
                    '<strong>Quick Submit:</strong> Press <code>Enter</code> while typing in a requirement box to start the AI analysis immediately.',
                    '<strong>Line Breaks:</strong> Press <code>Shift + Enter</code> if you need to add a new line to your job description.',
                    '<strong>Bulk Upload:</strong> Don\'t upload one by one. Press <code>Ctrl + A</code> in your file browser and drop 100+ files at once.',
                    '<strong>Cancel Anytime:</strong> Hit the red "Cancel" button if you made a mistake; it safely stops the AI without crashing.'
                ],
                bn: [
                    '<strong>কুইক সাবমিট:</strong> রিকোয়ারমেন্ট বক্সে লিখতে লিখতে <code>Enter</code> চাপলেই অ্যানালাইসিস শুরু হয়ে যাবে।',
                    '<strong>নতুন লাইন:</strong> জব ডেসক্রিপশনে নতুন লাইন বা প্যারাগ্রাফ করতে <code>Shift + Enter</code> ব্যবহার করুন।',
                    '<strong>বাল্ক আপলোড:</strong> একটা একটা করে আপলোড না করে, ফোল্ডারে গিয়ে <code>Ctrl + A</code> চেপে একসাথে সব সিভী টেনে আনুন।',
                    '<strong>যেকোনো সময় বাতিল:</strong> ভুল করে সার্চ শুরু করলে লাল "Cancel" বাটনে চাপ দিয়ে নিরাপদেই প্রসেস থামিয়ে দিতে পারবেন।'
                ]
            },
            proTip: {
                en: 'Use the Dark Mode toggle (Moon/Sun icon in sidebar) to reduce eye strain when working late on large recruitment batches.',
                bn: 'দীর্ঘ সময় ধরে সিভী দেখার ক্ষেত্রে চোখের সুরক্ষায় সাইডবারের নিচ থেকে "ডার্ক মোড" (চাঁদ আইকন) চালু করে নিন।'
            }
        }
    ];

    // DOM Elements
    const langToggle = document.getElementById('guide-lang-toggle');
    const langEnLbl = document.getElementById('guide-lang-en-lbl');
    const langBnLbl = document.getElementById('guide-lang-bn-lbl');
    const heroTitle = document.getElementById('guide-hero-title');
    const heroSubtitle = document.getElementById('guide-hero-subtitle');
    const manualHeroContainer = document.getElementById('guide-manual-hero-container');
    const categoryPills = document.querySelectorAll('.guide-pill-btn');
    const searchInput = document.getElementById('guide-search-input');
    const container = document.getElementById('guide-cards-container');

    // UI Translation Strings
    const UI_STRINGS = {
        en: {
            heroTitle: '<span class="gradient-text">Help & Support</span> · MTB Sortify',
            heroSubtitle: 'Complete user guide for the ultimate AI CV Sorting Application.',
            searchPlaceholder: 'Search guide topics / functions...',
            howItWorks: 'How it Works & Features',
            proTipLabel: 'Pro-Tip',
            noResults: 'No documentation topics found matching your query.',
            categories: {
                all: 'All Features',
                batch: 'Batch CV Engine',
                search: 'Search Modes',
                single: 'Single CV Match',
                rating: '5-Star Ratings',
                export: 'Reports & Export',
                tips: 'Pro-Tips & Shortcuts'
            }
        },
        bn: {
            heroTitle: '<span class="gradient-text">হেল্প ও সাপোর্ট</span> · MTB Sortify',
            heroSubtitle: 'MTB-এর এআই সিভী শর্টিং সফটওয়্যারটির বিস্তারিত নির্দেশিকা।',
            searchPlaceholder: 'ফিচার বা নির্দেশিকা খুঁজুন...',
            howItWorks: 'কার্যপদ্ধতি ও ফিচারসমূহ',
            proTipLabel: 'প্রো-টিপ',
            noResults: 'আপনার অনুসন্ধানের সাথে মিলে এমন কোনো বিষয় খুঁজে পাওয়া যায়নি।',
            categories: {
                all: 'সকল ফিচার',
                batch: 'ব্যাচ সিভী ইঞ্জিন',
                search: 'সার্চ মোডস',
                single: 'সিঙ্গেল সিভী ম্যাচ',
                rating: '৫-স্টার রেটিং',
                export: 'রিপোর্ট ও এক্সপোর্ট',
                tips: 'শর্টকাটস ও টিপস'
            }
        }
    };

    // Render Executive Manual Hero
    function renderManualHero() {
        if (!manualHeroContainer) return;

        const manual = OVERVIEW_MANUAL_DATA;
        const stepsHtml = manual.steps.map(step => `
            <div class="manual-wf-card">
                <span class="manual-wf-step-num">${step.num}</span>
                <div class="manual-wf-title">${step.title[currentLang]}</div>
                <div class="manual-wf-text">${step.desc[currentLang]}</div>
            </div>
        `).join('');

        const pillsHtml = manual.modulePills.map(p => `
            <div class="manual-module-pill">
                <i class="fa-solid ${p.icon}"></i>
                <span>${p[currentLang]}</span>
            </div>
        `).join('');

        manualHeroContainer.innerHTML = `
            <div class="guide-manual-hero">
                <div class="manual-hero-header">
                    <div class="manual-hero-title-group">
                        <div class="manual-hero-icon">
                            <i class="fa-solid fa-building-columns"></i>
                        </div>
                        <h2 class="manual-hero-title">${manual.title[currentLang]}</h2>
                    </div>
                    <span class="manual-hero-badge"><i class="fa-solid fa-book-open"></i> ${manual.badge[currentLang]}</span>
                </div>
                
                <div class="manual-hero-desc">
                    ${manual.description[currentLang]}
                </div>
                
                <div class="manual-workflow-title">
                    <i class="fa-solid fa-arrows-split-up-and-left"></i> ${manual.workflowTitle[currentLang]}
                </div>
                
                <div class="manual-workflow-grid">
                    ${stepsHtml}
                </div>
                
                <div class="manual-modules-bar">
                    ${pillsHtml}
                </div>
            </div>
        `;
    }

    // Initialize Language Toggle State
    function initLanguage() {
        if (currentLang === 'bn') {
            if (langToggle) langToggle.checked = true;
            if (langEnLbl) langEnLbl.classList.remove('active');
            if (langBnLbl) langBnLbl.classList.add('active');
        } else {
            if (langToggle) langToggle.checked = false;
            if (langEnLbl) langEnLbl.classList.add('active');
            if (langBnLbl) langBnLbl.classList.remove('active');
        }
        updateStaticUi();
        renderManualHero();
        renderCards();
    }

    function updateStaticUi() {
        const strings = UI_STRINGS[currentLang];
        if (heroTitle) heroTitle.innerHTML = strings.heroTitle;
        if (heroSubtitle) heroSubtitle.innerText = strings.heroSubtitle;
        if (searchInput) searchInput.placeholder = strings.searchPlaceholder;

        // Update Category Labels
        categoryPills.forEach(pill => {
            const cat = pill.dataset.cat;
            const labelSpan = pill.querySelector('.cat-label');
            if (labelSpan && strings.categories[cat]) {
                labelSpan.innerText = strings.categories[cat];
            }
        });
    }

    // Render Detailed Cards
    function renderCards() {
        if (!container) return;

        const strings = UI_STRINGS[currentLang];
        let filtered = GUIDE_DATA.filter(item => {
            const matchesCat = currentCategory === 'all' || item.category === currentCategory;
            if (!matchesCat) return false;

            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const title = (item.title[currentLang] || '').toLowerCase();
            const summary = (item.summary[currentLang] || '').toLowerCase();
            const stepsText = (item.steps[currentLang] || []).join(' ').toLowerCase();
            return title.includes(q) || summary.includes(q) || stepsText.includes(q);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                    <i class="fa-solid fa-file-circle-question" style="font-size: 2.5rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p style="font-size: 1rem;">${strings.noResults}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(item => {
            const stepsHtml = (item.steps[currentLang] || []).map((step, idx) => `
                <li class="guide-step-item">
                    <span class="guide-step-num">${idx + 1}</span>
                    <span>${step}</span>
                </li>
            `).join('');

            return `
                <div class="guide-card">
                    <div class="guide-card-header">
                        <div class="guide-card-icon-title">
                            <div class="guide-card-icon">
                                <i class="fa-solid ${item.icon}"></i>
                            </div>
                            <h3 class="guide-card-title">${item.title[currentLang]}</h3>
                        </div>
                        <span class="guide-card-badge">${item.badge[currentLang]}</span>
                    </div>
                    
                    <p class="guide-card-summary">${item.summary[currentLang]}</p>
                    
                    <div class="guide-card-section-label">
                        <i class="fa-solid fa-list-check"></i> ${strings.howItWorks}
                    </div>
                    <ul class="guide-steps-list">
                        ${stepsHtml}
                    </ul>
                    
                    <div class="guide-protip-box">
                        <i class="fa-solid fa-lightbulb"></i>
                        <div><strong>${strings.proTipLabel}:</strong> ${item.proTip[currentLang]}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Event Listeners
    if (langToggle) {
        langToggle.addEventListener('change', (e) => {
            currentLang = e.target.checked ? 'bn' : 'en';
            localStorage.setItem('guide_lang', currentLang);
            if (langEnLbl) langEnLbl.classList.toggle('active', currentLang === 'en');
            if (langBnLbl) langBnLbl.classList.toggle('active', currentLang === 'bn');
            updateStaticUi();
            renderManualHero();
            renderCards();
        });
    }

    if (categoryPills) {
        categoryPills.forEach(pill => {
            pill.addEventListener('click', () => {
                categoryPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentCategory = pill.dataset.cat;
                renderCards();
            });
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderCards();
        });
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLanguage);
    } else {
        initLanguage();
    }
})();
