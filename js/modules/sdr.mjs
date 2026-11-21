import {OpenWebRxClient} from './openwebrx-native.mjs';
import {validateReceiverUrl, nativeKiwiAllowed, nativeOpenWebRxAllowed, receiverProfile, receiverCatalog, resolveCatalogReceiver} from './sdr-adapters.mjs';

/* =====================================================================
   Radio Atlas — sdr module (KiwiSDR / WebSDR / WSPR / space weather / EIBI panels)
   Split out of js/app.js in P1-2; loaded lazily via loadModule('sdr').
   Reuses the globals of js/app.js (classic script). ES modules run in strict
   mode: every assignment below targets a declared or inherited binding.
   ===================================================================== */


var STR_SDR = {
  ar: {
    direct_title: 'راديو مباشر من الجهاز',
    direct_hint: 'اختار جهازًا وشغّله هنا. الأجهزة المرشحة مش ضمان اتصال؛ علامة الصوت بتظهر بعد استقبال صوت فعلي في الجلسة دي.',
    direct_candidate: 'مرشح للتشغيل — لسه ما اتجربش',
    direct_verified: 'صوت اتأكد في الجلسة دي',
    direct_failed: 'آخر محاولة اتصال لم تكتمل',
    direct_verified_only: 'الأجهزة اللي استقبلت صوت في الجلسة دي بس',
    direct_start: 'تشغيل مباشر',
    direct_more: 'أجهزة مباشرة أكتر',
    direct_empty: 'مفيش أجهزة مباشرة مطابقة. غيّر البحث أو جرّب جهازًا من القائمة.',
    direct_catalog: 'كل الأدلة والواجهات الأصلية',
    owrx_title: 'راديو OpenWebRX مباشر',
    owrx_hint: 'استقبال صوت وضبط مباشر من الجهاز. النطاقات والأوضاع المتاحة يحددها صاحب الجهاز.',
    owrx_profile: 'الجهاز / النطاق المتاح',
    owrx_wait_config: 'جاري قراءة نطاقات الجهاز…',
    owrx_wait_audio: 'تم الاتصال — في انتظار الصوت…',
    owrx_live: 'استقبال صوت مباشر',
    owrx_failed: 'الاتصال لم يكتمل',
    owrx_invalid: 'اختار ترددًا داخل نطاق الجهاز ووضعًا متاحًا.',
    owrx_range: 'نطاق الضبط الحالي',
    owrx_spectrum: 'طيف فعلي مستلم من الجهاز',
    owrx_no_spectrum: 'الطيف يظهر لو الجهاز أرسل بياناته.',
    owrx_session: 'بيانات الجلسة',
    owrx_disconnect: 'فصل الاتصال',
    owrx_no_profiles: 'بانتظار بيانات الجهاز',
    owrx_unsupported: 'التشغيل المباشر متاح لأجهزة OpenWebRX الآمنة الموجودة في الدليل؛ الأجهزة التانية لها واجهة أصلية منفصلة.',
    owrx_frequency: 'التردد (kHz)',
    owrx_original: 'واجهة أصلية إضافية ↗',
    owrx_no_audio: 'الجهاز لم يرسل صوتًا خلال المهلة. جرّب إعادة الاتصال أو جهازًا تانيًا.',

    sdr_workspace: 'مساحة أجهزة الاستقبال',
    sdr_open_workspace: 'افتح مساحة الجهاز',
    sdr_choose: 'اختار جهازًا من كل الأدلة',
    sdr_prev: 'السابق',
    sdr_next: 'التالي',
    sdr_reload: 'إعادة تحميل الواجهة',
    sdr_native: 'صوت Kiwi داخل التطبيق',
    sdr_original: 'واجهة الجهاز الأصلية ↗',
    sdr_capabilities: 'إمكانيات الواجهة الأصلية حسب إعدادات صاحب الجهاز',
    sdr_embed_hint: 'واجهة الجهاز الأصلية. ابدأ الصوت واضبط الاستقبال من أدوات الجهاز؛ بعض الأجهزة تحتاج الفتح في تبويب مستقل.',
    sdr_http_hint: 'افتح واجهة الجهاز الأصلية في تبويب مستقل لاستخدام أدوات الاستقبال المتاحة.',
    sdr_satnogs_hint: 'صفحة محطة وأرصاد أقمار صناعية، وليست جهازًا صوتيًا قابلًا للضبط المباشر. افتح شبكة SatNOGS للأرصاد والبيانات المتاحة.',
    sdr_unknown_hint: 'نوع الجهاز غير معروف؛ تتاح الصفحة الأصلية فقط دون افتراض بروتوكول أو إمكانيات.',
    sdr_invalid: 'الرابط غير آمن أو غير موجود في دليل أجهزة الاستقبال.',
    sdr_loading: 'جاري فتح واجهة الجهاز…',
    sdr_loaded: 'ابدأ الصوت من أدوات الجهاز. لو الواجهة ما ظهرتش، افتح صفحته الأصلية.',
    sdr_frame_wait: 'لم نتأكد من عرض الواجهة. قد يمنع الجهاز التضمين؛ جرّب فتح واجهته الأصلية.',
    sdr_external_ready: 'واجهة خارجية فقط — اضغط «واجهة الجهاز الأصلية» للمتابعة.',
    sdr_feature_tuning: 'ضبط التردد والأوضاع',
    sdr_feature_waterfall: 'الشلال الطيفي',
    sdr_feature_extensions: 'ملحقات Kiwi',
    sdr_feature_recording: 'أدوات الاستقبال والتسجيل إن توفرت',
    sdr_feature_profiles: 'ملفات الأجهزة والنطاقات',
    sdr_feature_digital: 'فك الإشارات الرقمية إن توفر',
    sdr_feature_observations: 'أرصاد وبيانات مسجلة',
    sdr_feature_satellites: 'جدولة ومتابعة الأقمار',
    sdr_unavailable_native: 'صوت Kiwi يحتاج جهازًا متاحًا، غير ممتلئ، مع سماح ext_api.',
    sdr_frame_title: 'واجهة جهاز الاستقبال الأصلية',
    sdr_provider: 'نظام الاستقبال',

    sdr_filters: 'فلاتر الاستقبال المتقدمة',
    sdr_tools: 'حالة النطاقات وجداول البث',
    search_sdr_ph: 'ابحث: اسم، بلد، نداء…',
    search_sdr_aria: 'البحث في أجهزة الاستقبال',
    all_bands: 'كل النطاقات',
    sort_snr: 'الأفضل SNR',
    sort_free: 'أكبر مساحة فاضية',
    sort_users: 'الأقل ازدحامًا',
    sort_name: 'الاسم',
    sort_near: 'الأقرب لي',
    online_only: 'أونلاين فقط',
    free_only: 'فيه مكان فاضي',
    snr_min: 'SNR ≥',
    https_only: 'شغال داخل التطبيق',
    sdr_hint: '🎧 شغّل أجهزة KiwiSDR المسموح بها مباشرة من راديو أطلس. أجهزة HTTP تحتاج وسيط WebSocket منشور؛ وضع التشغيل يظهر بوضوح لكل جهاز.',
    no_band: 'غير محدد',
    no_match: 'مفيش نتائج مطابقة — جرب تخفف الفلاتر.',
    results: '{n} نتيجة',
    more_rx: 'عرض المزيد — باقي {n} جهاز',
    geo_fallback: 'موقعك مش متاح — الترتيب حسب المسافة من القاهرة',
    listen_in_app: '🎧 استمع داخل التطبيق',
    open_ext: 'افتح الجهاز ↗',
    wspr_title: 'نشاط الانتشار الفعلي — WSPR (آخر ساعتين)',
    wspr_hint: 'عدد إشارات WSPR المستلمة في كل نطاق مقياس مباشر لانفتاح النطاق — وأطول المسارات أوضح دليل على المسارات المفتوحة الآن.',
    websdr_title: 'أجهزة WebSDR',
    owrx_title: 'أجهزة OpenWebRX',
    satnogs_title: 'محطات SatNOGS الأرضية',
    satnogs_type: 'SatNOGS',
    space_title: 'حالة النطاقات (بيانات NOAA SWPC)',
    updated_at: 'آخر تحديث',
    cond_good: 'الظروف مستقرة — النطاقات العليا (14–28 MHz) غالبًا مفتوحة.',
    cond_unstable: 'اضطراب متوسط — استقبل النطاقات المنخفضة (3–10 MHz).',
    cond_storm: 'عاصفة مغناطيسية — النطاقات العليا مغلقة والمسارات القطبية مشوشة.',
    alert_aria: 'تنبيهات حالة النطاقات',
    alert_unsupported: 'المتصفح ده مش بيدعم الإشعارات',
    alert_on: '🔔 التنبيهات شغالة — هنبلغك لما ظروف الاستقبال تتغير',
    alert_off: '🔕 التنبيهات مقفولة',
    alert_open_title: 'النطاقات العالية اتفتحت 🔥',
    alert_open_body: 'Kp {kp} — ظروف ممتازة للنطاقات العالية (14–28 MHz). فرصتك تسدّق دلوقتي!',
    alert_storm_title: 'عاصفة مغناطيسية ⛈',
    alert_storm_body: 'Kp {kp} — النطاقات العليا اتقفلت؛ استقبل النطاقات المنخفضة (3–10 MHz).',
    alert_toast_open: 'النطاقات اتفتحت (Kp {kp}) — ظروف ممتازة للنطاقات العالية 🔥',
    alert_toast_storm: 'عاصفة مغناطيسية (Kp {kp}) — النطاقات العليا مقفولة ⛈',
    eibi_title: 'بث موجات قصيرة على الهواء الآن',
    eibi_hint: 'من جدول EIBI — ترددات تُبث الآن (UTC). قرّب التردد على أي جهاز استقبال بالأسفل لسماعه.',
    eibi_ph: 'ابحث في البث الحالي: اسم، تردد…',
    onair: 'بث على الهواء',
    eibi_band_aria: 'اختر نطاق البث',
    eibi_search_aria: 'ابحث في بث الموجات القصيرة الجاري',
    more_eibi: 'تُعرض أول 60 نتيجة — دقّق البحث لعرض المزيد.',
    kiwi_audio: '🎧 صوت مباشر (تجريبي)',
    kiwi_connecting: 'جاري الاتصال بالجهاز…',
    kiwi_live: 'يستقبل ✔',
    kiwi_failed: 'تعذر الاتصال الصوتي بالجهاز — يمكن فتح صفحة الجهاز الأصلية عند الحاجة',
    kiwi_freq: 'التردد (kHz)',
    kiwi_mode: 'الوضع',
    close: 'إغلاق',
    kiwi_studio: 'استوديو الاستقبال',
    kiwi_explainer: 'اضبط التردد والوضع والمرشح مباشرةً. للشلال الطيفي وملحقات الجهاز افتح واجهته الكاملة بالتردد الحالي.',
    kiwi_receiver: 'جهاز الاستقبال',
    kiwi_prev: 'الجهاز السابق',
    kiwi_next: 'الجهاز التالي',
    kiwi_reconnect: 'إعادة الاتصال',
    kiwi_restore: 'آخر جهاز ناجح',
    kiwi_full_ui: 'واجهة الجهاز الكاملة ↗',
    kiwi_step: 'خطوة الضبط',
    kiwi_down: 'خفض التردد خطوة',
    kiwi_up: 'رفع التردد خطوة',
    kiwi_bandwidth: 'عرض المرشح',
    kiwi_narrow: 'ضيق',
    kiwi_normal: 'عادي',
    kiwi_wide: 'واسع',
    kiwi_agc: 'ضبط الكسب تلقائيًا AGC',
    kiwi_gain: 'الكسب اليدوي (dB)',
    kiwi_squelch: 'إسكات الضوضاء (0 = إيقاف)',
    kiwi_signal: 'مستوى الإشارة من الجهاز',
    kiwi_signal_wait: 'في انتظار الإشارة',
    kiwi_advanced: 'تحكم متقدم في الاستقبال',
    kiwi_retrying: 'انقطع الصوت — إعادة الاتصال {n}/2…',
    kiwi_unavailable: 'الجهاز غير متاح أو غير مسموح بالتشغيل الخارجي حاليًا',
    kiwi_invalid: 'أدخل ترددًا بين 10 و30,000 kHz ووضع استقبال صالحًا',
    kiwi_no_receivers: 'لا توجد أجهزة متاحة',
    kiwi_cyprus: 'قبرص',
    kiwi_saved_hint: 'تُحفظ آخر إعدادات ناجحة على جهازك؛ التشغيل يبدأ بضغطك فقط',
    kiwi_fullscreen: 'ملء الشاشة',
    kiwi_leave_fullscreen: 'إنهاء ملء الشاشة'
  },
  en: {
    direct_title: 'Direct receiver radio',
    direct_hint: 'Choose a receiver and listen here. Candidates are not guaranteed to connect; the audio badge appears after real audio is received in this session.',
    direct_candidate: 'Candidate — not tested yet',
    direct_verified: 'Audio received this session',
    direct_failed: 'Last connection attempt did not complete',
    direct_verified_only: 'Only receivers with audio received this session',
    direct_start: 'Play direct',
    direct_more: 'More direct receivers',
    direct_empty: 'No matching direct receivers. Change the search or try another receiver.',
    direct_catalog: 'All directories and original interfaces',
    owrx_title: 'Direct OpenWebRX radio',
    owrx_hint: 'Direct audio and tuning from the receiver. Available bands and modes depend on its operator.',
    owrx_profile: 'Available device / band',
    owrx_wait_config: 'Reading receiver bands…',
    owrx_wait_audio: 'Connected — waiting for audio…',
    owrx_live: 'Receiving live audio',
    owrx_failed: 'Connection did not complete',
    owrx_invalid: 'Choose a frequency inside the receiver band and an available mode.',
    owrx_range: 'Current tuning range',
    owrx_spectrum: 'Actual spectrum received from the device',
    owrx_no_spectrum: 'The spectrum appears when the receiver sends its data.',
    owrx_session: 'Session details',
    owrx_disconnect: 'Disconnect',
    owrx_no_profiles: 'Waiting for receiver data',
    owrx_unsupported: 'Direct playback requires a secure OpenWebRX receiver in the directory. Other receivers have a separate original interface.',
    owrx_frequency: 'Frequency (kHz)',
    owrx_original: 'Additional original interface ↗',
    owrx_no_audio: 'No audio arrived within the time limit. Reconnect or try another receiver.',

    sdr_workspace: 'Receiver workspace',
    sdr_open_workspace: 'Open receiver workspace',
    sdr_choose: 'Choose from all receiver directories',
    sdr_prev: 'Previous',
    sdr_next: 'Next',
    sdr_reload: 'Reload original interface',
    sdr_native: 'Native Kiwi audio',
    sdr_original: 'Original receiver interface ↗',
    sdr_capabilities: 'Original interface features depend on the receiver operator',
    sdr_embed_hint: 'Use the original receiver controls to start audio and tune. Some receivers require a separate tab.',
    sdr_http_hint: 'Open the original receiver interface in a separate tab to use its available controls.',
    sdr_satnogs_hint: 'A satellite station and observations page, not a directly tunable audio receiver. Open SatNOGS for available observations and data.',
    sdr_unknown_hint: 'Unknown receiver type. Only the original page is offered; no protocol or features are assumed.',
    sdr_invalid: 'Unsafe URL or receiver not found in the receiver directory.',
    sdr_loading: 'Opening receiver interface…',
    sdr_loaded: 'Start audio using the receiver controls. If the interface does not appear, open its original page.',
    sdr_frame_wait: 'Interface display could not be confirmed. The receiver may prevent embedding; try its original interface.',
    sdr_external_ready: 'External interface only — select “Original receiver interface” to continue.',
    sdr_feature_tuning: 'Frequency and mode tuning',
    sdr_feature_waterfall: 'RF waterfall',
    sdr_feature_extensions: 'Kiwi extensions',
    sdr_feature_recording: 'Receiver and recording tools when available',
    sdr_feature_profiles: 'Device and band profiles',
    sdr_feature_digital: 'Digital decoding when available',
    sdr_feature_observations: 'Recorded observations and data',
    sdr_feature_satellites: 'Satellite scheduling and tracking',
    sdr_unavailable_native: 'Native Kiwi audio requires an online, non-full receiver with ext_api permission.',
    sdr_frame_title: 'Original receiver interface',
    sdr_provider: 'Receiver system',

    sdr_filters: 'Advanced receiver filters',
    sdr_tools: 'Band conditions and broadcast schedules',
    search_sdr_ph: 'Search: name, country, callsign…',
    search_sdr_aria: 'Search receivers',
    all_bands: 'All bands',
    sort_snr: 'Best SNR',
    sort_free: 'Most free slots',
    sort_users: 'Least crowded',
    sort_name: 'Name',
    sort_near: 'Nearest to me',
    online_only: 'Online only',
    free_only: 'Has a free slot',
    snr_min: 'SNR ≥',
    https_only: 'Playable in-app',
    sdr_hint: '🎧 Listen to permitted KiwiSDR receivers directly in Radio Atlas. HTTP receivers need a deployed WebSocket relay; each receiver shows its available connection type.',
    no_band: 'Unspecified',
    no_match: 'No matching results — try lighter filters.',
    results: '{n} results',
    more_rx: 'Show more — {n} receivers left',
    geo_fallback: 'Location unavailable — sorted by distance from Cairo',
    listen_in_app: '🎧 Listen in app',
    open_ext: 'Open receiver ↗',
    wspr_title: 'Observed propagation — WSPR (last 2 hours)',
    wspr_hint: 'WSPR spots received per band directly measure how open each band is — the longest heard paths show the clearest open routes right now.',
    websdr_title: 'WebSDR receivers',
    owrx_title: 'OpenWebRX receivers',
    satnogs_title: 'SatNOGS ground stations',
    satnogs_type: 'SatNOGS',
    space_title: 'Band conditions (NOAA SWPC data)',
    updated_at: 'Updated',
    cond_good: 'Conditions are stable — high bands (14–28 MHz) are likely open.',
    cond_unstable: 'Moderate disturbance — favor lower bands (3–10 MHz).',
    cond_storm: 'Geomagnetic storm — high bands closed, polar paths disturbed.',
    alert_aria: 'Band condition alerts',
    alert_unsupported: 'This browser does not support notifications',
    alert_on: '🔔 Alerts on — you will be notified when conditions change',
    alert_off: '🔕 Alerts off',
    alert_open_title: 'High bands are open 🔥',
    alert_open_body: 'Kp {kp} — great conditions for high bands (14–28 MHz). Tune in now!',
    alert_storm_title: 'Geomagnetic storm ⛈',
    alert_storm_body: 'Kp {kp} — high bands are closed; favor lower bands (3–10 MHz).',
    alert_toast_open: 'Bands opened (Kp {kp}) — great high-band conditions 🔥',
    alert_toast_storm: 'Geomagnetic storm (Kp {kp}) — high bands closed ⛈',
    eibi_title: 'Shortwave broadcasts on air now',
    eibi_hint: 'From the EIBI schedule — frequencies broadcasting now (UTC). Tune one on any receiver below to listen.',
    eibi_ph: 'Search the current broadcast: name, frequency…',
    onair: 'on air',
    eibi_band_aria: 'Select broadcast band',
    eibi_search_aria: 'Search the current shortwave broadcast',
    all_bands: 'All bands',
    more_eibi: 'Showing the first 60 — refine your search to see more.',
    kiwi_audio: '🎧 Direct audio (beta)',
    kiwi_connecting: 'Connecting to the receiver…',
    kiwi_live: 'Receiving ✔',
    kiwi_failed: 'Could not connect to receiver audio — the original receiver page remains available',
    kiwi_freq: 'Frequency (kHz)',
    kiwi_mode: 'Mode',
    close: 'Close',
    kiwi_studio: 'Receiver studio',
    kiwi_explainer: 'Tune frequency, mode and passband directly. For the waterfall and device extensions, open the full receiver interface at your current tuning.',
    kiwi_receiver: 'Receiver',
    kiwi_prev: 'Previous receiver',
    kiwi_next: 'Next receiver',
    kiwi_reconnect: 'Reconnect',
    kiwi_restore: 'Last working receiver',
    kiwi_full_ui: 'Full receiver interface ↗',
    kiwi_step: 'Tuning step',
    kiwi_down: 'Tune down one step',
    kiwi_up: 'Tune up one step',
    kiwi_bandwidth: 'Passband width',
    kiwi_narrow: 'Narrow',
    kiwi_normal: 'Normal',
    kiwi_wide: 'Wide',
    kiwi_agc: 'Automatic gain control (AGC)',
    kiwi_gain: 'Manual gain (dB)',
    kiwi_squelch: 'Noise squelch (0 = off)',
    kiwi_signal: 'Receiver signal level',
    kiwi_signal_wait: 'Waiting for signal',
    kiwi_advanced: 'Advanced receiver controls',
    kiwi_retrying: 'Audio interrupted — reconnecting {n}/2…',
    kiwi_unavailable: 'Receiver unavailable or external audio not currently permitted',
    kiwi_invalid: 'Enter a frequency between 10 and 30,000 kHz and a valid mode',
    kiwi_no_receivers: 'No eligible receivers',
    kiwi_cyprus: 'Cyprus',
    kiwi_saved_hint: 'Last successful settings stay on your device; playback starts only after your click',
    kiwi_fullscreen: 'Full screen',
    kiwi_leave_fullscreen: 'Exit full screen'
  }
};



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
    kiwiRenderReceiverChoices();
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
  var action = receiverAction(r);
  if (nativeKiwiAllowed(r)) {
    action = '<button class="open kiwi-ws" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('kiwi_audio')) + '</button>' + action;
  }
  return '<article class="' + cls + '">' +
    '<div class="card-head"><span class="dot ' + (r.online ? 'on' : 'off') + '"></span>' +
    '<h3>' + esc(r.name) + '</h3><span class="chip receiver-provider">' + esc(receiverProfile(r.type,r.url).label) + '</span></div>' +
    (chips ? '<div class="chips">' + chips + '</div>' : '') +
    '<div class="meta"><span>👥 ' + users + '</span><span class="snr">📶 SNR ' + snr + '</span></div>' +
    (r.antenna ? '<div class="meta antenna" title="' + esc(r.antenna) + '">🛰 ' + esc(r.antenna) + '</div>' : '') +
    action +
    '</article>';
}

