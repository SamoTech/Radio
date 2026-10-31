'use strict';

/* Radio Atlas frontend — vanilla JS, no deps */

var RB_APIS = [
  'https://de1.api.radio-browser.info/json',
  'https://de2.api.radio-browser.info/json',
  'https://nl1.api.radio-browser.info/json'
];
var FM_PAGE = 120;
var LANGUAGE_ALIASES = {
  arabic:['arabic','ar','العربية','عربي','arab'], english:['english','en','انجليزي','إنجليزي','الانجليزية','الإنجليزية'],
  french:['french','fr','فرنسي','فرنسية'], spanish:['spanish','es','español','اسباني','إسباني'],
  german:['german','de','deutsch','الماني','ألماني'], portuguese:['portuguese','pt','português','برتغالي'],
  russian:['russian','ru','русский','روسي'], turkish:['turkish','tr','türkçe','تركي'],
  persian:['persian','farsi','fa','فارسي','فارسی'], urdu:['urdu','ur','اردو'], hindi:['hindi','hi','हिन्दी','هندي'],
  chinese:['chinese','zh','中文','صيني'], japanese:['japanese','ja','日本語','ياباني'], korean:['korean','ko','한국어','كوري'],
  italian:['italian','it','italiano','ايطالي','إيطالي'], dutch:['dutch','nl','nederlands','هولندي'],
  polish:['polish','pl','polski','بولندي'], greek:['greek','el','ελληνικά','يوناني'], swahili:['swahili','sw','kiswahili'],
  indonesian:['indonesian','id','bahasa indonesia'], malay:['malay','ms','bahasa melayu'], bengali:['bengali','bn','বাংলা'],
  kurdish:['kurdish','ku','كردي'], ukrainian:['ukrainian','uk','українська'], romanian:['romanian','ro','română'],
  swedish:['swedish','sv','svenska'], norwegian:['norwegian','no','norsk'], finnish:['finnish','fi','suomi'],
  danish:['danish','da','dansk'], czech:['czech','cs','čeština'], hungarian:['hungarian','hu','magyar'],
  serbian:['serbian','sr','српски'], croatian:['croatian','hr','hrvatski'], bulgarian:['bulgarian','bg','български'],
  thai:['thai','th','ไทย'], vietnamese:['vietnamese','vi','tiếng việt']
};
var CORE_CATEGORIES = [
  ['news',['news','اخبار','أخبار']],['music',['music','موسيقى','musique']],['talk',['talk','speech','spoken','حوار']],
  ['sports',['sport','sports','football','كرة','رياضة']],['quran',['quran','quraan','koran','قرآن']],
  ['religion',['religion','religious','islam','islamic','دين']],['classical',['classical','كلاسيك']],
  ['pop',['pop','بوب']],['rock',['rock','روك']],['jazz',['jazz','جاز']],['culture',['culture','ثقافة']],
  ['education',['education','educational','تعليم']],['business',['business','finance','اقتصاد']],
  ['weather',['weather','طقس']],['children',['children','kids','أطفال']],['oldies',['oldies','retro','قديم']],
  ['dance',['dance','electronic','دانس']],['folk',['folk','traditional','تراث','شعبي']],
  ['world',['world','international','عالمي']],['traffic',['traffic','ترافيك','مرور']]
];
var CATEGORY_LABELS = {
  ar:{news:'أخبار',music:'موسيقى',talk:'حوارات',sports:'رياضة',quran:'قرآن',religion:'ديني',classical:'كلاسيكي',pop:'بوب',rock:'روك',jazz:'جاز',culture:'ثقافة',education:'تعليم',business:'اقتصاد',weather:'طقس',children:'أطفال',oldies:'أغاني قديمة',dance:'رقص وإلكتروني',folk:'تراث وشعبي',world:'عالمي',traffic:'مرور'},
  en:{news:'News',music:'Music',talk:'Talk',sports:'Sports',quran:'Quran',religion:'Religion',classical:'Classical',pop:'Pop',rock:'Rock',jazz:'Jazz',culture:'Culture',education:'Education',business:'Business',weather:'Weather',children:'Children',oldies:'Oldies',dance:'Dance / Electronic',folk:'Folk',world:'World',traffic:'Traffic'}
};
var FACET_OPTIONS = {country:[],language:[],tag:[]};
var fmSearchSequence = 0;
var fmSearchDebounceTimer = null;

function cancelFMClientRender() {
  if (fmSearchDebounceTimer !== null) {
    clearTimeout(fmSearchDebounceTimer);
    fmSearchDebounceTimer = null;
  }
}

function scheduleFMClientRender() {
  cancelFMClientRender();
  fmSearchDebounceTimer = setTimeout(function () {
    fmSearchDebounceTimer = null;
    fmClientRender();
  }, 160);
}
function canonicalLanguage(value) {
  var raw=String(value||'').trim().toLowerCase();
  if(!raw)return '';
  for(var key in LANGUAGE_ALIASES) if(LANGUAGE_ALIASES[key].indexOf(raw)!==-1)return key;
  return raw.replace(/\s+/g,' ');
}
function normalizeSearchText(value) {
  var text=String(value||'').toLocaleLowerCase();
  try { text=text.normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e) {}
  return text.replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').trim();
}

function normalizeLanguages(value) {
  var seen={};
  return String(value||'').split(/[,;|]/).map(canonicalLanguage).filter(function(v){
    if(!v||seen[v])return false;seen[v]=true;return true;
  }).join(', ');
}
function normalizeCategories(value) {
  var raw=String(value||'').split(/[,;|]/).map(function(x){return x.trim().toLowerCase();});
  return CORE_CATEGORIES.filter(function(entry){
    return raw.some(function(tag){return entry[1].indexOf(tag)!==-1;});
  }).map(function(entry){return entry[0];}).join(', ');
}
function isOfficialStation(s) {
  return s.official===true || /(^|[,;])\s*(official|رسمي)\s*([,;]|$)/i.test(String(s.tags||''));
}
var CHIP_TAGS = {
  news: ['news', 'كل الأخبار', 'أخبار'],
  quran: ['quran', 'quraan', 'koran', 'islam', 'islamic', 'religion', 'religious', 'قرآن', 'دين'],
  sports: ['sport', 'sports', 'football', 'كرة', 'رياضة'],
  music: ['music', 'موسيقى']
};

