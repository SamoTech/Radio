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
var fmFacetAuto = {};

function cancelFMClientRender() {
  if (state.fmSearchDebounceTimer !== null) {
    clearTimeout(state.fmSearchDebounceTimer);
    state.fmSearchDebounceTimer = null;
  }
}

function scheduleFMClientRender() {
  cancelFMClientRender();
  state.fmSearchDebounceTimer = setTimeout(function () {
    state.fmSearchDebounceTimer = null;
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
  palette: { results: [] },
  streamProxy: '',
  ebTokenCache: {},
  fmSearchDebounceTimer: null,
  previousSDRFocus: null
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

function proxyStreamUrl(url) {
  if (!state.streamProxy || !url) return '';
  return state.streamProxy.replace(/\/+$/, '') + '/stream?url=' + encodeURIComponent(url);
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

/* ================= listen history ================= */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('ra-history') || '[]') || []; } catch (e) { return []; }
}

function isDmEmbed(url) {
  return /dailymotion\.com\/(?:embed\/video\/|video\/|player(?:\/[a-z0-9]+)?\.html)/.test(String(url || ''));
}

var CAIRO = { lat: 30.0444, lon: 31.2357 };
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

function loadStreamChecks() {
  fetchJSON('data/stream_checks.json').then(function (d) {
    if (d && d.results) { state.streamChecks = d.results; renderFM(); renderEG(); renderAR(); renderRel(); }
  }).catch(function () {});
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



function openSDR(url, name) {
  url = safeHttpsUrl(url);
  if (!url) { toast(t('toast_broken')); return; }
  $('sdr-modal-name').textContent = '🎧 ' + (name || '');
  $('sdr-open-ext').href = url;
  state.previousSDRFocus = document.activeElement;
  $('sdr-frame').src = url;
  $('sdr-modal').hidden = false;
  $('sdr-modal-close').focus();
}

function closeSDR() {
  $('sdr-frame').src = 'about:blank';
  try { $('sdr-frame').removeAttribute('srcdoc'); } catch (e) {}
  $('sdr-modal').hidden = true;
  if (state.previousSDRFocus && typeof state.previousSDRFocus.focus === 'function') state.previousSDRFocus.focus();
  state.previousSDRFocus = null;
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
  $('sdr-modal-close').addEventListener('click', closeSDR);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('sdr-modal').hidden) closeSDR();
      if (!$('kiwi-modal').hidden) closeKiwiAudio();
      if (!$('palette-modal').hidden) paletteClose();
      if (!$('alarm-modal').hidden) closeAlarmModal();
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.keyCode === 75)) {
      e.preventDefault();
      if ($('palette-modal').hidden) paletteOpen(); else paletteClose();
    }
  });
}
function switchTab(x) {
  state.activeTab = x;
  if (x === 'map') {
    if (mapApi) renderMap();
    else ensureMap().then(function (m) { m.mapTabOpened(); });
  } else if (x === 'sdr') {
    ensureSdr().then(function (m) { m.sdrTabOpened(); });
  } else if (x === 'fav' || x === 'ar' || x === 'rel' || x === 'eg') {
    var renderFn = { fav: 'renderFav', ar: 'renderAR', rel: 'renderRel', eg: 'renderEG' }[x];
    ensureCollections().then(function (m) { m[renderFn](); });
  }
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









/* ================= P1-2: lazy ES module loading ================= */
/* الوحدات الثقيلة (المشغل، SDR، الخريطة، الزوار، لوحة البحث، المجموعات،
   الكتالوج) بتتحمل ديناميكيًا عند أول استخدام — الزيارة الأولى تنزل
   النواة فقط (أقل من نص الحجم القديم)، والباقي عند الطلب. */

var playerApi = null, kiwiApi = null, mapApi = null, sdrApi = null;
var visitorsApi = null, paletteApi = null, collectionsApi = null, catalogApi = null;

function ensurePlayer() { return playerApi ? Promise.resolve(playerApi) : import('./modules/player.js').then(function (m) { playerApi = m; m.initPlayerUI(); return m; }); }
function ensureKiwi() { return kiwiApi ? Promise.resolve(kiwiApi) : import('./modules/kiwi.js').then(function (m) { kiwiApi = m; m.initKiwiUI(); return m; }); }
function ensureMap() { return mapApi ? Promise.resolve(mapApi) : import('./modules/map.js').then(function (m) { mapApi = m; return m; }); }
function ensureSdr() { return sdrApi ? Promise.resolve(sdrApi) : import('./modules/sdr.js').then(function (m) { sdrApi = m; return m; }); }
function ensureVisitors() { return visitorsApi ? Promise.resolve(visitorsApi) : import('./modules/visitors.js').then(function (m) { visitorsApi = m; return m; }); }
function ensurePalette() { return paletteApi ? Promise.resolve(paletteApi) : import('./modules/palette.js').then(function (m) { paletteApi = m; return m; }); }
function ensureCollections() { return collectionsApi ? Promise.resolve(collectionsApi) : import('./modules/collections.js').then(function (m) { collectionsApi = m; return m; }); }
function ensureCatalog() { return catalogApi ? Promise.resolve(catalogApi) : import('./modules/catalog.js').then(function (m) { catalogApi = m; return m; }); }

/* ---- مندوبات المشغل ---- */
function play(url, name) { ensurePlayer().then(function (m) { m.play(url, name); }); }
function playStepStation(dir) { ensurePlayer().then(function (m) { m.playStepStation(dir); }); }
function initResume() {
  var last = null;
  try { last = JSON.parse(localStorage.getItem('ra-last') || 'null'); } catch (e) {}
  if (!last || !last.url || !safeHttpsUrl(last.url) || isDmEmbed(last.url)) return;
  ensurePlayer().then(function (m) { m.initResume(); });
}
function renderHistory() { if (playerApi) playerApi.renderHistory(); }
function closeAlarmModal() { ensurePlayer().then(function (m) { m.closeAlarmModal(); }); }

/* ---- مندوبات SDR ---- */
function renderSDR() { if (sdrApi) sdrApi.renderSDR(); }
function renderWebSdrs() { if (sdrApi) sdrApi.renderWebSdrs(); }
function renderSatnogs() { if (sdrApi) sdrApi.renderSatnogs(); }
function renderWspr() { if (sdrApi) sdrApi.renderWspr(); }
function renderSpace() { if (sdrApi) sdrApi.renderSpace(); }
function renderEibi() { if (sdrApi) sdrApi.renderEibi(); }
function buildBandFilter() { if (sdrApi) sdrApi.buildBandFilter(); }
function toggleSpaceAlerts() { ensureSdr().then(function (m) { m.toggleSpaceAlerts(); }); }
function ensureGeo(cb) { ensureSdr().then(function (m) { m.ensureGeo(cb); }); }

/* ---- مندوبات الخريطة ---- */
function renderMap() { if (mapApi) mapApi.renderMap(); }
function mapItems() { return mapApi ? mapApi.mapItems() : []; }
function fetchAircraft() { if (mapApi) mapApi.fetchAircraft(); }

/* ---- مندوبات الزوار والترند ---- */
function initVisitorBox() { ensureVisitors().then(function (m) { m.initVisitorBox(); }); }
function initVisitorGeo() { ensureVisitors().then(function (m) { m.initVisitorGeo(); }); }
function initTrending() { ensureVisitors().then(function (m) { m.initTrending(); }); }
function countStationPlay(url) { ensureVisitors().then(function (m) { m.countStationPlay(url); }); }
function reportPlaybackError(gen, reason) { ensureVisitors().then(function (m) { m.reportPlaybackError(gen, reason); }); }

/* ---- مندوبات لوحة البحث (Ctrl+K) ---- */
function paletteOpen() { ensurePalette().then(function (m) { m.paletteOpen(); }); }
function paletteClose() { ensurePalette().then(function (m) { m.paletteClose(); }); }
function paletteRender() { if (paletteApi) paletteApi.paletteRender(); }
function palettePlayFirst() { if (paletteApi) paletteApi.palettePlayFirst(); }

/* ---- مندوبات المجموعات (المفضلة/عربي/ديني/مصر) ---- */
function renderFav() { if (collectionsApi) collectionsApi.renderFav(); }
function renderEG() { if (collectionsApi) collectionsApi.renderEG(); }
function renderAR() { if (collectionsApi) collectionsApi.renderAR(); }
function renderRel() { if (collectionsApi) collectionsApi.renderRel(); }

/* ---- مندوبات الكتالوج ---- */
function loadStations() { ensureCatalog().then(function (m) { m.loadStations(); }); }

/* ---- مندوبات Kiwi WebAudio ---- */
function openKiwiAudio(url, name) { ensureKiwi().then(function (m) { m.openKiwiAudio(url, name); }); }
function closeKiwiAudio() { ensureKiwi().then(function (m) { m.closeKiwiAudio(); }); }

export {
  state, $, t, esc, toast, fetchJSON, fmtNum, fmtDate,
  safeHttpUrl, safeHttpsUrl, proxyStreamUrl, stationByUrl,
  normalizeSearchText, normalizeFm, canonicalLanguage, languageLabel,
  regionName, flagOf, cardFm, splitList, egAliveRank, fmAliveFiltered, fmAliveSort,
  currentFMList, homeList, featuredList, FACET_OPTIONS,
  isDmEmbed, isDataSaver, renderSaverBtn, initSaverButton, updateDocTitle,
  renderQuickBar, loadHistory, loadStreamChecks, CAIRO,
  buildFMFacets, renderFM, filterFM, fmClientRender, searchFM,
  scheduleFMClientRender, cancelFMClientRender,
  play, playStepStation, initResume, renderHistory, closeAlarmModal,
  renderSDR, renderWebSdrs, renderSatnogs, renderWspr, renderSpace, renderEibi,
  buildBandFilter, toggleSpaceAlerts, ensureGeo,
  renderMap, mapItems, fetchAircraft,
  initVisitorBox, initVisitorGeo, initTrending, countStationPlay, reportPlaybackError,
  paletteOpen, paletteClose, paletteRender, palettePlayFirst,
  renderFav, renderEG, renderAR, renderRel,
  loadStations, openKiwiAudio, closeKiwiAudio, openSDR, closeSDR,
  setLang, switchTab, isOfficialStation
};