function renderSDR() {
  renderDirectReceivers();
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
  var action = receiverAction(r);
  if (nativeOpenWebRxAllowed(r)) action = '<button class="open owrx-native" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '">' + esc(t('direct_start')) + '</button>' + action;
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
  renderDirectReceivers();
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
      sdrRenderChoices();
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
      sdrRenderChoices();
      renderMap();
    }
  }).catch(function (e) {
    console.warn('satnogs snapshot:', e);
  });
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




var sdrCurrentReceiver = null;
var sdrFrameTimer = null;
var sdrFrameGeneration = 0;
function receiverRows() {
  return receiverCatalog({kiwi:state.receivers,websdr:state.webSdrs && state.webSdrs.websdr,
    owrx:state.webSdrs && state.webSdrs.openwebrx,satnogs:state.satnogs && state.satnogs.stations});
}
function receiverAction(r) {
  if (!validateReceiverUrl(r.url)) return '';
  return '<button class="open play-sdr" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '" data-type="' + esc(r.type || 'unknown') + '">' + esc(t('sdr_open_workspace')) + '</button>';
}
function sdrRenderChoices() {
  var select = $('sdr-receiver');
  if (!select) return;
  var rows = receiverRows();
  select.innerHTML = rows.map(function (r) {
    return '<option value="' + esc(r.key) + '">' + esc(receiverProfile(r.type,r.url).label + ' · ' + (r.name || r.url)) + '</option>';
  }).join('');
  if (sdrCurrentReceiver) select.value = sdrCurrentReceiver.key;
  ['sdr-prev','sdr-next'].forEach(function (id) { if ($(id)) $(id).disabled = rows.length < 2; });
}
function sdrStopFrame() {
  sdrFrameGeneration++;
  if (sdrFrameTimer) { clearTimeout(sdrFrameTimer);sdrFrameTimer = null; }
  var frame = $('sdr-frame');
  if (frame) {
    frame.onload = null;frame.onerror = null;
    frame.removeAttribute('srcdoc');
    frame.src = 'about:blank';
  }
}
function sdrStartFrame() {
  sdrStopFrame();
  if (!sdrCurrentReceiver) return;
  var profile = receiverProfile(sdrCurrentReceiver.type,sdrCurrentReceiver.url);
  var frame = $('sdr-frame'), status = $('sdr-status');
  frame.hidden = profile.transport !== 'embed';
  $('sdr-reload').disabled = profile.transport !== 'embed';
  $('sdr-frame-fallback').hidden = profile.transport === 'embed';
  $('sdr-frame-fallback').textContent = t(profile.transport === 'embed' ? 'sdr_frame_wait' : profile.reason);
  if (profile.transport !== 'embed') { status.textContent = t('sdr_external_ready');return; }
  // A fresh browsing context makes reload reliable even with a fragment URL.
  // Reusing a frame after about:blank can race a same-document navigation.
  var previousFrame = frame;
  frame = previousFrame.cloneNode(false);
  frame.removeAttribute('src');
  frame.removeAttribute('srcdoc');
  var generation = sdrFrameGeneration;
  status.textContent = t('sdr_loading');
  frame.title = t('sdr_frame_title') + ': ' + (sdrCurrentReceiver.name || profile.label);
  frame.onload = function () {
    if (generation !== sdrFrameGeneration) return;
    if (sdrFrameTimer) { clearTimeout(sdrFrameTimer);sdrFrameTimer = null; }
    status.textContent = t('sdr_loaded');
    // Cross-origin load events cannot establish rendering, permission or audio.
    $('sdr-frame-fallback').hidden = false;
  };
  frame.onerror = function () {
    if (generation !== sdrFrameGeneration) return;
    status.textContent = t('sdr_frame_wait');$('sdr-frame-fallback').hidden = false;
  };
  sdrFrameTimer = setTimeout(function () {
    if (generation !== sdrFrameGeneration) return;
    status.textContent = t('sdr_frame_wait');$('sdr-frame-fallback').hidden = false;
  },15000);
  frame.src = sdrCurrentReceiver.url;
  previousFrame.replaceWith(frame);
}
function openSDR(url, name, type) {
  var row = resolveCatalogReceiver(url,type,receiverRows());
  if (!row) { toast(t('sdr_invalid'));return; }
  closeKiwiAudio();
  closeOpenWebRx();
  var fm = $('audio');if (fm && typeof fm.pause === 'function') fm.pause();
  sdrCurrentReceiver = row;
  ['sdr-toolbar','sdr-provider','sdr-status','sdr-fullscreen'].forEach(function (id) { if ($(id)) $(id).hidden = false; });
  var profile = receiverProfile(row.type,row.url);
  $('sdr-modal-name').textContent = row.name || name || profile.label;
  $('sdr-open-ext').href = row.url;
  $('sdr-protocol').textContent = profile.label;
  $('sdr-provider-hint').textContent = t(profile.reason);
  $('sdr-capabilities').innerHTML = profile.features.map(function (key) { return '<span class="chip">' + esc(t(key)) + '</span>'; }).join('');
  $('sdr-native').hidden = row.type !== 'kiwi';
  $('sdr-native').disabled = !nativeKiwiAllowed(row);
  $('sdr-native').title = nativeKiwiAllowed(row) ? t('sdr_native') : t('sdr_unavailable_native');
  if ($('sdr-modal').hidden) previousSDRFocus = document.activeElement;
  $('sdr-modal').hidden = false;
  sdrRenderChoices();sdrStartFrame();
  $('sdr-modal-close').focus();
}
function sdrNavigate(direction) {
  var rows = receiverRows();
  if (!rows.length) return;
  var index = rows.findIndex(function (r) { return sdrCurrentReceiver && r.key === sdrCurrentReceiver.key; });
  index = index < 0 ? 0 : (index + (direction < 0 ? -1 : 1) + rows.length) % rows.length;
  openSDR(rows[index].url,rows[index].name,rows[index].type);
}
function closeSDR() {
  sdrStopFrame();
  $('sdr-modal').hidden = true;
  if (previousSDRFocus && typeof previousSDRFocus.focus === 'function') previousSDRFocus.focus();
  previousSDRFocus = null;
}