var STR = {
  ar: {
    locale: 'ar-EG', dateLocale: 'ar', dir: 'rtl',
    doc_title: 'راديو أطلس — دليل الاستقبال العالمي',
    app_title: '📻 راديو أطلس',
    tagline: 'دليل بحث ذكي لأجهزة الاستقبال ومحطات البث المتاحة أونلاين',
    stat_total: 'جهاز استقبال', stat_online: 'أونلاين الآن', stat_listeners: 'مستمع حاليًا', stat_updated: 'آخر تحديث',
    tab_fm: '📻 محطات البث', tab_ma: '🇲🇦 المغرب', tab_sdr: 'أجهزة الاستقبال SDR',
    search_fm_ph: 'ابحث بالاسم أو الدولة أو اللغة أو الفئة…', fm_search_aria:'البحث عن محطات الراديو', fm_search_input_aria:'ابحث باسم المحطة أو الدولة أو اللغة أو الفئة', search_country_aria:'ابحث عن دولة', select_country_aria:'اختر الدولة', search_language_aria:'ابحث عن لغة', select_language_aria:'اختر اللغة', search_category_aria:'ابحث عن فئة', select_category_aria:'اختر الفئة', filter_country:'الدولة', filter_language:'اللغة', filter_category:'الفئة', fm_search_note:'البحث الفوري داخل الكتالوج المحمّل؛ «بحث مباشر» يجلب نتائج أحدث من المصدر.', search_country_ph:'ابحث عن دولة…', search_language_ph:'ابحث عن لغة…', search_tag_ph:'ابحث عن فئة…',
    all_countries: '🌍 كل الدول', all_languages: '🗣 كل اللغات', all_tags: '🏷 كل الفئات',
    live_search: 'بحث مباشر', clear_filters: 'مسح الفلاتر',
    fm_hint: 'الكتالوج الكامل لكل محطات Radio-Browser المتاحة مخزن في التطبيق — البحث والتصنيف فوري. زر «بحث مباشر» يستعلم لحظيًا من المصدر.',
    chip_all: '✨ الكل', chip_fav: '⭐ المفضلة', chip_arabic: '🎙 عربي', chip_news: '📰 أخبار', chip_quran: '🕌 قرآن', chip_sports: '⚽ رياضة', chip_music: '🎵 موسيقى',
    search_sdr_ph: 'ابحث: اسم، بلد، نداء…',
    all_bands: 'كل النطاقات', sort_snr: 'الأفضل SNR', sort_free: 'أكبر مساحة فاضية', sort_users: 'الأقل ازدحامًا', sort_name: 'الاسم',
    online_only: 'أونلاين فقط', free_only: 'فيه مكان فاضي', snr_min: 'SNR ≥',
    sdr_hint: '🎧 الاستماع داخل التطبيق متاح لأجهزة HTTPS فقط (قيود أمان المتصفح) — الأجهزة التي على HTTP تفتح في نافذة جديدة.',
    no_band: 'غير محدد', no_data: 'لا توجد بيانات بعد.',
    no_match: 'مفيش نتائج مطابقة — جرب تخفف الفلاتر.',
    no_match_fm: 'مفيش محطات مطابقة — جرب فلتر أخف أو كلمة تانية.',
    searching_live: 'جاري البحث المباشر من المصدر…',
    live_failed: 'البحث المباشر فشل — استخدم الفلترة المحلية الفورية.',
    more_btn: 'عرض المزيد — باقي {n} محطة', results: '{n} نتيجة', stations: '{n} محطة',
    listen: '▶ استمع', listen_in_app: '🎧 استمع داخل التطبيق', open_ext: 'افتح الجهاز ↗', open_ext2: 'فتح خارجي ↗', close: '✕ إغلاق',
    wspr_title: 'نشاط الانتشار الفعلي — WSPR (آخر ساعتين)', wspr_hint: 'عدد إشارات WSPR المستلمة في كل نطاق مقياس مباشر لانفتاح النطاق — وأطول المسارات أوضح دليل على المسارات المفتوحة الآن.', websdr_title: 'أجهزة WebSDR', owrx_title: 'أجهزة OpenWebRX',
    resume: 'آخر محطة — دوس تشغيل للاستكمال',
    space_title: 'حالة النطاقات (بيانات NOAA SWPC)', updated_at: 'آخر تحديث',
    cond_good: 'الظروف مستقرة — النطاقات العليا (14–28 MHz) غالبًا مفتوحة.',
    cond_unstable: 'اضطراب متوسط — استقبل النطاقات المنخفضة (3–10 MHz).',
    cond_storm: 'عاصفة مغناطيسية — النطاقات العليا مغلقة والمسارات القطبية مشوشة.',
    alert_aria: 'تنبيهات حالة النطاقات', alert_unsupported: 'المتصفح ده مش بيدعم الإشعارات',
    alert_on: '🔔 التنبيهات شغالة — هنبلغك لما ظروف الاستقبال تتغير', alert_off: '🔕 التنبيهات مقفولة',
    alert_open_title: 'النطاقات العالية اتفتحت 🔥', alert_open_body: 'Kp {kp} — ظروف ممتازة للنطاقات العالية (14–28 MHz). فرصتك تسدّق دلوقتي!',
    alert_storm_title: 'عاصفة مغناطيسية ⛈', alert_storm_body: 'Kp {kp} — النطاقات العليا اتقفلت؛ استقبل النطاقات المنخفضة (3–10 MHz).',
    alert_toast_open: 'النطاقات اتفتحت (Kp {kp}) — ظروف ممتازة للنطاقات العالية 🔥', alert_toast_storm: 'عاصفة مغناطيسية (Kp {kp}) — النطاقات العليا مقفولة ⛈',
    eibi_title: 'بث موجات قصيرة على الهواء الآن',
    eibi_hint: 'من جدول EIBI — ترددات تُبث الآن (UTC). قرّب التردد على أي جهاز استقبال بالأسفل لسماعه.',
    eibi_ph: 'ابحث في البث الحالي: اسم، تردد…', onair: 'بث على الهواء',
    more_eibi: 'تُعرض أول 60 نتيجة — دقّق البحث لعرض المزيد.',
    visitors: 'إجمالي الزيارات', you_from: 'أنت تزور من',
    stream_ok: 'استجاب للبث في فحص التحديث الأخير', stream_dead: 'لم يستجب في فحص التحديث الأخير — ممكن يشتغل من متصفحك', chip_alive: '✔ شغال', chip_dead: '✖ لا يستجيب',
    kiwi_audio: '🎧 صوت مباشر (تجريبي)', kiwi_connecting: 'جاري الاتصال بالجهاز…', kiwi_live: 'يستقبل ✔', kiwi_failed: 'تعذر الصوت المباشر — فتحت واجهة الجهاز بدلاً منه', kiwi_freq: 'التردد (kHz)', kiwi_mode: 'الوضع', ma_hint: 'الإذاعات الرسمية المغربية من SNRT — ٤ وطنية و١١ جهوية، بتشتغل مباشرة من الموقع عبر روابط HLS موقّعة تلقائيًا.', ma_national: 'الإذاعات الوطنية', ma_regional: 'الإذاعات الجهوية', ma_source: 'SNRT Live ↗',
    toast_broken: 'تعذر تشغيل البث من الروابط المتاحة. جرّب الموقع الرسمي.', toast_tap_play:'اضغط تشغيل من مشغل الصوت لبدء البث.', open_official_site:'الموقع الرسمي ↗', fav_on: 'أضفتها للمفضلة ⭐', fav_off: 'شيلتها من المفضلة',
    share_aria: 'مشاركة رابط المحطة', share_copied: 'رابط المحطة اتنسخ ✔ — شاركه في أي مكان',
    random_aria: 'تشغيل محطة عشوائية من نتائج البحث الحالية', random_station: '🎲 محطة عشوائية', random_none: 'مفيش محطات https قابلة للتشغيل في النتائج الحالية — خفّف الفلاتر.', random_toast: '🎲 محطة عشوائية: {name}', report_aria: 'بلّغ عن محطة مش شغالة', report_title: 'محطة مش شغالة: {name}', report_body: 'رابط البث:\n{url}\n\nالمشكلة (وصف موجز):\n', report_toast: 'فتحنا صفحة البلاغ على GitHub — كمّل الوصف وابعت 🙏',
    sources: 'المصادر:', offline_footer: 'تُحدَّث الإذاعات يوميًا وبيانات SDR كل ٦ ساعات.'
  },
  en: {
    locale: 'en-US', dateLocale: 'en', dir: 'ltr',
    doc_title: 'Radio Atlas — Global Reception Directory',
    app_title: '📻 Radio Atlas',
    tagline: 'Smart search directory for online receivers and broadcast stations',
    stat_total: 'Receivers', stat_online: 'Online now', stat_listeners: 'Current listeners', stat_updated: 'Updated',
    tab_fm: '📻 Broadcast stations', tab_ma: '🇲🇦 Morocco', tab_sdr: 'SDR Receivers',
    search_fm_ph: 'Search by station, country, language, or category…', fm_search_aria:'Search radio stations', fm_search_input_aria:'Search by station, country, language, or category', search_country_aria:'Search countries', select_country_aria:'Select a country', search_language_aria:'Search languages', select_language_aria:'Select a language', search_category_aria:'Search categories', select_category_aria:'Select a category', filter_country:'Country', filter_language:'Language', filter_category:'Category', fm_search_note:'Instant search uses the loaded catalog; Live Search fetches fresher results from the source.', search_country_ph:'Search countries…', search_language_ph:'Search languages…', search_tag_ph:'Search categories…',
    all_countries: '🌍 All countries', all_languages: '🗣 All languages', all_tags: '🏷 All genres',
    live_search: 'Live search', clear_filters: 'Clear filters',
    fm_hint: 'The full Radio-Browser catalog is stored in the app — search and filtering are instant. Live search queries the source in real time.',
    chip_all: '✨ All', chip_fav: '⭐ Favorites', chip_arabic: '🎙 Arabic', chip_news: '📰 News', chip_quran: '🕌 Quran', chip_sports: '⚽ Sports', chip_music: '🎵 Music',
    search_sdr_ph: 'Search: name, country, callsign…',
    all_bands: 'All bands', sort_snr: 'Best SNR', sort_free: 'Most free slots', sort_users: 'Least crowded', sort_name: 'Name',
    online_only: 'Online only', free_only: 'Has a free slot', snr_min: 'SNR ≥',
    sdr_hint: '🎧 In-app listening works for HTTPS receivers only (browser security) — HTTP receivers open in a new window.',
    no_band: 'Unspecified', no_data: 'No data yet.',
    no_match: 'No matching results — try lighter filters.',
    no_match_fm: 'No matching stations — try a lighter filter or another keyword.',
    searching_live: 'Live search in progress…',
    live_failed: 'Live search failed — use the instant local filtering.',
    more_btn: 'Show more — {n} stations left', results: '{n} results', stations: '{n} stations',
    listen: '▶ Listen', listen_in_app: '🎧 Listen in app', open_ext: 'Open receiver ↗', open_ext2: 'Open externally ↗', close: '✕ Close',
    wspr_title: 'Observed propagation — WSPR (last 2 hours)', wspr_hint: 'WSPR spots received per band directly measure how open each band is — the longest heard paths show the clearest open routes right now.', websdr_title: 'WebSDR receivers', owrx_title: 'OpenWebRX receivers',
    resume: 'Last station — press play to resume',
    space_title: 'Band conditions (NOAA SWPC data)', updated_at: 'Updated',
    cond_good: 'Conditions are stable — high bands (14–28 MHz) are likely open.',
    cond_unstable: 'Moderate disturbance — favor lower bands (3–10 MHz).',
    cond_storm: 'Geomagnetic storm — high bands closed, polar paths disturbed.',
    alert_aria: 'Band condition alerts', alert_unsupported: 'This browser does not support notifications',
    alert_on: '🔔 Alerts on — you will be notified when conditions change', alert_off: '🔕 Alerts off',
    alert_open_title: 'High bands are open 🔥', alert_open_body: 'Kp {kp} — great conditions for high bands (14–28 MHz). Tune in now!',
    alert_storm_title: 'Geomagnetic storm ⛈', alert_storm_body: 'Kp {kp} — high bands are closed; favor lower bands (3–10 MHz).',
    alert_toast_open: 'Bands opened (Kp {kp}) — great high-band conditions 🔥', alert_toast_storm: 'Geomagnetic storm (Kp {kp}) — high bands closed ⛈',
    eibi_title: 'Shortwave broadcasts on air now',
    eibi_hint: 'From the EIBI schedule — frequencies broadcasting now (UTC). Tune one on any receiver below to listen.',
    eibi_ph: 'Search the current broadcast: name, frequency…', onair: 'on air',
    more_eibi: 'Showing the first 60 — refine your search to see more.',
    visitors: 'Total page views', you_from: 'You are visiting from',
    stream_ok: 'Responded in the latest refresh probe', stream_dead: 'Did not respond in the latest refresh probe — may still play in your browser', chip_alive: '✔ live', chip_dead: '✖ no reply',
    kiwi_audio: '🎧 Direct audio (beta)', kiwi_connecting: 'Connecting to the receiver…', kiwi_live: 'Receiving ✔', kiwi_failed: 'Direct audio failed — opening the receiver web UI instead', kiwi_freq: 'Frequency (kHz)', kiwi_mode: 'Mode', ma_hint: 'Official Moroccan radio from SNRT — 4 national and 11 regional stations, playing in-app via automatically signed HLS links.', ma_national: 'National radio', ma_regional: 'Regional radio', ma_source: 'SNRT Live ↗',
    toast_broken: 'The stream could not be played from available sources. Try the official website.', toast_tap_play:'Press Play in the audio controls to start the stream.', open_official_site:'Official website ↗', fav_on: 'Added to favorites ⭐', fav_off: 'Removed from favorites',
    share_aria: 'Share station link', share_copied: 'Station link copied ✔ — share it anywhere',
    random_aria: 'Play a random station from the current results', random_station: '🎲 Random station', random_none: 'No HTTPS-playable stations in the current results — try lighter filters.', random_toast: '🎲 Random station: {name}', report_aria: 'Report a broken station', report_title: 'Broken station: {name}', report_body: 'Stream URL:\n{url}\n\nWhat happened (short description):\n', report_toast: 'Opening a GitHub report — finish the description and submit 🙏',
    sources: 'Sources:', offline_footer: 'Stations refresh daily; SDR data refreshes every 6 hours.'
  }
};

