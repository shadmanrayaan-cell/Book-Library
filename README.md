# আমার পাঠাগার — Amar Pathagar

A **Bangla-first personal library manager** that runs entirely in your browser.
Track what you own, what you have read, what you are reading, your PDFs and
e-books, reading history, and private notes — with first-class Bangla
typography and search. No backend, no login, no tracking.

**Tech:** HTML5 + CSS3 + vanilla JavaScript (ES modules) · IndexedDB ·
Service Worker · Web App Manifest (installable PWA, works offline).

---

## 1. Features

### Library
- **13 views:** Dashboard, All Books, বাংলা বই, Authors, Publishers, Reading
  Queue, Currently Reading, Completed, PDF & Digital Shelf, Collections,
  Reading Journal, Import & Export, Settings.
- **Book records** with Bangla + English titles, alternate/transliterated
  titles, ISBN-10/13, multiple authors/translators/editors/illustrators,
  publishers, publication metadata, genres, tags, subjects.
- **Ownership tracking:** owned / borrowed / wishlist / library-access,
  copy count, condition, shelf & bookcase, acquisition date/price/source,
  lending (who borrowed it, due date, mark returned).
- **Formats:** physical + PDF + EPUB + other e-book + audiobook on the same
  record. A PDF attached in-app is stored as a real file (IndexedDB Blob),
  an external link is recorded as a link, and "known but not linked" is its
  own state — the app never pretends a file exists.
- **Reading status** (To Read / Reading / Completed / Paused / Abandoned) is
  independent of ownership and format. Owning or opening a PDF never marks a
  book "completed".
- **Multiple reading sessions** per book, including rereads and different
  media. Progress from page counts when available, or a manual percentage
  when not. History is never overwritten.
- **Reading journal:** reflections, summaries, chapter notes, quotes — with a
  distraction-free focus mode and draft autosave. Content stays on-device.
- **Collections** (e.g. রবীন্দ্রনাথ সমগ্র, World Literature) — a book can be in
  many. **Reading goals** (yearly/monthly books, weekly days, pages) computed
  from real session data only.
- **Queue:** priority, planned date, reason, estimated time; manual drag-and-
  drop ordering plus sorting.

### Bangla-first search
- Unicode-safe normalization layer: NFKD, nukta (য়/ড়/ঢ়) unification,
  ZWJ/ZWNJ stripping, case folding, punctuation and whitespace collapsing.
- Case-insensitive Latin + Bangla in the same query; searches titles,
  alternate titles, transliterations, author names (Bangla/English/aliases),
  publishers, genres, tags; optionally personal notes (off by default).
- Optional typo-tolerant fallback (Latin tokens) — used only when exact
  search finds nothing.
- Original spellings are always preserved; transliteration is never substituted.

### Data portability
- **CSV import** (UTF-8, Bangla headers supported, delimiter auto-detect,
  column mapping step, per-row validation, duplicate detection against the
  library *and* within the file, preview, summary).
- **CSV export** (whole library or the current filtered/selected list) with
  UTF-8 BOM so Bangla opens correctly in Excel and Google Sheets.
- **JSON backup/restore** — all stores, optional embedded attachments
  (base64), schema-validated restore with preview, **merge** or **full
  replace** (replace auto-downloads a safety backup of current data first and
  requires typing a confirmation word). After a metadata-only restore,
  dangling file references degrade to "known, not linked".

### Platform
- **PWA:** installable, offline-capable app shell (service worker caches the
  app; your data is IndexedDB and is never touched by app updates).
- **Light/dark/auto themes**, interface language **বাংলা / English / mixed**
  (changing the UI language never changes stored titles).
- Responsive (sidebar on desktop, drawer on mobile), keyboard-accessible,
  reduced-motion support, statuses never rely on color alone.

---

## 2. Run it

Any static file server works:

```bash
cd amar-pathagar
python3 -m http.server 8080
# open http://localhost:8080
```

> Open the site over http(s) once so the service worker can install; after
> that it works offline.

## 3. Deploy to GitHub Pages

1. Push this folder to a GitHub repository (files may sit at the repo root or
   in a subfolder like `/docs` — everything is relative-path based, so both
   work under `https://<user>.github.io/<repo>/`).
2. Repo **Settings → Pages → Deploy from branch** → pick the branch and
   folder.
3. Done. `start_url`/`scope` are `./`, the service worker registers relative
   to its own location, and all asset links are relative (`./css/...`,
   `./js/...`), so repository subpaths work unmodified.

## 4. Adding books

- **Manually:** "বই যোগ করুন" → a title in *any* language is the only
  requirement (reading status defaults to To Read). Everything else —
  authors, publisher, PDF, cover — is optional and can be added later.
  Duplicate detection warns on matching ISBN or normalized title+author
  before saving; different editions are never auto-merged.
