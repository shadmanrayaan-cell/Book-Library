/* আমার পাঠাগার — seed.js
   Suggested genre taxonomy (Bangla + English), default settings,
   and an optional clearly-labeled sample library. */

export const SEED_GENRES = [
  { id: 'gn_uponnash',   nameBn: 'উপন্যাস',            nameEn: 'Novel' },
  { id: 'gn_chhotogolpo',nameBn: 'ছোটগল্প',            nameEn: 'Short Stories' },
  { id: 'gn_kobita',     nameBn: 'কবিতা',              nameEn: 'Poetry' },
  { id: 'gn_probandho',  nameBn: 'প্রবন্ধ',             nameEn: 'Essays' },
  { id: 'gn_natok',      nameBn: 'নাটক',               nameEn: 'Drama' },
  { id: 'gn_attojiboni', nameBn: 'আত্মজীবনী',          nameEn: 'Autobiography' },
  { id: 'gn_jiboni',     nameBn: 'জীবনী',              nameEn: 'Biography' },
  { id: 'gn_smritikotha',nameBn: 'স্মৃতিকথা',          nameEn: 'Memoir' },
  { id: 'gn_bhromon',    nameBn: 'ভ্রমণকাহিনি',        nameEn: 'Travel Writing' },
  { id: 'gn_itihash',    nameBn: 'ইতিহাস',             nameEn: 'History' },
  { id: 'gn_muktijuddho',nameBn: 'মুক্তিযুদ্ধ',        nameEn: 'Liberation War' },
  { id: 'gn_dorshon',    nameBn: 'দর্শন',              nameEn: 'Philosophy' },
  { id: 'gn_dhormo',     nameBn: 'ধর্ম',               nameEn: 'Religion' },
  { id: 'gn_biggan',     nameBn: 'বিজ্ঞান',            nameEn: 'Science' },
  { id: 'gn_projukti',   nameBn: 'প্রযুক্তি',           nameEn: 'Technology' },
  { id: 'gn_monobiggan', nameBn: 'মনোবিজ্ঞান',         nameEn: 'Psychology' },
  { id: 'gn_orthoneeti', nameBn: 'অর্থনীতি',           nameEn: 'Economics' },
  { id: 'gn_rajniti',    nameBn: 'রাজনীতি',            nameEn: 'Politics' },
  { id: 'gn_shomaj',     nameBn: 'সমাজবিজ্ঞান',        nameEn: 'Sociology' },
  { id: 'gn_shishu',     nameBn: 'শিশু-কিশোর সাহিত্য', nameEn: 'Children & YA' },
  { id: 'gn_onubad',     nameBn: 'অনুবাদ সাহিত্য',     nameEn: 'Translated Literature' },
  { id: 'gn_shikkha',    nameBn: 'শিক্ষামূলক বই',      nameEn: 'Educational' },
  { id: 'gn_reference',  nameBn: 'Reference / গবেষণা', nameEn: 'Reference' },
];

export const GENRE_ID_BY_BN = new Map(SEED_GENRES.map(g => [g.nameBn, g.id]));
export const GENRE_ID_BY_EN = new Map(SEED_GENRES.map(g => [g.nameEn.toLowerCase(), g.id]));

export const DEFAULT_SETTINGS = {
  uiLang: 'bn',
  theme: 'light',
  defaultLanguage: 'bn',
  defaultStatus: 'to-read',
  defaultView: 'grid',
  defaultSort: 'newest',
  fontBody: 'sans',
  searchNotes: false,
  fuzzy: true,
  goals: { year: 0, month: 0, daysPerWeek: 0, pagesYear: 0 },
  backupReminderDays: 30,
  lastBackupAt: null,
};

export const SAMPLE_COLLECTIONS = [];

/* ---------- sample library (clearly labeled, one-click removable) ----------
   Uses real classic works with approximate public metadata for demonstration. */