var state = {
  lang: 'ar',
  theme: 'dark',
  favs: {},
  receivers: [],
  updated: null,
  filters: { q: '', band: 'all', sort: 'snr', onlineOnly: true, freeOnly: false, minSnr: 0 },
  fm: [],
  fmFilters: { q: '', country: '', language: '', tag: '', chip: '' },
  fmLimit: FM_PAGE,
  fmLive: false,
  fmLiveRows: [],
  eibi: [],
  eibiQ: '',
  streamChecks: {},
  space: null,
  wspr: null,
  webSdrs: null,
  currentName: '',
  playbackStation: null,
  playbackSources: [],
  playbackIndex: 0,
  playbackGeneration: 0,
  playbackAttemptFailed: false
};

function $(id) { return document.getElementById(id); }

function t(key) {
  var d = STR[state.lang] || STR.ar;
  if (d[key] != null) return d[key];
  if (STR.ar[key] != null) return STR.ar[key];
  return key;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fetchJSON(url) {
  return fetch(url, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function safeHttpUrl(value) {
  try {
    var u = new URL(String(value || '').trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return '';
    return u.toString();
  } catch (e) { return ''; }
}

function safeHttpsUrl(value) {
  var url = safeHttpUrl(value);
  return url && /^https:/i.test(url) ? url : '';
}

function fmtNum(n) {
  try { return Number(n).toLocaleString(STR[state.lang].locale); } catch (e) { return String(n); }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(STR[state.lang].dateLocale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch (e) { return String(iso); }
}

/* ================= i18n / theme ================= */

function applyI18n() {
  var els = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute('data-i18n'));
  var phs = document.querySelectorAll('[data-i18n-ph]');
  for (var j = 0; j < phs.length; j++) phs[j].placeholder = t(phs[j].getAttribute('data-i18n-ph'));
  var ariaEls = document.querySelectorAll('[data-i18n-aria]');
  for (var k = 0; k < ariaEls.length; k++) ariaEls[k].setAttribute('aria-label', t(ariaEls[k].getAttribute('data-i18n-aria')));
  $('lang-btn').textContent = state.lang === 'ar' ? 'EN' : 'ع';
  document.documentElement.lang = state.lang;
  document.documentElement.dir = STR[state.lang] ? STR[state.lang].dir : 'rtl';
  document.title = t('doc_title');
}

function rebuildDynamic() {
  buildBandFilter();
  renderSDR();
  buildFMFacets();
  renderChips();
  renderFM();
  renderMA();
  renderSpace();
  renderWspr();
  renderWebSdrs();
  if (state.currentName && !$('player').hidden) {
    $('player-name').textContent = '▶ ' + state.currentName;
  }
}

function setLang(l) {
  state.lang = l;
  try { localStorage.setItem('ra-lang', l); } catch (e) {}
  document.documentElement.lang = l;
  document.documentElement.dir = STR[l] ? STR[l].dir : 'rtl';
  applyI18n();
  rebuildDynamic();
}

function setTheme(th) {
  state.theme = th;
  try { localStorage.setItem('ra-theme', th); } catch (e) {}
  document.documentElement.setAttribute('data-theme', th);
  $('theme-btn').textContent = th === 'dark' ? '☀️' : '🌙';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', th === 'dark' ? '#0b1220' : '#f2f5fb');
}

/* ================= toast ================= */

var toastTimer = null;
function toast(msg) {
  var el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

/* ================= favorites ================= */

function loadFavs() {
  try { return JSON.parse(localStorage.getItem('ra-favs') || '{}') || {}; } catch (e) { return {}; }
}

function saveFavs() {
  try { localStorage.setItem('ra-favs', JSON.stringify(state.favs)); } catch (e) {}
}

function stationByUrl(url) {
  for (var i = 0; i < state.fm.length; i++) {
    if (state.fm[i].url === url) return state.fm[i];
  }
  return null;
}

function toggleFav(s) {
  if (state.favs[s.url]) {
    delete state.favs[s.url];
    toast(t('fav_off'));
  } else {
    state.favs[s.url] = { name: s.name, cc: s.cc, language: s.language, tags: s.tags, url: s.url };
    toast(t('fav_on'));
  }
  saveFavs();
  renderFM();
  renderMA();
}

/* ================= KiwiSDR ================= */

function normalizeRx(r) {
  var url = safeHttpUrl(r.url || '');
  return {
    name: r.name || '—',
    url: url,
    https: /^https:/i.test(url),
    online: !!r.online,
    users: Number(r.users) || 0,
    maxUsers: Number(r.max_users) || 0,
    snr: r.snr == null ? null : Number(r.snr),
    gps: !!r.gps,
    band: r.band || '',
    loc: r.loc || '',
    antenna: r.antenna || '',
    extApi: r.ext_api == null ? 0 : (Number(r.ext_api) || 0)
  };
}

function loadKiwi() {
  return fetchJSON('data/kiwisdr.json').then(function (data) {
    if (data && Array.isArray(data.receivers)) {
      state.receivers = data.receivers.map(normalizeRx);
      state.updated = data.updated;
    }
  }).catch(function (e) {
    console.warn('kiwisdr snapshot:', e);
  }).then(function () {
    renderStats();
    buildBandFilter();
    renderSDR();
  });
}

function renderStats() {
  var total = state.receivers.length;
  var online = 0, listeners = 0;
  state.receivers.forEach(function (r) {
    if (r.online) { online++; listeners += r.users; }
  });
  $('stat-total').textContent = fmtNum(total);
  $('stat-online').textContent = fmtNum(online);
  $('stat-listeners').textContent = fmtNum(listeners);
  $('stat-updated').textContent = fmtDate(state.updated);
}

function buildBandFilter() {
  var sel = $('band');
  var bands = {};
  state.receivers.forEach(function (r) {
    var b = r.band || t('no_band');
    bands[b] = (bands[b] || 0) + 1;
  });
  var keys = Object.keys(bands).sort(function (a, b) { return bands[b] - bands[a]; });
  sel.innerHTML = '<option value="all">' + esc(t('all_bands')) + '</option>' + keys.map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(k) + ' (' + bands[k] + ')</option>';
  }).join('');
  sel.value = state.filters.band;
}

function applyFilters() {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var list = state.receivers.filter(function (r) {
    if (f.onlineOnly && !r.online) return false;
    if (f.band !== 'all' && (r.band || t('no_band')) !== f.band) return false;
    if (f.freeOnly && !(r.maxUsers > 0 && r.users < r.maxUsers)) return false;
    if (f.minSnr > 0 && !(r.snr != null && r.snr >= f.minSnr)) return false;
    if (q) {
      var hay = (r.name + ' ' + r.url + ' ' + r.band + ' ' + r.loc + ' ' + r.antenna).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (f.sort === 'name') return a.name.localeCompare(b.name, state.lang);
    if (f.sort === 'free') return (b.maxUsers - b.users) - (a.maxUsers - a.users);
    if (f.sort === 'users') return a.users - b.users;
    var sa = a.snr == null ? -1 : a.snr;
    var sb = b.snr == null ? -1 : b.snr;
    return sb - sa;
  });
  return list;
}

function cardRx(r) {
  var cls = 'card' + (r.online ? '' : ' off');
  var snr = r.snr == null ? '—' : r.snr + ' dB';
  var users = r.users + '/' + (r.maxUsers || '?');
  var chips = '';
  if (r.band) chips += '<span class="chip">' + esc(r.band) + '</span>';
  if (r.loc) chips += '<span class="chip">📍 ' + esc(r.loc) + '</span>';
  if (r.gps) chips += '<span class="chip gps">📡 GPS</span>';
  var action = '';
  if (r.url) {
    action = r.https
      ? '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('listen_in_app')) + '</button>'
      : '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(t('open_ext')) + '</a>';
  }
  if (r.url && r.https && r.extApi > 0) {
    action += '<button class="open kiwi-ws" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '" title="' + esc(t('kiwi_audio')) + '">' + esc(t('kiwi_audio')) + '</button>';
  }
  return '<article class="' + cls + '">' +
    '<div class="card-head"><span class="dot ' + (r.online ? 'on' : 'off') + '"></span>' +
    '<h3>' + esc(r.name) + '</h3></div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    '<div class="meta"><span>👥 ' + users + '</span><span class="snr">📶 SNR ' + snr + '</span></div>' +
    (r.antenna ? '<div class="meta antenna" title="' + esc(r.antenna) + '">🛰 ' + esc(r.antenna) + '</div>' : '') +
    action +
    '</article>';
}

function renderSDR() {
  var grid = $('grid-sdr');
  if (!state.receivers.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    $('count-sdr').textContent = '';
    return;
  }
  var list = applyFilters();
  $('count-sdr').textContent = t('results').replace('{n}', fmtNum(list.length));
  grid.innerHTML = list.length ? list.map(cardRx).join('')
    : '<div class="empty">' + esc(t('no_match')) + '</div>';
}

/* ================= WSPR observed propagation ================= */

var WSPR_BAND_LABELS = { 0: '630/2200m', 0.136: '2200m', 0.474: '630m', 1: '160m', 3: '80m', 5: '60m', 7: '40m', 10: '30m', 14: '20m', 18: '17m', 21: '15m', 24: '12m', 28: '10m', 50: '6m', 70: '4m', 144: '2m', 432: '70cm' };

function wsprBandLabel(b) {
  var key = Number(b);
  return WSPR_BAND_LABELS[key] || (key + ' MHz');
}

function renderWspr() {
  var panel = $('wspr-panel');
  if (!panel || !state.wspr) return;
  panel.hidden = false;
  var bands = state.wspr.bands || [];
  $('wspr-bands').innerHTML = bands.slice(0, 12).map(function (b) {
    return '<span class="chip wspr-band"><b>' + esc(wsprBandLabel(b.band)) + '</b> ' + esc(fmtNum(b.c)) + ' 📶 · ↑ ' + esc(fmtNum(b.max_km)) + ' km</span>';
  }).join('');
  var top = state.wspr.top || [];
  $('wspr-top').innerHTML = top.map(function (s) {
    var path = esc(s.tx) + (s.tx_loc ? ' (' + esc(s.tx_loc) + ')' : '') + ' → ' + esc(s.rx) + (s.rx_loc ? ' (' + esc(s.rx_loc) + ')' : '');
    return '<div class="eibi-row"><span>📡 ' + path + '</span><span class="snr">' + esc(fmtNum(s.km)) + ' km · ' + esc(wsprBandLabel(s.band)) + '</span></div>';
  }).join('');
  if (state.wspr.updated) $('wspr-updated').textContent = t('updated_at') + ': ' + fmtDate(state.wspr.updated);
}

function loadWspr() {
  return fetchJSON('data/wspr.json').then(function (data) {
    if (data && Array.isArray(data.bands) && data.bands.length) {
      state.wspr = data;
      renderWspr();
    }
  }).catch(function (e) {
    console.warn('wspr snapshot:', e);
  });
}

/* ================= WebSDR / OpenWebRX directories ================= */

function webSdrCard(r) {
  var action = r.https
    ? '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('listen_in_app')) + '</button>'
    : '<a class="open" target="_blank" rel="noopener" href="' + esc(r.url) + '">' + esc(t('open_ext')) + '</a>';
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(r.name) + '</h3></div>' +
    (r.loc ? '<div class="chips"><span class="chip">📍 ' + esc(r.loc) + '</span></div>' : '') +
    action +
    '</article>';
}

function renderWebSdrGrid(gridId, countId, panelId, list) {
  var grid = $(gridId);
  var panel = $(panelId);
  if (!grid || !panel) return;
  if (!list || !list.length) { panel.hidden = true; return; }
  panel.hidden = false;
  $(countId).textContent = t('results').replace('{n}', fmtNum(list.length));
  grid.innerHTML = list.slice(0, 150).map(webSdrCard).join('');
}

function renderWebSdrs() {
  if (!state.webSdrs) return;
  renderWebSdrGrid('grid-websdr', 'websdr-count', 'websdr-panel', state.webSdrs.websdr);
  renderWebSdrGrid('grid-owrx', 'owrx-count', 'owrx-panel', state.webSdrs.openwebrx);
}

function loadWebSdrs() {
  return fetchJSON('data/web_sdrs.json').then(function (data) {
    if (data && (Array.isArray(data.websdr) || Array.isArray(data.openwebrx))) {
      state.webSdrs = data;
      renderWebSdrs();
    }
  }).catch(function (e) {
    console.warn('web sdrs snapshot:', e);
  });
}

/* ================= FM / Broadcast ================= */

function flagOf(cc) {
  if (!cc || !/^[a-zA-Z]{2}$/.test(cc)) return '';
  var a = cc.toUpperCase();
  try {
    return String.fromCodePoint(0x1F1E6 + a.charCodeAt(0) - 65, 0x1F1E6 + a.charCodeAt(1) - 65);
  } catch (e) { return ''; }
}

function regionName(cc, fallback) {
  if (!cc) return fallback;
  try {
    var dn = new Intl.DisplayNames([state.lang], { type: 'region' });
    var n = dn.of(cc.toUpperCase());
    return n && n !== cc.toUpperCase() ? n : fallback;
  } catch (e) { return fallback; }
}

function fillSelect(sel, placeholder, items) {
  sel.innerHTML = '<option value="">' + esc(placeholder) + '</option>' + items.map(function (it) {
    return '<option value="' + esc(it.value) + '">' + esc(it.label) + '</option>';
  }).join('');
}

function splitList(v) {
  return String(v || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
}

function buildFMFacets() {
  var countries={},langs={},categories={};
  state.fm.forEach(function(s){
    if(s.cc)countries[s.cc]=(countries[s.cc]||0)+1;
    splitList(s.language).forEach(function(l){var c=canonicalLanguage(l);if(c)langs[c]=(langs[c]||0)+1;});
    splitList(normalizeCategories(s.tags)).forEach(function(tag){categories[tag]=(categories[tag]||0)+1;});
  });
  var countryItems=Object.keys(countries).map(function(k){
    var name=regionName(k,k);return {value:k,name:name,label:flagOf(k)+' '+name+' ('+countries[k]+')'};
  }).sort(function(a,b){return a.name.localeCompare(b.name,state.lang);});
  var langItems=Object.keys(langs).sort(function(a,b){return a.localeCompare(b,state.lang);})
    .map(function(k){return {value:k,label:k.charAt(0).toUpperCase()+k.slice(1)+' ('+langs[k]+')'};});
  var labels=CATEGORY_LABELS[state.lang]||CATEGORY_LABELS.en;
  var tagItems=CORE_CATEGORIES.filter(function(entry){return categories[entry[0]]>0;})
    .map(function(entry){return {value:entry[0],label:labels[entry[0]]+' ('+categories[entry[0]]+')'};});
  FACET_OPTIONS={country:countryItems,language:langItems,tag:tagItems};
  fillSelect($('fm-country'),t('all_countries'),countryItems);
  fillSelect($('fm-language'),t('all_languages'),langItems);
  fillSelect($('fm-tag'),t('all_tags'),tagItems);
  filterFacetOptions('country');filterFacetOptions('language');filterFacetOptions('tag');
}
function filterFacetOptions(kind) {
  var search=$('fm-'+kind+'-search'),select=$('fm-'+kind);
  if(!search||!select)return;
  var q=normalizeSearchText(search.value),selected=state.fmFilters[kind]||'';
  var options=FACET_OPTIONS[kind].filter(function(item){
    return item.value===selected||!q||normalizeSearchText(item.label+' '+item.value).indexOf(q)!==-1;
  });
  var placeholder=kind==='country'?t('all_countries'):(kind==='language'?t('all_languages'):t('all_tags'));
  fillSelect(select,placeholder,options);select.value=selected;
}
function normalizeFm(s) {
  return {
    name:s.name||'—',url:safeHttpUrl(s.url_resolved||s.url||''),cc:String(s.countrycode||s.cc||'').toUpperCase(),
    language:normalizeLanguages(s.language||''),tags:normalizeCategories(s.tags||''),official:isOfficialStation(s),
    codec:s.codec||'',bitrate:s.bitrate||0,
    fallbacks:Array.isArray(s.fallbacks)?s.fallbacks.map(safeHttpsUrl).filter(Boolean):[],
    website:safeHttpUrl(s.website||s.officialUrl||''),
    tokenEndpoint:safeHttpsUrl(s.tokenEndpoint||''),
    tokenType:s.tokenType||''
  };
}

function cardFm(s) {
  var isFav = !!state.favs[s.url];
  var heart = '<button class="fav' + (isFav ? ' active' : '') + '" type="button" title="⭐" data-fav-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">' + (isFav ? '❤️' : '🤍') + '</button>';
  var shareBtn = '<button class="share" type="button" title="🔗" data-share-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '">🔗</button>';
  var reportBtn = '<button class="report" type="button" title="🚩" data-report-url="' + esc(s.url) + '" data-name="' + esc(s.name) + '" aria-label="' + esc(t('report_aria')) + '">🚩</button>';
  var chips = '';
  if (s.cc) chips += '<span class="chip">' + flagOf(s.cc) + ' ' + esc(regionName(s.cc, s.cc)) + '</span>';
  if (s.language) chips += '<span class="chip">🗣 ' + esc(s.language) + '</span>';
  var allTags=String(s.tags||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
  var isOfficial=isOfficialStation(s);
  if(isOfficial)chips+='<span class="chip official">🏛 '+esc(state.lang==='ar'?'رسمي':'Official')+'</span>';
  var check=state.streamChecks?state.streamChecks[s.url]:null;
  if(check&&check.alive)chips+='<span class="chip ok" title="'+esc(t('stream_ok'))+'">'+esc(t('chip_alive'))+'</span>';
  else if(check&&!check.alive)chips+='<span class="chip dead" title="'+esc(t('stream_dead'))+'">'+esc(t('chip_dead'))+'</span>';
  var shownTags=allTags.slice(0,3);
  shownTags.forEach(function (x) { chips += '<span class="chip tag">🏷 ' + esc(x) + '</span>'; });
  var meta = [s.codec, s.bitrate ? s.bitrate + 'kbps' : ''].filter(Boolean).join(' · ');
  var streamUrl = safeHttpUrl(s.url);
  var streamAction = streamUrl && /^https:/i.test(streamUrl)
    ? '<button class="open play" type="button" data-url="' + esc(streamUrl) + '" data-name="' + esc(s.name) + '">' + esc(t('listen')) + '</button>'
    : (streamUrl ? '<a class="open http-warning" href="' + esc(streamUrl) + '" target="_blank" rel="noopener noreferrer">HTTP — ' + esc(state.lang==='ar'?'فتح خارجي فقط':'open externally only') + '</a>' : '<span class="meta">' + esc(state.lang==='ar'?'رابط البث غير صالح':'Invalid stream URL') + '</span>');
  return '<article class="card">' +
    '<div class="card-head"><h3>' + esc(s.name) + '</h3>' + heart + shareBtn + reportBtn + '</div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
    streamAction +
    (safeHttpUrl(s.website) ? '<a class="open official-link" href="' + esc(safeHttpUrl(s.website)) + '" target="_blank" rel="noopener noreferrer">' + esc(t('open_official_site')) + '</a>' : '') +
    '</article>';
}

function filterFM() {
  var f = state.fmFilters;
  var q = normalizeSearchText(f.q);
  return state.fm.filter(function (s) {
    if (f.country && s.cc !== f.country) return false;
    if (f.language && splitList(s.language).indexOf(f.language) === -1) return false;
    if (f.tag && splitList(s.tags).indexOf(f.tag) === -1) return false;
    if (f.chip === 'fav' && !state.favs[s.url]) return false;
    if (f.chip === 'arabic') {
      var langA = (s.language || '').toLowerCase();
      var tagsA = splitList(s.tags);
      if (langA.indexOf('arabic') === -1 && tagsA.indexOf('عربي') === -1 && tagsA.indexOf('arabic') === -1) return false;
    }
    if (f.chip && CHIP_TAGS[f.chip]) {
      var tags = splitList(s.tags);
      var hit = false;
      var wanted = CHIP_TAGS[f.chip];
      for (var i = 0; i < wanted.length; i++) {
        if (tags.indexOf(wanted[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return false;
    }
    if (q) {
      var country=regionName(s.cc,s.cc);
      var haystack=normalizeSearchText([s.name,s.language,s.tags,s.cc,country].join(' '));
      if (haystack.indexOf(q) === -1) return false;
    }
    return true;
  });
}

function currentFMList() {
  var list = state.fmLive ? filterFM().concat(state.fmLiveRows) : filterFM();
  var seen = Object.create(null);
  list = list.filter(function (station) {
    var url = safeHttpUrl(station.url);
    if (!url) return false;
    var key = url.replace(/#.*$/, '').toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  return list.sort(function(a,b){
    if(isOfficialStation(a)!==isOfficialStation(b))return isOfficialStation(a)?-1:1;
    return 0;
  });
}

function renderFM() {
  var grid = $('grid-fm');
  var list = currentFMList();
  $('count-fm').textContent = t('stations').replace('{n}', fmtNum(list.length));
  if (!list.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_match_fm')) + '</div>';
    return;
  }
  var shown = list.slice(0, state.fmLimit);
  var html = shown.map(cardFm).join('');
  if (list.length > state.fmLimit) {
    html += '<div class="more-wrap"><button id="fm-more" class="btn ghost" type="button">' + esc(t('more_btn').replace('{n}', fmtNum(list.length - state.fmLimit))) + '</button></div>';
  }
  grid.innerHTML = html;
}

function loadStations() {
  return fetchJSON('data/stations.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      buildFMFacets();
    }
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(function () {
    renderFM();
    renderMA();
    initResume();
    loadStreamChecks();
    handleShareHash();
  });
}

function loadStreamChecks() {
  fetchJSON('data/stream_checks.json').then(function (d) {
    if (d && d.results) { state.streamChecks = d.results; renderFM(); renderMA(); }
  }).catch(function () {});
}

/* ================= Morocco / SNRT ================= */

var MA_NATIONAL_PATHS = ['/radio_nationale/', '/radio_amazigh/', '/radio_med_VI/', '/radio_inter/'];

function maIsNational(url) {
  var u = String(url || '');
  for (var i = 0; i < MA_NATIONAL_PATHS.length; i++) {
    if (u.indexOf(MA_NATIONAL_PATHS[i]) !== -1) return true;
  }
  return false;
}

function moroccanStations() {
  return state.fm.filter(function (s) { return s.cc === 'MA' && s.official; });
}

function renderMA() {
  var grid = $('grid-ma');
  if (!grid) return;
  var list = moroccanStations();
  var count = $('ma-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  if (count) count.textContent = t('stations').replace('{n}', fmtNum(list.length));
  var national = list.filter(function (s) { return maIsNational(s.url); });
  var regional = list.filter(function (s) { return !maIsNational(s.url); });
  var html = '';
  if (national.length) {
    html += '<h2 class="ma-group">' + esc(t('ma_national')) + ' · ' + fmtNum(national.length) + '</h2>' + national.map(cardFm).join('');
  }
  if (regional.length) {
    html += '<h2 class="ma-group">' + esc(t('ma_regional')) + ' · ' + fmtNum(regional.length) + '</h2>' + regional.map(cardFm).join('');
  }
  grid.innerHTML = html;
}

function fmClientRender() {
  fmSearchSequence += 1;
  state.fmLive = false;
  state.fmLiveRows = [];
  state.fmLimit = FM_PAGE;
  renderChips();
  renderFM();
}

function fetchRB(params) {
  var i = 0;
  function attempt() {
    return fetch(RB_APIS[i] + '/stations/search?' + params.join('&')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (err) {
      i += 1;
      if (i >= RB_APIS.length) throw err;
      return attempt();
    });
  }
  return attempt();
}

function searchFM() {
  cancelFMClientRender();
  var requestId = ++fmSearchSequence;
  var f = state.fmFilters;
  if (!(f.q || f.country || f.language || f.tag || f.chip === 'arabic' || (f.chip && CHIP_TAGS[f.chip]))) { fmClientRender(); return; }
  $('grid-fm').innerHTML = '<div class="empty">' + esc(t('searching_live')) + '</div>';
  var params = ['limit=200', 'hidebroken=true', 'order=clickcount', 'reverse=true'];
  if (f.q) params.push('name=' + encodeURIComponent(f.q));
  if (f.country) params.push('countrycode=' + encodeURIComponent(f.country));
  if (f.language) params.push('language=' + encodeURIComponent(f.language));
  if (f.tag) params.push('tagList=' + encodeURIComponent(f.tag));
  if (f.chip === 'arabic') params.push('language=arabic');
  if (f.chip && CHIP_TAGS[f.chip]) params.push('tagList=' + encodeURIComponent(CHIP_TAGS[f.chip][0]));
  fetchRB(params)
    .then(function (rows) {
      if (requestId !== fmSearchSequence) return;
      state.fmLive = true;
      state.fmLiveRows = rows
        .filter(function (s) { return (s.url_resolved || s.url) && (s.countrycode || '').toUpperCase() !== 'IL'; })
        .map(normalizeFm);
      if (f.chip === 'fav') {
        state.fmLiveRows = state.fmLiveRows.filter(function (s) { return !!state.favs[s.url]; });
      }
      state.fmLimit = FM_PAGE;
      renderChips();
      renderFM();
    })
    .catch(function () {
      if (requestId !== fmSearchSequence) return;
      $('grid-fm').innerHTML = '<div class="empty">' + esc(t('live_failed')) + '</div>';
    });
}

function clearFMFilters() {
  state.fmFilters = { q: '', country: '', language: '', tag: '', chip: '' };
  $('qfm').value = '';
  ['country','language','tag'].forEach(function(kind){$('fm-'+kind+'-search').value='';filterFacetOptions(kind);});
  $('fm-country').value = '';
  $('fm-language').value = '';
  $('fm-tag').value = '';
  fmClientRender();
}

/* ================= quick chips ================= */

function renderChips() {
  var chips = document.querySelectorAll('.qchip');
  for (var i = 0; i < chips.length; i++) {
    var c = chips[i];
    var k = c.getAttribute('data-chip');
    var active = (k === 'all') ? state.fmFilters.chip === '' : state.fmFilters.chip === k;
    c.classList.toggle('active', active);
  }
}

/* ================= space weather ================= */

function loadSpace() {
  fetchJSON('data/space_weather.json').then(function (d) {
    if (d && (d.kp != null || d.f107 != null)) { state.space = d; renderSpace(); }
  }).catch(function () {});
  fetchJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json').then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    for (var i = rows.length - 1; i >= 0; i--) {
      var v = rows[i] && (rows[i].kp_index != null ? rows[i].kp_index : rows[i].estimated_kp);
      if (v != null) {
        if (!state.space) state.space = {};
        state.space.kp = Number(v);
        state.space.updated = new Date().toISOString();
        renderSpace();
        return;
      }
    }
  }).catch(function () {});
}

function renderSpace() {
  var p = $('space-panel');
  if (!state.space) { p.hidden = true; return; }
  p.hidden = false;
  $('space-upd').textContent = t('updated_at') + ': ' + fmtDate(state.space.updated);
  var vals = '';
  if (state.space.kp != null) vals += '<span class="chip">🧲 Kp ' + state.space.kp + '</span>';
  if (state.space.f107 != null) vals += '<span class="chip">☀️ F10.7 ' + state.space.f107 + ' sfu</span>';
  $('space-values').innerHTML = vals;
  var kp = state.space.kp;
  var cond = kp == null ? '' : (kp < 4 ? t('cond_good') : (kp < 6 ? t('cond_unstable') : t('cond_storm')));
  $('space-cond').textContent = cond;
  maybeSpaceAlert();
  renderSpaceAlertBtn();
}

/* ================= band-condition alerts ================= */

var SPACE_ALERT_KEY = 'ra-space-alerts';
var SPACE_LAST_KP = 'ra-space-last-kp';

function spaceAlertsEnabled() {
  try { return localStorage.getItem(SPACE_ALERT_KEY) === '1'; } catch (e) { return false; }
}

function renderSpaceAlertBtn() {
  var btn = $('space-alert-btn');
  if (!btn) return;
  var supported = 'Notification' in window;
  btn.hidden = !supported;
  if (!supported) return;
  var enabled = spaceAlertsEnabled();
  btn.textContent = enabled ? '🔔' : '🔕';
  btn.classList.toggle('active', enabled);
}

function notifySpace(title, body, fallbackToast) {
  var ok = false;
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      var n = new Notification(title, { body: body, icon: 'icons/icon-192.png', tag: 'ra-space', lang: state.lang });
      n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
      ok = true;
    } catch (e) {}
  }
  if (!ok) toast(fallbackToast);
}

function maybeSpaceAlert() {
  var kp = state.space && state.space.kp;
  if (kp == null) return;
  var last = null;
  try { last = Number(localStorage.getItem(SPACE_LAST_KP)); } catch (e) {}
  try { localStorage.setItem(SPACE_LAST_KP, String(kp)); } catch (e) {}
  if (!spaceAlertsEnabled() || last == null || !isFinite(last) || last === kp) return;
  var opened = last >= 4 && kp < 4;
  var storm = last < 5 && kp >= 5;
  if (!opened && !storm) return;
  if (opened) {
    notifySpace(t('alert_open_title'), t('alert_open_body').replace('{kp}', kp), t('alert_toast_open').replace('{kp}', kp));
  } else {
    notifySpace(t('alert_storm_title'), t('alert_storm_body').replace('{kp}', kp), t('alert_toast_storm').replace('{kp}', kp));
  }
}

function toggleSpaceAlerts() {
  if (!('Notification' in window)) { toast(t('alert_unsupported')); return; }
  var enabling = !spaceAlertsEnabled();
  if (!enabling) {
    try { localStorage.setItem(SPACE_ALERT_KEY, '0'); } catch (e) {}
    renderSpaceAlertBtn();
    toast(t('alert_off'));
    return;
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission().then(function () {
      try { localStorage.setItem(SPACE_ALERT_KEY, '1'); } catch (e) {}
      renderSpaceAlertBtn();
      toast(t('alert_on'));
    }).catch(function () {});
    return;
  }
  try { localStorage.setItem(SPACE_ALERT_KEY, '1'); } catch (e) {}
  renderSpaceAlertBtn();
  toast(t('alert_on'));
}

/* ================= EIBI on-air ================= */

function loadEibi() {
  fetchJSON('data/eibi.json').then(function (d) {
    if (d && Array.isArray(d.rows) && d.rows.length) { state.eibi = d.rows; renderEibi(); }
  }).catch(function () {});
}

function eibiRow(x) {
  var freq = (x.f / 1000).toFixed(3) + ' MHz';
  return '<div class="eibi-row"><span class="eibi-time">' + esc(x.s + '–' + x.e + ' UTC') + '</span><strong>' + freq + '</strong><span class="eibi-name">' + esc(x.n || '') + '</span></div>';
}

function renderEibi() {
  var p = $('eibi-panel');
  if (!p) return;
  if (!state.eibi.length) { p.hidden = true; return; }
  p.hidden = false;
  var q = state.eibiQ.trim().toLowerCase();
  var rows = state.eibi.filter(function (x) {
    if (!q) return true;
    return ((x.n || '') + ' ' + x.f).toLowerCase().indexOf(q) !== -1;
  });
  $('eibi-count').textContent = fmtNum(rows.length) + ' ' + t('onair');
  var html = rows.slice(0, 60).map(eibiRow).join('');
  if (rows.length > 60) html += '<div class="hint" style="text-align:center">' + esc(t('more_eibi')) + '</div>';
  $('eibi-list').innerHTML = html || ('<div class="hint">' + esc(t('no_match')) + '</div>');
}

/* ================= players ================= */

function setMedia(name) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: name || 'Radio Atlas',
      artist: 'Radio Atlas — راديو أطلس',
      album: 'Radio Atlas'
    });
  } catch (e) {}
}

var hls = null;
var easyBroadcastTokenCache = {};
function isHlsUrl(u) {
  return /\.m3u8(?:\?|$)/i.test(u || '');
}
function destroyHls() {
  if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
}
function appendEasyBroadcastToken(url, tokenText) {
  var values = new URLSearchParams(String(tokenText || '').trim().replace(/^\?/, ''));
  if (!values.get('token')) throw new Error('EasyBroadcast token response did not include a token');
  var signed = new URL(url);
  ['token', 'expires', 'token_path'].forEach(function (key) {
    if (values.get(key)) signed.searchParams.set(key, values.get(key));
  });
  return signed.toString();
}
function resolvePlaybackUrl(url, station) {
  if (!station || !station.tokenEndpoint || station.tokenType !== 'easy_b') return Promise.resolve(url);
  var cleanUrl = new URL(url);
  ['token', 'expires', 'token_path'].forEach(function (key) { cleanUrl.searchParams.delete(key); });
  var unsignedUrl = cleanUrl.toString();
  var cacheKey = station.tokenEndpoint + '|' + station.url;
  var cached = easyBroadcastTokenCache[cacheKey];
  if (cached && cached.tokenText && cached.expires * 1000 > Date.now() + 30000) {
    return Promise.resolve(appendEasyBroadcastToken(unsignedUrl, cached.tokenText));
  }
  if (cached && cached.promise) {
    return cached.promise.then(function (tokenText) { return appendEasyBroadcastToken(unsignedUrl, tokenText); });
  }
  var endpoint = station.tokenEndpoint + '?url=' + encodeURIComponent(station.url || unsignedUrl);
  var entry = { tokenText: '', expires: 0, promise: null };
  entry.promise = fetch(endpoint, { cache: 'no-store' }).then(function (response) {
    if (!response.ok) throw new Error('Token endpoint HTTP ' + response.status);
    return response.text();
  }).then(function (tokenText) {
    var values = new URLSearchParams(String(tokenText || '').trim().replace(/^\?/, ''));
    entry.tokenText = tokenText;
    entry.expires = Number(values.get('expires')) || 0;
    entry.promise = null;
    return tokenText;
  }).catch(function (error) {
    delete easyBroadcastTokenCache[cacheKey];
    throw error;
  });
  easyBroadcastTokenCache[cacheKey] = entry;
  return entry.promise.then(function (tokenText) { return appendEasyBroadcastToken(unsignedUrl, tokenText); });
}
function loadHlsLib(cb) {
  if (window.Hls) { cb(true); return; }
  if (loadHlsLib.loading) { loadHlsLib.queue.push(cb); return; }
  loadHlsLib.loading = true;
  loadHlsLib.queue = [cb];
  var urls = [
    'https://cdn.jsdelivr.net/npm/hls.js@1.6.10/dist/hls.min.js',
    'https://unpkg.com/hls.js@1.6.10/dist/hls.min.js'
  ];
  var index = 0;
  function finish(ok) {
    var queue = loadHlsLib.queue || [];
    loadHlsLib.queue = [];
    loadHlsLib.loading = false;
    queue.forEach(function (fn) { fn(ok); });
  }
  function next() {
    if (window.Hls) { finish(true); return; }
    if (index >= urls.length) { finish(false); return; }
    var script = document.createElement('script');
    script.src = urls[index++];
    script.onload = function () { finish(!!window.Hls); };
    script.onerror = function () { script.remove(); next(); };
    document.head.appendChild(script);
  }
  next();
}
function failCurrentPlayback(generation, reason) {
  if (generation !== state.playbackGeneration || state.playbackAttemptFailed) return;
  state.playbackAttemptFailed = true;
  destroyHls();
  var audio = $('audio');
  audio.pause();
  audio.removeAttribute('src');
  state.playbackIndex += 1;
  if (state.playbackIndex < state.playbackSources.length) {
    startCurrentPlayback(generation);
    return;
  }
  var official = $('player-official');
  if (official && state.playbackStation && state.playbackStation.website) official.hidden = false;
  toast(t('toast_broken'));
  console.warn('Radio playback failed:', reason || 'all sources exhausted');
}
function createEasyBroadcastLoader(station) {
  var BaseLoader = window.Hls.DefaultConfig.loader;
  return class EasyBroadcastTokenLoader extends BaseLoader {
    load(context, config, callbacks) {
      var path = '';
      try { path = new URL(context.url).pathname; } catch (e) {}
      if (!/\.m3u8$/i.test(path) || !station || !station.tokenEndpoint) {
        return BaseLoader.prototype.load.call(this, context, config, callbacks);
      }
      var self = this;
      resolvePlaybackUrl(context.url, station).then(function (signedUrl) {
        context.url = signedUrl;
        BaseLoader.prototype.load.call(self, context, config, callbacks);
      }).catch(function (error) {
        callbacks.onError({ code: 0, text: error && error.message ? error.message : 'Stream token request failed' }, context, null);
      });
    }
  };
}
function attachHls(url, generation, station) {
  var audio = $('audio');
  if (!window.Hls || !window.Hls.isSupported()) return false;
  destroyHls();
  audio.removeAttribute('src');
  var config = {
    autoStartLoad: true,
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 30,
    maxBufferLength: 30
  };
  if (station && station.tokenEndpoint && station.tokenType === 'easy_b') {
    config.pLoader = createEasyBroadcastLoader(station);
  }
  hls = new window.Hls(config);
  var networkRetries = 0;
  var mediaRetries = 0;
  hls.on(window.Hls.Events.ERROR, function (evt, data) {
    if (!data || !data.fatal || generation !== state.playbackGeneration) return;
    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
      networkRetries += 1;
      try { hls.startLoad(); return; } catch (e) {}
    }
    if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
      mediaRetries += 1;
      try { hls.recoverMediaError(); return; } catch (e) {}
    }
    failCurrentPlayback(generation, data.details || data.type || 'fatal HLS error');
  });
  hls.loadSource(url);
  hls.attachMedia(audio);
  return true;
}
function startCurrentPlayback(generation) {
  if (generation !== state.playbackGeneration) return;
  var baseUrl = state.playbackSources[state.playbackIndex];
  if (!baseUrl) { failCurrentPlayback(generation, 'No source URL'); return; }
  state.playbackAttemptFailed = false;
  var audio = $('audio');
  destroyHls();
  audio.pause();
  audio.removeAttribute('src');
  var ext = $('player-ext');
  if (ext) { ext.href = baseUrl; ext.hidden = false; }
  var official = $('player-official');
  if (official) {
    official.hidden = !(state.playbackStation && state.playbackStation.website);
    if (!official.hidden) official.href = state.playbackStation.website;
  }
  var station = state.playbackStation;
  var requiresTokenLoader = station && station.tokenEndpoint && station.tokenType === 'easy_b';
  var needsHlsJs = isHlsUrl(baseUrl) && (requiresTokenLoader || !audio.canPlayType('application/vnd.apple.mpegurl'));
  if (needsHlsJs) {
    loadHlsLib(function (loaded) {
      if (generation !== state.playbackGeneration) return;
      if (!loaded || !attachHls(baseUrl, generation, station)) {
        failCurrentPlayback(generation, 'HLS.js unavailable or MediaSource unsupported');
        return;
      }
      audio.play().catch(function (error) {
        if (error && error.name === 'NotAllowedError') {
          toast(t('toast_tap_play'));
        } else {
          failCurrentPlayback(generation, error && error.message);
        }
      });
    });
  } else if (requiresTokenLoader) {
    failCurrentPlayback(generation, 'Token-protected HLS requires HLS.js');
  } else {
    audio.src = baseUrl;
    audio.load();
    audio.play().catch(function (error) {
      if (error && error.name === 'NotAllowedError') {
        toast(t('toast_tap_play'));
      } else {
        failCurrentPlayback(generation, error && error.message);
      }
    });
  }
}
function play(url, name) {
  url = safeHttpsUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  var station = stationByUrl(url);
  if (!station) {
    for (var i = 0; i < state.fmLiveRows.length; i++) {
      if (state.fmLiveRows[i].url === url) { station = state.fmLiveRows[i]; break; }
    }
  }
  state.playbackStation = station || { name: name || '', url: url };
  state.playbackSources = [url].concat(state.playbackStation.fallbacks || []).filter(function (source, index, list) {
    return !!source && list.indexOf(source) === index;
  });
  state.playbackIndex = 0;
  state.playbackGeneration += 1;
  var generation = state.playbackGeneration;
  state.currentName = name || (station && station.name) || '';
  $('player').hidden = false;
  $('player-name').textContent = '▶ ' + state.currentName;
  startCurrentPlayback(generation);
  try { localStorage.setItem('ra-last', JSON.stringify({ url: url, name: state.currentName })); } catch (e) {}
  setMedia(state.currentName);
  try { history.replaceState(null, '', '#play=' + encodeURIComponent(url)); } catch (e) {}
}

/* ================= station sharing / deep links ================= */

var shareHashHandled = false;

function stationShareLink(url) {
  try {
    return location.origin + location.pathname + '#play=' + encodeURIComponent(url);
  } catch (e) { return ''; }
}

function shareStation(url, name) {
  url = safeHttpUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  var link = stationShareLink(url);
  if (!link) { toast(t('toast_broken')); return; }
  if (navigator.share) {
    try {
      navigator.share({ title: name || t('doc_title'), text: name || '', url: link }).catch(function () {});
      return;
    } catch (e) {}
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(function () {
      toast(t('share_copied'));
    }).catch(function () {
      toast(link);
    });
    return;
  }
  toast(link);
}

function handleShareHash() {
  if (shareHashHandled) return;
  shareHashHandled = true;
  try {
    var h = location.hash || '';
    if (h.indexOf('#play=') !== 0) return;
    var url = decodeURIComponent(h.slice(6));
    if (!safeHttpsUrl(url)) return;
    var station = stationByUrl(url);
    play(url, station ? station.name : '');
  } catch (e) {}
}

/* ================= random station + broken-station report ================= */

var ISSUE_URL = 'https://github.com/SamoTech/Radio/issues/new';

function playRandomStation() {
  var list = currentFMList().filter(function (s) { return !!safeHttpsUrl(s.url); });
  if (!list.length) { toast(t('random_none')); return; }
  var s = list[Math.floor(Math.random() * list.length)];
  play(s.url, s.name);
  toast(t('random_toast').replace('{name}', s.name));
}

function reportStation(url, name) {
  url = safeHttpUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  var title = t('report_title').replace('{name}', name || '');
  var body = t('report_body').replace('{url}', url);
  var link = ISSUE_URL + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  try { window.open(link, '_blank', 'noopener'); } catch (e) { location.href = link; }
  toast(t('report_toast'));
}

var previousSDRFocus = null;

function openSDR(url, name) {
  url = safeHttpsUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  $('sdr-modal-name').textContent = '🎧 ' + (name || '');
  $('sdr-open-ext').href = url;
  previousSDRFocus = document.activeElement;
  $('sdr-frame').src = url;
  $('sdr-modal').hidden = false;
  $('sdr-modal-close').focus();
}

function closeSDR() {
  $('sdr-frame').src = 'about:blank';
  $('sdr-modal').hidden = true;
  if (previousSDRFocus && typeof previousSDRFocus.focus === 'function') previousSDRFocus.focus();
  previousSDRFocus = null;
}

function initResume() {
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !safeHttpsUrl(last.url)) return;
  var station = stationByUrl(last.url);
  state.playbackStation = station || { name: last.name || '', url: last.url };
  state.playbackSources = [last.url].concat(state.playbackStation.fallbacks || []);
  state.playbackIndex = 0;
  state.playbackGeneration += 1;
  var generation = state.playbackGeneration;
  state.currentName = last.name || '';
  var a = $('audio');
  var ext = $('player-ext');
  if (ext) { ext.href = last.url; ext.hidden = false; }
  var official = $('player-official');
  if (official) {
    official.hidden = !(state.playbackStation && state.playbackStation.website);
    if (!official.hidden) official.href = state.playbackStation.website;
  }
  $('player').hidden = false;
  $('player-name').textContent = '⏸ ' + state.currentName + ' — ' + t('resume');
  if (isHlsUrl(last.url) && (state.playbackStation.tokenEndpoint || !a.canPlayType('application/vnd.apple.mpegurl'))) {
    loadHlsLib(function (loaded) {
      if (generation !== state.playbackGeneration || !loaded || !attachHls(last.url, generation, state.playbackStation)) return;
      a.preload = 'none';
    });
  } else {
    try { a.src = last.url; a.preload = 'none'; } catch (e) {}
  }
  setMedia(state.currentName);
}

