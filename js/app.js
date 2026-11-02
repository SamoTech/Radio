'use strict';

/* Radio Atlas frontend — vanilla JS, no deps */

var RB_APIS = [
  'https://de1.api.radio-browser.info/json',
  'https://de2.api.radio-browser.info/json',
  'https://nl1.api.radio-browser.info/json'
];
var FM_PAGE = 120;
var LANGUAGE_ALIASES = {
  arabic:['arabic','ar','arab','العربية','العربيه','عربي','عربية'],
  english:['english','en','انجليزي','انجليزيه','الانجليزيه','الانجليزية','إنجليزي','الإنجليزية'],
  french:['french','fr','francais','فرنسي','فرنسيه','الفرنسيه','الفرنسية'],
  spanish:['spanish','es','espanol','castellano','castilian','اسباني','إسباني','اسبانيه','الأسبانية'],
  german:['german','de','deutsch','deutsche','الماني','ألماني','المانيه','الألمانية'],
  portuguese:['portuguese','pt','portugues','برتغالي','برتغاليه'],
  russian:['russian','ru','russkiy','rus','русский','روسي','روسيه'],
  turkish:['turkish','tr','turkce','تركي','تركيه'],
  persian:['persian','farsi','fa','dari','فارسي','فارسی','پارسي'],
  urdu:['urdu','ur','اردو'], hindi:['hindi','hi','هندي','हिन्दी'],
  chinese:['chinese','zh','mandarin','cantonese','putonghua','中文','صيني','صينيه'],
  japanese:['japanese','ja','nihongo','日本語','ياباني','يابانيه'], korean:['korean','ko','hangul','한국어','كوري'],
  italian:['italian','it','italiano','ايطالي','إيطالي','ايطاليه'],
  dutch:['dutch','nl','nederlands','هولندي','هولنديه'],
  polish:['polish','pl','polski','بولندي'], greek:['greek','el','ellinika','ελληνικα','ελληνικά','يوناني'],
  swahili:['swahili','sw','kiswahili'],
  indonesian:['indonesian','id','in','bahasa indonesia'], malay:['malay','ms','bahasa melayu','melayu'],
  bengali:['bengali','bn','bangla','বাংলা'],
  kurdish:['kurdish','ku','kurdi','sorani','كردي','كرديه'],
  ukrainian:['ukrainian','uk','ukrainska','українська','اوكراني','أوكراني'],
  romanian:['romanian','ro','romana','روماني'],
  swedish:['swedish','sv','svenska'], norwegian:['norwegian','no','norsk'], finnish:['finnish','fi','suomi'],
  danish:['danish','da','dansk'], czech:['czech','cs','cestina'], hungarian:['hungarian','hu','magyar'],
  serbian:['serbian','sr','srpski','српски'], croatian:['croatian','hr','hrvatski'],
  bulgarian:['bulgarian','bg','bulgarski','български'],
  thai:['thai','th','ไทย'], vietnamese:['vietnamese','vi','tieng viet'],
  hebrew:['hebrew','he','ivrit','עברית','عبري','عبريه'],
  tigrinya:['tigrinya','tigrigna'], amharic:['amharic','am'], somali:['somali','so'],
  hausa:['hausa','ha'], yoruba:['yoruba','yo'], igbo:['igbo','ig'],
  zulu:['zulu','zu'], xhosa:['xhosa','xh'], wolof:['wolof'],
  fula:['fula','fulfulde','peul'], oromo:['oromo','afaan oromo'],
  filipino:['filipino','tagalog','tl','pilipino'],
  tamil:['tamil','ta','تاميلي'], telugu:['telugu','te'], marathi:['marathi','mr'],
  punjabi:['punjabi','pa'], gujarati:['gujarati','gu'], kannada:['kannada','kn'],
  malayalam:['malayalam','ml'], nepali:['nepali','ne'], sinhala:['sinhala','si'],
  pashto:['pashto','ps','pashtu','pushto','بشتو'],
  azerbaijani:['azerbaijani','az','azeri'], kazakh:['kazakh','kk'], uzbek:['uzbek','uz','ozbek'],
  georgian:['georgian','ka','kartuli'], armenian:['armenian','hy','hayeren','ارمني','أرمني'],
  albanian:['albanian','sq','shqip'], macedonian:['macedonian','mk','makedonski'],
  slovenian:['slovenian','sl','slovensko','slovene'], slovak:['slovak','sk','slovensky','slovencina'],
  bosnian:['bosnian','bs','bosanski'], lithuanian:['lithuanian','lt','lietuviu'],
  latvian:['latvian','lv','latviesu'], estonian:['estonian','et','eesti'],
  icelandic:['icelandic','is','islenska'], irish:['irish','ga','gaeilge'],
  welsh:['welsh','cy','cymraeg'], catalan:['catalan','ca','catala'],
  galician:['galician','gl','galego'], basque:['basque','eu','euskara'],
  maltese:['maltese','mt','malti'], afrikaans:['afrikaans','af'],
  luxembourgish:['luxembourgish','lb','letzebuergesch'], esperanto:['esperanto','eo'],
  amazigh:['amazigh','berber','tamazight','kabyle','tarifit','tachelhit','chleuh','أمازيغية'],
  creole:['creole','kreyol','haitian creole','pidgin'],
  quechua:['quechua','qu'], guarani:['guarani','gn'], aymara:['aymara','ay'],
  burmese:['burmese','my'], khmer:['khmer','km'], lao:['lao','lo'], mongolian:['mongolian','mn']
};
/* Every alias entry is pre-normalized (lowercase, accents stripped) and folded
   into one flat lookup so canonicalLanguage stays a single map access. */
