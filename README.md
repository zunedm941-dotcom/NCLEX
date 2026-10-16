# NCLEX Exam Simulator Pro 🩺 — Online Edition

A clinical-grade NextGen NCLEX web application featuring **11,718 practice questions** across six major nursing banks, authentic **Pearson VUE testing tools**, and a **Question Bank Explorer with direct page number navigation and instant "Go to page" controls**.

---

## ⚡ Direct Access — No Login or Password Required

The application is completely open and requires **zero credentials, logins, or passwords**. You can immediately start practicing, launch simulated CAT exams, bookmark questions, and review detailed clinical rationales without any barriers.

All exam history, saved questions, and progress are persisted automatically in your browser's local storage.

---

## 📖 Question Bank Explorer & Pagination

The **Question Bank Explorer** allows you to browse, search, and study all **11,718 questions** with comprehensive navigation controls:

- **Interactive Page Numbers**: Clickable page number buttons (`1 ... 14, 15, [16], 17, 18 ... 586`) with smart ellipses to keep navigation clean and responsive.
- **Go to Page Section (Top & Bottom)**: Direct numeric input field with a **Go** button and **Enter key** support to instantly jump to any page in the bank.
- **First / Prev / Next / Last Navigation**: Easy step-by-step or leap controls (`« First`, `‹ Prev`, `Next ›`, `Last »`).
- **Quick Jump Buttons**: Rapid leaps (`-10 Pages`, `-5 Pages`, `+5 Pages`, `+10 Pages`) to quickly scan large banks.
- **Configurable Page Size**: Choose between **20**, **50**, or **100** questions per page.
- **Live Search & Multi-Bank Filters**: Instant filtering by keyword (medications, diseases, lab values), question bank source (e.g., NCSBN, Exam Cram, Bank 4, Bank 5, Bank 6), clinical category, and question format (Single Choice, SATA, Numeric Dosage).
- **Reveal Answer & Rationale**: Click to reveal the official answer key and thorough clinical explanations.

---

## 🌟 Key Capabilities

### 1. Massive 11,718 Multi-Bank Question Repository
1. **Comprehensive NCLEX Bank (5,673 Questions)**: Full-spectrum question bank covering all client needs categories, dosage calculations, and SATA questions.
2. **NCLEX Practice Bank 5 (1,786 Questions)**: Deep clinical scenarios, detailed rationales, and extensive multiple-choice questions.
3. **NCLEX Exam Cram Bank (1,250 Questions)**: High-yield board practice questions organized across 5 clinical chapters with verified keys.
4. **HESI 1200 Exam Bank 6 (1,148 Questions)**: Authentic HESI examination questions with clinical rationales and page references.
5. **NCLEX Practice Bank 4 (977 Questions)**: High-yield practice questions featuring **213 SATA questions** and clinical explanations.
6. **Official NCSBN Question Bank (884 Questions)**: Authentic board questions with verified keys and case rationales.
- **Over 740 Select All That Apply (SATA)** multi-select questions.
- **Clinical Dosage Calculations** with dedicated numeric input fields and rounding rules.

### 2. Pearson VUE Testing Interface
- **On-Screen Calculator**: Floating medical calculator (`+`, `-`, `×`, `÷`, `√`, `±`, `%`, keyboard shortcut `C`).
- **Normal Laboratory Reference Ranges**: Searchable lab values (Electrolytes, CBC, PT/INR, aPTT, ABGs, Renal/Liver function, Cardiac biomarkers, Therapeutic Drug Levels).
- **Option Elimination / Strikethrough**: Click the cross-out button or right-click any distractor to eliminate it visually.
- **Mark for Review**: Flag questions for second review.
- **Question Navigator**: Visual matrix drawer displaying answered, unanswered, marked, and current questions.
- **Accessibility & Themes**: Modern Clinical, Official Pearson VUE, Dark Night Study, and font size scaling.

---

## 🚀 How to Run Locally

### Option 1: Double-Click Launcher
Double-click `start-app.bat`. It automatically detects `agy-node` or `node` and opens your browser.

### Option 2: Command Line Web Server
```powershell
node server.js
# or
agy-node server.js
```
Then navigate in any browser to:
- Local URL: **`http://localhost:3000`**
- Network URL: **`http://<your-local-ip>:3000`** (accessible from tablets or mobile devices on the same Wi-Fi)

### Option 3: Standalone Browser Mode
You can also open `index.html` directly in any modern browser without needing a server running.

---

## 🌐 Deploying Online (Vercel, Render, Railway, Heroku)

This application is ready for cloud deployment with zero build steps or npm installations:

### Deploy to Vercel (Recommended — Free & Instant Global CDN)
1. Push this repository to GitHub (e.g. `https://github.com/zunedm941-dotcom/NCLEX`).
2. Go to [vercel.com](https://vercel.com) and log in with your GitHub account.
3. Click **Add New...** → **Project**.
4. Select your **NCLEX** repository and click **Import**.
5. Leave all settings at their defaults (Framework Preset: *Other*, Root Directory: `./`).
6. Click **Deploy**.
7. In ~30 seconds, your site will be live worldwide with free HTTPS!

### Deploy to Render (Free Web Service)
1. Push this folder to a GitHub repository.
2. Log into [render.com](https://render.com) and click **New + > Web Service**.
3. Select your repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: *(leave blank or `echo "Build complete"`)*
   - **Start Command**: `node server.js`
5. Click **Create Web Service**. Your app is live with SSL!

### Deploy to Railway
1. Push to GitHub.
2. In [Railway.app](https://railway.app), click **New Project > Deploy from GitHub repo**.
3. Railway automatically detects `package.json` and runs `npm start` (`node server.js`).

### Deploy to Heroku
1. The included `Procfile` (`web: node server.js`) is automatically detected.
2. Run `heroku create` and `git push heroku main`.

---

## 📁 File Structure

```
NCLEX simulator/
├── server.js               # Online HTTP server & static file serving
├── db.js                   # Persistent SQLite database layer
├── package.json            # Node project configuration
├── Procfile                # Cloud deployment entrypoint
├── start-app.bat           # Windows one-click launcher
├── index.html              # Main single-page application & Pearson VUE tools
├── app.css                 # Ergonomic clinical styling, pagination & themes
├── app.js                  # State management, explorer pagination & test engine
├── manifest.json           # PWA configuration
├── service-worker.js       # Offline PWA caching
├── README.md               # Documentation & setup guide
├── database/
│   ├── nclex.db            # SQLite persistent database file
│   └── nclex-data.json     # JSON database fallback file
└── data/
    ├── questions.json      # 11,718 questions master dataset (10.5 MB)
    ├── questions.js        # Self-contained bundle for browser offline compatibility
    ├── lab-values.json     # Normal clinical laboratory reference values
    └── lab-values.js       # Lab values JavaScript bundle
```