function initPlayers() {
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var shBtn = el.closest('button.share');
    if (shBtn) {
      shareStation(shBtn.getAttribute('data-share-url'), shBtn.getAttribute('data-name'));
      return;
    }
    var repBtn = el.closest('button.report');
    if (repBtn) {
      reportStation(repBtn.getAttribute('data-report-url'), repBtn.getAttribute('data-name'));
      return;
    }
    var fav = el.closest('button.fav');
    if (fav) {
      var url = fav.getAttribute('data-fav-url');
      var s = stationByUrl(url);
      if (!s) s = { name: fav.getAttribute('data-name') || '', url: url, cc: '', language: '', tags: '' };
      toggleFav(s);
      return;
    }
    var p = el.closest('button.play');
    if (p) {
      play(p.getAttribute('data-url'), p.getAttribute('data-name'));
      return;
    }
    var sdr = el.closest('button.play-sdr');
    if (sdr) {
      openSDR(sdr.getAttribute('data-url'), sdr.getAttribute('data-name'));
      return;
    }
    var kw = el.closest('button.kiwi-ws');
    if (kw) {
      openKiwiAudio(kw.getAttribute('data-url'), kw.getAttribute('data-name'));
    }
  });
  $('player-close').addEventListener('click', function () {
    state.playbackGeneration += 1;
    state.playbackSources = [];
    state.playbackStation = null;
    var a = $('audio');
    a.pause();
    a.removeAttribute('src');
    destroyHls();
    var ext = $('player-ext');
    var official = $('player-official');
    if (ext) ext.hidden = true;
    if (official) official.hidden = true;
    $('player').hidden = true;
  });
  $('sdr-modal-close').addEventListener('click', closeSDR);
  $('kiwi-modal-close').addEventListener('click', closeKiwiAudio);
  $('kiwi-freq').addEventListener('change', function () {
    if (kiwiWs && kiwiWs.readyState === 1) kiwiWs.send('SET freq ' + (Number(this.value) || 7100));
  });
  $('kiwi-mode').addEventListener('change', function () {
    if (kiwiWs && kiwiWs.readyState === 1) kiwiWs.send('SET mod ' + this.value);
  });
  $('audio').addEventListener('error', function () {
    if (state.playbackSources.length) failCurrentPlayback(state.playbackGeneration, 'HTML audio element error');
  });
  $('audio').addEventListener('play', function () {
    if (hls && !hls.__raStarted) {
      hls.__raStarted = true;
      try { hls.startLoad(); } catch (e) {}
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('sdr-modal').hidden) closeSDR();
      if (!$('kiwi-modal').hidden) closeKiwiAudio();
    }
  });
}