var LANGUAGE_ALIAS_INDEX = (function () {
  var index = {};
  for (var key in LANGUAGE_ALIASES) {
    index[key] = key;
    for (var i = 0; i < LANGUAGE_ALIASES[key].length; i++) {
      index[LANGUAGE_ALIASES[key][i]] = key;
    }
  }
  return index;
})();
var LANGUAGE_LABELS = {
  ar:{arabic:'عربي',english:'إنجليزي',french:'فرنسي',spanish:'إسباني',german:'ألماني',portuguese:'برتغالي',
    italian:'إيطالي',dutch:'هولندي',russian:'روسي',turkish:'تركي',persian:'فارسي',urdu:'أردو',hindi:'هندي',
    chinese:'صيني',japanese:'ياباني',korean:'كوري',polish:'بولندي',greek:'يوناني',swahili:'سواحيلي',
    indonesian:'إندونيسي',malay:'ملايوي',bengali:'بنغالي',kurdish:'كردي',ukrainian:'أوكراني',romanian:'روماني',
    swedish:'سويدي',norwegian:'نرويجي',finnish:'فنلندي',danish:'دنماركي',czech:'تشيكي',hungarian:'مجري',
    serbian:'صربي',croatian:'كرواتي',bulgarian:'بلغاري',thai:'تايلاندي',vietnamese:'فيتنامي',hebrew:'عبري',
    tigrinya:'تجريني',amharic:'أمهري',somali:'صومالي',hausa:'هوسا',yoruba:'يوروبا',igbo:'إيبو',zulu:'زولو',
    xhosa:'خوسا',wolof:'وولوف',fula:'فولاني',oromo:'أورومو',filipino:'فلبيني',tamil:'تاميلي',telugu:'تيلوغو',
    marathi:'مراثي',punjabi:'بنجابي',gujarati:'غوجاراتي',kannada:'كانادي',malayalam:'ماليالامية',nepali:'نيبالي',
    sinhala:'سنهالي',pashto:'باشتو',azerbaijani:'أذري',kazakh:'كازاخي',uzbek:'أوزبكي',georgian:'جورجي',
    armenian:'أرميني',albanian:'ألباني',macedonian:'مقدوني',slovenian:'سلوفيني',slovak:'سلوفاكي',bosnian:'بوسني',
    lithuanian:'ليتواني',latvian:'لاتفي',estonian:'إستوني',icelandic:'آيسلندي',irish:'أيرلندي',welsh:'ويلزي',
    catalan:'كتالوني',galician:'غاليسي',basque:'باسكي',maltese:'مالطي',afrikaans:'أفريكانية',
    luxembourgish:'لوكسمبورغي',esperanto:'إسبرانتو',amazigh:'أمازيغي',creole:'كريول',quechua:'كيتشوا',
    guarani:'غواراني',aymara:'أيمارا',burmese:'بورمي',khmer:'خميري',lao:'لاوي',mongolian:'منغولي'},
  en:{}
};
function languageLabel(key) {
  var labels = LANGUAGE_LABELS[state.lang] || {};
  if (labels[key]) return labels[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}
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
var fmFacetAuto = {};

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
  /* Normalize hard before matching: strip Latin combining marks (Français →
     francais, čeština → cestina, Türkçe → turkce), Arabic tashkeel, stray
     apostrophes (O'zbek → ozbek) and collapse whitespace — so every spelling
     of the same language lands on ONE canonical key instead of showing up
     as several near-duplicate entries in the language filter. */
  try { raw=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch(e) {}
  raw=raw.replace(/[\u064B-\u065F\u0670]/g,'').replace(/['\u2018\u2019`´]/g,'').replace(/\s+/g,' ').trim();
  return LANGUAGE_ALIAS_INDEX[raw] || raw;
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
    tab_fm: '📻 محطات البث', tab_fav: '⭐ المفضلة', tab_rel: '🕋 ديني', tab_ar: '🌍 عربي', tab_eg: '🇪🇬 مصر', tab_sdr: 'أجهزة الاستقبال SDR',
    featured_title: 'الأشهر عالميًا وعربيًا',
    home_grid_title: '🏛 الرسمية · 🇪🇬 مصر',
    player_status_connecting: 'جارٍ الاتصال…', player_status_live: '● يبث الآن', player_status_paused: '⏸ متوقف مؤقتًا', player_status_dead: '✖ المحطة غير متاحة',
    vol_aria: 'مستوى الصوت', mute_aria: 'كتم الصوت', prev_aria: 'المحطة السابقة', next_aria: 'المحطة التالية',
    search_fm_ph: 'ابحث بالاسم أو الدولة أو اللغة أو الفئة…', fm_search_aria:'البحث عن محطات الراديو', fm_search_input_aria:'ابحث باسم المحطة أو الدولة أو اللغة أو الفئة', search_country_aria:'ابحث عن دولة', select_country_aria:'اختر الدولة', search_language_aria:'ابحث عن لغة', select_language_aria:'اختر اللغة', search_category_aria:'ابحث عن فئة', select_category_aria:'اختر الفئة', filter_country:'الدولة', filter_language:'اللغة', filter_category:'الفئة', filter_rx_type:'نوع الاستقبال', filter_rx_type_aria:'اختر نوع الاستقبال', all_types:'الكل', kiwi_type:'KiwiSDR', websdr_type:'WebSDR', owrx_type:'OpenWebRX', fm_search_note:'البحث الفوري داخل الكتالوج المحمّل؛ «بحث مباشر» يجلب نتائج أحدث من المصدر.', search_country_ph:'ابحث عن دولة…', search_language_ph:'ابحث عن لغة…', search_tag_ph:'ابحث عن فئة…',
    all_countries: '🌍 كل الدول', all_languages: '🗣 كل اللغات', all_tags: '🏷 كل الفئات',
    live_search: 'بحث مباشر', clear_filters: 'مسح الفلاتر',
    install_aria: 'ثبّت التطبيق على جهازك', install_done: '✅ تم تثبيت التطبيق', install_ios_hint: 'على الآيفون: زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية» لتثبيت التطبيق', hero_play: '▶ شغّل آخر محطة', hero_play_aria: 'تشغيل آخر محطة استمعت إليها', alive_only: 'شغالة بس',
    saver_aria: 'وضع توفير البيانات — بث بجودة أخف', saver_on: '✅ توفير البيانات شغال — البث بأقل جودة', saver_off: '🔋 توفير البيانات متوقف', title_playing: '{n} ▶ | راديو أطلس', alt_title: 'محطات شغالة تشبهها:', quick_bar_aria: 'الأشهر — تشغيل سريع من أي صفحة',
    fm_hint: 'الرئيسية تعرض الأشهر والرسمية ومحطات مصر فقط — ابحث أو استخدم الفلاتر لتصفح الكتالوج الكامل (أكثر من 56 ألف محطة). زر «بحث مباشر» يستعلم لحظيًا من المصدر.',
    chip_all: '✨ الكل', chip_fav: '⭐ المفضلة', chip_arabic: '🎙 عربي', chip_news: '📰 أخبار', chip_quran: '🕌 قرآن', chip_sports: '⚽ رياضة', chip_music: '🎵 موسيقى',
    search_sdr_ph: 'ابحث: اسم، بلد، نداء…',
    all_bands: 'كل النطاقات', sort_snr: 'الأفضل SNR', sort_free: 'أكبر مساحة فاضية', sort_users: 'الأقل ازدحامًا', sort_name: 'الاسم', sort_near: 'الأقرب لي',
    online_only: 'أونلاين فقط', free_only: 'فيه مكان فاضي', snr_min: 'SNR ≥', https_only: 'شغال داخل التطبيق',
    sdr_hint: '🎧 الاستماع داخل التطبيق متاح لأجهزة HTTPS فقط (قيود أمان المتصفح) — الأجهزة التي على HTTP تفتح في نافذة جديدة.',
    no_band: 'غير محدد', no_data: 'لا توجد بيانات بعد.',
    no_match: 'مفيش نتائج مطابقة — جرب تخفف الفلاتر.',
    no_match_fm: 'مفيش محطات مطابقة — جرب فلتر أخف أو كلمة تانية.',
    searching_live: 'جاري البحث المباشر من المصدر…',
    live_failed: 'البحث المباشر فشل — استخدم الفلترة المحلية الفورية.',
    more_btn: 'عرض المزيد — باقي {n} محطة', results: '{n} نتيجة', stations: '{n} محطة', more_rx: 'عرض المزيد — باقي {n} جهاز', geo_fallback: 'موقعك مش متاح — الترتيب حسب المسافة من القاهرة',
    listen: '▶ استمع', listen_in_app: '🎧 استمع داخل التطبيق', open_ext: 'افتح الجهاز ↗', open_ext2: 'فتح خارجي ↗', close: '✕ إغلاق',
    wspr_title: 'نشاط الانتشار الفعلي — WSPR (آخر ساعتين)', wspr_hint: 'عدد إشارات WSPR المستلمة في كل نطاق مقياس مباشر لانفتاح النطاق — وأطول المسارات أوضح دليل على المسارات المفتوحة الآن.', websdr_title: 'أجهزة WebSDR', owrx_title: 'أجهزة OpenWebRX', satnogs_title: 'محطات SatNOGS الأرضية', satnogs_type: 'SatNOGS', tab_map: '🗺️ الخريطة', map_title: 'خريطة أجهزة الاستقبال العالمية', map_hint: 'توزيع أجهزة الاستقبال حول العالم — دوس على أي نقطة لفتح الجهاز في نافذة جديدة.', map_layer_kiwi: 'KiwiSDR', map_layer_websdr: 'WebSDR', map_layer_owrx: 'OpenWebRX', map_layer_satnogs: 'SatNOGS', map_layer_gray: 'الخط الرمادي', map_layer_aircraft: '✈️ الطائرات', map_layer_visitors: '🌍 الزوار', visitors_dot: '{n} زائر', visitor_lead_title: 'أكثر البلاد زيارةً', trending_title: '🔥 الأكثر سماعاً', map_count: '{n} جهاز على الخريطة',
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
    eibi_ph: 'ابحث في البث الحالي: اسم، تردد…', onair: 'بث على الهواء', eibi_band_aria: 'اختر نطاق البث',
    more_eibi: 'تُعرض أول 60 نتيجة — دقّق البحث لعرض المزيد.',
    visitors: 'إجمالي الزيارات', you_from: 'أنت تزور من',
    stream_ok: 'استجاب للبث في فحص التحديث الأخير', stream_dead: 'لم يستجب في فحص التحديث الأخير — ممكن يشتغل من متصفحك', chip_alive: '✔ شغال', chip_dead: '✖ لا يستجيب',
    stream_maybe: 'سيرفرنا مأقدرنش يوصله (بلوك جغرافي أو قيود شبكة) — لكن ممكن يشتغل عندك عادي، جرّبها', chip_maybe: '؟ جرّبها',
    kiwi_audio: '🎧 صوت مباشر (تجريبي)', kiwi_connecting: 'جاري الاتصال بالجهاز…', kiwi_live: 'يستقبل ✔', kiwi_failed: 'تعذر الصوت المباشر — فتحت واجهة الجهاز بدلاً منه', kiwi_freq: 'التردد (kHz)', kiwi_mode: 'الوضع', fav_hint: 'جميع المحطات المفضلة لديك في مكان واحد. يمكنك إدارة المفضلة من أي محطة عبر زر القلب ❤️.', eg_hint: 'كل إذاعات مصر من الكتالوج في مكان واحد — الاستماع مباشر من الموقع، والمحطات الرسمية والمنتقاة في الأول.', eg_source: 'إذاعات مصر الرسمية ↗', ar_hint: 'كل الإذاعات العربية من الكتالوج مجمعة حسب الدولة — الاستماع مباشر من الموقع، والمحطات الرسمية في الأول.', ar_count: '{n} إذاعة عربية · {c} دولة', ar_top: 'أول {n} محطة من {m}', rel_hint: 'كل المحطات الدينية من الكتالوج في مكان واحد — قرآن وبرامج دينية، والمحطات الرسمية في الأول.',
    toast_broken: 'تعذر تشغيل البث من الروابط المتاحة. جرّب الموقع الرسمي.', toast_tap_play:'اضغط تشغيل من مشغل الصوت لبدء البث.', open_official_site:'الموقع الرسمي ↗', fav_on: 'أضفتها للمفضلة ⭐', fav_off: 'شيلتها من المفضلة',
    share_aria: 'مشاركة رابط المحطة', share_copied: 'رابط المحطة اتنسخ ✔ — شاركه في أي مكان',
    random_aria: 'تشغيل محطة عشوائية من نتائج البحث الحالية', random_station: '🎲 محطة عشوائية', random_none: 'مفيش محطات https قابلة للتشغيل في النتائج الحالية — خفّف الفلاتر.', random_toast: '🎲 محطة عشوائية: {name}', report_aria: 'بلّغ عن محطة مش شغالة', report_title: 'محطة مش شغالة: {name}', report_body: 'رابط البث:\n{url}\n\nالمشكلة (وصف موجز):\n', report_toast: 'فتحنا صفحة البلاغ على GitHub — كمّل الوصف وابعت 🙏', dm_notice_title: 'بث إذاعات ماسبيرو', dm_notice_body: 'قناة ماسبيرو الرسمية على Dailymotion بتسمح بتشغيل بث الإذاعات من موقعها بس، فمش بنقدر نشغّلها داخل التطبيق. افتحها على Dailymotion في نافذة جديدة وهتبث معاك فورًا 🎧', dm_notice_btn: 'افتح البث على Dailymotion ↗',
    history_title: 'سجل الاستماع', history_aria: 'تشغيل من سجل الاستماع',
    sleep_aria: 'مؤقت النوم', sleep_set: '⏱ البث هيقف بعد {n} دقيقة', sleep_done: '⏱ خلص المؤقت — اتوقف البث', sleep_clear: '⏱ اتلغى مؤقت النوم',
    alarm_aria: 'منبه الراديو', alarm_title: '⏰ منبه الراديو', alarm_hint: 'المنبه يشغّل آخر محطة استمعت لها — الصفحة لازم تفضل مفتوحة.', alarm_station: 'المحطة: {name}', alarm_save: '✓ ضبط المنبه', alarm_clear: '✕ إلغاء المنبه', alarm_set: '⏰ المنبه اتحط على {time} — {name}', alarm_cleared: '⏰ اتلغى المنبه', alarm_fired: '⏰ دقّ المنبه — شغّلنا {name}', alarm_no_station: 'شغّل أي محطة الأول عشان المنبه يعرف يشغّلها.',
    palette_aria: 'بحث سريع (Ctrl+K)', palette_title: 'بحث سريع', palette_ph: 'ابحث: محطة، دولة، جهاز…', palette_none: 'مفيش نتائج مطابقة.', palette_hint: 'Enter يشغّل أول نتيجة · Esc للإغلاق', palette_kind_fm: 'بث', palette_kind_rx: 'استقبال',
    sources: 'المصادر:', offline_footer: 'تُحدَّث الإذاعات يوميًا وبيانات SDR كل ٦ ساعات.'
  },
  en: {
    locale: 'en-US', dateLocale: 'en', dir: 'ltr',
    doc_title: 'Radio Atlas — Global Reception Directory',
    app_title: '📻 Radio Atlas',
    tagline: 'Smart search directory for online receivers and broadcast stations',
    stat_total: 'Receivers', stat_online: 'Online now', stat_listeners: 'Current listeners', stat_updated: 'Updated',
    tab_fm: '📻 Broadcast stations', tab_fav: '⭐ Favorites', tab_rel: '🕋 Religious', tab_ar: '🌍 Arabic', tab_eg: '🇪🇬 Egypt', tab_sdr: 'SDR Receivers',
    featured_title: 'Most popular worldwide & Arabic',
    home_grid_title: '🏛 Official · 🇪🇬 Egypt',
    player_status_connecting: 'Connecting…', player_status_live: '● On air', player_status_paused: '⏸ Paused', player_status_dead: '✖ Station unavailable',
    vol_aria: 'Volume level', mute_aria: 'Mute', prev_aria: 'Previous station', next_aria: 'Next station',
    search_fm_ph: 'Search by station, country, language, or category…', fm_search_aria:'Search radio stations', fm_search_input_aria:'Search by station, country, language, or category', search_country_aria:'Search countries', select_country_aria:'Select a country', search_language_aria:'Search languages', select_language_aria:'Select a language', search_category_aria:'Search categories', select_category_aria:'Select a category', filter_rx_type_aria:'Select receiver type', filter_country:'Country', filter_language:'Language', filter_category:'Category', filter_rx_type:'Receiver type', all_types:'All', kiwi_type:'KiwiSDR', websdr_type:'WebSDR', owrx_type:'OpenWebRX', fm_search_note:'Instant search uses the loaded catalog; Live Search fetches fresher results from the source.', search_country_ph:'Search countries…', search_language_ph:'Search languages…', search_tag_ph:'Search categories…',
    all_countries: '🌍 All countries', all_languages: '🗣 All languages', all_tags: '🏷 All genres',
    live_search: 'Live search', clear_filters: 'Clear filters',
    install_aria: 'Install the app on your device', install_done: '✅ App installed', install_ios_hint: 'On iPhone: tap Share ⬆️ then "Add to Home Screen" to install the app', hero_play: '▶ Play last station', hero_play_aria: 'Play the last station you listened to', alive_only: 'Working only',
    saver_aria: 'Data saver mode — lighter stream quality', saver_on: '✅ Data saver on — streaming at the lowest quality', saver_off: '🔋 Data saver off', title_playing: '{n} ▶ | Radio Atlas', alt_title: 'Working stations like it:', quick_bar_aria: 'Most famous — quick play from any tab',
    fm_hint: 'Home shows only the most famous, official and Egyptian stations — search or use the filters to browse the full 56k+ catalog. Live Search queries the source in real time.',
    chip_all: '✨ All', chip_fav: '⭐ Favorites', chip_arabic: '🎙 Arabic', chip_news: '📰 News', chip_quran: '🕌 Quran', chip_sports: '⚽ Sports', chip_music: '🎵 Music',
    search_sdr_ph: 'Search: name, country, callsign…',
    all_bands: 'All bands', sort_snr: 'Best SNR', sort_free: 'Most free slots', sort_users: 'Least crowded', sort_name: 'Name', sort_near: 'Nearest to me',
    online_only: 'Online only', free_only: 'Has a free slot', snr_min: 'SNR ≥', https_only: 'Playable in-app',
    sdr_hint: '🎧 In-app listening works for HTTPS receivers only (browser security) — HTTP receivers open in a new window.',
    no_band: 'Unspecified', no_data: 'No data yet.',
    no_match: 'No matching results — try lighter filters.',
    no_match_fm: 'No matching stations — try a lighter filter or another keyword.',
    searching_live: 'Live search in progress…',
    live_failed: 'Live search failed — use the instant local filtering.',
    more_btn: 'Show more — {n} stations left', results: '{n} results', stations: '{n} stations', more_rx: 'Show more — {n} receivers left', geo_fallback: 'Location unavailable — sorted by distance from Cairo',
    listen: '▶ Listen', listen_in_app: '🎧 Listen in app', open_ext: 'Open receiver ↗', open_ext2: 'Open externally ↗', close: '✕ Close',
    wspr_title: 'Observed propagation — WSPR (last 2 hours)', wspr_hint: 'WSPR spots received per band directly measure how open each band is — the longest heard paths show the clearest open routes right now.', websdr_title: 'WebSDR receivers', owrx_title: 'OpenWebRX receivers', satnogs_title: 'SatNOGS ground stations', satnogs_type: 'SatNOGS', tab_map: '🗺️ Map', map_title: 'World receiver map', map_hint: 'Receiver locations worldwide — click any dot to open it in a new tab.', map_layer_kiwi: 'KiwiSDR', map_layer_websdr: 'WebSDR', map_layer_owrx: 'OpenWebRX', map_layer_satnogs: 'SatNOGS', map_layer_gray: 'Grayline', map_layer_aircraft: '✈️ Aircraft', map_layer_visitors: '🌍 Visitors', visitors_dot: '{n} visitors', visitor_lead_title: 'Top visiting countries', trending_title: '🔥 Trending now', map_count: '{n} receivers on the map',
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
    eibi_band_aria: 'Select broadcast band', all_bands: 'All bands',
    more_eibi: 'Showing the first 60 — refine your search to see more.',
    visitors: 'Total page views', you_from: 'You are visiting from',
    stream_ok: 'Responded in the latest refresh probe', stream_dead: 'Did not respond in the latest refresh probe — may still play in your browser', chip_alive: '✔ live', chip_dead: '✖ no reply',
    stream_maybe: 'Our probe could not reach it (geo or network block) — it may still play fine for you, give it a try', chip_maybe: '? Try it',
    kiwi_audio: '🎧 Direct audio (beta)', kiwi_connecting: 'Connecting to the receiver…', kiwi_live: 'Receiving ✔', kiwi_failed: 'Direct audio failed — opening the receiver web UI instead', kiwi_freq: 'Frequency (kHz)', kiwi_mode: 'Mode', fav_hint: 'All your favorite stations in one place. Manage favorites from any station using the heart button ❤️.', eg_hint: 'Every Egyptian station from the catalog in one place — plays in-app, official and curated stations first.', eg_source: 'Official Egyptian radio ↗', ar_hint: 'All Arabic radio from the catalog grouped by country — plays in-app, official stations first.', ar_count: '{n} Arabic stations · {c} countries', ar_top: 'First {n} of {m} stations', rel_hint: 'All religious stations from the catalog in one place — Quran and religious programming, official stations first.',
    toast_broken: 'The stream could not be played from available sources. Try the official website.', toast_tap_play:'Press Play in the audio controls to start the stream.', open_official_site:'Official website ↗', fav_on: 'Added to favorites ⭐', fav_off: 'Removed from favorites',
    share_aria: 'Share station link', share_copied: 'Station link copied ✔ — share it anywhere',
    random_aria: 'Play a random station from the current results', random_station: '🎲 Random station', random_none: 'No HTTPS-playable stations in the current results — try lighter filters.', random_toast: '🎲 Random station: {name}', report_aria: 'Report a broken station', report_title: 'Broken station: {name}', report_body: 'Stream URL:\n{url}\n\nWhat happened (short description):\n', report_toast: 'Opening a GitHub report — finish the description and submit 🙏', dm_notice_title: 'Maspero radios broadcast', dm_notice_body: 'Maspero\\u2019s official Dailymotion channel only allows playback on its own website, so the stream cannot run inside the app. Open it on Dailymotion in a new tab and it will play right away 🎧', dm_notice_btn: 'Open stream on Dailymotion ↗',
    history_title: 'Recently played', history_aria: 'Play from history',
    sleep_aria: 'Sleep timer', sleep_set: '⏱ Playback stops in {n} min', sleep_done: '⏱ Timer finished — playback stopped', sleep_clear: '⏱ Sleep timer cleared',
    alarm_aria: 'Radio alarm', alarm_title: '⏰ Radio alarm', alarm_hint: 'The alarm plays your last station — keep this page open.', alarm_station: 'Station: {name}', alarm_save: '✓ Set alarm', alarm_clear: '✕ Clear alarm', alarm_set: '⏰ Alarm set for {time} — {name}', alarm_cleared: '⏰ Alarm cleared', alarm_fired: '⏰ Alarm rang — playing {name}', alarm_no_station: 'Play any station first so the alarm has one to play.',
    palette_aria: 'Quick search (Ctrl+K)', palette_title: 'Quick search', palette_ph: 'Search: station, country, receiver…', palette_none: 'No matching results.', palette_hint: 'Enter plays the first result · Esc to close', palette_kind_fm: 'Broadcast', palette_kind_rx: 'Receiver',
    sources: 'Sources:', offline_footer: 'Stations refresh daily; SDR data refreshes every 6 hours.'
  }
};

var state = {
  lang: 'ar',
  theme: 'dark',
  favs: {},
  receivers: [],
  updated: null,
  geo: null,
  webLimits: { websdr: 150, owrx: 150, satnogs: 150 },
  filters: { q: '', band: 'all', sort: 'snr', onlineOnly: true, freeOnly: false, minSnr: 0, httpsOnly: false, rxType: 'all' },
  fm: [],
  fmFilters: { q: '', country: '', language: '', tag: '', chip: '' },
  fmLimit: FM_PAGE,
  fmLive: false,
  fmLiveRows: [],
  eibi: [],
  eibiQ: '',
  eibiBand: 'all',
  streamChecks: {},
  space: null,
  wspr: null,
  webSdrs: null,
  satnogs: null,
  landMap: null,
  mapLayers: { kiwi: true, websdr: true, owrx: true, satnogs: true, aircraft: true, visitors: true },
  grayline: true,
  currentName: '',
  activeTab: 'fm',
  aircraft: [],
  playbackStation: null,
  playbackSources: [],
  playbackIndex: 0,
  playbackGeneration: 0,
  playbackAttemptFailed: false,
  playerQueue: [],
  playerVolume: 100,
  playerMuted: false,
  dataSaver: false,
  history: [],
  palette: { results: [] }
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

/* Cloudflare Worker relay (see proxy/README.md). Empty until the worker is
   deployed; when set it becomes the last-resort playback source for streams
   that fail direct playback (CORS or geo blocks). */
var STREAM_PROXY = '';

function proxyStreamUrl(url) {
  if (!STREAM_PROXY || !url) return '';
  return STREAM_PROXY.replace(/\/+$/, '') + '/stream?url=' + encodeURIComponent(url);
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
  renderFav();
  renderEG();
  renderAR();
  renderRel();
  renderSpace();
  renderWspr();
  renderWebSdrs();
  renderSatnogs();
  renderHistory();
  renderMap();
  if (state.currentName && !$('player').hidden) {
    $('player-name').textContent = '▶ ' + state.currentName;
  }
  updateDocTitle();
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
  if (meta) meta.setAttribute('content', th === 'dark' ? '#0f0e13' : '#f7f2e9');
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
  renderFav();
  renderEG();
  renderAR();
  renderRel();
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
    gpsCoords: Array.isArray(r.gps) && r.gps.length === 2 ? [Number(r.gps[0]), Number(r.gps[1])] : null,
    band: r.band || '',
    loc: r.loc || '',
    antenna: r.antenna || '',
    extApi: r.ext_api == null ? 0 : (Number(r.ext_api) || 0),
    type: 'kiwi'
  };
}

function loadKiwi() {
  return fetchJSON('data/kiwisdr.json').then(function (data) {
    if (data && Array.isArray(data.receivers)) {
      state.receivers = data.receivers.map(normalizeRx);
      state.updated = data.updated;
      renderMap();
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

var CAIRO = { lat: 30.0444, lon: 31.2357 };
function havKm(a, b) {
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLon = (b.lon - a.lon) * rad;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(x)));
}
function ensureGeo(cb) {
  if (state.geo) return cb(state.geo);
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('ra-geo') || 'null'); } catch (e) { saved = null; }
  if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') { state.geo = saved; return cb(state.geo); }
  if (!navigator.geolocation) { state.geo = CAIRO; toast(t('geo_fallback')); return cb(state.geo); }
  navigator.geolocation.getCurrentPosition(function (p) {
    state.geo = { lat: p.coords.latitude, lon: p.coords.longitude };
    try { localStorage.setItem('ra-geo', JSON.stringify(state.geo)); } catch (e) {}
    cb(state.geo);
  }, function () {
    state.geo = CAIRO;
    toast(t('geo_fallback')); // fallback center
    cb(state.geo);
  }, { timeout: 8000 });
}

function applyFilters() {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var list = state.receivers.filter(function (r) {
    if (f.onlineOnly && !r.online) return false;
    if (f.httpsOnly && !r.https) return false;
    if (state.geo && r.gpsCoords) r.dist = havKm(state.geo, { lat: r.gpsCoords[0], lon: r.gpsCoords[1] }); else r.dist = null;
    if (f.band !== 'all' && (r.band || t('no_band')) !== f.band) return false;
    if (f.freeOnly && !(r.maxUsers > 0 && r.users < r.maxUsers)) return false;
    if (f.minSnr > 0 && !(r.snr != null && r.snr >= f.minSnr)) return false;
    if (q) {
      var hay = (r.name + ' ' + r.url + ' ' + r.band + ' ' + r.loc + ' ' + r.antenna).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    var rxType = f.rxType || 'all';
    if (rxType !== 'all') {
      if (rxType === 'kiwi' && r.type !== 'kiwi') return false;
      if (rxType === 'websdr' && r.type !== 'websdr') return false;
      if (rxType === 'owrx' && r.type !== 'owrx') return false;
    }
    return true;
  });
  list.sort(function (a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (f.sort === 'name') return a.name.localeCompare(b.name, state.lang);
    if (f.sort === 'near') {
      var da = a.dist == null ? Infinity : a.dist;
      var db = b.dist == null ? Infinity : b.dist;
      return da - db;
    }
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
  if (r.dist != null) chips += '<span class="chip">🧭 ' + fmtNum(r.dist) + ' km</span>';
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

var WSPR_BAND_LABELS = { '-1': '2200m', 0: '630m', 1: '160m', 3: '80m', 5: '60m', 7: '40m', 10: '30m', 14: '20m', 18: '17m', 21: '15m', 24: '12m', 28: '10m', 27: '11m', 40: '8m', 50: '6m', 70: '4m', 144: '2m', 430: '70cm', 432: '70cm', 1296: '23cm' };

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

function applyWebFilters(list) {
  var f = state.filters;
  var q = f.q.trim().toLowerCase();
  var rxType = f.rxType || 'all';
  return (list || []).filter(function (r) {
    if (f.httpsOnly && !r.https) return false;
    if (rxType !== 'all' && r.type !== rxType) return false;
    if (q) {
      var hay = (r.name + ' ' + (r.loc || '') + ' ' + r.url).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort(function (a, b) {
    var ha = a.https ? 1 : 0, hb = b.https ? 1 : 0;
    return hb - ha || a.name.localeCompare(b.name, state.lang);
  });
}

function renderWebSdrGrid(gridId, countId, panelId, list, kind) {
  var grid = $(gridId);
  var panel = $(panelId);
  if (!grid || !panel) return;
  if (!list || !list.length) { panel.hidden = true; return; }
  panel.hidden = false;
  var filtered = applyWebFilters(list);
  var limit = state.webLimits[kind];
  $(countId).textContent = t('results').replace('{n}', fmtNum(filtered.length));
  if (!filtered.length) { grid.innerHTML = '<div class="empty">' + esc(t('no_match')) + '</div>'; return; }
  grid.innerHTML = filtered.slice(0, limit).map(webSdrCard).join('') +
    (filtered.length > limit
      ? '<div class="more-wrap"><button class="btn ghost web-more" type="button" data-more-kind="' + esc(kind) + '">' + esc(t('more_rx').replace('{n}', fmtNum(filtered.length - limit))) + '</button></div>'
      : '');
}

function renderWebSdrs() {
  if (!state.webSdrs) return;
  renderWebSdrGrid('grid-websdr', 'websdr-count', 'websdr-panel', state.webSdrs.websdr, 'websdr');
  renderWebSdrGrid('grid-owrx', 'owrx-count', 'owrx-panel', state.webSdrs.openwebrx, 'owrx');
}

function loadWebSdrs() {
  return fetchJSON('data/web_sdrs.json').then(function (data) {
    if (data && (Array.isArray(data.websdr) || Array.isArray(data.openwebrx))) {
      (data.websdr || []).forEach(function (r) { r.type = 'websdr'; });
      (data.openwebrx || []).forEach(function (r) { r.type = 'owrx'; });
      state.webSdrs = data;
      renderWebSdrs();
      renderMap();
    }
  }).catch(function (e) {
    console.warn('web sdrs snapshot:', e);
  });
}

function renderSatnogs() {
  if (!state.satnogs) return;
  renderWebSdrGrid('grid-satnogs', 'satnogs-count', 'satnogs-panel', state.satnogs.stations, 'satnogs');
}

function loadSatnogs() {
  return fetchJSON('data/satnogs.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      data.stations.forEach(function (r) { r.type = 'satnogs'; });
      state.satnogs = data;
      renderSatnogs();
      renderMap();
    }
  }).catch(function (e) {
    console.warn('satnogs snapshot:', e);
  });
}

/* ================= Receiver world map ================= */

function mapXY(lat, lon) {
  var x = (Number(lon) + 180) / 360;
  var y = (90 - Number(lat)) / 180;
  return [Math.round(x * 7200) / 10, Math.round(y * 3600) / 10];
}

function mapTopoLand(topo) {
  if (!topo || !topo.transform || !Array.isArray(topo.arcs) || !topo.objects) return '';
  var tf = topo.transform;
  var sx = tf.scale[0], sy = tf.scale[1], tx = tf.translate[0], ty = tf.translate[1];
  var arcs = topo.arcs.map(function (arc) {
    var x = 0, y = 0;
    return arc.map(function (pt) {
      x += pt[0]; y += pt[1];
      return [x * sx + tx, y * sy + ty];
    });
  });
  function ringPath(indices) {
    var pts = [];
    indices.forEach(function (idx) {
      var rev = idx < 0;
      var a = arcs[rev ? ~idx : idx] || [];
      var seg = rev ? a.slice().reverse() : a;
      seg.forEach(function (p) {
        if (!pts.length || p[0] !== pts[pts.length - 1][0] || p[1] !== pts[pts.length - 1][1]) pts.push(p);
      });
    });
    if (pts.length < 3) return '';
    var d = 'M' + pts[0][0].toFixed(2) + ' ' + pts[0][1].toFixed(2);
    for (var i = 1; i < pts.length; i++) d += 'L' + pts[i][0].toFixed(2) + ' ' + pts[i][1].toFixed(2);
    return d + 'Z';
  }
  var dAll = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.type === 'Polygon') {
      (obj.arcs || []).forEach(function (r) { dAll.push(ringPath(r)); });
    } else if (obj.type === 'MultiPolygon') {
      (obj.arcs || []).forEach(function (poly) {
        poly.forEach(function (r) { dAll.push(ringPath(r)); });
      });
    } else if (obj.type === 'GeometryCollection') {
      (obj.geometries || []).forEach(walk);
    }
  }
  walk(topo.objects.land || topo.objects.countries);
  return dAll.join('');
}

function subSolar(d) {
  var start = Date.UTC(d.getUTCFullYear(), 0, 0);
  var day = Math.floor((d.getTime() - start) / 86400000);
  var decl = -23.44 * Math.cos((2 * Math.PI / 365) * (day + 10));
  var utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  var lon = -15 * (utcH - 12);
  while (lon <= -180) lon += 360;
  while (lon > 180) lon -= 360;
  return [decl, lon];
}

function mapNightPath() {
  var s = subSolar(new Date());
  var dec = s[0], lonSun = s[1];
  var rad = Math.PI / 180;
  var tanDec = Math.tan(dec * rad);
  var pts = [];
  for (var lon = -180; lon <= 180; lon += 3) {
    var t = -Math.cos((lon - lonSun) * rad) / tanDec;
    if (isNaN(t)) t = 0;
    pts.push(mapXY(Math.atan(t) / rad, lon));
  }
  var d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (var i = 1; i < pts.length; i++) d += 'L' + pts[i][0] + ' ' + pts[i][1];
  var edgeY = mapXY(dec >= 0 ? -90 : 90, 0)[1];
  d += 'L720 ' + edgeY + 'L0 ' + edgeY + 'Z';
  return { night: d, sun: mapXY(dec, lonSun) };
}

function mapItems() {
  var items = [];
  function push(layer, r, lat, lon) {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
    items.push({ layer: layer, name: r.name, loc: r.loc || '', url: r.url, lat: Number(lat), lon: Number(lon) });
  }
  if (state.mapLayers.kiwi) {
    (state.receivers || []).forEach(function (r) {
      if (r.gpsCoords) push('kiwi', r, r.gpsCoords[0], r.gpsCoords[1]);
    });
  }
  if (state.webSdrs && state.mapLayers.websdr) {
(state.webSdrs.websdr || []).forEach(function (r) { push('websdr', r, r.lat, r.lon); });
  }
  if (state.webSdrs && state.mapLayers.owrx) {
(state.webSdrs.openwebrx || []).forEach(function (r) { push('owrx', r, r.lat, r.lon); });
  }
  if (state.satnogs && state.mapLayers.satnogs) {
(state.satnogs.stations || []).forEach(function (r) { push('satnogs', r, r.lat, r.lng); });
  }
  return items;
}

var AIRCRAFT_APIS = ['https://api.adsb.lol', 'https://api.airplanes.live'];
var AIRCRAFT_RADIUS_NM = 250;
var lastAircraftFetch = 0;
/* Live ADS-B aircraft near the map center — community aggregators, no key, 1 req/min max */
function fetchAircraft() {
  var nowMs = Date.now();
  if (nowMs - lastAircraftFetch < 55000) return;
  lastAircraftFetch = nowMs;
  var g = state.geo || CAIRO;
  var i = 0;
  function attempt() {
    if (i >= AIRCRAFT_APIS.length) return;
    var base = AIRCRAFT_APIS[i++];
    fetch(base + '/v2/point/' + Number(g.lat).toFixed(2) + '/' + Number(g.lon).toFixed(2) + '/' + AIRCRAFT_RADIUS_NM, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !Array.isArray(j.ac)) { attempt(); return; }
        state.aircraft = j.ac.filter(function (a) {
          return a && typeof a.lat === 'number' && typeof a.lon === 'number';
        }).map(function (a) {
          var nm = (a.flight || a.r || a.hex || '').toString().trim();
          var det = [];
          if (a.alt_baro != null) det.push(fmtNum(a.alt_baro) + ' ft');
          if (a.gs != null) det.push(Math.round(a.gs) + ' kt');
          if (a.t) det.push(a.t);
          return { name: '✈️ ' + (nm || '?'), loc: det.join(' · '), lat: a.lat, lon: a.lon };
        });
        var ac = $('map-aircraft-count');
        if (ac) { ac.textContent = '✈️ ' + fmtNum(state.aircraft.length); ac.hidden = false; }
        if (state.activeTab === 'map') renderMap();
      })
      .catch(function () { attempt(); });
  }
  attempt();
}

function renderMap() {
  var wrap = $('map-wrap');
  if (!wrap) return;
  $('map-count').textContent = t('map_count').replace('{n}', fmtNum(mapItems().length));
  var items = mapItems();
  var land = mapTopoLand(state.landMap);
  var svg = '<svg id="map-svg" viewBox="0 0 720 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(t('map_title')) + '">';
  svg += '<rect class="map-sea" x="0" y="0" width="720" height="360"></rect>';
  if (land) svg += '<path class="map-land" d="' + land + '"></path>';
  if (state.grayline) {
    var g = mapNightPath();
    svg += '<path class="map-night" d="' + g.night + '"></path>';
    svg += '<circle class="map-sun" cx="' + g.sun[0] + '" cy="' + g.sun[1] + '" r="3"></circle>';
  }
  if (state.mapLayers.aircraft && state.activeTab === 'map') fetchAircraft();
  var nowD = new Date();
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var ck = $('map-clock');
  if (ck) ck.textContent = p2(nowD.getUTCHours()) + ':' + p2(nowD.getUTCMinutes()) + ' UTC';
  items.forEach(function (it, i) {
    var xy = mapXY(it.lat, it.lon);
    svg += '<circle class="map-dot map-dot-' + it.layer + '" data-map-idx="' + i + '" cx="' + xy[0] + '" cy="' + xy[1] + '" r="1.8"><title>' + esc(it.name + (it.loc ? ' — ' + it.loc : '')) + '</title></circle>';
  });
  if (state.aircraft && state.mapLayers.aircraft) {
    state.aircraft.forEach(function (a) {
      var axy = mapXY(a.lat, a.lon);
      svg += '<circle class="map-dot-aircraft" cx="' + axy[0] + '" cy="' + axy[1] + '" r="1.6"><title>' + esc(a.name + (a.loc ? ' — ' + a.loc : '')) + '</title></circle>';
    });
  }
  if (state.mapLayers.visitors) {
    var vheat = state.visitorHeat || visitorHeatCached() || {};
    state.visitorHeat = vheat;
    if (state.activeTab === 'map') fetchVisitorHeat();
    var vMax = 0;
    VISITOR_CC_POINTS.forEach(function (p) { if (Number(vheat[p.cc]) > vMax) vMax = Number(vheat[p.cc]); });
    if (vMax > 0) {
      VISITOR_CC_POINTS.forEach(function (p) {
        var vn = Number(vheat[p.cc]) || 0;
        var vr = visitorHeatDot(vn, vMax);
        if (!vr) return;
        var vxy = mapXY(p.lat, p.lon);
        svg += '<circle class="map-dot-visitors" cx="' + vxy[0] + '" cy="' + vxy[1] + '" r="' + vr + '"><title>' + esc(flagOf(p.cc) + ' ' + p.cc + ' — ' + t('visitors_dot').replace('{n}', fmtNum(vn))) + '</title></circle>';
      });
    }
  }
  svg += '</svg>';
  wrap.innerHTML = svg;
  renderVisitorLead();
}

function loadLand() {
  return fetchJSON('data/land_map.json').then(function (data) {
    if (data && data.topo) {
      state.landMap = data.topo;
      renderMap();
    }
  }).catch(function (e) {
    console.warn('land map snapshot:', e);
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
  var langItems=Object.keys(langs).map(function(k){
    return {value:k,count:langs[k],label:languageLabel(k)+' ('+langs[k]+')'};
  }).sort(function(a,b){ return b.count-a.count || a.value.localeCompare(b.value); });
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
function facetLiveApply(kind) {
  var search = $('fm-' + kind + '-search');
  if (!search) return;
  var q = normalizeSearchText(search.value);
  if (!q) {
    if (fmFacetAuto[kind]) { fmFacetAuto[kind] = false; state.fmFilters[kind] = ''; scheduleFMClientRender(); }
    return;
  }
  var opts = FACET_OPTIONS[kind] || [];
  var match = null;
  for (var i = 0; i < opts.length; i++) {
    var hay = opts[i].label + ' ' + opts[i].value + ' ' + (LANGUAGE_ALIASES[opts[i].value] || []).join(' ');
    if (normalizeSearchText(hay).indexOf(q) !== -1) { match = opts[i]; break; }
  }
  if (!match) {
    if (fmFacetAuto[kind]) { fmFacetAuto[kind] = false; state.fmFilters[kind] = ''; scheduleFMClientRender(); }
    return;
  }
  if (state.fmFilters[kind] !== match.value) {
    state.fmFilters[kind] = match.value;
    fmFacetAuto[kind] = true;
    var sel = $('fm-' + kind);
    if (sel) sel.value = match.value;
    scheduleFMClientRender();
  }
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
  if (s.language) chips += '<span class="chip">🗣 ' + esc(s.language.split(', ').filter(Boolean).map(languageLabel).join('، ')) + '</span>';
  var allTags=String(s.tags||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
  var isOfficial=isOfficialStation(s);
  if(isOfficial)chips+='<span class="chip official">🏛 '+esc(state.lang==='ar'?'رسمي':'Official')+'</span>';
  var check=state.streamChecks?state.streamChecks[s.url]:null;
  if(check&&check.alive)chips+='<span class="chip ok" title="'+esc(t('stream_ok'))+'">'+esc(t('chip_alive'))+'</span>';
  else if(check&&check.maybe_alive)chips+='<span class="chip maybe" title="'+esc(t('stream_maybe'))+'">'+esc(t('chip_maybe'))+'</span>';
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

function isHomeMode() {
  var f = state.fmFilters;
  return !f.q && !f.country && !f.language && !f.tag && !f.chip && !state.fmLive;
}

function homeList() {
  var seen = {};
  var feat = featuredList();
  for (var i = 0; i < feat.length; i++) seen[feat[i].url] = 1;
  var out = [];
  var st = state.fm || [];
  for (var j = 0; j < st.length; j++) {
    var s = st[j];
    if (seen[s.url]) continue;
    if (isOfficialStation(s) || s.cc === 'EG') { seen[s.url] = 1; out.push(s); }
  }
  out.sort(function (a, b) {
    if (isOfficialStation(a) !== isOfficialStation(b)) return isOfficialStation(a) ? -1 : 1;
    return 0;
  });
  return out;
}


function renderFM() {
renderFeatured();
renderQuickBar();
  var grid = $('grid-fm');
  var home = isHomeMode();
  var list = fmAliveSort(fmAliveFiltered(home ? homeList() : currentFMList()));
  state.playerQueue = list.filter(function (s) { return !!safeHttpsUrl(s.url); });
  var homeTitle = $('home-grid-title');
  if (homeTitle) homeTitle.hidden = !home;
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
  return fetchJSON('data/stations_head.json').then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      state.featuredCache = null;
      buildFMFacets();
      renderFM();
      renderFav();
      renderEG();
      renderAR();
      renderRel();
    }
  }).catch(function (e) {
    console.warn('stations head:', e);
  }).then(function () {
    return fetchJSON('data/stations.json');
  }).then(function (data) {
    if (data && Array.isArray(data.stations)) {
      state.fm = data.stations.map(normalizeFm).filter(function (s) { return s.cc !== 'IL'; });
      state.featuredCache = null;
      buildFMFacets();
    }
  }).catch(function (e) { console.warn('stations snapshot:', e); }).then(function () {
    renderFM();
    renderFav();
    renderEG();
    renderAR();
    renderRel();
    initTrending();
    initResume();
    loadStreamChecks();
    handleShareHash();
  });
}

function loadStreamChecks() {
  fetchJSON('data/stream_checks.json').then(function (d) {
    if (d && d.results) { state.streamChecks = d.results; renderFM(); renderEG(); renderAR(); renderRel(); }
  }).catch(function () {});
}

/* ================= Egypt radio ================= */

function egStations() {
  return state.fm.filter(function (s) { return s.cc === 'EG'; });
}

function egAliveRank(s) {
  var c = state.streamChecks ? state.streamChecks[s.url] : null;
  if (c && c.alive) return 0;
  if (c && c.maybe_alive) return 1;
  if (!c) return 2;
  return 3;
}

function fmAliveFiltered(list) {
  if (!state.fmFilters || !state.fmFilters.aliveOnly || !state.streamChecks) return list;
  return list.filter(function (s) {
    var c = state.streamChecks[s.url];
    return !!(c && (c.alive || c.maybe_alive));
  });
}

function fmAliveSort(list) {
  if (!state.streamChecks) return list;
  var any = false;
  for (var i = 0; i < list.length; i++) {
    if (state.streamChecks[list[i].url]) { any = true; break; }
  }
  if (!any) return list;
  return list.slice().sort(function (a, b) { return egAliveRank(a) - egAliveRank(b); });
}



function renderFav() {
  var grid = $('grid-fav');
  var favStations = [];
  for (var url in state.favs) {
    var s = stationByUrl(url);
    if (s) favStations.push(s);
  }
  $('fav-count').textContent = t('stations').replace('{n}', fmtNum(favStations.length));
  if (!favStations.length) {
    grid.innerHTML = '<div class="empty">' + esc(t('no_match_fm')) + '</div>';
    return;
  }
  var html = favStations.map(cardFm).join('');
  grid.innerHTML = html;
}
function renderEG() {
  var grid = $('grid-eg');
  if (!grid) return;
  var list = egStations();
  var count = $('eg-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  if (count) count.textContent = t('stations').replace('{n}', fmtNum(list.length));
  list.sort(function (a, b) {
    var oa = a.official ? 0 : 1, ob = b.official ? 0 : 1;
    if (oa !== ob) return oa - ob;
    var ra = egAliveRank(a), rb = egAliveRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name), 'ar');
  });
  grid.innerHTML = list.map(cardFm).join('');
}

/* ================= All-Arabic by country ================= */

var ARAB_COUNTRIES = [
  ['EG', 'مصر'], ['SA', 'السعودية'], ['MA', 'المغرب'], ['DZ', 'الجزائر'],
  ['TN', 'تونس'], ['AE', 'الإمارات'], ['LB', 'لبنان'], ['SY', 'سوريا'],
  ['IQ', 'العراق'], ['JO', 'الأردن'], ['QA', 'قطر'], ['YE', 'اليمن'],
  ['KW', 'الكويت'], ['BH', 'البحرين'], ['OM', 'عُمان'], ['PS', 'فلسطين'],
  ['LY', 'ليبيا'], ['SD', 'السودان'], ['SO', 'الصومال'], ['MR', 'موريتانيا'],
  ['KM', 'جزر القمر'], ['DJ', 'جيبوتي']
];
var AR_PER_COUNTRY = 30;

function flagOf(cc) {
  try {
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
  } catch (e) { return ''; }
}

function arabCountryName(cc) {
  for (var i = 0; i < ARAB_COUNTRIES.length; i++) {
    if (ARAB_COUNTRIES[i][0] === cc) return ARAB_COUNTRIES[i][1];
  }
  return cc;
}

function arabStations() {
  var set = {};
  for (var i = 0; i < ARAB_COUNTRIES.length; i++) set[ARAB_COUNTRIES[i][0]] = true;
  return state.fm.filter(function (s) { return !!set[s.cc]; });
}

function renderAR() {
  var grid = $('grid-ar');
  if (!grid) return;
  var list = arabStations();
  var count = $('ar-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  var groups = {};
  for (var i = 0; i < list.length; i++) {
    var cc = list[i].cc;
    if (!groups[cc]) groups[cc] = [];
    groups[cc].push(list[i]);
  }
  var order = Object.keys(groups).sort(function (a, b) {
    return groups[b].length - groups[a].length;
  });
  if (count) {
    count.textContent = t('ar_count').replace('{n}', fmtNum(list.length)).replace('{c}', fmtNum(order.length));
  }
  var html = '';
  for (var g = 0; g < order.length; g++) {
    var gcc = order[g];
    groups[gcc].sort(function (a, b) {
      var oa = a.official ? 0 : 1, ob = b.official ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return String(a.name).localeCompare(String(b.name));
    });
    var shown = groups[gcc].slice(0, AR_PER_COUNTRY);
    html += '<h2 class="ma-group">' + flagOf(gcc) + ' ' + esc(regionName(gcc, arabCountryName(gcc))) + ' · ' + fmtNum(groups[gcc].length) + '</h2>';
    html += shown.map(cardFm).join('');
    if (groups[gcc].length > shown.length) {
      html += '<p class="ma-count">' + esc(t('ar_top').replace('{n}', fmtNum(shown.length)).replace('{m}', fmtNum(groups[gcc].length))) + '</p>';
    }
  }
  grid.innerHTML = html;
}

/* ================= Religious radio ================= */

function isReligiousStation(s) {
  var cats = splitList(s.tags);
  if (cats.indexOf('quran') !== -1 || cats.indexOf('religion') !== -1) return true;
  return /(قرآن|قران|دين|ديني|قبط|إنجيل|quran|quraan|koran|islam|religio|christian|bible|gospel)/i.test(String(s.name || ''));
}

function renderRel() {
  var grid = $('grid-rel');
  if (!grid) return;
  var list = state.fm.filter(isReligiousStation);
  var count = $('rel-count');
  if (!list.length) {
    if (count) count.textContent = '';
    grid.innerHTML = '<div class="empty">' + esc(t('no_data')) + '</div>';
    return;
  }
  if (count) count.textContent = t('stations').replace('{n}', fmtNum(list.length));
  list.sort(function (a, b) {
    var oa = a.official ? 0 : 1, ob = b.official ? 0 : 1;
    if (oa !== ob) return oa - ob;
    var ra = egAliveRank(a), rb = egAliveRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name), state.lang);
  });
  grid.innerHTML = list.map(cardFm).join('');
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
  fmFacetAuto = {};
  ['country','language','tag'].forEach(function(kind){$('fm-'+kind+'-search').value='';filterFacetOptions(kind);});
  $('fm-country').value = '';
  $('fm-language').value = '';
  $('fm-tag').value = '';
  var aliveBox = $('alive-only');
  if (aliveBox) aliveBox.checked = false;
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
  var kpVal = Number(state.space.kp);
  var f107Val = Number(state.space.f107);
  if (state.space.kp != null && isFinite(kpVal)) vals += '<span class="chip">🧲 Kp ' + kpVal + '</span>';
  if (state.space.f107 != null && isFinite(f107Val)) vals += '<span class="chip">☀️ F10.7 ' + f107Val + ' sfu</span>';
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
  var band = state.eibiBand;
  var rows = state.eibi.filter(function (x) {
    if (band !== 'all') {
      var freq = x.f / 1000;
      if (band === '120' && (freq < 2300 || freq >= 2495)) return false;
      if (band === '90' && (freq < 3200 || freq >= 3400)) return false;
      if (band === '75' && (freq < 3900 || freq >= 4000)) return false;
      if (band === '60' && (freq < 4750 || freq >= 5060)) return false;
      if (band === '49' && (freq < 5900 || freq >= 6200)) return false;
      if (band === '41' && (freq < 7200 || freq >= 7600)) return false;
      if (band === '31' && (freq < 9400 || freq >= 9900)) return false;
      if (band === '25' && (freq < 11600 || freq >= 12100)) return false;
      if (band === '22' && (freq < 13570 || freq >= 13870)) return false;
      if (band === '19' && (freq < 15100 || freq >= 15800)) return false;
      if (band === '16' && (freq < 17480 || freq >= 17900)) return false;
      if (band === '15' && (freq < 18900 || freq >= 19020)) return false;
      if (band === '13' && (freq < 21450 || freq >= 21850)) return false;
      if (band === '11' && (freq < 25600 || freq >= 26100)) return false;
    }
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
  wireMediaSessionActions();
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
  // Every source failed — point the open-direct link back at the station's
  // real URL: when the failure is a CORS or geo block the stream often plays
  // fine opened directly in a new tab.
  var ext = $('player-ext');
  if (ext && state.playbackStation && state.playbackStation.url) {
    ext.href = state.playbackStation.url;
    ext.hidden = false;
  }
  setPlayerStatus('dead');
  renderPlayerAlternatives();
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
  if (isDataSaver()) {
    config.startLevel = 0;
    config.maxAutoLevelBitrate = 96000;
  }
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
  // The open-direct link must always point at the station's real URL, never
  // at our relay tier.
  if (ext) {
    var proxyBase = STREAM_PROXY ? STREAM_PROXY.replace(/\/+$/, '') : '';
    if (!proxyBase || baseUrl.indexOf(proxyBase) !== 0) ext.href = baseUrl;
    else if (state.playbackStation && state.playbackStation.url) ext.href = state.playbackStation.url;
    ext.hidden = false;
  }
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
/* ================= professional player controls ================= */

function applyVolume() {
  var a = $('audio');
  try { a.muted = state.playerMuted; a.volume = state.playerVolume / 100; } catch (e) {}
  var btn = $('vol-mute');
  if (btn) btn.textContent = (state.playerMuted || state.playerVolume === 0) ? '🔇' : (state.playerVolume < 40 ? '🔈' : '🔊');
}

function saveVolume() {
  try { localStorage.setItem('ra-vol', JSON.stringify({ v: state.playerVolume, m: state.playerMuted })); } catch (e) {}
}

function loadVolume() {
  try {
    var saved = JSON.parse(localStorage.getItem('ra-vol') || 'null');
    if (saved && typeof saved.v === 'number') {
      state.playerVolume = Math.max(0, Math.min(100, Math.round(saved.v)));
      state.playerMuted = !!saved.m;
    }
  } catch (e) {}
  var slider = $('vol-slider');
  if (slider) slider.value = String(state.playerVolume);
  applyVolume();
}

function toggleMute() {
  state.playerMuted = !state.playerMuted;
  saveVolume();
  applyVolume();
}

function setPlayerStatus(kind) {
  var el = $('player-status');
  if (!el) return;
  var key = { connecting: 'player_status_connecting', live: 'player_status_live', paused: 'player_status_paused', dead: 'player_status_dead' }[kind] || 'player_status_connecting';
  el.textContent = t(key);
  el.classList.toggle('dead', kind === 'dead');
}

function renderPlayerMeta() {
  var el = $('player-meta');
  if (!el) return;
  var s = state.playbackStation || {};
  var bits = [];
  if (s.cc) bits.push((flagOf(s.cc) || '') + ' ' + esc(regionName(s.cc, s.cc)));
  if (s.bitrate) bits.push(String(s.bitrate) + ' kbps');
  if (s.codec) bits.push(esc(String(s.codec).toUpperCase()));
  if (s.official) bits.push('🏛');
  if (!bits.length) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = bits.join(' · ');
  el.hidden = false;
}

function playStepStation(dir) {
  var list = (state.playerQueue && state.playerQueue.length) ? state.playerQueue : currentFMList().filter(function (s) { return !!safeHttpsUrl(s.url); });
  if (!list.length) { toast(t('random_none')); return; }
  var cur = state.playbackStation && state.playbackStation.url;
  var idx = -1;
  for (var i = 0; i < list.length; i++) { if (list[i].url === cur) { idx = i; break; } }
  var next = idx < 0 ? (dir > 0 ? 0 : list.length - 1) : (idx + dir + list.length) % list.length;
  var st = list[next];
  play(st.url, st.name);
}

function isDmEmbed(url) {
  return /dailymotion\.com\/(?:embed\/video\/|video\/|player(?:\/[a-z0-9]+)?\.html)/.test(String(url || ''));
}

function dmVideoUrl(url) {
  var m = String(url || '').match(/dailymotion\.com\/(?:embed\/video\/|video\/|player(?:\/[a-z0-9]+)?\.html\?video=)([a-z0-9]+)/i);
  return m ? 'https://www.dailymotion.com/video/' + m[1] : String(url || '');
}

function dmNoticeHtml(link) {
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  return '<!DOCTYPE html><html dir="rtl" lang="'
    + (state.lang === 'en' ? 'en' : 'ar')
    + '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>body{margin:0;font-family:Segoe UI,Tahoma,system-ui,sans-serif;background:#0f0e13;color:#f4f1e8;'
    + 'display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}'
    + '.box{max-width:430px;padding:26px 18px}h2{margin:0 0 12px;font-size:1.15rem;color:#d4af37;font-weight:700}'
    + 'p{margin:0 0 20px;line-height:1.9;color:#c9c2b2;font-size:.95rem}'
    + 'a.btn{display:inline-block;background:#d4af37;color:#1a1405;border-radius:10px;padding:12px 26px;'
    + 'text-decoration:none;font-weight:700;font-size:1rem}</style></head><body><div class="box">'
    + '<h2>📻 ' + esc(t('dm_notice_title')) + '</h2>'
    + '<p>' + esc(t('dm_notice_body')) + '</p>'
    + '<a class="btn" href="' + esc(link) + '" target="_blank" rel="noopener">▶ ' + esc(t('dm_notice_btn')) + '</a>'
    + '</div></body></html>';
}

function openDmNotice(url, name) {
  var link = dmVideoUrl(safeHttpsUrl(url));
  if (!/^https:\/\//.test(link)) { toast(t('toast_broken')); return; }
  $('sdr-modal-name').textContent = '📻 ' + (name || '');
  $('sdr-open-ext').href = link;
  previousSDRFocus = document.activeElement;
  $('sdr-frame').removeAttribute('src');
  try { $('sdr-frame').srcdoc = dmNoticeHtml(link); } catch (e) { $('sdr-frame').src = link; }
  $('sdr-modal').hidden = false;
  $('sdr-modal-close').focus();
}

function play(url, name) {
  url = safeHttpsUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  if (isDmEmbed(url)) {
    openDmNotice(url, name);
    pushHistory(url, name);
    try { history.replaceState(null, '', '#play=' + encodeURIComponent(url)); } catch (e) {}
    return;
  }
  var station = stationByUrl(url);
  if (!station) {
    for (var i = 0; i < state.fmLiveRows.length; i++) {
      if (state.fmLiveRows[i].url === url) { station = state.fmLiveRows[i]; break; }
    }
  }
  state.playbackStation = station || { name: name || '', url: url };
  var saverStation = pickSaverStation(state.playbackStation, url);
  state.playbackSources = [saverStation ? saverStation.url : url]
    .concat(state.playbackStation.fallbacks || [])
    .concat(saverStation ? [url] : [])
    .filter(function (source, index, list) {
    return !!source && list.indexOf(source) === index;
  });
  // Last-resort relay tier: some streams fail direct playback from the
  // browser (CORS or geo blocks) while our Cloudflare Worker relay can
  // still fetch them. Token-gated easybroadcast streams are skipped: their
  // loader signs the original playlist URL and would break through a proxy.
  var isEasyB = station && station.tokenEndpoint && station.tokenType === 'easy_b';
  var relayUrl = isEasyB ? '' : proxyStreamUrl(url);
  if (relayUrl && state.playbackSources.indexOf(relayUrl) === -1) {
    state.playbackSources.push(relayUrl);
  }
  state.playbackIndex = 0;
  state.playbackGeneration += 1;
  var generation = state.playbackGeneration;
  state.currentName = name || (station && station.name) || '';
  var altBox = $('player-alt');
  if (altBox) { altBox.hidden = true; altBox.innerHTML = ''; }
  $('player').hidden = false;
  $('player-name').textContent = '▶ ' + state.currentName;
  renderPlayerMeta();
  setPlayerStatus('connecting');
  updateDocTitle();
  renderQuickBar();
  applyVolume();
  startCurrentPlayback(generation);
  pushHistory(url, state.currentName);
  countStationPlay(url);
  try { localStorage.setItem('ra-last', JSON.stringify({ url: url, name: state.currentName })); } catch (e) {}
  setMedia(state.currentName);
  try { history.replaceState(null, '', '#play=' + encodeURIComponent(url)); } catch (e) {}
}


/* ================= listen history ================= */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('ra-history') || '[]') || []; } catch (e) { return []; }
}

function pushHistory(url, name) {
  if (!url) return;
  state.history = state.history.filter(function (h) { return h.url !== url; });
  state.history.unshift({ url: url, name: name || '' });
  if (state.history.length > 10) state.history.length = 10;
  try { localStorage.setItem('ra-history', JSON.stringify(state.history)); } catch (e) {}
  renderHistory();
}

function renderHistory() {
  var row = $('history-row');
  if (!row) return;
  if (!state.history.length) { row.hidden = true; row.innerHTML = ''; return; }
  var chips = '';
  state.history.slice(0, 10).forEach(function (h) {
    chips += '<button class="chip history-chip" type="button" data-history-url="' + esc(h.url) + '" data-history-name="' + esc(h.name) + '" aria-label="' + esc(t('history_aria')) + '">▶ ' + esc(h.name || h.url) + '</button>';
  });
  row.innerHTML = '<span class="history-label">' + esc(t('history_title')) + '</span>' + chips;
  row.hidden = false;
}

/* ================= sleep timer ================= */

var SLEEP_STEPS = [15, 30, 60];
var sleepIdx = -1;
var sleepEndsAt = 0;
var sleepTick = null;

function renderSleepBtn() {
  var btn = $('sleep-btn');
  if (!btn) return;
  if (!sleepEndsAt) { btn.textContent = '⏱'; btn.classList.remove('active'); return; }
  var left = Math.max(0, sleepEndsAt - Date.now());
  var m = Math.floor(left / 60000);
  var s = Math.floor((left % 60000) / 1000);
  btn.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
  btn.classList.add('active');
}

function stopSleepTimer(silent) {
  sleepIdx = -1;
  sleepEndsAt = 0;
  if (sleepTick) { clearInterval(sleepTick); sleepTick = null; }
  renderSleepBtn();
  if (!silent) toast(t('sleep_clear'));
}

function sleepCheck() {
  if (!sleepEndsAt) { stopSleepTimer(true); return; }
  if (Date.now() >= sleepEndsAt) {
    try { $('audio').pause(); } catch (e) {}
    stopSleepTimer(true);
    toast(t('sleep_done'));
    return;
  }
  renderSleepBtn();
}

function startSleepTimer(minutes) {
  sleepEndsAt = Date.now() + minutes * 60000;
  renderSleepBtn();
  if (sleepTick) clearInterval(sleepTick);
  sleepTick = setInterval(sleepCheck, 1000);
  toast(t('sleep_set').replace('{n}', minutes));
}

function toggleSleepTimer() {
  sleepIdx += 1;
  if (sleepIdx >= SLEEP_STEPS.length) { stopSleepTimer(false); return; }
  startSleepTimer(SLEEP_STEPS[sleepIdx]);
}

/* ================= radio alarm ================= */

var alarmTick = null;
var alarmLastFired = '';

function alarmState() {
  try { return JSON.parse(localStorage.getItem('ra-alarm') || 'null'); } catch (e) { return null; }
}

function renderAlarmBtn() {
  var btn = $('alarm-btn');
  if (!btn) return;
  var a = alarmState();
  btn.classList.toggle('active', !!a);
  btn.title = a ? t('alarm_aria') + ' — ' + a.time : t('alarm_aria');
}

function openAlarmModal() {
  var m = $('alarm-modal');
  if (!m) return;
  var a = alarmState();
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) {}
  $('alarm-station').textContent = t('alarm_station').replace('{name}', (a && a.name) || (last && last.name) || t('alarm_no_station'));
  $('alarm-time').value = (a && a.time) || '06:00';
  m.hidden = false;
  $('alarm-time').focus();
}

function closeAlarmModal() {
  var m = $('alarm-modal');
  if (m) m.hidden = true;
}

function saveAlarm() {
  var time = $('alarm-time').value || '';
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) {}
  if (!/^\d{2}:\d{2}$/.test(time) || !last || !safeHttpsUrl(last.url)) { toast(t('alarm_no_station')); return; }
  try { localStorage.setItem('ra-alarm', JSON.stringify({ time: time, url: last.url, name: last.name || '' })); } catch (e) {}
  closeAlarmModal();
  renderAlarmBtn();
  toast(t('alarm_set').replace('{time}', time).replace('{name}', last.name || ''));
}

function clearAlarm() {
  try { localStorage.removeItem('ra-alarm'); } catch (e) {}
  closeAlarmModal();
  renderAlarmBtn();
  toast(t('alarm_cleared'));
}

function checkAlarm() {
  var a = alarmState();
  if (!a || !a.time) return;
  var now = new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  var hhmm = p(now.getHours()) + ':' + p(now.getMinutes());
  if (hhmm !== a.time || alarmLastFired === now.toDateString()) return;
  alarmLastFired = now.toDateString();
  if (!safeHttpsUrl(a.url)) return;
  toast(t('alarm_fired').replace('{name}', a.name || ''));
  play(a.url, a.name || '');
}

/* ================= quick search palette (Ctrl+K) ================= */

var palettePrevFocus = null;

function paletteRows(q) {
  var nq = normalizeSearchText(q);
  var rows = [];
  var fm = state.fm;
  for (var i = 0; i < fm.length && rows.length < 12; i++) {
    var s = fm[i];
    if (!safeHttpsUrl(s.url)) continue;
    var hay = normalizeSearchText([s.name, s.language, s.tags, s.cc, regionName(s.cc, s.cc)].join(' '));
    if (!nq || hay.indexOf(nq) !== -1) rows.push({ kind: 'fm', name: s.name, url: s.url, sub: regionName(s.cc, s.cc) + (s.language ? ' · ' + s.language.split(', ').filter(Boolean).map(languageLabel).join('، ') : '') });
  }
  var rx = state.receivers;
  for (var j = 0; j < rx.length && rows.length < 12; j++) {
    var r = rx[j];
    if (!r.https) continue;
    var hayR = normalizeSearchText([r.name, r.loc, r.url].join(' '));
    if (!nq || hayR.indexOf(nq) !== -1) rows.push({ kind: 'rx', name: r.name, url: r.url, sub: r.loc || '' });
  }
  return rows;
}

function paletteRender() {
  var q = $('palette-q').value;
  var rows;
  if (!q.trim()) {
    rows = state.history.map(function (h) { return { kind: 'fm', name: h.name || h.url, url: h.url, sub: '' }; });
  } else {
    rows = paletteRows(q);
  }
  state.palette.results = rows;
  var list = $('palette-list');
  if (!rows.length) {
    list.innerHTML = '<div class="hint" style="text-align:center">' + esc(t('palette_none')) + '</div>';
    return;
  }
  var html = '';
  rows.forEach(function (r, i) {
    var kind = r.kind === 'fm' ? '📻 ' + t('palette_kind_fm') : '🛰 ' + t('palette_kind_rx');
    html += '<button class="pal-item" type="button" data-pal-idx="' + i + '">' +
      '<span class="pal-kind">' + esc(kind) + '</span>' +
      '<span class="pal-name">' + esc(r.name) + '</span>' +
      (r.sub ? '<span class="pal-sub">' + esc(r.sub) + '</span>' : '') +
      '</button>';
  });
  list.innerHTML = html;
}

function paletteOpen() {
  var m = $('palette-modal');
  if (!m) return;
  palettePrevFocus = document.activeElement;
  $('palette-q').value = '';
  state.palette.results = [];
  m.hidden = false;
  paletteRender();
  $('palette-q').focus();
}

function paletteClose() {
  var m = $('palette-modal');
  if (m) m.hidden = true;
  if (palettePrevFocus && typeof palettePrevFocus.focus === 'function') { try { palettePrevFocus.focus(); } catch (e) {} }
  palettePrevFocus = null;
}

function palettePlayFirst() {
  var r = (state.palette.results || [])[0];
  if (!r) return;
  if (r.kind === 'rx') openSDR(r.url, r.name); else play(r.url, r.name);
  paletteClose();
}

/* ================= player EQ animation (decorative) ================= */

var visRaf = null;
var visBars = null;

function visFrame() {
  var cv = $('player-vis');
  if (!cv || !cv.getContext) { visRaf = null; return; }
  var ctx = cv.getContext('2d');
  var w = cv.width, h = cv.height;
  if (!visBars) {
    visBars = [];
    for (var i = 0; i < 14; i++) visBars.push(Math.random());
  }
  ctx.clearRect(0, 0, w, h);
  var grad = ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, 'rgba(212,175,55,.35)');
  grad.addColorStop(1, '#d4af37');
  ctx.fillStyle = grad;
  var bw = w / visBars.length;
  for (var b = 0; b < visBars.length; b++) {
    visBars[b] += (Math.random() - 0.5) * 0.4;
    if (visBars[b] > 1) visBars[b] = 1;
    if (visBars[b] < 0.08) visBars[b] = 0.08 + Math.random() * 0.25;
    var bh = visBars[b] * (h - 2);
    ctx.fillRect(b * bw + 1, h - bh, Math.max(2, bw - 2), bh);
  }
  visRaf = requestAnimationFrame(visFrame);
}

function visStop() {
  if (visRaf) { cancelAnimationFrame(visRaf); visRaf = null; }
  var cv = $('player-vis');
  if (cv && cv.getContext) {
    try { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); } catch (e) {}
  }
}

