/* Provider decisions only. Remote pages own their protocols and audio controls. */
export function validateReceiverUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\u0000-\u0020\u007f]/.test(raw)) return '';
  try {
    var url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password) return '';
    var host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.indexOf(':') !== -1 || host.indexOf('[') !== -1) return '';
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      var parts = host.split('.').map(Number);
      if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224 ||
          (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)) return '';
    } else if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) return '';
    return url.href;
  } catch (e) { return ''; }
}
export function nativeKiwiAllowed(row) {
  return !!row && row.type === 'kiwi' && row.online === true && Number.isFinite(row.extApi) && row.extApi > 0 &&
    Number.isFinite(row.users) && row.users >= 0 && Number.isFinite(row.maxUsers) && row.maxUsers > row.users && !!validateReceiverUrl(row.url);
}
export function nativeOpenWebRxAllowed(row) {
  return !!row && row.type === 'owrx' && validateReceiverUrl(row.url).indexOf('https:') === 0;
}
export function receiverProfile(type, raw) {
  var url = validateReceiverUrl(raw);
  var known = ['kiwi','websdr','owrx','satnogs'].indexOf(type) !== -1;
  var provider = known ? type : 'unknown';
  var labels = {kiwi:'KiwiSDR',websdr:'WebSDR',owrx:'OpenWebRX',satnogs:'SatNOGS',unknown:'External'};
  return {
    type:provider,label:labels[provider],
    transport:url && url.indexOf('https:') === 0 && known && provider !== 'satnogs' ? 'embed' : 'external',
    reason:!url ? 'sdr_invalid' : provider === 'satnogs' ? 'sdr_satnogs_hint' : !known ? 'sdr_unknown_hint' : url.indexOf('http:') === 0 ? 'sdr_http_hint' : 'sdr_embed_hint',
    features:provider === 'kiwi' ? ['sdr_feature_tuning','sdr_feature_waterfall','sdr_feature_extensions'] :
      provider === 'websdr' ? ['sdr_feature_tuning','sdr_feature_waterfall','sdr_feature_recording'] :
      provider === 'owrx' ? ['sdr_feature_profiles','sdr_feature_waterfall','sdr_feature_digital'] :
      provider === 'satnogs' ? ['sdr_feature_observations','sdr_feature_satellites'] : []
  };
}
export function receiverCatalog(groups) {
  var rows = [], seen = new Set();
  ['kiwi','websdr','owrx','satnogs'].forEach(function (type) {
    var list = groups && Array.isArray(groups[type]) ? groups[type] : [];
    list.forEach(function (row) {
      var url = row && validateReceiverUrl(row.url);
      if (!url) return;
      var key = type + '|' + url;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(Object.assign({},row,{url:url,type:type,key:key}));
    });
  });
  return rows;
}
export function resolveCatalogReceiver(raw, type, rows) {
  var url = validateReceiverUrl(raw);
  if (!url || !Array.isArray(rows)) return null;
  var matches = rows.filter(function (row) { return validateReceiverUrl(row.url) === url && (!type || row.type === type); });
  // A missing provider is compatible with old two-argument calls only if unambiguous.
  return matches.length === 1 ? matches[0] : null;
}