/* ================= visitor box ================= */

var visitorJsonpSequence = 0;
var ABACUS_BASE = 'https://abacus.jasoncameron.dev';
var ABACUS_NAMESPACE = 'samotech.github.io';
var ABACUS_KEY = 'radio-atlas-views';

function visitorCounterRequest(action, params) {
  return new Promise(function (resolve, reject) {
    var callbackName = '__radioAtlasCounter' + (++visitorJsonpSequence);
    var script = document.createElement('script');
    var settled = false;
    var query = Object.assign({}, params || {});
    query.callback = callbackName;
    var queryString = Object.keys(query).map(function (name) {
      return encodeURIComponent(name) + '=' + encodeURIComponent(String(query[name]));
    }).join('&');
    function finish(error, data) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (error) reject(error); else resolve(data);
    }
    window[callbackName] = function (data) { finish(null, data); };
    script.onerror = function () { finish(new Error('Abacus request failed')); };
    var timeout = setTimeout(function () {
      finish(new Error('Abacus request timed out'));
    }, 10000);
    script.src = ABACUS_BASE + '/' + action + '/' +
      encodeURIComponent(ABACUS_NAMESPACE) + '/' +
      encodeURIComponent(ABACUS_KEY) + (queryString ? '?' + queryString : '');
    script.async = true;
    document.head.appendChild(script);
  });
}