/* ================= featured home row (most famous stations) ================= */

var FEATURED = [
  { m: ['قرآن الكريم'] },
  { m: ['محمد السادس'] },
  { m: ['مونت كارلو', 'monte carlo'] },
  { m: ['الجزيرة الصوتية'] },
  { m: ['dw عربي', 'دويتشه'] },
  { m: ['bbc arabic', 'بي بي سي'] },
  { m: ['راديو سوا', 'radio sawa'] },
  { m: ['شام'] },
  { m: ['alarabiya', 'العربية'] },
  { m: ['nile fm'] },
  { m: ['نوجوم', 'nogoum'] },
  { m: ['9090'] },
  { m: ['bbc world service'] },
  { m: ['france inter'] },
  { m: ['radio france internationale', 'rfi'] },
  { m: ['deutschlandfunk'] },
  { m: ['npo radio 1', 'npo 1'] },
  { m: ['fip'] },
  { m: ['europe 1'] },
  { m: ['radio swiss jazz'] },
  { m: ['radio paradise'] },
  { m: ['groove salad'] },
  { m: ['kbs world'] },
  { m: ['vatican', 'الفاتيكان'] }
];

function featuredList() {
  if (state.featuredCache) return state.featuredCache;
  var out = [];
  var seen = {};
  var st = state.fm || [];
  for (var i = 0; i < FEATURED.length; i++) {
    var pats = FEATURED[i].m;
    for (var j = 0; j < st.length; j++) {
      var s = st[j];
      if (seen[s.url]) continue;
      if (!safeHttpUrl(s.url) || !/^https:/i.test(s.url)) continue;
      var nm = String(s.name || '').toLowerCase();
      var hit = false;
      for (var k = 0; k < pats.length; k++) { if (nm.indexOf(pats[k].toLowerCase()) >= 0) { hit = true; break; } }
      if (!hit) continue;
      seen[s.url] = 1;
      out.push(s);
      break;
    }
  }
  state.featuredCache = out;
  return out;
}