- **CSV:** use `sample/books-import-template.csv` as a starting point (Bangla
  and English example rows included). Header names in Bangla or English are
  auto-mapped; you can fix the mapping in step 2 of the import wizard.
  Multiple authors/publishers are separated by `;` (or `|`).
- **JSON:** restore a previous backup from আমদানি ও রপ্তানি → পুনরুদ্ধার.

## 5. CSV format

- UTF-8 (the export includes a BOM; keep it if you re-import on Windows).
- Recognized columns (any of these header aliases map automatically):
  `বইয়ের নাম / title (bangla) / title_bn`, `Title (English) / title_en`,
  `লেখক / author(s)`, `অনুবাদক / translator`, `প্রকাশক / publisher`,
  `ভাষা / language`, `প্রকাশকাল / year`, `পৃষ্ঠা / pages`,
  `ধরন / genre`, `ট্যাগ / tags`, `সিরিজ / series`, `সংস্করণ / edition`,
  `ISBN`, `মালিকানা / ownership`, `পড়ার অবস্থা / reading status`,
  `অগ্রাধিকার / priority`, `তাক / shelf`, `রেটিং / rating`,
  `রিভিউ / review`, `নোট / notes`, `সংগ্রহের তারিখ / acquisition date`,
  `পরিকল্পিত তারিখ / planned`.
- Status values accept both languages: `সমাপ্ত / completed / পড়ছি / reading /
  পড়ার অপেক্ষায় / to-read / বিরত / paused / ছেড়ে দেওয়া / abandoned` and
  ownership `মালিকানাধীন / owned / ধার / borrowed / ইচ্ছে-তালিকা / wishlist /
  লাইব্রেরি / library`. Bangla numerals (৬২৪) are converted automatically.

## 6. JSON backup format

```jsonc
{
  "app": "amar-pathagar",
  "schemaVersion": 1,
  "exportedAt": "2026-10-23T09:00:00.000Z",
  "attachmentsIncluded": false,
  "counts": { "books": 11, "authors": 2, "...": "..." },
  "data": {
    "books":          [ /* full book records, same shape as IndexedDB */ ],
    "authors":        [ { "id", "nameBn", "nameEn", "aliases", "biography", "birthYear", "deathYear", "notes" } ],
    "publishers":     [ { "id", "nameBn", "nameEn", "aliases", "country", "notes" } ],
    "collections":    [ { "id", "nameBn", "nameEn", "description", "color" } ],
    "sessions":       [ { "sessionId", "bookId", "startDate", "endDate", "medium", "startingPage", "endingPage", "currentPage", "manualProgress", "completionStatus", "sessionNotes", "rating" } ],
    "journalEntries": [ { "id", "bookId", "type", "title", "body", "chapter", "date" } ],
    "meta":           { "genres": [...], "tags": [...], "queueOrder": [...], "settings": {...} }
  },
  "attachments": {              // only when "include attachments" is checked
    "included": true,
    "items": [ { "attachmentId", "bookId", "fileName", "mimeType", "size", "dataBase64" } ]
  }
}
```

- `schemaVersion` is validated on restore; unknown files are rejected.
- **A backup without attachments contains metadata only — not the files.**
  The restore screen says this explicitly and reconciles dangling references.

## 7. IndexedDB schema

Database **`amarPathagar`**, version **1**:

| Store | Key | Indexes | Contents |
|---|---|---|---|
| `books` | `id` | language, readingStatus, ownershipStatus, primaryGenre, isArchived, createdAt, updatedAt | Full book records (identity, people, publication, classification, ownership/lending, `formats[]`, reading plan, personal review, optional `coverDataUrl`) |
| `authors` | `id` | nameNorm | Author/contributor records (Bangla + English + aliases) |
| `publishers` | `id` | nameNorm | Publisher records |
| `collections` | `id` | — | User collections |
| `sessions` | `sessionId` | bookId, completionStatus, updatedAt | Reading sessions (history-preserving) |
| `journal` | `id` | bookId, createdAt | Journal entries |
| `attachments` | `attachmentId` | bookId | File metadata + `Blob` (PDF/EPUB/…), never executed, only opened/downloaded |
| `meta` | `key` | — | genres taxonomy, tags, queue order |

- Migrations run in `onupgradeneeded` keyed by old version; future schema
  changes append a new migration step and bump `DB_VERSION`.
- Deleting a book removes its sessions and attachments in one transaction;
  journal entries are kept unless you explicitly opt in to deleting them.
- Lightweight preferences (theme, language, goals, view mode) live in
  `localStorage` (`ap.prefs`) — safe to clear; core data does not.

## 8. Storage & privacy reality check

- All data lives in **this browser, on this device**. Clearing site data (or
  the browser evicting storage under pressure) **deletes your library**.
  Settings shows a storage-usage meter; the app requests persistent storage.
- **This is not cloud storage.** A GitHub Pages deployment does **not** sync
  between devices — use JSON backups to move data (Settings → Import & Export,
  with an optional backup reminder).