function renderVisitorValue(elementId, value) {
  var el = $(elementId);
  if (!el) return;
  var number = Number(value);
  el.textContent = Number.isFinite(number) && number >= 0 ? fmtNum(number) : '—';
}

var VISITOR_CACHE_KEY = 'ra-views';
var VISITOR_CACHE_TTL = 14 * 24 * 3600 * 1000;

function visitorCachedTotal() {
  try {
    var cached = JSON.parse(localStorage.getItem(VISITOR_CACHE_KEY) || 'null');
    if (cached && Number(cached.v) >= 0 && Date.now() - Number(cached.ts || 0) < VISITOR_CACHE_TTL) {
      return Number(cached.v);
    }
  } catch (e) {}
  return null;
}

function renderVisitorFallbackBadge() {
  // Abacus down and nothing cached: show a live Moe-Counter badge
  // instead of an unavailable label.
  var el = $('visitor-counter');
  if (!el || el.getAttribute('data-fallback-badge')) return;
  el.setAttribute('data-fallback-badge', '1');
  var img = document.createElement('img');
  img.src = 'https://count.getloli.com/get/@samotech-radio-atlas';
  img.alt = 'visitors';
  img.height = 28;
  img.style.verticalAlign = 'middle';
  el.textContent = '';
  el.appendChild(img);
}