function renderFeatured() {
  var wrap = $('featured-wrap');
  if (!wrap) return;
  var list = featuredList();
  if (!list.length) { wrap.hidden = true; return; }
  var html = '';
  for (var i = 0; i < list.length; i++) html += cardFm(list[i]);
  $('featured-row').innerHTML = html;
  wrap.hidden = false;
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
  try { $('sdr-frame').removeAttribute('srcdoc'); } catch (e) {}
  $('sdr-modal').hidden = true;
  if (previousSDRFocus && typeof previousSDRFocus.focus === 'function') previousSDRFocus.focus();
  previousSDRFocus = null;
}

function initResume() {
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !safeHttpsUrl(last.url)) return;
  if (isDmEmbed(last.url)) return;
  var station = stationByUrl(last.url);
  state.playbackStation = station || { name: last.name || '', url: last.url };
  state.playbackSources = [last.url].concat(state.playbackStation.fallbacks || []);
  var resumeRelay = (station && station.tokenEndpoint && station.tokenType === 'easy_b') ? '' : proxyStreamUrl(last.url);
  if (resumeRelay && state.playbackSources.indexOf(resumeRelay) === -1) {
    state.playbackSources.push(resumeRelay);
  }
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
    visStop();
    var ext = $('player-ext');
    var official = $('player-official');
    if (ext) ext.hidden = true;
    if (official) official.hidden = true;
    var altBox = $('player-alt');
    if (altBox) { altBox.hidden = true; altBox.innerHTML = ''; }
    $('player').hidden = true;
    setMediaPlaybackState('none');
    updateDocTitle();
    renderQuickBar();
  });
  $('vol-mute').addEventListener('click', toggleMute);
  $('vol-slider').addEventListener('input', function () {
    state.playerVolume = Math.max(0, Math.min(100, Number(this.value) || 0));
    if (state.playerVolume > 0) state.playerMuted = false;
    saveVolume();
    applyVolume();
  });
  $('player-prev').addEventListener('click', function () { playStepStation(-1); });
  $('player-next').addEventListener('click', function () { playStepStation(1); });
  var playerAltBox = $('player-alt');
  if (playerAltBox) playerAltBox.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.alt-chip') : null;
    if (!b) return;
    play(b.getAttribute('data-alt-url'), b.getAttribute('data-alt-name'));
  });
  loadVolume();
  $('sdr-modal-close').addEventListener('click', closeSDR);
  $('kiwi-modal-close').addEventListener('click', closeKiwiAudio);
  $('kiwi-freq').addEventListener('change', function () {
    if (kiwiWs && kiwiWs.readyState === 1) kiwiWs.send('SET freq ' + (Number(this.value) || 7100));
  });
  $('kiwi-mode').addEventListener('change', function () {
    if (kiwiWs && kiwiWs.readyState === 1) kiwiWs.send('SET mod ' + this.value);
  });
  $('audio').addEventListener('playing', function () {
    setPlayerStatus('live');
    setMediaPlaybackState('playing');
    if (!visRaf && !$('player-vis').hidden) visRaf = requestAnimationFrame(visFrame);
  });
  $('audio').addEventListener('pause', function () {
    setPlayerStatus('paused');
    setMediaPlaybackState('paused');
    visStop();
  });
  $('audio').addEventListener('waiting', function () { setPlayerStatus('connecting'); });
  $('audio').addEventListener('stalled', function () { setPlayerStatus('connecting'); });
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
      if (!$('palette-modal').hidden) paletteClose();
      if (!$('alarm-modal').hidden) closeAlarmModal();
    }
    var ptag = ((e.target && e.target.tagName) || '').toLowerCase();
    if (ptag === 'input' || ptag === 'select' || ptag === 'textarea') return;
    if ($('player').hidden) return;
    if (e.key === ' ' && ptag !== 'button') {
      e.preventDefault();
      try {
        var au = $('audio');
        if (au.paused) au.play().catch(function () {}); else au.pause();
      } catch (err) {}
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      state.playerVolume = Math.max(0, Math.min(100, state.playerVolume + (e.key === 'ArrowUp' ? 5 : -5)));
      if (state.playerVolume > 0) state.playerMuted = false;
      var sl = $('vol-slider');
      if (sl) sl.value = String(state.playerVolume);
      saveVolume();
      applyVolume();
      return;
    }
    if (e.key === 'ArrowLeft') { playStepStation(-1); return; }
    if (e.key === 'ArrowRight') { playStepStation(1); return; }
    if (e.key === 'm' || e.key === 'M') toggleMute();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.keyCode === 75)) {
      e.preventDefault();
      if ($('palette-modal').hidden) paletteOpen(); else paletteClose();
    }
  });
}