export function buildSampleLibrary() {
  const now = Date.now();
  const iso = (d) => new Date(now - d * 86400000).toISOString();
  const dt = (d) => iso(d).slice(0, 10);
  const mk = (p) => ({ tags: ['নমুনা'], isArchived: false, subjects: [], targetAudience: '', ...p });

  const authors = [
    { id: 'au_rabindranath', nameBn: 'রবীন্দ্রনাথ ঠাকুর', nameEn: 'Rabindranath Tagore', aliases: ['R. Tagore', 'রবি ঠাকুর'], biography: '১৮৬১–১৯৪১। বাংলা সাহিত্যের বিশ্বমানব; ১৯১৩ সালে সাহিত্যে নোবেল পুরস্কার লাভ করেন।', birthYear: 1861, deathYear: 1941, notes: '' },
    { id: 'au_nazrul', nameBn: 'কাজী নজরুল ইসলাম', nameEn: 'Kazi Nazrul Islam', aliases: ['বিদ্রোহী কবি'], biography: '১৮৯৯–১৯৭৬। বিদ্রোহী কবি, বাংলাদেশের জাতীয় কবি।', birthYear: 1899, deathYear: 1976, notes: '' },
    { id: 'au_bibhutibhushan', nameBn: 'বিভূতিভূষণ বন্দ্যোপাধ্যায়', nameEn: 'Bibhutibhushan Bandyopadhyay', aliases: [], biography: '১৮৯৪–১৯৫০। “পথের পাঁচালী” ও “অরণ্যক”-এর স্রষ্টা।', birthYear: 1894, deathYear: 1950, notes: '' },
    { id: 'au_jafar', nameBn: 'মুহম্মদ জাফর ইকবাল', nameEn: 'Muhammed Zafar Iqbal', aliases: ['জাফর ইকবাল'], biography: 'বিজ্ঞান-কল্পকাহিনি ও শিশুসাহিত্যের জনপ্রিয় লেখক।', birthYear: 1952, deathYear: null, notes: '' },
    { id: 'au_waliullah', nameBn: 'সৈয়দ ওয়ালীউল্লাহ', nameEn: 'Syed Waliullah', aliases: [], biography: '১৯২২–১৯৭১। “লালসালু” ও “চাঁদের অমাবস্যা”-এর লেখক।', birthYear: 1922, deathYear: 1971, notes: '' },
    { id: 'au_roy', nameBn: 'অরুন্ধতী রায়', nameEn: 'Arundhati Roy', aliases: [], biography: 'The God of Small Things (১৯৯৭)-এর জন্য বুকার পুরস্কার বিজয়ী।', birthYear: 1961, deathYear: null, notes: '' },
  ];
  const pubs = [
    { id: 'pb_prothoma', nameBn: 'প্রথমা প্রকাশন', nameEn: 'Prothoma Prokashon', aliases: [], notes: '', country: 'বাংলাদেশ' },
    { id: 'pb_biswabidyalay', nameBn: 'বিশ্ববিদ্যালয় গ্রন্থাগার', nameEn: 'Biswabidyalay Granthagar', aliases: [], notes: '', country: 'বাংলাদেশ' },
    { id: 'pb_penguin', nameBn: 'পেঙ্গুইন বুকস', nameEn: 'Penguin Books', aliases: [], notes: '', country: 'India' },
  ];

  const books = [
    mk({
      id: 'bk_s_git', titleBn: 'গীতাঞ্জলি', titleEn: 'Gitanjali', transliteratedTitle: 'Gitanjali',
      language: 'bn', authors: ['au_rabindranath'], publishers: ['pb_biswabidyalay'],
      publicationYear: 1910, pageCount: 128, primaryGenre: 'gn_kobita', genres: ['gn_kobita'],
      ownershipStatus: 'owned', physicalCopyCount: 1, physicalCondition: 'good', shelfLocation: 'রবীন্দ্রনাথ তাক',
      readingStatus: 'completed', priority: 'medium', rating: 5, wouldRecommend: true, rereadStatus: 'want',
      personalReview: 'সরল ভাষায় গভীর আধ্যাত্মিকতা — বারবার ফিরে পড়ার মতো।',
      keyTakeaways: 'নম্রতাই শক্তি; দৈনন্দিন জীবনেই কাব্য লুকিয়ে আছে।',
      createdAt: iso(120), updatedAt: iso(20),
    }),
    mk({
      id: 'bk_s_agunbinа', titleBn: 'অগ্নিবীণা', titleEn: 'Agni Bina', transliteratedTitle: 'Agnibina',
      language: 'bn', authors: ['au_nazrul'], publishers: ['pb_biswabidyalay'],
      publicationYear: 1922, pageCount: 96, primaryGenre: 'gn_kobita', genres: ['gn_kobita'],
      ownershipStatus: 'owned', physicalCopyCount: 1, physicalCondition: 'fair',
      readingStatus: 'reading', priority: 'high',
      createdAt: iso(40), updatedAt: iso(2),
    }),
    mk({
      id: 'bk_s_pother', titleBn: 'পথের পাঁচালী', titleEn: 'Pather Panchali', transliteratedTitle: 'Pather Panchali',
      language: 'bn', authors: ['au_bibhutibhushan'], publishers: ['pb_prothoma'],
      publicationYear: 1929, pageCount: 624, primaryGenre: 'gn_uponnash', genres: ['gn_uponnash'],
      ownershipStatus: 'owned', physicalCopyCount: 1, physicalCondition: 'good', shelfLocation: 'উপন্যাস তাক-১',
      readingStatus: 'completed', priority: 'low', rating: 4.5, wouldRecommend: true, rereadStatus: 'have',
      personalReview: 'অপু-দুর্গার জগৎটা নিজের শৈশবের মনে করিয়ে দেয়। গতি ধীর, কিন্তু স্রোত গভীর।',
      createdAt: iso(200), updatedAt: iso(60),
    }),
    mk({
      id: 'bk_s_lalsalu', titleBn: 'লালসালু', titleEn: 'Lalsalu', transliteratedTitle: 'Lal Salu',
      language: 'bn', authors: ['au_waliullah'], publishers: ['pb_prothoma'],
      publicationYear: 1948, pageCount: 224, primaryGenre: 'gn_uponnash', genres: ['gn_uponnash'],
      ownershipStatus: 'owned', physicalCopyCount: 1,
      readingStatus: 'to-read', priority: 'high', plannedReadingDate: dt(7),
      reasonForReading: 'গ্রামবাংলার সমাজ-বাস্তবতা বোঝার জন্য',
      createdAt: iso(30), updatedAt: iso(30),
    }),
    mk({
      id: 'bk_s_ontoringo', titleBn: 'অন্তরঙ্গ ও বহিরঙ্গ', titleEn: '',
      language: 'bn', authors: ['au_jafar'], publishers: ['pb_prothoma'],
      publicationYear: 2015, pageCount: 216, primaryGenre: 'gn_probandho', genres: ['gn_probandho'],
      ownershipStatus: 'wishlist',
      readingStatus: 'to-read', priority: 'medium',
      createdAt: iso(15), updatedAt: iso(15),
    }),
    mk({
      id: 'bk_s_godsmall', titleBn: 'ছোট জিনিসের ঈশ্বর', titleEn: 'The God of Small Things',
      language: 'bn', originalLanguage: 'English', authors: ['au_roy'], translators: [],
      publishers: ['pb_penguin'], publicationYear: 1997, pageCount: 340,
      primaryGenre: 'gn_onubad', genres: ['gn_onubad', 'gn_uponnash'],
      ownershipStatus: 'owned', physicalCopyCount: 0,
      readingStatus: 'reading', priority: 'medium',
      formats: [{ formatId: 'fm_s1', type: 'pdf', availabilityStatus: 'attached', fileName: 'god-of-small-things.pdf', languageOfEdition: 'English', notes: '' }],
      createdAt: iso(90), updatedAt: iso(1),
    }),
  ];

  const sessions = [
    { sessionId: 'ss_s1', bookId: 'bk_s_git', startDate: dt(130), endDate: dt(125), medium: 'physical', startingPage: 1, endingPage: 128, currentPage: 128, completionStatus: 'completed', sessionNotes: 'প্রথমবার পড়া।', rating: 5, createdAt: iso(130), updatedAt: iso(125) },
    { sessionId: 'ss_s2', bookId: 'bk_s_pother', startDate: dt(100), endDate: dt(60), medium: 'physical', startingPage: 1, endingPage: 624, currentPage: 624, completionStatus: 'completed', sessionNotes: '', rating: 4.5, createdAt: iso(100), updatedAt: iso(60) },
    { sessionId: 'ss_s3', bookId: 'bk_s_pother', startDate: dt(20), endDate: null, medium: 'pdf', startingPage: 1, currentPage: 210, completionStatus: 'active', sessionNotes: 'দ্বিতীয়বার — এবার পিডিএফ সংস্করণে।', createdAt: iso(20), updatedAt: iso(1) },
    { sessionId: 'ss_s4', bookId: 'bk_s_agunbinа', startDate: dt(4), endDate: null, medium: 'physical', startingPage: 1, currentPage: 40, completionStatus: 'active', sessionNotes: '', createdAt: iso(4), updatedAt: iso(2) },
  ];

  const journal = [
    { id: 'jr_s1', bookId: 'bk_s_git', type: 'quote', title: '', body: 'যদি তোর ডাক শুনে কেউ না আসে তবে একলা চলো রে।', chapter: 'একলা চলো', date: dt(124), createdAt: iso(124), updatedAt: iso(124) },
    { id: 'jr_s2', bookId: 'bk_s_pother', type: 'reflection', title: 'অপুর জগৎ', body: 'শৈশবের মৃত্যু-সচেতনতা নিয়ে বিভূতিভূষণ যেভাবে লিখেছেন, তা কোনো সাহিত্যে কমই দেখা যায়। দুর্গার মৃত্যুর পর অপুর নীরবতাটাই উপন্যাসের সবচেয়ে বড় অধ্যায়।', date: dt(59), createdAt: iso(59), updatedAt: iso(59) },
  ];

  return { authors, publishers: pubs, books, sessions, journal };
}
