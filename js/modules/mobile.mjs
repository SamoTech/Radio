/* Radio Atlas mobile navigation / saved favorites; loaded on demand. */
var STR_MOBILE={
  ar:{mobile_home:'الرئيسية',mobile_explore:'استكشف',mobile_favorites:'المفضلة',mobile_sdr:'SDR',home_favorites_title:'محطاتك المفضلة',mobile_quick_listen:'استمع الآن'},
  en:{mobile_home:'Home',mobile_explore:'Explore',mobile_favorites:'Favorites',mobile_sdr:'SDR',home_favorites_title:'Your favorites',mobile_quick_listen:'Listen now'}
};
function renderMobileHomePreview(home){
  var wrap=$('mobile-home-preview'),row=$('mobile-home-preview-row');
  if(!wrap||!row)return;
  if(!home){wrap.hidden=true;row.innerHTML='';return;}
  var candidates=[],seen={};
  function add(s){
    if(!s||!safeHttpsUrl(s.url)||seen[s.url])return;
    seen[s.url]=true;candidates.push(s);
  }
  if(state.history&&state.history.length)add(stationByUrl(state.history[0].url));
  featuredList().slice(0,6).forEach(add);
  if(candidates.length<3)homeList().slice(0,6).forEach(add);
  wrap.hidden=!candidates.length;
  row.innerHTML=candidates.slice(0,3).map(cardFm).join('');
}
function renderHomeFavorites(home) {
  renderMobileHomePreview(home);
  var wrap=$('home-favorites-wrap'),row=$('home-favorites-row');
  if(!wrap||!row)return;
  var urls=Object.keys(state.favs||{}).slice(0,6);
  var stations=urls.map(function(url){return stationByUrl(url)||state.favs[url];}).filter(function(s){return !!s&&!!safeHttpUrl(s.url);});
  wrap.hidden=!home||!stations.length;
  if(wrap.hidden){row.innerHTML='';return;}
  row.innerHTML=stations.map(cardFm).join('');
}

function syncPrimaryNav(){
  var active=state.activeTab==='fm'?(state.mobileExplore?'explore':'home'):state.activeTab;
  ['home','explore','fav','sdr'].forEach(function(item){
    var b=$('mobile-nav-'+item);if(!b)return;
    var current=active===item;b.classList.toggle('active',current);
    if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
}
function switchPrimaryNav(item){
  if(item==='home'){state.mobileExplore=false;clearFMFilters();switchTab('fm');renderFM();}
  else if(item==='explore'){state.mobileExplore=true;switchTab('fm');renderFM();var q=$('qfm');if(q)q.focus({preventScroll:true});}
  else if(item==='fav'||item==='sdr')switchTab(item);
}

var API={renderHomeFavorites:renderHomeFavorites,syncPrimaryNav:syncPrimaryNav,switchPrimaryNav:switchPrimaryNav};
var booted=false;
export function boot(){
  if(booted)return API;
  booted=true;
  RA_MODULES.mobile=API;
  raMergeStr(STR_MOBILE);
  applyI18n();
  syncPrimaryNav();
  return API;
}