function initVisitorBox() {
  // Show the last known total instantly, then count this visit via
  // Abacus (free counting API, jasoncameron.dev) using JSONP.
  var cachedTotal = visitorCachedTotal();
  if (cachedTotal != null) renderVisitorValue('visitor-counter', cachedTotal);
  visitorCounterRequest('hit', {})
    .then(function (data) {
      var value = Number(data && data.value);
      renderVisitorValue('visitor-counter', value);
      if (value >= 0) {
        try { localStorage.setItem(VISITOR_CACHE_KEY, JSON.stringify({ v: value, ts: Date.now() })); } catch (e) {}
      }
    })
    .catch(function (error) {
      console.warn('Radio Atlas total visitor counter:', error);
      if (visitorCachedTotal() == null) renderVisitorFallbackBadge();
    });
}

/* ================= KiwiSDR WebSocket audio (experimental) ================= */

var kiwiWs = null;
var kiwiAudioCtx = null;
var kiwiGain = null;
var kiwiNextTime = 0;
var kiwiKeepAlive = null;

function kiwiSetStatus(text) {
  var el = $('kiwi-status');
  if (el) el.textContent = text;
}

function closeKiwiAudio() {
  if (kiwiKeepAlive) { clearInterval(kiwiKeepAlive); kiwiKeepAlive = null; }
  if (kiwiWs) { try { kiwiWs.close(); } catch (e) {} kiwiWs = null; }
  var audio = $('kiwi-audio');
  if (audio) { try { audio.pause(); audio.srcObject = null; } catch (e) {} }
  kiwiGain = null;
  var modal = $('kiwi-modal');
  if (modal) modal.hidden = true;
}