/* ================= Direct receiver candidates and OpenWebRX audio ================= */
var directSessionResults = new Map();
var directLimit = 24;
var owrxClient = null;
var owrxAudioCtx = null;
var owrxGain = null;
var owrxNextTime = 0;
var owrxSources = new Set();
var owrxSession = 0;
var owrxReceiver = null;
var owrxConfig = null;
var owrxConfigKey = '';
var owrxDeadline = null;
var owrxWatchdog = null;
var owrxLastAudio = 0;
var owrxPendingTune = null;
var owrxPreviousFocus = null;
var owrxFailActive = null;
var owrxStats = {frames:0,samples:0,nonZeroSamples:0,sampleRate:0,signalDbm:null,verifiedAt:null,fftFrames:0};
var OWRX_ANALOG_MODES = ['am','nfm','wfm','usb','lsb','cw'];
function directResultKey(type,url) { return type + '|' + validateReceiverUrl(url); }
function directMarkVerified(type,url) {
  var key = directResultKey(type,url), old = directSessionResults.get(key);
  if (old && old.status === 'verified') return old.at;
  var at = new Date().toISOString();
  directSessionResults.set(key,{status:'verified',at:at});
  renderDirectReceivers();
  return at;
}
function directMarkFailed(type,url) {
  var key = directResultKey(type,url), old = directSessionResults.get(key);
  if (!old || old.status !== 'verified') directSessionResults.set(key,{status:'failed',at:new Date().toISOString()});
  renderDirectReceivers();
}
function renderDirectReceivers() {
  var grid = $('grid-direct');
  if (!grid) return;
  var rows = receiverRows(), q = String(state.filters.q || '').trim().toLowerCase();
  var onlyVerified = $('direct-only-verified') && $('direct-only-verified').checked;
  rows = rows.filter(function (r) {
    if (!nativeKiwiAllowed(r) && !nativeOpenWebRxAllowed(r)) return false;
    if (state.filters.rxType && state.filters.rxType !== 'all' && state.filters.rxType !== r.type) return false;
    if (q && (r.name + ' ' + (r.loc || '') + ' ' + r.url).toLowerCase().indexOf(q) === -1) return false;
    var result = directSessionResults.get(r.key);
    return !onlyVerified || result && result.status === 'verified';
  });
  var kiwi = rows.filter(function (r) { return r.type === 'kiwi'; }).sort(function (a,b) {
    return Number(/cyprus/i.test(b.name + ' ' + b.loc)) - Number(/cyprus/i.test(a.name + ' ' + a.loc));
  });
  var owrx = rows.filter(function (r) { return r.type === 'owrx'; });
  var mixed = [];
  for (var i = 0; i < Math.max(kiwi.length,owrx.length); i++) {
    if (kiwi[i]) mixed.push(kiwi[i]);
    if (owrx[i]) mixed.push(owrx[i]);
  }
  mixed.sort(function (a,b) {
    var ar = directSessionResults.get(a.key), br = directSessionResults.get(b.key);
    return Number(!!br && br.status === 'verified') - Number(!!ar && ar.status === 'verified');
  });
  grid.innerHTML = mixed.slice(0,directLimit).map(function (r) {
    var result = directSessionResults.get(r.key);
    var status = result ? result.status : 'candidate';
    var label = t(status === 'verified' ? 'direct_verified' : status === 'failed' ? 'direct_failed' : 'direct_candidate');
    return '<article class="card direct-card" data-native-status="' + status + '" data-receiver-url="' + esc(r.url) + '">' +
      '<div class="card-head"><span class="chip">' + esc(receiverProfile(r.type,r.url).label) + '</span><h3>' + esc(r.name || r.url) + '</h3></div>' +
      '<p class="direct-session-state">' + esc(label) + (result ? ' <time datetime="' + esc(result.at) + '">' + esc(new Date(result.at).toLocaleTimeString(state.lang)) + '</time>' : '') + '</p>' +
      '<button class="open ' + (r.type === 'kiwi' ? 'kiwi-ws' : 'owrx-native') + '" type="button" data-url="' + esc(r.url) + '" data-name="' + esc(r.name) + '" data-type="' + r.type + '">' + esc(t('direct_start')) + '</button></article>';
  }).join('') || '<p class="empty">' + esc(t('direct_empty')) + '</p>';
  if ($('direct-count')) $('direct-count').textContent = fmtNum(rows.length);
  if ($('direct-more')) $('direct-more').hidden = mixed.length <= directLimit;
}
function owrxArmAudioDeadline() {
  if (owrxDeadline) clearTimeout(owrxDeadline);
  if (!owrxFailActive) return;
  var session = owrxSession, fail = owrxFailActive;
  owrxDeadline = setTimeout(function () { if (session === owrxSession) fail('audio_timeout'); },30000);
}
function owrxSetStatus(key,detail) {
  $('owrx-status').textContent = t(key) + (detail ? ' · ' + detail : '');
}
function owrxSetControls(enabled) {
  ['owrx-freq','owrx-mode','owrx-down','owrx-up'].forEach(function (id) { if ($(id)) $(id).disabled = !enabled; });
}
function owrxRange() {
  if (!owrxConfig || !Number.isFinite(owrxConfig.center_freq) || !Number.isFinite(owrxConfig.samp_rate) || owrxConfig.samp_rate <= 0) return null;
  return {min:owrxConfig.center_freq - owrxConfig.samp_rate / 2,max:owrxConfig.center_freq + owrxConfig.samp_rate / 2};
}
function owrxUpdateSession() {
  var hz = Number($('owrx-freq').value) * 1000;
  $('owrx-session').textContent = (Number.isFinite(hz) ? (hz / 1000000).toFixed(6) + ' MHz · ' : '') +
    $('owrx-mode').value.toUpperCase() + (owrxStats.sampleRate ? ' · ' + owrxStats.sampleRate + ' Hz PCM' : '');
}
function owrxApplyConfig(config) {
  owrxConfig = config;
  var modes = Array.isArray(config.modes) ? config.modes.filter(function (mode) { return OWRX_ANALOG_MODES.indexOf(mode) !== -1; }) : OWRX_ANALOG_MODES;
  var oldMode = $('owrx-mode').value;
  $('owrx-mode').innerHTML = modes.map(function (mode) { return '<option value="' + mode + '">' + mode.toUpperCase() + '</option>'; }).join('');
  if (modes.indexOf(oldMode) !== -1) $('owrx-mode').value = oldMode;
  var range = owrxRange();
  if (!range) return;
  var key = [config.sdr_id,config.profile_id,config.center_freq,config.samp_rate].join('|');
  var input = $('owrx-freq');
  input.min = (range.min / 1000).toFixed(3);input.max = (range.max / 1000).toFixed(3);
  $('owrx-range').textContent = (range.min / 1000).toFixed(3) + ' – ' + (range.max / 1000).toFixed(3) + ' kHz';
  if (owrxConfigKey !== key) {
    owrxArmAudioDeadline();owrxFlushAudio();
    owrxConfigKey = key;
    var initial = Number.isFinite(config.start_freq) ? config.start_freq : config.center_freq + (Number(config.start_offset_freq) || 0);
    var mode = modes.indexOf(config.start_mod) !== -1 ? config.start_mod : modes[0];
    if (owrxPendingTune && modes.indexOf(owrxPendingTune.mode) !== -1 && owrxPendingTune.frequency >= range.min && owrxPendingTune.frequency <= range.max) {
      initial = owrxPendingTune.frequency;mode = owrxPendingTune.mode;owrxPendingTune = null;
    }
    if (owrxClient && !owrxClient.validTune(initial,mode)) initial = config.center_freq;
    input.value = (initial / 1000).toFixed(3);$('owrx-mode').value = mode;
    if (owrxClient) owrxClient.tune(initial,mode);
  }
  var profileId = config.sdr_id !== undefined && config.profile_id !== undefined ? config.sdr_id + '|' + config.profile_id : config.profile_id;
  if (profileId !== undefined && Array.from($('owrx-profile').options).some(function (o) { return o.value === String(profileId); })) $('owrx-profile').value = String(profileId);
  owrxSetControls(modes.length > 0);owrxUpdateSession();
}
function owrxTune() {
  if (!owrxClient) return;
  var frequency = Math.round(Number($('owrx-freq').value) * 1000), range = owrxRange();
  if (!range || !Number.isFinite(frequency) || frequency < range.min || frequency > range.max || !owrxClient.tune(frequency,$('owrx-mode').value)) {
    owrxSetStatus('owrx_invalid');return;
  }
  owrxFlushAudio();owrxUpdateSession();
}
function owrxStepTune(direction) {
  var range = owrxRange(), step = Number($('owrx-step').value), frequency = Number($('owrx-freq').value);
  if (!range || !Number.isFinite(frequency) || [0.001,0.01,0.1,1,5,10].indexOf(step) === -1) return;
  $('owrx-freq').value = (Math.max(range.min / 1000,Math.min(range.max / 1000,frequency + direction * step))).toFixed(3);
  owrxTune();
}
function owrxDrawSpectrum(values) {
  if (!(values instanceof Float32Array) || values.length < 2 || values.length > 65536) return;
  var canvas = $('owrx-spectrum'), ctx = canvas.getContext('2d');
  if (!ctx) return;
  var valid = false;
  for (var i = 0; i < values.length; i++) if (Number.isFinite(values[i])) { valid = true;break; }
  if (!valid) return;
  $('owrx-spectrum-wrap').hidden = false;
  owrxStats.fftFrames++;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = getComputedStyle(canvas).color;ctx.lineWidth = 1.5;ctx.beginPath();
  for (var x = 0; x < canvas.width; x++) {
    var value = values[Math.min(values.length - 1,Math.floor(x * values.length / canvas.width))];
    var y = canvas.height * (1 - Math.max(0,Math.min(1,((Number.isFinite(value) ? value : -160) + 160) / 160)));
    if (x === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
}
function owrxFlushAudio() {
  owrxSources.forEach(function (source) { try { source.stop();source.disconnect(); } catch (e) {} });
  owrxSources.clear();owrxNextTime = 0;
}
function owrxFeedAudio(samples,sampleRate) {
  if (!owrxAudioCtx || !owrxGain || !samples.length || !Number.isFinite(sampleRate) || sampleRate < 1000 || sampleRate > 96000) return;
  if (owrxStats.sampleRate && owrxStats.sampleRate !== sampleRate) owrxFlushAudio();
  var buffer = owrxAudioCtx.createBuffer(1,samples.length,sampleRate), channel = buffer.getChannelData(0);
  for (var i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
  var source = owrxAudioCtx.createBufferSource();source.buffer = buffer;source.connect(owrxGain);
  if (owrxNextTime < owrxAudioCtx.currentTime || owrxNextTime > owrxAudioCtx.currentTime + 1) owrxNextTime = owrxAudioCtx.currentTime + 0.06;
  owrxSources.add(source);source.start(owrxNextTime);owrxNextTime += samples.length / sampleRate;
  source.onended = function () { owrxSources.delete(source);source.disconnect(); };
}
function owrxStopSession() {
  owrxSession++;owrxFailActive = null;owrxFlushAudio();
  if (owrxDeadline) { clearTimeout(owrxDeadline);owrxDeadline = null; }
  if (owrxWatchdog) { clearInterval(owrxWatchdog);owrxWatchdog = null; }
  if (owrxClient) { try { owrxClient.close(); } catch (e) {} owrxClient = null; }
  var audio = $('owrx-audio');
  if (audio) { try { audio.pause();audio.srcObject = null; } catch (e) {} }
  if (owrxAudioCtx) { try { owrxAudioCtx.close().catch(function () {}); } catch (e) {} owrxAudioCtx = null; }
  owrxGain = null;owrxNextTime = 0;owrxSetControls(false);
}
function closeOpenWebRx() {
  owrxStopSession();
  if ($('owrx-modal')) $('owrx-modal').hidden = true;
  if (owrxPreviousFocus && owrxPreviousFocus.isConnected && typeof owrxPreviousFocus.focus === 'function') owrxPreviousFocus.focus();
  owrxPreviousFocus = null;
}
function stopReceivers() { closeOpenWebRx();closeKiwiAudio();closeSDR(); }
function openOpenWebRx(url,name) {
  var row = resolveCatalogReceiver(url,'owrx',receiverRows());
  if (!row || !nativeOpenWebRxAllowed(row)) { toast(t('owrx_unsupported'));return; }
  var previousTune = owrxReceiver && validateReceiverUrl(owrxReceiver.url) === row.url && owrxRange() ? {
    frequency:Math.round(Number($('owrx-freq').value) * 1000),mode:$('owrx-mode').value,
    profileId:$('owrx-profile').value
  } : null;
  if ($('owrx-modal').hidden) owrxPreviousFocus = document.activeElement;
  closeSDR();closeKiwiAudio();owrxStopSession();
  owrxPendingTune = previousTune;
  var fm = $('audio');if (fm) fm.pause();
  owrxReceiver = row;owrxConfig = null;owrxConfigKey = '';
  owrxStats = {frames:0,samples:0,nonZeroSamples:0,sampleRate:0,signalDbm:null,verifiedAt:null,fftFrames:0};
  var session = owrxSession, failed = false;
  var audio = $('owrx-audio');
  $('owrx-modal-name').textContent = row.name || name || 'OpenWebRX';
  $('owrx-original').href = row.url;$('owrx-modal').hidden = false;
  $('owrx-profile').innerHTML = '<option value="">' + esc(t('owrx_no_profiles')) + '</option>';$('owrx-profile').disabled = true;
  $('owrx-range').textContent = '—';$('owrx-signal').textContent = '—';$('owrx-session').textContent = '—';
  $('owrx-spectrum-wrap').hidden = true;owrxSetStatus('owrx_wait_config');
  $('owrx-close').focus();
  function fail(code,detail) {
    if (session !== owrxSession || failed) return;
    failed = true;owrxStopSession();
    directMarkFailed('owrx',row.url);
    owrxSetStatus(code === 'audio_timeout' ? 'owrx_no_audio' : 'owrx_failed',code || detail || '');
  }
  owrxFailActive = fail;
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { fail('audio_unavailable');return; }
  try {
    owrxAudioCtx = new Ctx();owrxGain = owrxAudioCtx.createGain();
    var destination = owrxAudioCtx.createMediaStreamDestination();owrxGain.connect(destination);
    audio.srcObject = destination.stream;
    owrxAudioCtx.resume().catch(function () { fail('audio_locked'); });
    audio.play().catch(function () { fail('audio_locked'); });
    owrxClient = new OpenWebRxClient({receiver:row,catalog:receiverRows(),
      onState:function (stateName) {
        if (session !== owrxSession || failed) return;
        if (stateName === 'connected') owrxSetStatus('owrx_wait_audio');
        if (stateName === 'closed') fail('connection_closed');
      },
      onConfig:function (config) { if (session === owrxSession && !failed) owrxApplyConfig(config); },
      onProfiles:function (profiles) {
        if (session !== owrxSession || failed || !Array.isArray(profiles)) return;
        $('owrx-profile').innerHTML = profiles.map(function (p) { return '<option value="' + esc(String(p.id)) + '">' + esc(p.name || String(p.id)) + '</option>'; }).join('');
        $('owrx-profile').disabled = profiles.length < 2;
        if (owrxPendingTune && profiles.some(function (p) { return p.id === owrxPendingTune.profileId; })) {
          $('owrx-profile').value = owrxPendingTune.profileId;
          owrxClient.selectProfile(owrxPendingTune.profileId);
        }
      },
      onPcm:function (samples,sampleRate) {
        if (session !== owrxSession || failed) return;
        try { owrxFeedAudio(samples,sampleRate); } catch (e) { fail('audio_decode');return; }
        owrxLastAudio = Date.now();owrxStats.frames++;owrxStats.samples += samples.length;owrxStats.sampleRate = sampleRate;
        for (var i = 0; i < samples.length; i++) if (samples[i] !== 0) owrxStats.nonZeroSamples++;
        if (owrxStats.nonZeroSamples > 0 && owrxAudioCtx && owrxAudioCtx.state === 'running' && !audio.paused) {
          if (owrxDeadline) { clearTimeout(owrxDeadline);owrxDeadline = null; }
          owrxStats.verifiedAt = directMarkVerified('owrx',row.url);
          owrxSetStatus('owrx_live');
        }
        owrxUpdateSession();
      },
      onSmeter:function (dbm) {
        if (session !== owrxSession || failed || !Number.isFinite(dbm)) return;
        owrxStats.signalDbm = dbm;$('owrx-signal').textContent = dbm.toFixed(1) + ' dBm';
      },
      onFft:function (values) { if (session === owrxSession && !failed) owrxDrawSpectrum(values); },
      onError:fail
    });
    if (!owrxClient.connect() || failed || session !== owrxSession) return;
    owrxArmAudioDeadline();
    owrxWatchdog = setInterval(function () { if (owrxStats.frames > 0 && Date.now() - owrxLastAudio > 20000) fail('audio_timeout'); },5000);
  } catch (e) { fail('connection_error'); }
}
function owrxDiagnostics() {
  return Object.assign({contextState:owrxAudioCtx ? owrxAudioCtx.state : 'closed',receiver:owrxReceiver ? owrxReceiver.url : '',
    frequencyHz:Math.round(Number($('owrx-freq').value) * 1000),mode:$('owrx-mode').value,
    profiles:Array.from($('owrx-profile').options).map(function (o) { return {id:o.value,name:o.textContent}; })},owrxStats);
}


/* ================= KiwiSDR native WebSocket audio ================= */
// Separate Cloudflare Worker public hostname supplied by site owner on 2026-11-20.
// Worker deployment and /healthz are reported live; actual WebSocket audio
// remains subject to separate per-receiver verification and permission.
// A failed relay must not cause a cross-site navigation or disrupt FM playback.
var KIWI_WS_RELAY = 'https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev';
var kiwiWs = null;
var kiwiAudioCtx = null;
var kiwiGain = null;
var kiwiNextTime = 0;
var kiwiKeepAlive = null;
var kiwiFailTimer = null;
var kiwiWatchdog = null;
var kiwiRetryTimer = null;
var kiwiRetryCount = 0;
var kiwiSession = 0;
var kiwiReady = false;
var kiwiCurrentReceiver = null;
var kiwiLastReceiver = null;
var KIWI_SETTINGS_KEY = 'ra-kiwi-session-v1';
var kiwiStats = {frames:0, samples:0, nonZeroSamples:0, sampleRate:0, signalDbm:null};
var kiwiLastFrame = 0;
var kiwiLastMeter = 0;

function kiwiSetStatus(text) {
  var el = $('kiwi-status');
  if (el) el.textContent = text;
}
function kiwiControlValue(id, fallback) {
  var el = $(id);
  return el && el.value !== undefined ? el.value : fallback;
}
function kiwiModeCuts(mode, width) {
  if (['narrow','normal','wide'].indexOf(width) === -1) return null;
  var cuts = {am:[-4900,4900],amn:[-2500,2500],sam:[-4900,4900],usb:[300,2900],lsb:[-2900,-300],cw:[-350,350],nbfm:[-6000,6000]};
  if (!cuts[mode]) return null;
  if (width === 'narrow') {
    if (mode === 'usb') return [300,2100];
    if (mode === 'lsb') return [-2100,-300];
    if (mode === 'cw') return [-150,150];
    return mode === 'nbfm' ? [-3000,3000] : [-2500,2500];
  }
  if (width === 'wide') {
    if (mode === 'usb') return [100,3500];
    if (mode === 'lsb') return [-3500,-100];
    if (mode === 'cw') return [-600,600];
    return [-6000,6000];
  }
  return cuts[mode];
}
function kiwiSocketAddress(raw) {
  var url;
  try { url = new URL(raw); } catch (e) { return ''; }
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return '';
  if (url.protocol === 'https:') return 'wss://' + url.host + '/' + Date.now() + '/SND';
  if (!KIWI_WS_RELAY) return '';
  try {
    var relay = new URL(KIWI_WS_RELAY);
    if (relay.protocol !== 'https:' || relay.username || relay.password) return '';
    return 'wss://' + relay.host + '/kiwi/ws?receiver=' + encodeURIComponent(url.origin + '/');
  } catch (e) { return ''; }
}
function kiwiTuneCommand() {
  var freq = Number(kiwiControlValue('kiwi-freq', ''));
  if (!Number.isFinite(freq) || freq < 10 || freq > 30000) return '';
  var mode = String(kiwiControlValue('kiwi-mode', 'am')).toLowerCase();
  var cuts = kiwiModeCuts(mode, kiwiControlValue('kiwi-bandwidth','normal'));
  if (!cuts) return '';
  return 'SET mod=' + mode + ' low_cut=' + cuts[0] + ' high_cut=' + cuts[1] + ' freq=' + freq.toFixed(3);
}
function kiwiAgcCommand() {
  var control = $('kiwi-agc');
  var enabled = !control || control.checked;
  var gain = Math.round(Number(kiwiControlValue('kiwi-gain',50)));
  if (!Number.isFinite(gain) || gain < 0 || gain > 120) return '';
  return 'SET agc=' + (enabled ? 1 : 0) + ' hang=0 thresh=-100 slope=6 decay=1000 manGain=' + gain;
}
function kiwiSquelchCommand() {
  var squelch = Math.round(Number(kiwiControlValue('kiwi-squelch',0)));
  var max = kiwiControlValue('kiwi-mode','am') === 'nbfm' ? 99 : 40;
  if (!Number.isFinite(squelch) || squelch < 0 || squelch > max) return '';
  return 'SET squelch=' + squelch + ' param=0.00';
}
function kiwiSendControl(command) {
  if (command && kiwiReady && kiwiWs && kiwiWs.readyState === WebSocket.OPEN) kiwiWs.send(command);
}
function kiwiFullReceiverUrl(raw) {
  if (!kiwiSocketAddress(raw)) return '';
  var url = new URL(raw);
  var command = kiwiTuneCommand();
  if (!command) return '';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  url.searchParams.set('f', Number(kiwiControlValue('kiwi-freq',7100)).toFixed(3) + kiwiControlValue('kiwi-mode','am') + 'z5');
  return url.toString();
}
function kiwiUpdateControls() {
  var gain = $('kiwi-gain'), agc = $('kiwi-agc'), squelch = $('kiwi-squelch');
  if (gain) gain.disabled = !agc || agc.checked;
  if (squelch) {
    squelch.max = kiwiControlValue('kiwi-mode','am') === 'nbfm' ? '99' : '40';
    if (Number(squelch.value) > Number(squelch.max)) squelch.value = squelch.max;
  }
  if ($('kiwi-gain-value')) $('kiwi-gain-value').textContent = kiwiControlValue('kiwi-gain','50') + ' dB';
  if ($('kiwi-squelch-value')) $('kiwi-squelch-value').textContent = kiwiControlValue('kiwi-squelch','0');
  var external = $('kiwi-open-ext');
  if (external && kiwiCurrentReceiver) external.href = kiwiFullReceiverUrl(kiwiCurrentReceiver.url) || '#';
  var input = $('kiwi-freq');
  if (input) input.step = kiwiControlValue('kiwi-step','1');
}
function kiwiSaveSession() {
  if (!kiwiCurrentReceiver || !kiwiReady || kiwiStats.frames < 1 || !kiwiTuneCommand()) return;
  var audio = $('kiwi-audio'), agc = $('kiwi-agc');
  var saved = {
    url:kiwiCurrentReceiver.url,name:kiwiCurrentReceiver.name,
    frequency:Number(kiwiControlValue('kiwi-freq',7100)),mode:kiwiControlValue('kiwi-mode','am'),
    bandwidth:kiwiControlValue('kiwi-bandwidth','normal'),step:kiwiControlValue('kiwi-step','1'),
    agc:!agc || agc.checked,gain:Number(kiwiControlValue('kiwi-gain',50)),
    squelch:Number(kiwiControlValue('kiwi-squelch',0)),volume:audio && typeof audio.volume === 'number' ? audio.volume : 1
  };
  kiwiLastReceiver = saved;
  try { localStorage.setItem(KIWI_SETTINGS_KEY,JSON.stringify(saved)); } catch (e) {}
  kiwiRenderReceiverChoices();
}
function kiwiLoadSettings(savedSettings) {
  var saved = savedSettings;
  try {
    if (!saved) {
      var raw = localStorage.getItem(KIWI_SETTINGS_KEY);
      if (!raw || raw.length > 4000) return;
      saved = JSON.parse(raw);
    }
  } catch (e) { return; }
  if (!saved || !kiwiSocketAddress(saved.url) || !kiwiModeCuts(saved.mode,'normal') ||
      !Number.isFinite(saved.frequency) || saved.frequency < 10 || saved.frequency > 30000) return;
  kiwiLastReceiver = saved;
  var frequency = $('kiwi-freq'), mode = $('kiwi-mode');
  if (frequency) frequency.value = String(saved.frequency);
  if (mode) mode.value = saved.mode;
  ['bandwidth','step'].forEach(function (key) {
    var el = $('kiwi-' + key);
    var allowed = key === 'bandwidth' ? ['narrow','normal','wide'] : ['0.01','0.1','1','5','9','10'];
    if (el && allowed.indexOf(String(saved[key])) !== -1) el.value = String(saved[key]);
  });
  if ($('kiwi-agc')) $('kiwi-agc').checked = saved.agc !== false;
  if ($('kiwi-gain') && Number.isFinite(saved.gain) && saved.gain >= 0 && saved.gain <= 120) $('kiwi-gain').value = String(saved.gain);
  if ($('kiwi-squelch') && Number.isFinite(saved.squelch) && saved.squelch >= 0 && saved.squelch <= 99) $('kiwi-squelch').value = String(saved.squelch);
  var audio = $('kiwi-audio');
  if (audio && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1) audio.volume = saved.volume;
  kiwiUpdateControls();
}
function kiwiSameReceiver(a,b) {
  try { return new URL(a).origin === new URL(b).origin; } catch (e) { return false; }
}
function kiwiReceiverChoices() {
  var rows = typeof state !== 'undefined' && Array.isArray(state.receivers) ? state.receivers : [];
  return rows.filter(function (r) {
    return r.online && r.extApi > 0 && r.maxUsers > r.users && !!kiwiSocketAddress(r.url);
  }).slice().sort(function (a,b) {
    var ac = /cyprus/i.test(a.name + ' ' + a.loc), bc = /cyprus/i.test(b.name + ' ' + b.loc);
    return Number(bc) - Number(ac) || String(a.name).localeCompare(String(b.name));
  });
}
function kiwiRenderReceiverChoices() {
  var select = $('kiwi-receiver');
  if (!select) return;
  var rows = kiwiReceiverChoices();
  var current = kiwiCurrentReceiver || kiwiLastReceiver;
  if (current && !rows.some(function (r) { return kiwiSameReceiver(r.url,current.url); })) rows.unshift(current);
  select.innerHTML = rows.map(function (r) { return '<option value="' + esc(r.url) + '">' + esc(r.name || r.url) + '</option>'; }).join('') || '<option value="">' + esc(t('kiwi_no_receivers')) + '</option>';
  if (current) {
    var match = rows.find(function (r) { return kiwiSameReceiver(r.url,current.url); });
    if (match) select.value = match.url;
  }
  var restore = $('kiwi-restore');
  if (restore) restore.disabled = !kiwiLastReceiver || !kiwiReceiverChoices().some(function (r) { return kiwiSameReceiver(r.url,kiwiLastReceiver.url); });
  ['kiwi-prev','kiwi-next'].forEach(function (id) { if ($(id)) $(id).disabled = rows.length < 2; });
}
function kiwiNavigateReceiver(direction) {
  var rows = kiwiReceiverChoices();
  if (!rows.length) { kiwiSetStatus(t('kiwi_unavailable')); return; }
  var index = rows.findIndex(function (r) { return kiwiCurrentReceiver && kiwiSameReceiver(r.url,kiwiCurrentReceiver.url); });
  index = index < 0 ? (direction < 0 ? rows.length - 1 : 0) : (index + (direction < 0 ? -1 : 1) + rows.length) % rows.length;
  var receiver = rows[index];
  openKiwiAudio(receiver.url,receiver.name);
}
function kiwiReconnect() {
  if (kiwiCurrentReceiver) openKiwiAudio(kiwiCurrentReceiver.url,kiwiCurrentReceiver.name);
}
function kiwiRestoreSession() {
  if (!kiwiLastReceiver) return;
  var r = kiwiReceiverChoices().find(function (receiver) { return kiwiSameReceiver(receiver.url,kiwiLastReceiver.url); });
  if (!r) { kiwiSetStatus(t('kiwi_unavailable')); return; }
  kiwiLoadSettings(kiwiLastReceiver);
  openKiwiAudio(r.url,r.name);
}
function kiwiSendTune() {
  var command = kiwiTuneCommand();
  if (!command) { kiwiSetStatus(t('kiwi_invalid')); return; }
  kiwiSendControl(command);
  kiwiUpdateControls();
  kiwiSendControl(kiwiSquelchCommand());
  kiwiSaveSession();
}
function kiwiStepTune(direction) {
  var step = Number(kiwiControlValue('kiwi-step','1'));
  var freq = Number(kiwiControlValue('kiwi-freq',''));
  if ([0.01,0.1,1,5,9,10].indexOf(step) === -1 || !Number.isFinite(freq) || (direction !== -1 && direction !== 1)) return;
  var input = $('kiwi-freq');
  if (input) input.value = Math.max(10,Math.min(30000,freq + direction * step)).toFixed(3);
  kiwiSendTune();
}
function closeKiwiAudio() {
  kiwiSession++;
  kiwiReady = false;
  if (kiwiFailTimer) { clearTimeout(kiwiFailTimer); kiwiFailTimer = null; }
  if (kiwiKeepAlive) { clearInterval(kiwiKeepAlive); kiwiKeepAlive = null; }
  if (kiwiWatchdog) { clearInterval(kiwiWatchdog); kiwiWatchdog = null; }
  if (kiwiRetryTimer) { clearTimeout(kiwiRetryTimer); kiwiRetryTimer = null; }
  if (kiwiWs) { try { kiwiWs.close(); } catch (e) {} kiwiWs = null; }
  var audio = $('kiwi-audio');
  if (audio) { try { audio.pause(); audio.srcObject = null; } catch (e) {} }
  if (kiwiAudioCtx) { try { kiwiAudioCtx.close(); } catch (e) {} kiwiAudioCtx = null; }
  kiwiGain = null;
  kiwiNextTime = 0;
  var modal = $('kiwi-modal');
  if (modal) modal.hidden = true;
}
function kiwiFeedAudio(samples, sampleRate) {
  if (!kiwiAudioCtx || !kiwiGain || !samples.length) return;
  try {
    var buffer = kiwiAudioCtx.createBuffer(1, samples.length, sampleRate);
    var channel = buffer.getChannelData(0);
    for (var i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    var source = kiwiAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(kiwiGain);
    var now = kiwiAudioCtx.currentTime;
    if (kiwiNextTime < now + 0.04 || kiwiNextTime > now + 0.75) kiwiNextTime = now + 0.06;
    source.start(kiwiNextTime);
    kiwiNextTime += buffer.duration;
  } catch (e) { console.warn('KiwiSDR audio:', e); }
}
function kiwiSignalDbm(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 10) return null;
  var bytes = new Uint8Array(buffer);
  if (bytes[0] !== 83 || bytes[1] !== 78 || bytes[2] !== 68) return null;
  var value = new DataView(buffer).getUint16(8,false) / 10 - 127;
  return value >= -160 && value <= 10 ? value : null;
}
// KiwiSDR sends SND frames: ASCII "SND", flags (1), sequence (4),
// S-meter (2), then big-endian 16-bit PCM when compression is disabled.
// Decoder explicitly rejects compressed frames and invalid packet tags.
function kiwiDecodeSnd(buffer) {
  if (!(buffer instanceof ArrayBuffer)) return null;
  var bytes = new Uint8Array(buffer);
  if (bytes.length <= 10 || bytes[0] !== 83 || bytes[1] !== 78 || bytes[2] !== 68) return null;
  // IQ uses a different header; ADPCM must never be interpreted as PCM.
  if (bytes[3] & 0x18) return null;
  if ((bytes.length - 10) % 2 !== 0) return null;
  var samples = new Int16Array((bytes.length - 10) / 2);
  var view = new DataView(buffer);
  for (var i = 0; i < samples.length; i++) samples[i] = view.getInt16(10 + i * 2, !!(bytes[3] & 0x80));
  return samples;
}

// Control messages are commonly binary frames, just like SND packets.
function kiwiControlMessage(data) {
  if (typeof data === 'string') return data.indexOf('MSG ') === 0 ? data : '';
  if (!(data instanceof ArrayBuffer) || data.byteLength < 4 || data.byteLength > 65536) return '';
  var bytes = new Uint8Array(data);
  if (bytes[0] !== 77 || bytes[1] !== 83 || bytes[2] !== 71 || bytes[3] !== 32) return '';
  var message = '';
  for (var i = 0; i < bytes.length; i++) message += String.fromCharCode(bytes[i]);
  return message;
}

function openKiwiAudio(url, name, options) {
  var authorized = typeof state !== 'undefined' && Array.isArray(state.receivers) && state.receivers.some(function (row) {
    return nativeKiwiAllowed(row) && validateReceiverUrl(row.url) === validateReceiverUrl(url);
  });
  if (!authorized) { toast(t('sdr_unavailable_native'));return; }
  if (typeof closeSDR === 'function' && $('sdr-modal') && !$('sdr-modal').hidden) closeSDR();
  var socketUrl = kiwiSocketAddress(url);
  if (!socketUrl) { toast(t('kiwi_failed')); return; }
  var tune = kiwiTuneCommand();
  if (!tune) { kiwiSetStatus(t('kiwi_invalid')); return; }
  if (typeof closeOpenWebRx === 'function') closeOpenWebRx();
  var fm = $('audio');if (fm && typeof fm.pause === 'function') fm.pause();
  if (!options || !options.retry) kiwiRetryCount = 0;
  closeKiwiAudio();
  var session = kiwiSession;
  var sampleRate = 12000;
  var authenticated = false, haveRate = false, gotSamples = false, failed = false;
  kiwiCurrentReceiver = {url:url,name:name || url};
  kiwiStats = {frames:0, samples:0, nonZeroSamples:0, sampleRate:0, signalDbm:null};
  kiwiLastFrame = Date.now();
  kiwiLastMeter = 0;
  $('kiwi-modal-name').textContent = '🎧 ' + (name || '');
  $('kiwi-modal').hidden = false;
  kiwiUpdateControls();
  kiwiRenderReceiverChoices();
  if ($('kiwi-signal')) $('kiwi-signal').textContent = t('kiwi_signal_wait');
  if ($('kiwi-signal-meter')) $('kiwi-signal-meter').value = -160;
  kiwiSetStatus(options && options.retry ? t('kiwi_retrying').replace('{n}',kiwiRetryCount) : t('kiwi_connecting'));
  var audio = $('kiwi-audio');
  function fail(retryable) {
    if (session !== kiwiSession || failed) return;
    failed = true;
    var retry = retryable === true && gotSamples && kiwiRetryCount < 2;
    kiwiReady = false;
    if (kiwiKeepAlive) { clearInterval(kiwiKeepAlive); kiwiKeepAlive = null; }
    if (kiwiWatchdog) { clearInterval(kiwiWatchdog); kiwiWatchdog = null; }
    if (kiwiWs) { try { kiwiWs.close(); } catch (e) {} kiwiWs = null; }
    if (kiwiAudioCtx) { kiwiAudioCtx.close().catch(function () {}); kiwiAudioCtx = null; }
    try { audio.pause(); audio.srcObject = null; } catch (e) {}
    kiwiGain = null;
    if (kiwiFailTimer) { clearTimeout(kiwiFailTimer); kiwiFailTimer = null; }
    if (retry) {
      kiwiRetryCount++;
      kiwiSetStatus(t('kiwi_retrying').replace('{n}',kiwiRetryCount));
      kiwiRetryTimer = setTimeout(function () {
        if (session === kiwiSession) openKiwiAudio(url,name,{retry:true});
      },1500 * kiwiRetryCount);
    } else {
      kiwiSetStatus(t('kiwi_failed'));
      toast(t('kiwi_failed'));
    }
  }
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !window.WebSocket) { fail(false); return; }
  try {
    kiwiAudioCtx = new Ctx();
    kiwiGain = kiwiAudioCtx.createGain();
    var dest = kiwiAudioCtx.createMediaStreamDestination();
    kiwiGain.connect(dest);
    audio.srcObject = dest.stream;
    kiwiAudioCtx.resume().catch(function () { fail(false); });
    audio.play().catch(function () { fail(false); });
  } catch (e) { fail(false); return; }
  var ws;
  try { ws = new WebSocket(socketUrl); } catch (e) { fail(false); return; }
  ws.binaryType = 'arraybuffer';
  kiwiWs = ws;
  // Directory + DNS + upstream upgrade each have bounded setup work in the bridge.
  kiwiFailTimer = setTimeout(function () { fail(false); },30000);
  ws.onopen = function () {
    if (session === kiwiSession && !failed) ws.send('SET auth t=kiwi p=');
  };
  ws.onmessage = function (ev) {
    if (session !== kiwiSession || failed) return;
    var msg = kiwiControlMessage(ev.data);
    if (msg) {
      if (/(?:^|\s)(?:badp=[1-9][0-9]*|too_busy(?:=|\s|$)|down=|fault(?:=|\s|$)|no_channels(?:=|\s|$))/i.test(msg)) { fail(false); return; }
      if (/(?:^|\s)badp=0(?:\s|$)/.test(msg)) authenticated = true;
      var rate = /(?:^|\s)audio_rate=([0-9.]+)/.exec(msg);
      if (rate && Number(rate[1]) > 1000 && Number(rate[1]) < 96000) {
        sampleRate = Number(rate[1]);haveRate = true;
        if (kiwiReady) ws.send('SET AR OK in=' + sampleRate + ' out=' + kiwiAudioCtx.sampleRate);
      }
      if (!kiwiReady && authenticated && haveRate) {
        kiwiReady = true;
        ws.send('SET compression=0');
        ws.send('SET AR OK in=' + sampleRate + ' out=' + kiwiAudioCtx.sampleRate);
        ws.send(kiwiSquelchCommand());
        ws.send('SET ident_user=Radio%20Atlas');
        ws.send(kiwiAgcCommand());
        var latestTune = kiwiTuneCommand();
        if (!latestTune) { fail(false); return; }
        kiwiUpdateControls();
        ws.send(latestTune);
        ws.send('SET keepalive');
      }
      return;
    }
    if (!kiwiReady) return;
    var samples = kiwiDecodeSnd(ev.data);
    if (!samples || !samples.length) return;
    kiwiLastFrame = Date.now();
    kiwiStats.frames++;kiwiStats.samples += samples.length;kiwiStats.sampleRate = sampleRate;
    kiwiStats.signalDbm = kiwiSignalDbm(ev.data);
    for (var i = 0; i < samples.length; i++) if (samples[i] !== 0) kiwiStats.nonZeroSamples++;
    if (Date.now() - kiwiLastMeter >= 250 && kiwiStats.signalDbm !== null) {
      kiwiLastMeter = Date.now();
      if ($('kiwi-signal')) $('kiwi-signal').textContent = kiwiStats.signalDbm.toFixed(1) + ' dBm';
      if ($('kiwi-signal-meter')) $('kiwi-signal-meter').value = kiwiStats.signalDbm;
    }
    if (!gotSamples) {
      gotSamples = true;
      if (kiwiFailTimer) { clearTimeout(kiwiFailTimer); kiwiFailTimer = null; }
      kiwiSetStatus(t('kiwi_live'));kiwiSaveSession();
    }
    kiwiFeedAudio(samples,sampleRate);
    if (typeof directMarkVerified === 'function' && kiwiStats.nonZeroSamples > 0 && kiwiAudioCtx && kiwiAudioCtx.state === 'running' && !audio.paused) directMarkVerified('kiwi',url);
  };
  ws.onerror = function () { fail(gotSamples); };
  ws.onclose = function (event) {
    // Policy/authentication failures and the bridge's deliberate session deadline
    // are not retried automatically. A user can explicitly reconnect.
    if (session === kiwiSession) fail(gotSamples && (!event || (event.code !== 1000 && event.code !== 1008 && event.code !== 1009)));
  };
  kiwiKeepAlive = setInterval(function () {
    if (session === kiwiSession && !failed && ws.readyState === WebSocket.OPEN) ws.send('SET keepalive');
  },10000);
  kiwiWatchdog = setInterval(function () {
    if (session === kiwiSession && gotSamples && Date.now() - kiwiLastFrame > 20000) fail(true);
  },5000);
}


var API = { stopReceivers:stopReceivers, openOpenWebRx:openOpenWebRx,closeOpenWebRx:closeOpenWebRx,owrxDiagnostics:owrxDiagnostics, reconnectKiwi: kiwiReconnect, navigateKiwi: kiwiNavigateReceiver, restoreKiwi: kiwiRestoreSession, kiwiDiagnostics: function () { return Object.assign({contextState:kiwiAudioCtx ? kiwiAudioCtx.state : 'closed',retries:kiwiRetryCount,receiver:kiwiCurrentReceiver ? kiwiCurrentReceiver.url : ''}, kiwiStats); }, renderSDR: renderSDR, renderWspr: renderWspr, renderWebSdrs: renderWebSdrs, renderSatnogs: renderSatnogs, renderSpace: renderSpace, renderEibi: renderEibi, buildBandFilter: buildBandFilter, openSDR: openSDR, closeSDR: closeSDR, openKiwiAudio: openKiwiAudio, closeKiwiAudio: closeKiwiAudio };
var booted = false;
export function boot() {
  if (booted) return API;
  booted = true;
  RA_MODULES.sdr = API;
  raMergeStr(STR_SDR);
  applyI18n();
  kiwiLoadSettings();
  // The user may type while the lazy module is downloading.
  state.filters.q = $('q').value;
  loadKiwi();
  loadSpace();
  loadEibi();
  loadWspr();
  loadWebSdrs();
  loadSatnogs();

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


  $('grid-direct').addEventListener('change',renderDirectReceivers);
  $('direct-only-verified').addEventListener('change',renderDirectReceivers);
  $('direct-more').addEventListener('click',function () { directLimit += 24;renderDirectReceivers(); });
  document.addEventListener('click',function (event) {
    var button = event.target.closest && event.target.closest('button.owrx-native');
    if (button) openOpenWebRx(button.getAttribute('data-url'),button.getAttribute('data-name'));
  });
  $('owrx-close').addEventListener('click',closeOpenWebRx);
  $('owrx-disconnect').addEventListener('click',function () { owrxStopSession();owrxSetStatus('owrx_disconnect'); });
  $('owrx-reconnect').addEventListener('click',function () { if (owrxReceiver) openOpenWebRx(owrxReceiver.url,owrxReceiver.name); });
  $('owrx-freq').addEventListener('change',owrxTune);
  $('owrx-mode').addEventListener('change',owrxTune);
  $('owrx-step').addEventListener('change',function () { $('owrx-freq').step = this.value; });
  $('owrx-down').addEventListener('click',function () { owrxStepTune(-1); });
  $('owrx-up').addEventListener('click',function () { owrxStepTune(1); });
  $('owrx-profile').addEventListener('change',function () {
    if (!owrxClient || !owrxClient.selectProfile(this.value)) { owrxSetStatus('owrx_invalid');return; }
    owrxArmAudioDeadline();owrxFlushAudio();
    owrxPendingTune = null;owrxConfigKey = '';owrxSetControls(false);$('owrx-spectrum-wrap').hidden = true;owrxSetStatus('owrx_wait_config');
  });
  $('owrx-freq').addEventListener('keydown',function (event) {
    if (event.key === 'Enter') { event.preventDefault();owrxTune(); }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault();owrxStepTune(event.key === 'ArrowUp' ? 1 : -1); }
  });
  $('owrx-modal').addEventListener('keydown',function (event) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault();closeOpenWebRx();return; }
    if (event.key === 'Tab') {
      var controls = Array.from(this.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),audio[controls]')).filter(function (el) { return !el.hidden && el.getClientRects().length > 0; });
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
    }
  });
  $('kiwi-modal').addEventListener('keydown',function (event) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault();closeKiwiAudio(); }
  });
  $('kiwi-freq').addEventListener('keydown',function (event) {
    if (event.key === 'Enter') { event.preventDefault();kiwiSendTune(); }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault();kiwiStepTune(event.key === 'ArrowUp' ? 1 : -1); }
  });
  $('sdr-modal-close').addEventListener('click', closeSDR);
  $('sdr-modal').addEventListener('keydown',function (event) {
    if (event.key === 'Escape') { event.preventDefault();closeSDR();return; }
    if (event.key !== 'Tab') return;
    var controls = Array.from(this.querySelectorAll('button:not([disabled]),a[href],select:not([disabled]),summary,iframe')).filter(function (el) {
      return !el.hidden && el.getClientRects().length > 0;
    });
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault();last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first.focus(); }
  });
  $('sdr-receiver').addEventListener('change',function () {
    var row = receiverRows().find(function (r) { return r.key === $('sdr-receiver').value; });
    if (row) openSDR(row.url,row.name,row.type);
  });
  $('sdr-prev').addEventListener('click',function () { sdrNavigate(-1); });
  $('sdr-next').addEventListener('click',function () { sdrNavigate(1); });
  $('sdr-reload').addEventListener('click',sdrStartFrame);
  $('sdr-native').addEventListener('click',function () {
    if (nativeKiwiAllowed(sdrCurrentReceiver)) openKiwiAudio(sdrCurrentReceiver.url,sdrCurrentReceiver.name);
  });
  $('sdr-fullscreen').addEventListener('click',function () {
    var expanded = $('sdr-modal').classList.toggle('sdr-expanded');
    this.setAttribute('aria-pressed',String(expanded));
    this.textContent = t(expanded ? 'kiwi_leave_fullscreen' : 'kiwi_fullscreen');
  });
  $('kiwi-modal-close').addEventListener('click', closeKiwiAudio);
  $('kiwi-freq').addEventListener('change', function () {
    kiwiSendTune();
  });
  $('kiwi-mode').addEventListener('change', function () {
    kiwiSendTune();
  });
  ['kiwi-bandwidth'].forEach(function (id) { if ($(id)) $(id).addEventListener('change',kiwiSendTune); });
  if ($('kiwi-step')) $('kiwi-step').addEventListener('change',function () { kiwiUpdateControls();kiwiSaveSession(); });
  if ($('kiwi-down')) $('kiwi-down').addEventListener('click',function () { kiwiStepTune(-1); });
  if ($('kiwi-up')) $('kiwi-up').addEventListener('click',function () { kiwiStepTune(1); });
  if ($('kiwi-agc')) $('kiwi-agc').addEventListener('change',function () { kiwiUpdateControls();kiwiSendControl(kiwiAgcCommand());kiwiSaveSession(); });
  ['kiwi-gain','kiwi-squelch'].forEach(function (id) { if ($(id)) $(id).addEventListener('input',kiwiUpdateControls); });
  if ($('kiwi-gain')) $('kiwi-gain').addEventListener('change',function () { kiwiSendControl(kiwiAgcCommand());kiwiSaveSession(); });
  if ($('kiwi-squelch')) $('kiwi-squelch').addEventListener('change',function () { kiwiSendControl(kiwiSquelchCommand());kiwiSaveSession(); });
  if ($('kiwi-reconnect')) $('kiwi-reconnect').addEventListener('click',kiwiReconnect);
  if ($('kiwi-restore')) $('kiwi-restore').addEventListener('click',kiwiRestoreSession);
  if ($('kiwi-prev')) $('kiwi-prev').addEventListener('click',function () { kiwiNavigateReceiver(-1); });
  if ($('kiwi-next')) $('kiwi-next').addEventListener('click',function () { kiwiNavigateReceiver(1); });
  if ($('kiwi-receiver')) $('kiwi-receiver').addEventListener('change',function () {
    var value = this.value;
    var r = kiwiReceiverChoices().find(function (row) { return row.url === value; });
    if (r) openKiwiAudio(r.url,r.name);
  });
  if ($('kiwi-audio')) $('kiwi-audio').addEventListener('volumechange',kiwiSaveSession);
  if ($('kiwi-fullscreen')) $('kiwi-fullscreen').addEventListener('click',function () {
    var modal = $('kiwi-modal');
    var expanded = modal.classList.toggle('kiwi-expanded');
    this.setAttribute('aria-pressed',String(expanded));
    this.textContent = t(expanded ? 'kiwi_leave_fullscreen' : 'kiwi_fullscreen');
  });



  return API;
}