/* ================= visitor box ================= */

var visitorJsonpSequence = 0;
var ABACUS_BASE = 'https://abacus.jasoncameron.dev';
var ABACUS_NAMESPACE = 'radio-atlas';
var ABACUS_KEY = 'views';

function visitorCounterRequest(action, params, key) {
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
      encodeURIComponent(key || ABACUS_KEY) + (queryString ? '?' + queryString : '');
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

/* ---- visitor geography: country-level counts on the world map ---- */

var VISITOR_CC_POINTS = [
  { cc: 'EG', lat: 26.8, lon: 30.8 }, { cc: 'SA', lat: 24, lon: 45 },
  { cc: 'AE', lat: 24, lon: 54 }, { cc: 'KW', lat: 29.3, lon: 47.6 },
  { cc: 'QA', lat: 25.3, lon: 51.2 }, { cc: 'BH', lat: 26, lon: 50.55 },
  { cc: 'OM', lat: 21, lon: 57 }, { cc: 'JO', lat: 31.3, lon: 36.8 },
  { cc: 'LB', lat: 33.9, lon: 35.9 }, { cc: 'SY', lat: 35, lon: 38.5 },
  { cc: 'IQ', lat: 33, lon: 43.8 }, { cc: 'YE', lat: 15.5, lon: 48 },
  { cc: 'SD', lat: 15, lon: 30 }, { cc: 'LY', lat: 27, lon: 17 },
  { cc: 'DZ', lat: 28, lon: 2.7 }, { cc: 'TN', lat: 34, lon: 9.5 },
  { cc: 'MA', lat: 31.9, lon: -7 }, { cc: 'PS', lat: 31.9, lon: 35.2 },
  { cc: 'MR', lat: 20, lon: -10.5 }, { cc: 'SO', lat: 5, lon: 46 },
  { cc: 'DJ', lat: 11.5, lon: 43 }, { cc: 'KM', lat: -11.7, lon: 43.3 },
  { cc: 'US', lat: 39.8, lon: -98.6 }, { cc: 'CA', lat: 56, lon: -106 },
  { cc: 'GB', lat: 54, lon: -2 }, { cc: 'FR', lat: 46.6, lon: 2.4 },
  { cc: 'DE', lat: 51, lon: 10.4 }, { cc: 'NL', lat: 52.2, lon: 5.3 },
  { cc: 'ES', lat: 40.2, lon: -3.7 }, { cc: 'IT', lat: 42.8, lon: 12.6 },
  { cc: 'TR', lat: 39, lon: 35 }, { cc: 'RU', lat: 61, lon: 90 },
  { cc: 'SE', lat: 62, lon: 15 }, { cc: 'PL', lat: 52.2, lon: 19.1 },
  { cc: 'IN', lat: 21, lon: 78 }, { cc: 'PK', lat: 30, lon: 70 },
  { cc: 'ID', lat: -2, lon: 118 }, { cc: 'MY', lat: 4, lon: 102 },
  { cc: 'PH', lat: 12, lon: 122 }, { cc: 'JP', lat: 36.5, lon: 138 },
  { cc: 'CN', lat: 35, lon: 104 }, { cc: 'BR', lat: -10, lon: -52 },
  { cc: 'AU', lat: -25, lon: 134 }, { cc: 'ZA', lat: -29, lon: 25 },
  { cc: 'NG', lat: 9.5, lon: 8 }, { cc: 'KE', lat: 0.3, lon: 37.9 }
];
var VISITOR_GEO_CACHE_KEY = 'ra-visitor-geo';
var VISITOR_GEO_TTL = 30 * 24 * 3600 * 1000;
var VISITOR_HEAT_CACHE_KEY = 'ra-visitor-heat';
var VISITOR_HEAT_TTL = 24 * 3600 * 1000;
var visitorHeatBusy = false;
var visitorHeatLastTry = 0;

function visitorHeatDot(count, maxCount) {
  // Gold dot radius for the visitors map layer (0 = do not draw).
  var n = Number(count) || 0;
  var m = Number(maxCount) || 0;
  if (n <= 0 || m <= 0) return 0;
  return (2 + 6 * Math.sqrt(n / m)).toFixed(2);
}

function visitorLeadRows(vheat, limit) {
  // Top countries by visit count for the map leaderboard (pure helper).
  var rows = [];
  var src = vheat || {};
  for (var cc in src) {
    var n = Number(src[cc]) || 0;
    if (n > 0) rows.push({ cc: cc, n: n });
  }
  rows.sort(function (a, b) { return b.n - a.n; });
  return rows.slice(0, limit || 10);
}

function renderVisitorYou(cc, name, flag) {
  var el = $('visitor-you');
  if (!el) return;
  el.textContent = '';
  el.appendChild(document.createTextNode(t('you_from') + ' '));
  var b = document.createElement('b');
  b.textContent = (flag ? flag + ' ' : '') + (name || String(cc || '').toUpperCase());
  el.appendChild(b);
  el.hidden = false;
}

function countVisitorCountry(cc) {
  if (!cc || !/^[A-Z]{2}$/.test(cc)) return;
  visitorCounterRequest('hit', {}, 'views-' + cc)
    .catch(function (error) { console.warn('Radio Atlas visitor country counter:', error); });
}

function initVisitorGeo() {
  // Detect the visitor country (ipwho.is, CORS-open) and count the visit
  // under a per-country Abacus key for the map visitors layer.
  var cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(VISITOR_GEO_CACHE_KEY) || 'null');
  } catch (e) {}
  if (cached && cached.cc && Date.now() - Number(cached.ts || 0) < VISITOR_GEO_TTL) {
    renderVisitorYou(cached.cc, cached.name, cached.flag);
    countVisitorCountry(cached.cc);
    return;
  }
  fetchJSON('https://ipwho.is/')
    .then(function (j) {
      if (!j || !j.success || !j.country_code) throw new Error('geo lookup failed');
      var cc = String(j.country_code).toUpperCase().slice(0, 2);
      var name = String(j.country || cc);
      var flag = j.flag && j.flag.emoji ? String(j.flag.emoji) : flagOf(cc);
      try { localStorage.setItem(VISITOR_GEO_CACHE_KEY, JSON.stringify({ cc: cc, name: name, flag: flag, ts: Date.now() })); } catch (e) {}
      renderVisitorYou(cc, name, flag);
      countVisitorCountry(cc);
    })
    .catch(function (error) { console.warn('Radio Atlas visitor geo:', error); });
}