function kiwiFeedAudio(samples) {
  // samples: Int16Array PCM at 11.025 kHz mono (KiwiSDR 'SET ar o-f s11').
  if (!kiwiAudioCtx || !kiwiGain || !samples.length) return;
  try {
    var buffer = kiwiAudioCtx.createBuffer(1, samples.length, 11025);
    var channel = buffer.getChannelData(0);
    for (var i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    var source = kiwiAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(kiwiGain);
    var now = kiwiAudioCtx.currentTime;
    if (kiwiNextTime < now + 0.05) kiwiNextTime = now + 0.05;
    source.start(kiwiNextTime);
    kiwiNextTime += buffer.duration;
  } catch (e) {}
}

function openKiwiAudio(url, name) {
  // Experimental direct audio over the KiwiSDR WebSocket protocol for
  // HTTPS receivers whose operator allows API connections (ext_api > 0).
  // Any failure falls back to the embedded receiver web UI (openSDR).
  var parsed = null;
  try { parsed = new URL(url); } catch (e) {}
  if (!parsed || parsed.protocol !== 'https:') { openSDR(url, name); return; }
  closeKiwiAudio();
  kiwiNextTime = 0;
  $('kiwi-modal-name').textContent = '🎧 ' + (name || '');
  $('kiwi-open-ext').href = url;
  $('kiwi-modal').hidden = false;
  kiwiSetStatus(t('kiwi_connecting'));
  var audio = $('kiwi-audio');
  var failed = false;
  var failTimer = null;
  function fail() {
    if (failed) return;
    failed = true;
    if (failTimer) { clearTimeout(failTimer); failTimer = null; }
    closeKiwiAudio();
    toast(t('kiwi_failed'));
    openSDR(url, name);
  }
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { fail(); return; }
  try {
    kiwiAudioCtx = new Ctx();
    kiwiGain = kiwiAudioCtx.createGain();
    var dest = kiwiAudioCtx.createMediaStreamDestination();
    kiwiGain.connect(dest);
    audio.srcObject = dest.stream;
    audio.play().catch(function () {});
  } catch (e) { fail(); return; }
  failTimer = setTimeout(fail, 8000);
  var ws = new WebSocket('wss://' + parsed.host + '/0');
  ws.binaryType = 'arraybuffer';
  kiwiWs = ws;
  ws.onopen = function () { ws.send('SET auth t=1'); };
  ws.onmessage = function (ev) {
    if (typeof ev.data === 'string') {
      var msg = ev.data;
      if (msg.indexOf('BAD_AUTH') !== -1 || msg.indexOf('MSG fault') !== -1) { fail(); return; }
      if (msg.indexOf('MSG auth') !== -1) {
        var freqEl = $('kiwi-freq');
        var modeEl = $('kiwi-mode');
        ws.send('SET freq ' + (Number(freqEl && freqEl.value) || 7100));
        ws.send('SET mod ' + ((modeEl && modeEl.value) || 'am'));
        ws.send('SET ar o-f s11');
        ws.send('SET sound out buf_size=512');
      }
      return;
    }
    if (!(ev.data instanceof ArrayBuffer)) return;
    var bytes = new Uint8Array(ev.data);
    if (bytes.length < 10) return;
    var type = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
    if (type !== 3) return;
    if (failTimer) { clearTimeout(failTimer); failTimer = null; }
    kiwiSetStatus(t('kiwi_live'));
    var sampleLen = (bytes.length - 9) >> 1;
    if (sampleLen <= 0) return;
    var samples = new Int16Array(sampleLen);
    for (var i = 0; i < sampleLen; i++) {
      samples[i] = bytes[9 + i * 2] | (bytes[10 + i * 2] << 8);
    }
    kiwiFeedAudio(samples);
  };
  ws.onerror = function () { fail(); };
  ws.onclose = function () { if (!failed) fail(); };
  kiwiKeepAlive = setInterval(function () {
    if (ws && ws.readyState === 1) ws.send('SET keepalive');
  }, 30000);
}

/* ================= UI ================= */

function switchTab(x) {
  ['fm', 'ma', 'sdr'].forEach(function (k) {
    var tab = $('tab-' + k);
    var panel = $('panel-' + k);
    if (tab) tab.classList.toggle('active', x === k);
    if (panel) panel.hidden = x !== k;
  });
}

function initUI() {
  $('tab-fm').addEventListener('click', function () { switchTab('fm'); });
  $('tab-ma').addEventListener('click', function () { switchTab('ma'); });
  $('tab-sdr').addEventListener('click', function () { switchTab('sdr'); });

  $('theme-btn').addEventListener('click', function () {
    setTheme(state.theme === 'dark' ? 'light' : 'dark');
  });
  $('lang-btn').addEventListener('click', function () {
    setLang(state.lang === 'ar' ? 'en' : 'ar');
  });

  $('quick-chips').addEventListener('click', function (e) {
    var c = e.target && e.target.closest ? e.target.closest('.qchip') : null;
    if (!c) return;
    var k = c.getAttribute('data-chip');
    if (k === 'all') { state.fmFilters.chip = ''; }
    else if (state.fmFilters.chip === k) { state.fmFilters.chip = ''; }
    else { state.fmFilters.chip = k; }
    state.fmLive = false;
    state.fmLiveRows = [];
    state.fmLimit = FM_PAGE;
    renderChips();
    renderFM();
  });

  $('qfm').addEventListener('input', function () {
    state.fmFilters.q = this.value;
    fmSearchSequence += 1;
    scheduleFMClientRender();
  });
  $('qfm').addEventListener('keydown',function(e){
    if(e.key==='Escape' && this.value){this.value='';state.fmFilters.q='';fmClientRender();}
  });
  $('fm-search-btn').addEventListener('click', searchFM);
  $('fm-random-btn').addEventListener('click', playRandomStation);
  $('fm-clear-btn').addEventListener('click', clearFMFilters);
  $('fm-country').addEventListener('change',function(){state.fmFilters.country=this.value;fmClientRender();});
  $('fm-language').addEventListener('change',function(){state.fmFilters.language=this.value;fmClientRender();});
  $('fm-tag').addEventListener('change',function(){state.fmFilters.tag=this.value;fmClientRender();});
  ['country','language','tag'].forEach(function(kind){
    var search=$('fm-'+kind+'-search');
    if(search)search.addEventListener('input',function(){filterFacetOptions(kind);});
  });
  $('grid-fm').addEventListener('click', function (e) {
    var el = e.target;
    if (el && el.closest && el.closest('#fm-more')) {
      state.fmLimit += FM_PAGE;
      renderFM();
    }
  });

  var qTimer = null;
  $('q').addEventListener('input', function () {
    clearTimeout(qTimer);
    var v = this.value;
    qTimer = setTimeout(function () { state.filters.q = v; renderSDR(); }, 150);
  });
  $('band').addEventListener('change', function () { state.filters.band = this.value; renderSDR(); });
  $('sort').addEventListener('change', function () { state.filters.sort = this.value; renderSDR(); });
  $('online-only').addEventListener('change', function () { state.filters.onlineOnly = this.checked; renderSDR(); });
  $('free-only').addEventListener('change', function () { state.filters.freeOnly = this.checked; renderSDR(); });
  $('minsnr').addEventListener('change', function () { state.filters.minSnr = Number(this.value) || 0; renderSDR(); });
  var alertBtn = $('space-alert-btn');
  if (alertBtn) alertBtn.addEventListener('click', toggleSpaceAlerts);
  var eibiSearch = $('eibi-q');
  if (eibiSearch) eibiSearch.addEventListener('input', function () { state.eibiQ = this.value; renderEibi(); });
}

function init() {
  state.favs = loadFavs();
  initUI();
  initPlayers();
  setTheme('dark');
  try {
    var savedTheme = localStorage.getItem('ra-theme');
    var savedLang = localStorage.getItem('ra-lang');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
    setLang(savedLang === 'en' ? 'en' : 'ar');
  } catch (e) { setLang('ar'); }
  loadKiwi();
  loadSpace();
  loadEibi();
  loadWspr();
  loadWebSdrs();
  if (window.requestIdleCallback) {
    window.requestIdleCallback(function () { loadStations(); });
  } else {
    setTimeout(loadStations, 300);
  }
  initVisitorBox();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

document.addEventListener('DOMContentLoaded', init);