- No analytics, no network calls beyond Google Fonts (cached for offline) and
  links you explicitly open. Journal text and private notes never leave the
  device. The app does not download, scrape, or unlock copyrighted books; it
  manages records and files you provide.

## 9. Project structure

```
amar-pathagar/
├── index.html              # the single HTML shell (SPA + icon sprite)
├── manifest.json           # PWA manifest (start_url ./ , relative icons)
├── sw.js                   # service worker (precache shell, network-first assets)
├── css/
│   ├── styles.css          # design tokens, layout, core components
│   └── views.css           # view-specific styles
├── js/
│   ├── app.js              # bootstrap, hash router, theme, nav
│   ├── db.js               # IndexedDB: versioning, migrations, cascade deletes
│   ├── state.js            # in-memory caches, prefs, derived lookups
│   ├── search.js           # normalization layer, scoring, fuzzy fallback, dupes
│   ├── i18n.js             # bn/en/mixed UI dictionary
│   ├── util.js             # pure helpers (Node-testable)
│   ├── csv.js              # RFC-4180 parser/serializer, mapping, validation
│   ├── components.js       # modal, toast, chips, autocomplete, stars, covers…
│   ├── book-form.js        # add/edit book (progressive disclosure)
│   ├── quick-forms.js      # author/publisher/collection editors
│   ├── actions.js          # reading sessions, attachments
│   ├── sample.js           # optional labeled sample library
│   └── views/              # dashboard, books, book-detail, people, reading,
│                           # digital, collections, journal, data, settings
├── sample/books-import-template.csv
└── icons/                  # PWA icons
```

## 10. Implemented vs. limitations

**Implemented and browser-verified** (see §11): the full list in §1.

**Known limitations (honest):**
- No multi-device sync and no cloud backup (by design, v1).
- External PDF links can't be health-checked from the app (browsers block
  cross-origin HEAD probing without CORS); broken links are reported by the
  browser when opened.
- Search is in-memory (fast to several thousand books); it is not a full
  stemming/fuzzy Bangla engine — transliteration search works only for
  explicitly saved aliases/transliterated titles, never generated ones.
- Reread "resume" picks the most recent paused session; very unusual
  multi-paused-session scenarios are better managed from the book page's
  session editor.
- The sample library is demonstration data (clearly tagged `নমুনা`,
  one-click removable in Settings) — it is never counted as anything else.

## 11. Test checklist (actually verified in Chromium, headless)

Verified **in-browser** with automated end-to-end runs:
1. ✅ Add a book with Bangla title + author (form, chips, autocomplete).
2. ✅ Add an English book.
3. ✅ Save a book with both Bangla and English titles.
4. ✅ Search using Bangla characters (title and author).
5. ✅ Search using an English alias for a Bangla book.
6. ✅ Filter by language, genre, format availability, PDF status, reading
   status, ownership, priority, rating, date added, shelf, collection.
7. ✅ Record a **PDF-medium reading session** while physical ownership and
   copy data remain intact.
8. ✅ Complete a book; both session records keep their dates/notes/ratings.
9. ✅ Reread → a **second** session is created; earlier history untouched.
10. ✅ Attach a PDF (real Blob in IndexedDB); Open/Download buttons work and
    the attachment **survives a page reload**.
11. ✅ Export CSV → re-import the same file: zero corruptions (Bangla text,
    digits, status words survive); changed titles import as new books.
12. ✅ JSON backup → delete books → **merge** restore restores them;
    **full replace** requires typed confirmation and downloads a safety
    backup of current data **before** wiping; post-restore reconciliation
    marks missing files "known, not linked".
13. ✅ Duplicate detection: by ISBN, by normalized title (also within one
    import file), with "save anyway" for different editions.
14. ✅ Dashboard counts match the underlying records (verified against seeded
    numbers: titles/copies/PDF/attached/completed/reading/queue/paused).
15. ✅ Empty database shows a welcoming empty state and **no fabricated
    statistics**.
16. ✅ Persistence across normal page reloads.
17. ✅ Works offline after first load (service worker; tested with the
    browser set offline and reloaded).
18. ✅ Responsive layouts at 1280 px and 390 px (drawer nav, 2-col KPIs).
19. ✅ Deleting a book removes only its own sessions/attachments (journal
    kept unless opted in); unrelated records verified intact.
20. ✅ App boots and navigates under a **repository subpath**
    (`/amar-pathagar/`) with all relative assets and SW scope correct.

Additionally verified: CSV parse/serialize/normalization unit tests (36
assertions in Node), dark/light/auto themes, interface-language switching
(en/mixed/bn) without touching stored titles, journal focus mode + Esc +
draft autosave, queue manual reorder (drag + buttons), bulk status/tag/
collection/archive/delete, table column visibility, cover upload preview,
lending flow, backup reminder banner.

Not yet automated: real mobile-device hardware testing; PDF rendering inside
the browser viewer (the app hands files to the browser's viewer).