function visitorHeatCached() {
  try {
    var cached = JSON.parse(localStorage.getItem(VISITOR_HEAT_CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - Number(cached.ts || 0) < VISITOR_HEAT_TTL) return cached.data;
  } catch (e) {}
  return null;
}

function fetchVisitorHeat() {
  // Per-country visit counts for the map layer. One JSONP request every
  // 400ms respects the free Abacus rate limit; cached 24h in localStorage.
  var cached = visitorHeatCached();
  if (cached) { state.visitorHeat = cached; return; }
  if (visitorHeatBusy || Date.now() - visitorHeatLastTry < 600000) return;
  visitorHeatBusy = true;
  visitorHeatLastTry = Date.now();
  var merged = {};
  var chain = Promise.resolve();
  VISITOR_CC_POINTS.forEach(function (p, i) {
    chain = chain.then(function () {
      return visitorCounterRequest('get', {}, 'views-' + p.cc)
        .then(function (data) {
          var v = Number(data && data.value);
          if (Number.isFinite(v) && v > 0) merged[p.cc] = v;
        })
        .catch(function () {});
    });
    if (i < VISITOR_CC_POINTS.length - 1) {
      chain = chain.then(function () { return new Promise(function (r) { setTimeout(r, 400); }); });
    }
  });
  chain.then(function () {
    visitorHeatBusy = false;
    state.visitorHeat = merged;
    try { localStorage.setItem(VISITOR_HEAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: merged })); } catch (e) {}
    if (state.activeTab === 'map' && state.mapLayers.visitors) renderMap();
  });
}

