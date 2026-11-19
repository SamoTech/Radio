/* Optional audience measurement. Load the Google tag only after opt-in. */
(function () {
  'use strict';
  const id = 'G-1NG4ZXNVGD';
  const key = 'radio-atlas-analytics-v1';
  const disabled = 'ga-disable-' + id;
  let allowed = false;
  let loaded = false;
  try { allowed = localStorage.getItem(key) === 'yes'; } catch {}

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function start() {
    window[disabled] = false;
    if (loaded) {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      return;
    }
    loaded = true;
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: location.origin + location.pathname,
      page_referrer: document.referrer.split(/[?#]/, 1)[0]
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.append(script);
  }

  const events = new Set([
    'station_play', 'station_play_error',
    'pwa_install', 'language_change',
    'country_filter', 'language_filter', 'genre_filter'
  ]);
  window.radioAtlasTrack = function (name) {
    if (allowed && events.has(name)) gtag('event', name);
  };

  const filters = {
    'fm-country': 'country_filter',
    'fm-language': 'language_filter',
    'fm-tag': 'genre_filter'
  };
  document.addEventListener('change', function (event) {
    const name = filters[event.target.id];
    if (name) window.radioAtlasTrack(name);
  });
  document.addEventListener('click', function (event) {
    if (event.target.closest('#lang-btn')) window.radioAtlasTrack('language_change');
  });
  window.addEventListener('appinstalled', function () {
    window.radioAtlasTrack('pwa_install');
  });

  const settings = document.createElement('details');
  const label = document.createElement('summary');
  const status = document.createElement('p');
  const accept = document.createElement('button');
  const decline = document.createElement('button');
  accept.type = decline.type = 'button';
  status.setAttribute('aria-live', 'polite');
  settings.append(label, status, accept, ' ', decline);
  (document.querySelector('footer') || document.body).append(settings);

  function render() {
    const english = document.documentElement.lang === 'en';
    label.textContent = english ? 'Analytics choices' : 'اختيارات إحصاءات الزيارات';
    accept.textContent = english ? 'Allow analytics' : 'السماح بالإحصاءات';
    decline.textContent = english ? 'Decline analytics' : 'رفض الإحصاءات';
    status.textContent = english
      ? (allowed ? 'Optional analytics are on.' : 'Optional analytics are off.')
      : (allowed ? 'إحصاءات الزيارات الاختيارية مفعّلة.' : 'إحصاءات الزيارات الاختيارية متوقفة.');
  }

  function apply(choice) {
    if (allowed !== choice) {
      allowed = choice;
      if (allowed) start();
      else {
        gtag('consent', 'update', { analytics_storage: 'denied' });
        window[disabled] = true;
      }
    }
    render();
  }

  function choose(choice) {
    try { localStorage.setItem(key, choice ? 'yes' : 'no'); } catch {}
    apply(choice);
  }

  accept.addEventListener('click', function () { choose(true); });
  decline.addEventListener('click', function () { choose(false); });
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) apply(event.newValue === 'yes');
  });
  new MutationObserver(render).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang']
  });
  render();
  if (allowed) start();
})();