function renderVisitorLead() {
  // Ranked "top visiting countries" box under the map (visitors layer).
  var el = $('visitor-lead');
  if (!el) return;
  var vheat = state.visitorHeat || visitorHeatCached() || {};
  var rows = visitorLeadRows(vheat, 10);
  if (!rows.length || !state.mapLayers.visitors) { el.hidden = true; el.innerHTML = ''; return; }
  var max = rows[0].n;
  var html = '<h3 class="vlead-title">' + esc(t('visitor_lead_title')) + '</h3>';
  rows.forEach(function (r, i) {
    var w = Math.max(8, Math.round(100 * r.n / max));
    html += '<div class="vlead-row"><span class="vlead-rank">' + (i + 1) + '</span><span class="vlead-flag">' + flagOf(r.cc) + '</span><span class="vlead-name">' + esc(regionName(r.cc, r.cc)) + '</span><span class="vlead-bar"><span class="vlead-fill" style="width:' + w + '%"></span></span><b class="vlead-count">' + fmtNum(r.n) + '</b></div>';
  });
  el.innerHTML = html;
  el.hidden = false;
}

/* ---- trending: per-station play counts (Abacus play-<host/path>) ---- */

var PLAY_HEAT_CACHE_KEY = 'ra-play-heat';
var PLAY_HEAT_TTL = 24 * 3600 * 1000;
var playHeatBusy = false;
var playHeatLastTry = 0;

function playCountKey(url) {
  // Stable short key for per-station play counting (host + path, no query).
  try {
    var u = new URL(url);
    return 'play-' + u.hostname.replace(/^www\./, '') + u.pathname;
  } catch (e) { return ''; }
}

function trendingList(candidates, counts, limit) {
  // Candidate stations ranked by play count (pure helper; zeros masked).
  var out = [];
  var list = candidates || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var k = playCountKey(s && s.url);
    var n = k ? Number(counts && counts[k]) || 0 : 0;
    if (n > 0) out.push({ station: s, n: n });
  }
  out.sort(function (a, b) { return b.n - a.n; });
  return out.slice(0, limit || 10);
}

function countStationPlay(url) {
  // Fire-and-forget: +1 on this station's Abacus play key.
  var key = playCountKey(url);
  if (!key) return;
  state.playHeat = state.playHeat || {};
  state.playHeat[key] = (Number(state.playHeat[key]) || 0) + 1;
  renderTrending();
  visitorCounterRequest('hit', {}, key)
    .catch(function (error) { console.warn('Radio Atlas play counter:', error); });
}

function playHeatCached() {
  try {
    var cached = JSON.parse(localStorage.getItem(PLAY_HEAT_CACHE_KEY) || 'null');
    if (cached && cached.data && Date.now() - Number(cached.ts || 0) < PLAY_HEAT_TTL) return cached.data;
  } catch (e) {}
  return null;
}

function fetchPlayHeat() {
  // Play counts for the trending shelf candidates (the featured list).
  // One JSONP get every 400ms respects the free Abacus rate limit; cached 24h.
  var cached = playHeatCached();
  if (cached) { state.playHeat = cached; renderTrending(); return; }
  if (playHeatBusy || Date.now() - playHeatLastTry < 600000) return;
  var candidates = featuredList();
  if (!candidates.length) return;
  playHeatBusy = true;
  playHeatLastTry = Date.now();
  var merged = {};
  var chain = Promise.resolve();
  candidates.forEach(function (s, i) {
    var key = playCountKey(s.url);
    if (!key) return;
    chain = chain.then(function () {
      return visitorCounterRequest('get', {}, key)
        .then(function (data) {
          var v = Number(data && data.value);
          if (Number.isFinite(v) && v > 0) merged[key] = v;
        })
        .catch(function () {});
    });
    if (i < candidates.length - 1) {
      chain = chain.then(function () { return new Promise(function (r) { setTimeout(r, 400); }); });
    }
  });
  chain.then(function () {
    playHeatBusy = false;
    state.playHeat = merged;
    try { localStorage.setItem(PLAY_HEAT_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: merged })); } catch (e) {}
    renderTrending();
  });
}

function renderTrending() {
  var wrap = $('trending-wrap');
  if (!wrap) return;
  var counts = state.playHeat || playHeatCached() || {};
  var rows = trendingList(featuredList(), counts, 10);
  if (!rows.length) { wrap.hidden = true; return; }
  var html = '';
  for (var i = 0; i < rows.length; i++) html += cardFm(rows[i].station);
  $('trending-row').innerHTML = html;
  wrap.hidden = false;
}

function initTrending() {
  // Called once the catalog is loaded: paint cached counts, refresh if stale.
  renderTrending();
  fetchPlayHeat();
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
  state.activeTab = x;
  if (x === 'map') renderMap();
  ['fm', 'fav', 'ar', 'rel', 'eg', 'sdr', 'map'].forEach(function (k) {
    var tab = $('tab-' + k);
    var panel = $('panel-' + k);
    if (tab) tab.classList.toggle('active', x === k);
    if (panel) panel.hidden = x !== k;
  });
}

/* ---- PWA install hint + hero quick-play ---- */
var deferredInstallPrompt = null;
function isStandalone() {
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  return window.navigator.standalone === true;
}
function initInstallButton() {
  var btn = $('install-btn');
  if (!btn || isStandalone()) return;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) btn.hidden = false;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', function () {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      Promise.resolve(deferredInstallPrompt.userChoice).then(function (res) {
        if (res && res.outcome === 'accepted') toast(t('install_done'));
      });
      return;
    }
    toast(t('install_ios_hint'));
  });
  window.addEventListener('appinstalled', function () {
    deferredInstallPrompt = null;
    btn.hidden = true;
    toast(t('install_done'));
  });
}
function initHeroPlay() {
  var btn = $('hero-play');
  if (!btn) return;
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { last = null; }
  if (!last || !last.url || isDmEmbed(last.url)) return;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    var cur = null;
    try { cur = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) { cur = null; }
    if (cur && cur.url && cur.name) play(cur.url, cur.name);
    else if (last.name) play(last.url, last.name);
    else play(last.url, '');
  });
}
/* ================= v54: listener experience pack — media session, data saver, failure alternatives, quick bar ================= */

var mediaSessionActionsBound = false;
function wireMediaSessionActions() {
  if (mediaSessionActionsBound || !('mediaSession' in navigator) || !navigator.mediaSession.setActionHandler) return;
  var audio = $('audio');
  var actions = {
    play: function () { try { audio.play(); } catch (e) {} },
    pause: function () { audio.pause(); },
    previoustrack: function () { playStepStation(-1); },
    nexttrack: function () { playStepStation(1); }
  };
  for (var key in actions) {
    try { navigator.mediaSession.setActionHandler(key, actions[key]); } catch (e) {}
  }
  mediaSessionActionsBound = true;
}
function setMediaPlaybackState(kind) {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = kind; } catch (e) {}
}
function updateDocTitle() {
  if (state.currentName && !$('player').hidden) {
    document.title = String(t('title_playing')).replace('{n}', state.currentName);
  } else {
    document.title = t('doc_title');
  }
}
function isDataSaver() { return state.dataSaver === true; }
function renderSaverBtn() {
  var btn = $('saver-btn');
  if (!btn) return;
  btn.classList.toggle('active', isDataSaver());
  btn.textContent = isDataSaver() ? '🪫' : '🔋';
}
function initSaverButton() {
  var btn = $('saver-btn');
  if (!btn) return;
  try { state.dataSaver = localStorage.getItem('ra-saver') === '1'; } catch (e) {}
  renderSaverBtn();
  btn.addEventListener('click', function () {
    state.dataSaver = !state.dataSaver;
    try { localStorage.setItem('ra-saver', state.dataSaver ? '1' : '0'); } catch (e) {}
    renderSaverBtn();
    toast(isDataSaver() ? t('saver_on') : t('saver_off'));
  });
}
function pickSaverStation(station, url) {
  if (!isDataSaver() || !station) return null;
  var curBit = Number(station.bitrate) || 0;
  if (!curBit || curBit <= 96000) return null;
  var nm = normalizeSearchText(station.name || '');
  if (!nm) return null;
  var fallback = null;
  var list = state.fm || [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (!s || s.url === url || !safeHttpsUrl(s.url) || !/^https:/i.test(s.url)) continue;
    if (normalizeSearchText(s.name || '') !== nm) continue;
    var b = Number(s.bitrate) || 0;
    if (!b || b >= curBit) continue;
    var c = state.streamChecks ? state.streamChecks[s.url] : null;
    if (c && c.alive) return s;
    if (!fallback) fallback = s;
  }
  return fallback;
}
function aliveAlternativeStations(limit) {
  var cur = state.playbackStation || {};
  var out = [];
  var seen = {};
  var list = state.fm || [];
  var cc = cur.cc || '';
  var myTags = String(cur.tags || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  for (var pass = 0; pass < 2 && out.length < limit; pass++) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || seen[s.url] || s.url === cur.url) continue;
      if (!safeHttpsUrl(s.url) || !/^https:/i.test(s.url)) continue;
      var c = state.streamChecks ? state.streamChecks[s.url] : null;
      if (!c || !c.alive) continue;
      if (pass === 0) {
        if (!cc || s.cc !== cc) continue;
      } else {
        var stTags = String(s.tags || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        var overlap = myTags.some(function (tg) { return stTags.indexOf(tg) !== -1; });
        if (!myTags.length || !overlap) continue;
      }
      seen[s.url] = 1;
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}
function renderPlayerAlternatives() {
  var box = $('player-alt');
  if (!box) return;
  var alts = aliveAlternativeStations(3);
  if (!alts.length) { box.hidden = true; box.innerHTML = ''; return; }
  var html = '<span class="alt-label">' + esc(t('alt_title')) + '</span>';
  for (var i = 0; i < alts.length; i++) {
    html += '<button class="chip alt-chip" type="button" data-alt-url="' + esc(alts[i].url) + '" data-alt-name="' + esc(alts[i].name || '') + '">▶ ' + esc(alts[i].name || '') + '</button>';
  }
  box.innerHTML = html;
  box.hidden = false;
}
var quickBarRenderedFor = null;
function renderQuickBar() {
  var bar = $('quick-bar');
  if (!bar) return;
  var row = $('quick-bar-row');
  if (!row) return;
  var list = featuredList().slice(0, 10);
  if (!list.length) { bar.hidden = true; return; }
  if (quickBarRenderedFor !== state.featuredCache) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<button class="qb-chip" type="button" data-qbu="' + esc(list[i].url) + '" data-qbn="' + esc(list[i].name || '') + '" title="' + esc(list[i].name || '') + '">▶ ' + esc(list[i].name || '') + '</button>';
    }
    row.innerHTML = html;
    quickBarRenderedFor = state.featuredCache;
  }
  bar.hidden = !$('player').hidden;
}

function initUI() {
  $('tab-fm').addEventListener('click', function () { switchTab('fm'); });
  $('tab-fav').addEventListener('click', function () { switchTab('fav'); });
  $('tab-ar').addEventListener('click', function () { switchTab('ar'); });
  $('tab-rel').addEventListener('click', function () { switchTab('rel'); });
  $('tab-eg').addEventListener('click', function () { switchTab('eg'); });
  $('tab-sdr').addEventListener('click', function () { switchTab('sdr'); });
  $('tab-map').addEventListener('click', function () { switchTab('map'); });

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
  var aliveOnlyBox = $('alive-only');
  if (aliveOnlyBox) aliveOnlyBox.addEventListener('change', function () {
    state.fmFilters.aliveOnly = this.checked;
    renderFM();
  });
  $('fm-clear-btn').addEventListener('click', clearFMFilters);
  $('fm-country').addEventListener('change',function(){fmFacetAuto.country=false;state.fmFilters.country=this.value;fmClientRender();});
  $('fm-language').addEventListener('change',function(){fmFacetAuto.language=false;state.fmFilters.language=this.value;fmClientRender();});
  $('fm-tag').addEventListener('change',function(){fmFacetAuto.tag=false;state.fmFilters.tag=this.value;fmClientRender();});
  ['country','language','tag'].forEach(function(kind){
    var search=$('fm-'+kind+'-search');
    if(search)search.addEventListener('input',function(){filterFacetOptions(kind);facetLiveApply(kind);});
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
    qTimer = setTimeout(function () { state.filters.q = v; renderSDR(); renderWebSdrs(); renderSatnogs(); }, 150);
  });
  $('band').addEventListener('change', function () { state.filters.band = this.value; renderSDR(); });
  $('sort').addEventListener('change', function () {
    state.filters.sort = this.value;
    if (this.value === 'near' && !state.geo) ensureGeo(function () { renderSDR(); });
    renderSDR();
  });
  $('online-only').addEventListener('change', function () { state.filters.onlineOnly = this.checked; renderSDR(); });
  $('free-only').addEventListener('change', function () { state.filters.freeOnly = this.checked; renderSDR(); });
  $('minsnr').addEventListener('change', function () { state.filters.minSnr = Number(this.value) || 0; renderSDR(); });
  $('https-only').addEventListener('change', function () { state.filters.httpsOnly = this.checked; renderSDR(); renderWebSdrs(); renderSatnogs(); });
  $('rx-type').addEventListener('change', function () { state.filters.rxType = this.value; renderSDR(); renderWebSdrs(); renderSatnogs(); });
  ['websdr', 'owrx', 'satnogs'].forEach(function (kind) {
    var g = $('grid-' + kind);
    if (g) g.addEventListener('click', function (e) {
      var el = e.target;
      if (el && el.closest && el.closest('.web-more')) { state.webLimits[kind] += 150; renderWebSdrs(); renderSatnogs(); }
    });
  });
  var alertBtn = $('space-alert-btn');
  if (alertBtn) alertBtn.addEventListener('click', toggleSpaceAlerts);
  var eibiSearch = $('eibi-q');
  if (eibiSearch) eibiSearch.addEventListener('input', function () { state.eibiQ = this.value; renderEibi(); });
  var mapWrap = $('map-wrap');
  if (mapWrap) mapWrap.addEventListener('click', function (e) {
    var dot = e.target && e.target.closest ? e.target.closest('.map-dot') : null;
    if (!dot) return;
    var it = mapItems()[Number(dot.getAttribute('data-map-idx'))];
    if (it && it.url && /^https?:/i.test(it.url)) window.open(it.url, '_blank', 'noopener');
  });
  var mapLayersBox = $('map-layers');
  if (mapLayersBox) mapLayersBox.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button.map-layer') : null;
    if (!btn) return;
    var k = btn.getAttribute('data-layer');
    if (k === 'gray') { state.grayline = !state.grayline; }
    else { state.mapLayers[k] = !state.mapLayers[k]; }
    if (k === 'aircraft' && state.mapLayers[k]) fetchAircraft();
    btn.classList.toggle('active', k === 'gray' ? state.grayline : state.mapLayers[k]);
    renderMap();
  });
  var historyRow = $('history-row');
  if (historyRow) historyRow.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.history-chip') : null;
    if (!b) return;
    play(b.getAttribute('data-history-url'), b.getAttribute('data-history-name'))
  });
  $('sleep-btn').addEventListener('click', toggleSleepTimer);
  $('alarm-btn').addEventListener('click', openAlarmModal);
  $('alarm-save').addEventListener('click', saveAlarm);
  $('alarm-clear').addEventListener('click', clearAlarm);
  $('alarm-close').addEventListener('click', closeAlarmModal);
  $('palette-btn').addEventListener('click', paletteOpen);
  $('palette-close').addEventListener('click', paletteClose);
  $('palette-q').addEventListener('input', function () { paletteRender(); });
  $('palette-q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); palettePlayFirst(); }
  });
  $('palette-list').addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.pal-item') : null;
    if (!b) return;
    var idx = Number(b.getAttribute('data-pal-idx'));
    var r = (state.palette.results || [])[idx];
    if (!r) return;
    if (r.kind === 'rx') openSDR(r.url, r.name); else play(r.url, r.name);
    paletteClose();
  });
  renderHistory();
  initInstallButton();
  initHeroPlay();
  initSaverButton();
  var qbRow = $('quick-bar-row');
  if (qbRow) qbRow.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button.qb-chip') : null;
    if (!b) return;
    play(b.getAttribute('data-qbu'), b.getAttribute('data-qbn'));
  });
  renderAlarmBtn();
  alarmTick = setInterval(checkAlarm, 15000);
  setInterval(function () { if (state.activeTab === 'map') renderMap(); }, 60000);
}

function init() {
  state.favs = loadFavs();
  state.history = loadHistory();
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
  loadSatnogs();
  loadLand();
  if (window.requestIdleCallback) {
    window.requestIdleCallback(function () { loadStations(); });
  } else {
    setTimeout(loadStations, 300);
  }
  initVisitorBox();
  initVisitorGeo();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
}

document.addEventListener('DOMContentLoaded', init);






