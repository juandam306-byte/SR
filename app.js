import { supabase } from './supabase.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const authView = $('#auth-view');
const appView = $('#app-view');
const authForm = $('#auth-form');
const authSubmit = $('#auth-submit');
const displayNameInput = $('#display-name');
const passwordInput = $('#auth-password');
const postForm = $('#post-form');
const postContent = $('#post-content');
const postMediaInput = $('#post-media');
const postsList = $('#posts-list');
const feedSentinel = $('#feed-sentinel');
const loadMorePostsButton = $('#load-more-posts');
const reelsList = $('#reels-list');
const reelsStatus = $('#reels-status');
const loadMoreReelsButton = $('#load-more-reels');
const feedStatus = $('#feed-status');
const toast = $('#toast');
const profileDialog = $('#profile-dialog');
const postDialog = $('#post-dialog');
const notificationsDialog = $('#notifications-dialog');
const editPostDialog = $('#edit-post-dialog');
const storyDialog = $('#story-dialog');
const storyViewerDialog = $('#story-viewer-dialog');
const installAppButton = $('#install-app');
const PROFILE_FIELDS = 'id, username, display_name, avatar_url, background_url, bio, profile_theme, follower_count, follower_bonus, following_count, post_count, is_private, show_follower_count, comments_from';

let authMode = 'register';
let currentUser = null;
let currentProfile = null;
let activeView = 'feed';
let settingsPreviousView = 'profile';
let viewedProfileId = null;
let selectedChat = null;
let focusedPostId = null;
let selectedPostMedia = null;
let selectedMessageMedia = null;
let selectedProfileAvatar = null;
let selectedStoryMedia = null;
let editingPostId = null;
let editingPostHasMedia = false;
let focusedStoryId = null;
let currentSettings = null;
let selectedBackgroundImage = null;
let clearBackgroundImage = false;
let realtimeChannel = null;
let refreshTimer = null;
let toastTimer = null;
let appLoadId = 0;
let contacts = [];
let contactUnreadIds = new Set();
let contactActivity = new Map();
let contactPreviews = new Map();
let contactUnreadCounts = new Map();
let contactsLoading = false;
let contactsReloadQueued = false;
let contactsFilter = 'all';
let contactsQuery = '';
let contactsSearchTimer = null;
let contactsSearchResults = [];
let contactsSearchResultsFollowing = new Set();
let contactsSearchResultsPending = new Set();
let storyGroups = new Map();
let activeStoryQueue = [];
let activeStoryIndex = -1;
let searchTimer = null;
let searchResults = [];
let currentMessages = [];
let replyingToMessage = null;
let chatRealtimeChannel = null;
let typingTimer = null;
let deferredInstallPrompt = null;
let reelsOffset = 0;
let reelsExhausted = false;
let reelObserver = null;
let reelLoadObserver = null;
let reelsLoading = false;
let feedOffset = 0;
let feedExhausted = false;
let feedLoading = false;
let feedObserver = null;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function initials(name = 'SR') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join('') || 'SR').toUpperCase();
}

function usernameFor(profile) {
  return profile?.username ? `@${profile.username}` : '@sin_usuario';
}

function effectiveFollowers(profile) {
  return Number(profile?.follower_count || 0) + Number(profile?.follower_bonus || 0);
}

function compactNumber(value = 0) {
  return new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

function chatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const age = Date.now() - date.getTime();
  if (age < 86400000) return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(date);
  if (age < 604800000) return new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(date).replace('.', '');
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit' }).format(date);
}

function prettyDate(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'ahora';
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} d`;
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(new Date(value));
}

function badgeMarkup(profile) {
  const count = effectiveFollowers(profile);
  if (count >= 100000000) return '<span class="verified gold" title="Verificado dorado">✓</span>';
  if (count >= 1000) return '<span class="verified" title="Verificado">✓</span>';
  return '';
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function youtubeVideoId(value) {
  const url = safeHttpsUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0];
  if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/').filter(Boolean)[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
}

function sharedMediaFromLink(value, allowAudio = false) {
  const url = safeHttpsUrl(value);
  if (!url) throw new Error('Usa un enlace HTTPS público y completo.');
  const youtubeId = youtubeVideoId(url.href);
  if (youtubeId) return { url: `https://www.youtube-nocookie.com/embed/${youtubeId}`, type: 'video', provider: 'youtube', publicId: youtubeId, path: null };
  const path = url.pathname.toLowerCase();
  if (/\.(mp4|webm|ogv)(?:$)/.test(path)) return { url: url.href, type: 'video', provider: 'external', publicId: null, path: null };
  if (allowAudio && /\.(mp3|m4a|ogg|wav|weba)(?:$)/.test(path)) return { url: url.href, type: 'audio', provider: 'external', publicId: null, path: null };
  throw new Error(allowAudio
    ? 'El enlace debe ser de YouTube o terminar en .mp4, .webm, .ogv, .mp3, .m4a, .ogg, .wav o .weba.'
    : 'El enlace debe ser de YouTube o terminar en .mp4, .webm o .ogv.');
}

function youtubeEmbedSource(url, loop = false) {
  const id = youtubeVideoId(url);
  if (!id) return null;
  const params = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1' });
  if (loop) {
    params.set('autoplay', '1');
    params.set('mute', '1');
    params.set('loop', '1');
    params.set('playlist', id);
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function mediaMarkup(url, type, className = 'post-media', provider = null, options = {}) {
  const safeUrl = safeHttpsUrl(url);
  if (!safeUrl) return '';
  if (type === 'video') {
    if (provider === 'youtube') {
      const source = youtubeEmbedSource(safeUrl.href, Boolean(options.loop));
      if (!source) return '';
      return `<iframe class="${className} video youtube-embed" src="${escapeHtml(source)}" title="Video compartido" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
    const preload = options.preload === 'none' ? 'none' : 'metadata';
    return `<video class="${className} video"${options.controls === false ? '' : ' controls'}${options.autoplay ? ' autoplay muted' : ''}${options.loop ? ' loop' : ''} playsinline preload="${preload}" src="${escapeHtml(safeUrl.href)}"></video>`;
  }
  if (type === 'audio') return `<audio class="${className}" controls preload="metadata" src="${escapeHtml(safeUrl.href)}"></audio>`;
  return `<img class="${className}" loading="${options.loading || 'lazy'}" decoding="async" alt="Archivo compartido" src="${escapeHtml(safeUrl.href)}" />`;
}

function avatarMarkup(profile, className = 'avatar') {
  const name = profile?.display_name || 'SR';
  const image = profile?.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="Foto de ${escapeHtml(name)}" />` : escapeHtml(initials(name));
  return `<div class="${className}">${image}</div>`;
}

function profileBackgroundStyle(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    return ` style="--profile-hero-background: url('${escapeHtml(parsed.href.replaceAll("'", '%27'))}')"`;
  } catch {
    return '';
  }
}

function setAvatarElement(selector, profile) {
  const element = $(selector);
  if (!element) return;
  const name = profile?.display_name || 'SR';
  element.innerHTML = profile?.avatar_url ? `<img src="${escapeHtml(profile.avatar_url)}" alt="Foto de ${escapeHtml(name)}" />` : escapeHtml(initials(name));
}

function showToast(message, type = 'success') {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show${type === 'error' ? ' error' : ''}`;
  toastTimer = window.setTimeout(() => { toast.className = 'toast'; }, 4300);
}

function setInstallButtonVisible(visible) {
  if (!installAppButton) return;
  installAppButton.hidden = !visible;
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  setInstallButtonVisible(true);
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  setInstallButtonVisible(false);
  showToast('SR se instaló correctamente en este dispositivo.');
});

installAppButton?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    showToast('Usa el menú del navegador y selecciona “Instalar SR” o “Añadir a pantalla de inicio”.');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  setInstallButtonVisible(false);
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.warn('No pudimos activar el modo instalable.', error);
  }));
}


/* SR Web Push */
let pushRegistrationPromise = null;

function vapidPublicKey() {
  return String(
    window.SR_PUSH_CONFIG?.VAPID_PUBLIC_KEY ||
    document.querySelector('meta[name="sr-vapid-public-key"]')?.content ||
    ''
  ).trim();
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function ensurePushSubscription({ requestPermission = false } = {}) {
  if (!currentUser) return { ok: false, reason: 'no-user' };
  if (!('Notification' in window) || !('PushManager' in window) ||
      !('serviceWorker' in navigator) || !window.isSecureContext) {
    return { ok: false, reason: 'unsupported' };
  }

  const key = vapidPublicKey();
  if (!key) return { ok: false, reason: 'missing-vapid-key' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  if (Notification.permission !== 'granted') {
    if (!requestPermission) return { ok: false, reason: 'permission-needed' };
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: permission };
  }

  if (pushRegistrationPromise) return pushRegistrationPromise;

  pushRegistrationPromise = (async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(key),
        });
      }

      const data = subscription.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: currentUser.id,
        endpoint: data.endpoint,
        p256dh: data.keys?.p256dh,
        auth: data.keys?.auth,
        user_agent: navigator.userAgent.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });

      if (error) throw error;
      console.info('[SR Push] Dispositivo registrado correctamente.');
      return { ok: true };
    } catch (error) {
      console.error('[SR Push] No se pudo registrar el dispositivo:', error);
      return { ok: false, reason: 'registration-error', error };
    } finally {
      pushRegistrationPromise = null;
    }
  })();

  return pushRegistrationPromise;
}

async function removePushSubscriptionForCurrentDevice() {
  if (!currentUser || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('endpoint', endpoint);
  } catch (error) {
    console.warn('[SR Push] Error desactivando Push:', error);
  }
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? busyText : button.dataset.originalText;
}

function selectedFilePreview(file, target, onRemove) {
  if (!file) { target.hidden = true; target.innerHTML = ''; return; }
  const url = URL.createObjectURL(file);
  target.hidden = false;
  const preview = file.type.startsWith('video/')
    ? `<video muted src="${url}"></video>`
    : `<img src="${url}" alt="Vista previa del archivo" />`;
  target.innerHTML = `${preview}<button type="button" aria-label="Quitar archivo">×</button>`;
  target.querySelector('button').addEventListener('click', () => { URL.revokeObjectURL(url); onRemove(); });
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem('sr-theme', theme);
  const dark = theme === 'dark';
  const headerTheme = $('#theme-toggle');
  if (headerTheme) { headerTheme.textContent = dark ? '☀' : '☾'; headerTheme.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro'); }
  const settingsTheme = $('#settings-theme-toggle');
  if (settingsTheme) { settingsTheme.textContent = dark ? '☀ Claro' : '☾ Oscuro'; settingsTheme.setAttribute('aria-pressed', String(dark)); }
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === 'register';
  $('#auth-title').textContent = isRegister ? 'Crea tu cuenta' : 'Qué gusto verte';
  $('#auth-subtitle').textContent = isRegister ? 'Es gratis y solo te tomará un momento.' : 'Entra para volver a tu espacio.';
  $('#display-name-field').hidden = !isRegister;
  displayNameInput.required = isRegister;
  if (!isRegister) displayNameInput.value = '';
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  passwordInput.placeholder = isRegister ? 'Mínimo 8 caracteres' : 'Tu contraseña';
  authSubmit.innerHTML = isRegister ? 'Crear mi cuenta <span>→</span>' : 'Entrar a SR <span>→</span>';
  authSubmit.dataset.originalText = authSubmit.innerHTML;
  $$('[data-auth-mode]').forEach((tab) => {
    const active = tab.dataset.authMode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
}

function renderCurrentProfile() {
  const name = currentProfile?.display_name || currentUser?.email?.split('@')[0] || 'Tu perfil';
  const handle = usernameFor(currentProfile);
  const followers = effectiveFollowers(currentProfile);
  ['#sidebar-avatar', '#composer-avatar', '#create-post-avatar', '#profile-avatar'].forEach((selector) => setAvatarElement(selector, currentProfile));
  $('#mini-profile-name').textContent = name;
  $('#sidebar-username').textContent = handle;
  $('#profile-name').innerHTML = `${escapeHtml(name)}${badgeMarkup(currentProfile)}`;
  $('#profile-handle').textContent = handle;
  $('#profile-bio').textContent = currentProfile?.bio || 'Añade una bio para que la comunidad te conozca.';
  $('#sidebar-post-count').textContent = compactNumber(currentProfile?.post_count);
  $('#sidebar-follower-count').textContent = compactNumber(followers);
  document.body.dataset.profileTheme = currentProfile?.profile_theme || 'nebula';
  try {
    const url = currentProfile?.background_url ? new URL(currentProfile.background_url) : null;
    if (url?.protocol === 'https:') {
      document.body.dataset.customBackground = 'true';
      document.body.style.setProperty('--profile-background', `url("${url.href.replaceAll('"', '%22')}")`);
    } else {
      document.body.dataset.customBackground = 'false';
      document.body.style.removeProperty('--profile-background');
    }
  } catch {
    document.body.dataset.customBackground = 'false';
    document.body.style.removeProperty('--profile-background');
  }
}

async function getProfile(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCurrentProfile() {
  currentProfile = await getProfile(currentUser.id);
  renderCurrentProfile();
}

async function profilesForIds(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!uniqueIds.length) return map;
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .in('id', uniqueIds);
  if (error) throw error;
  data.forEach((profile) => map.set(profile.id, profile));
  return map;
}

async function reactionState(postIds) {
  const state = new Map(postIds.map((id) => [id, { liked: false, reposted: false }]));
  if (!postIds.length) return state;
  const [{ data: likes, error: likeError }, { data: reposts, error: repostError }] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds),
    supabase.from('reposts').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds),
  ]);
  if (likeError) throw likeError;
  if (repostError) throw repostError;
  likes.forEach(({ post_id: id }) => { state.get(id).liked = true; });
  reposts.forEach(({ post_id: id }) => { state.get(id).reposted = true; });
  return state;
}

function postCard(post, profile, reactions = {}, compact = false) {
  const author = profile || {};
  const name = author.display_name || 'Miembro de SR';
  const handle = usernameFor(author);
  const canEdit = post.author_id === currentUser.id;
  const media = mediaMarkup(post.media_url || post.image_url, post.media_type || (post.image_url ? 'image' : null), 'post-media', post.media_provider, { preload: 'metadata' });
  return `
    <article class="post-card${compact ? ' compact' : ''}" data-post-id="${post.id}">
      <header class="post-header">
        <button class="post-author" type="button" data-open-profile="${post.author_id}">${avatarMarkup(author)}<span><b>${escapeHtml(name)}${badgeMarkup(author)}</b><small>${escapeHtml(handle)} · ${escapeHtml(prettyDate(post.created_at))}</small></span></button>
        ${canEdit ? `<div class="post-owner-actions"><button class="post-edit" type="button" data-edit-post="${post.id}" aria-label="Editar publicación">✎</button><button class="post-delete" type="button" data-delete-post="${post.id}" aria-label="Eliminar publicación">×</button></div>` : ''}
      </header>
      ${post.content ? (() => {
        const safeContent = escapeHtml(post.content).replaceAll('\n', '<br>');
        const isLong = String(post.content).length > 280 || String(post.content).split(/\n/).length > 7;
        return `<div class="post-content-wrap${isLong ? ' has-more' : ''}"><p class="post-content${isLong ? ' is-collapsed' : ''}">${safeContent}</p>${isLong ? '<button class="post-expand" type="button" data-post-expand aria-expanded="false">Ver más</button>' : ''}</div>`;
      })() : ''}
      ${media}
      <footer class="post-actions">
        <button class="post-action liked${reactions.liked ? ' active' : ''}" type="button" data-action="like" data-post-id="${post.id}" aria-label="Me gusta">♡ <span>${compactNumber(post.like_count)}</span></button>
        <button class="post-action" type="button" data-action="comments" data-post-id="${post.id}" aria-label="Comentar">◯ <span>${compactNumber(post.comment_count)}</span></button>
      </footer>
    </article>`;
}
function emptyPosts(message = 'Aún no hay publicaciones.') {
  return `<section class="empty-state"><strong>${message}</strong>La próxima idea puede encender la conversación ✦</section>`;
}

async function fetchPosts(authorId = null, { offset = 0, limit = authorId ? 50 : 12 } = {}) {
  let query = supabase
    .from('posts')
    .select('id, author_id, content, image_url, media_url, media_type, media_provider, like_count, comment_count, repost_count, created_at');
  if (authorId) query = query.eq('author_id', authorId);
  const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const [profiles, reactions] = await Promise.all([
    profilesForIds(data.map((post) => post.author_id)),
    reactionState(data.map((post) => post.id)),
  ]);
  return { posts: data, profiles, reactions };
}

function setupFeedInfiniteScroll() {
  if (!feedSentinel) return;
  feedObserver?.disconnect();
  if (feedExhausted) { loadMorePostsButton.hidden = true; return; }
  if (!('IntersectionObserver' in window)) { loadMorePostsButton.hidden = false; return; }
  loadMorePostsButton.hidden = true;
  feedObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadFeed({ append: true });
  }, { rootMargin: '700px 0px' });
  feedObserver.observe(feedSentinel);
}

async function loadFeed({ append = false } = {}) {
  if (feedLoading || (append && feedExhausted)) return;
  const pageSize = 12;
  if (!append) {
    feedOffset = 0;
    feedExhausted = false;
    postsList.innerHTML = '';
  }
  feedLoading = true;
  feedStatus.textContent = append ? 'Cargando más publicaciones…' : 'Actualizando publicaciones…';
  try {
    const { posts, profiles, reactions } = await fetchPosts(null, { offset: feedOffset, limit: pageSize });
    const markup = posts.map((post) => postCard(post, profiles.get(post.author_id), reactions.get(post.id))).join('');
    if (append) postsList.insertAdjacentHTML('beforeend', markup);
    else postsList.innerHTML = markup || emptyPosts();
    feedOffset += posts.length;
    feedExhausted = posts.length < pageSize;
    feedStatus.textContent = feedOffset ? `${feedOffset} publicación${feedOffset === 1 ? '' : 'es'} cargada${feedOffset === 1 ? '' : 's'}` : '';
    setupFeedInfiniteScroll();
  } catch (error) {
    console.error(error);
    feedStatus.textContent = 'No fue posible cargar las publicaciones.';
    if (error.code === '42703') showToast('Ejecuta supabase-social-features.sql para activar las nuevas funciones.', 'error');
    else showToast(error.message || 'No pudimos cargar el inicio.', 'error');
  } finally {
    feedLoading = false;
  }
}

function reelCard(post, profile, reactions = {}) {
  const author = profile || {};
  const name = author.display_name || 'Miembro de SR';
  const media = mediaMarkup(post.media_url, 'video', 'reel-video', post.media_provider, { autoplay: true, loop: true, controls: false });
  if (!media) return '';
  const sound = post.media_provider === 'youtube' ? '' : '<button class="reel-action" type="button" data-reel-sound aria-label="Activar o silenciar sonido">♬</button>';
  return `<article class="reel-card" data-post-id="${post.id}">
    <div class="reel-media">${media}</div><div class="reel-overlay"></div>
    <div class="reel-top"><button class="reel-author" type="button" data-open-profile="${post.author_id}">${avatarMarkup(author, 'avatar reel-avatar')}<span><b>${escapeHtml(name)}${badgeMarkup(author)}</b><small>${escapeHtml(usernameFor(author))}</small></span></button>${post.author_id === currentUser.id ? `<button class="reel-edit" type="button" data-edit-post="${post.id}" aria-label="Editar Reel">✎</button><button class="reel-delete" type="button" data-delete-post="${post.id}" aria-label="Eliminar Reel">×</button>` : ''}</div>
    <div class="reel-bottom"><div class="reel-copy">${post.content ? `<p>${escapeHtml(post.content).replaceAll('\n', '<br>')}</p>` : '<p>Video compartido en SR</p>'}<small>${escapeHtml(prettyDate(post.created_at))}</small></div>
      <div class="reel-actions"><button class="reel-action liked${reactions.liked ? ' active' : ''}" type="button" data-action="like" data-post-id="${post.id}" aria-label="Me gusta">♥<span>${compactNumber(post.like_count)}</span></button><button class="reel-action" type="button" data-action="comments" data-post-id="${post.id}" aria-label="Comentar">◌<span>${compactNumber(post.comment_count)}</span></button><button class="reel-action reposted${reactions.reposted ? ' active' : ''}" type="button" data-action="repost" data-post-id="${post.id}" aria-label="Repostear">↻<span>${compactNumber(post.repost_count)}</span></button>${sound}</div>
    </div>
  </article>`;
}

function setupReelPlayback() {
  if (!reelsList || !('IntersectionObserver' in window)) return;
  reelObserver?.disconnect();
  reelObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector('video');
      if (!video) return;
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
  }, { root: reelsList, threshold: 0.7 });
  reelsList.querySelectorAll('.reel-card').forEach((card) => reelObserver.observe(card));
}

function setupReelInfiniteScroll() {
  if (!reelsList) return;
  reelLoadObserver?.disconnect();
  reelsList.querySelector('.reel-load-sentinel')?.remove();
  if (reelsExhausted) { loadMoreReelsButton.hidden = true; return; }
  if (!('IntersectionObserver' in window)) { loadMoreReelsButton.hidden = false; return; }
  const sentinel = document.createElement('div');
  sentinel.className = 'reel-load-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  reelsList.append(sentinel);
  loadMoreReelsButton.hidden = true;
  reelLoadObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadReels({ append: true });
  }, { root: reelsList, rootMargin: '0px 0px 650px' });
  reelLoadObserver.observe(sentinel);
}

async function loadReels({ append = false } = {}) {
  if (!reelsList || reelsLoading || (append && reelsExhausted)) return;
  const pageSize = 8;
  if (!append) {
    reelsOffset = 0;
    reelsExhausted = false;
    reelsList.innerHTML = '';
    reelsStatus.textContent = 'Cargando Reels…';
  }
  reelsLoading = true;
  loadMoreReelsButton.hidden = true;
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, author_id, content, media_url, media_type, media_provider, like_count, comment_count, repost_count, created_at')
      .eq('media_type', 'video')
      .order('created_at', { ascending: false })
      .range(reelsOffset, reelsOffset + pageSize - 1);
    if (error) throw error;
    const posts = data || [];
    const [profiles, reactions] = await Promise.all([
      profilesForIds(posts.map((post) => post.author_id)),
      reactionState(posts.map((post) => post.id)),
    ]);
    const markup = posts.map((post) => reelCard(post, profiles.get(post.author_id), reactions.get(post.id))).filter(Boolean).join('');
    if (append) reelsList.insertAdjacentHTML('beforeend', markup);
    else reelsList.innerHTML = markup || emptyPosts('Todavía no hay Reels.');
    reelsOffset += posts.length;
    reelsExhausted = posts.length < pageSize;
    reelsStatus.textContent = posts.length || append ? `${reelsOffset} Reel${reelsOffset === 1 ? '' : 's'} cargado${reelsOffset === 1 ? '' : 's'}` : '';
    setupReelPlayback();
    setupReelInfiniteScroll();
  } catch (error) {
    console.error(error);
    reelsStatus.textContent = '';
    if (!append) reelsList.innerHTML = emptyPosts('No pudimos cargar los Reels.');
    showToast(error.message || 'No pudimos cargar los Reels.', 'error');
  } finally {
    reelsLoading = false;
  }
}

function extractHashtags(posts) {
  const counts = new Map();
  posts.forEach((post) => {
    const matches = String(post.content || '').match(/#[\p{L}\p{N}_]{2,40}/gu) || [];
    matches.forEach((tag) => {
      const normalized = tag.toLocaleLowerCase('es-CO');
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, 10);
}

function renderTrendingTags(posts) {
  const container = $('#trending-tags');
  const tags = extractHashtags(posts);
  container.innerHTML = tags.length
    ? tags.map(([tag, count]) => `<button type="button" class="trending-tag" data-explore-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span>${count}</span></button>`).join('')
    : '<span class="notification-empty">Usa #hashtags en tus publicaciones para crear tendencias.</span>';
}

async function loadExplore(rawQuery = $('#explore-query')?.value || '') {
  const query = rawQuery.trim().slice(0, 80);
  const status = $('#explore-status');
  const results = $('#explore-results');
  status.textContent = 'Buscando en SR…';
  results.innerHTML = '';
  try {
    const [searchResponse, trendsResponse] = await Promise.all([
      supabase.rpc('sr_search_posts', { search_text: query, result_limit: 60 }),
      query ? supabase.rpc('sr_search_posts', { search_text: '', result_limit: 100 }) : Promise.resolve(null),
    ]);
    if (searchResponse.error) throw searchResponse.error;
    if (trendsResponse?.error) throw trendsResponse.error;
    const posts = searchResponse.data || [];
    const [profiles, reactions] = await Promise.all([
      profilesForIds(posts.map((post) => post.author_id)),
      reactionState(posts.map((post) => post.id)),
    ]);
    renderTrendingTags(trendsResponse?.data || posts);
    results.innerHTML = posts.length
      ? posts.map((post) => postCard(post, profiles.get(post.author_id), reactions.get(post.id))).join('')
      : emptyPosts(query ? 'No encontramos publicaciones con esa búsqueda.' : 'Todavía no hay publicaciones para explorar.');
    status.textContent = query ? `${posts.length} resultado${posts.length === 1 ? '' : 's'} para “${query}”` : `${posts.length} publicaciones recientes`;
  } catch (error) {
    console.error(error);
    status.textContent = '';
    results.innerHTML = emptyPosts('Activa supabase-social-advanced.sql para usar Explorar.');
    showToast(error.message || 'No pudimos buscar publicaciones.', 'error');
  }
}

async function loadHighlights(authorId) {
  const container = $('#profile-highlights');
  if (!container) return;
  try {
    const { data: highlights, error } = await supabase
      .from('story_highlights')
      .select('id, title, cover_url, created_at')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!highlights.length) { container.innerHTML = ''; return; }
    const { data: items, error: itemError } = await supabase
      .from('story_highlight_items')
      .select('highlight_id, media_url, media_type')
      .in('highlight_id', highlights.map((highlight) => highlight.id));
    if (itemError) throw itemError;
    const covers = new Map();
    items.forEach((item) => { if (!covers.has(item.highlight_id)) covers.set(item.highlight_id, item); });
    container.innerHTML = `<p>DESTACADAS</p><div>${highlights.map((highlight) => {
      const item = covers.get(highlight.id);
      const visual = highlight.cover_url || item?.media_url;
      return `<button class="highlight-chip" type="button" data-highlight-id="${highlight.id}">${visual ? `<img src="${escapeHtml(visual)}" alt="Destacada ${escapeHtml(highlight.title)}" />` : '<span>✦</span>'}<b>${escapeHtml(highlight.title)}</b></button>`;
    }).join('')}</div>`;
  } catch (error) {
    console.warn('Las historias destacadas aún no están disponibles.', error);
    container.innerHTML = '';
  }
}

async function loadStories() {
  const container = $('#stories-list');
  if (!container || !currentUser) return;
  try {
    await supabase.rpc('sr_purge_expired_stories');
    const { data, error } = await supabase
      .from('stories')
      .select('id, author_id, caption, media_url, media_path, media_type, created_at, expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });
    if (error) throw error;
    const profiles = await profilesForIds(data.map((story) => story.author_id));
    storyGroups = new Map();
    data.forEach((story) => {
      const group = storyGroups.get(story.author_id) || [];
      group.push(story);
      storyGroups.set(story.author_id, group);
    });
    const groups = [...storyGroups.entries()];
    const ownStories = storyGroups.get(currentUser.id) || [];
    container.innerHTML = `
      <button class="story-chip mine" type="button" ${ownStories.length ? `data-open-story="${ownStories[0].id}"` : 'data-create-story="true"'}><span class="story-ring">${avatarMarkup(currentProfile)}</span>${ownStories.length > 1 ? `<em>${ownStories.length}</em>` : ''}<span>Tu historia</span></button>
      ${groups.filter(([authorId]) => authorId !== currentUser.id).map(([authorId, stories]) => { const profile = profiles.get(authorId) || {}; return `<button class="story-chip" type="button" data-open-story="${stories[0].id}"><span class="story-ring">${avatarMarkup(profile)}</span>${stories.length > 1 ? `<em>${stories.length}</em>` : ''}<span>${escapeHtml(profile.display_name || 'SR')}</span></button>`; }).join('')}`;
  } catch (error) {
    console.warn('Historias pendientes de activar.', error);
    container.innerHTML = '<div class="story-empty">Ejecuta la migración de historias para compartir momentos.</div>';
  }
}

async function openStoryViewer(storyId, keepQueue = false) {
  if (!keepQueue) {
    const groupedStories = [...storyGroups.values()].find((stories) => stories.some((story) => story.id === storyId));
    activeStoryQueue = groupedStories || [{ id: storyId }];
    activeStoryIndex = Math.max(0, activeStoryQueue.findIndex((story) => story.id === storyId));
  }
  const queuedStory = activeStoryQueue[activeStoryIndex];
  const activeStoryId = queuedStory?.id || storyId;
  focusedStoryId = activeStoryId;
  $('#story-viewer-content').innerHTML = '<div class="story-viewer"><div class="story-viewer-media">Cargando historia…</div></div>';
  if (!storyViewerDialog.open) storyViewerDialog.showModal();
  try {
    const { data: story, error } = await supabase
      .from('stories')
      .select('id, author_id, caption, media_url, media_path, media_type, created_at, expires_at')
      .eq('id', activeStoryId)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (error) throw error;
    const [{ data: reactionRows, error: reactionError }, { data: comments, error: commentError }, profile] = await Promise.all([
      supabase.from('story_reactions').select('story_id, user_id').eq('story_id', activeStoryId),
      supabase.from('story_comments').select('id, author_id, content, created_at').eq('story_id', activeStoryId).order('created_at', { ascending: true }),
      getProfile(story.author_id),
    ]);
    if (reactionError) throw reactionError;
    if (commentError) throw commentError;
    const commentProfiles = await profilesForIds(comments.map((comment) => comment.author_id));
    const reacted = reactionRows.some((reaction) => reaction.user_id === currentUser.id);
    const ownStory = story.author_id === currentUser.id;
    const progress = activeStoryQueue.length > 1 ? `<div class="story-progress" aria-label="Historia ${activeStoryIndex + 1} de ${activeStoryQueue.length}">${activeStoryQueue.map((_, index) => `<i class="${index <= activeStoryIndex ? 'active' : ''}"></i>`).join('')}</div>` : '';
    const navigation = activeStoryQueue.length > 1 ? `<div class="story-navigation"><button type="button" data-story-prev ${activeStoryIndex === 0 ? 'disabled' : ''} aria-label="Historia anterior">‹</button><span>${activeStoryIndex + 1} de ${activeStoryQueue.length}</span><button type="button" data-story-next ${activeStoryIndex === activeStoryQueue.length - 1 ? 'disabled' : ''} aria-label="Siguiente historia">›</button></div>` : '';
    $('#story-viewer-content').innerHTML = `
      <article class="story-viewer">
        ${progress}
        <header class="story-viewer-header">${avatarMarkup(profile)}<div><b>${escapeHtml(profile?.display_name || 'Miembro de SR')}</b><span>${escapeHtml(prettyDate(story.created_at))}</span></div></header>
        <div class="story-viewer-media">${mediaMarkup(story.media_url, story.media_type, 'story-file')}${story.caption ? `<p class="story-viewer-caption">${escapeHtml(story.caption)}</p>` : ''}</div>
        ${navigation}
        <div class="story-actions"><button class="story-reaction${reacted ? ' active' : ''}" type="button" data-story-reaction="${story.id}">♥ <span>${reactionRows.length}</span></button>${ownStory ? `<button class="story-highlight" type="button" data-story-highlight="${story.id}">✦ Destacar</button><button class="story-delete" type="button" data-story-delete="${story.id}">Eliminar</button>` : ''}</div>
        <section class="story-comments">${comments.length ? comments.map((comment) => { const author = commentProfiles.get(comment.author_id) || {}; return `<p class="story-comment"><b>${escapeHtml(author.display_name || 'SR')}</b> ${escapeHtml(comment.content)}</p>`; }).join('') : '<p class="story-comment">Aún no hay respuestas.</p>'}</section>
        <form id="story-comment-form" class="story-comment-form" novalidate><input id="story-comment-input" maxlength="1000" placeholder="Responder a la historia" /><button type="submit">Enviar</button></form>
      </article>`;
  } catch (error) {
    console.error(error);
    $('#story-viewer-content').innerHTML = `<div class="story-viewer"><div class="story-viewer-media">${escapeHtml(error.message || 'Esta historia ya no está disponible.')}</div></div>`;
  }
}

async function toggleStoryReaction(storyId) {
  const { data: currentReaction, error: readError } = await supabase
    .from('story_reactions').select('story_id').eq('story_id', storyId).eq('user_id', currentUser.id).maybeSingle();
  if (readError) throw readError;
  const { error } = currentReaction
    ? await supabase.from('story_reactions').delete().eq('story_id', storyId).eq('user_id', currentUser.id)
    : await supabase.from('story_reactions').insert({ story_id: storyId, user_id: currentUser.id, reaction: '❤️' });
  if (error) throw error;
  await openStoryViewer(storyId, true);
}

async function deleteStory(storyId) {
  if (!window.confirm('¿Eliminar esta historia? Esta acción no se puede deshacer.')) return;
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('id, media_path, media_url')
    .eq('id', storyId)
    .eq('author_id', currentUser.id)
    .single();
  if (storyError) throw storyError;
  const { data: highlightedItems, error: highlightedError } = await supabase
    .from('story_highlight_items')
    .select('id')
    .eq('media_url', story.media_url)
    .limit(1);
  if (highlightedError) throw highlightedError;
  const { error } = await supabase.from('stories').delete().eq('id', story.id).eq('author_id', currentUser.id);
  if (error) throw error;
  if (!highlightedItems.length && story.media_path) {
    const { error: mediaError } = await supabase.storage.from('media').remove([story.media_path]);
    if (mediaError) console.warn('No pudimos liberar el archivo de la historia eliminada.', mediaError);
  }
  storyViewerDialog.close();
  activeStoryQueue = [];
  activeStoryIndex = -1;
  await loadStories();
  showToast('Historia eliminada.');
}

async function highlightStory(storyId) {
  const title = window.prompt('Nombre para esta destacada:', 'Destacada');
  if (!title?.trim()) return;
  const { data: story, error: storyError } = await supabase.from('stories').select('media_url, media_type, caption').eq('id', storyId).single();
  if (storyError) throw storyError;
  const { data: highlight, error: highlightError } = await supabase
    .from('story_highlights').insert({ author_id: currentUser.id, title: title.trim(), cover_url: story.media_url }).select('id').single();
  if (highlightError) throw highlightError;
  const { error: itemError } = await supabase.from('story_highlight_items').insert({ highlight_id: highlight.id, media_url: story.media_url, media_type: story.media_type, caption: story.caption || null });
  if (itemError) throw itemError;
  showToast('Historia guardada en tus destacadas.');
}

async function openHighlight(highlightId) {
  try {
    const { data: highlight, error } = await supabase.from('story_highlights').select('id, author_id, title').eq('id', highlightId).single();
    if (error) throw error;
    const { data: items, error: itemError } = await supabase.from('story_highlight_items').select('media_url, media_type, caption, created_at').eq('highlight_id', highlightId).order('created_at', { ascending: true }).limit(1);
    if (itemError) throw itemError;
    if (!items.length) throw new Error('Esta destacada no tiene contenido.');
    const profile = await getProfile(highlight.author_id);
    const item = items[0];
    $('#story-viewer-content').innerHTML = `<article class="story-viewer"><header class="story-viewer-header">${avatarMarkup(profile)}<div><b>${escapeHtml(profile?.display_name || 'SR')}</b><span>Destacada · ${escapeHtml(highlight.title)}</span></div></header><div class="story-viewer-media">${mediaMarkup(item.media_url, item.media_type, 'story-file')}${item.caption ? `<p class="story-viewer-caption">${escapeHtml(item.caption)}</p>` : ''}</div></article>`;
    storyViewerDialog.showModal();
  } catch (error) { showToast(error.message || 'No pudimos abrir la destacada.', 'error'); }
}

function setActiveView(view) {
  // La navegación principal de SR tiene exactamente tres destinos visibles.
  if (!['feed', 'messages', 'profile', 'settings'].includes(view)) view = 'feed';
  activeView = view;
  $$('.view-section').forEach((section) => { section.hidden = section.id !== `${view}-view`; });
  $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  const searchButton = $('#feed-search-toggle');
  if (searchButton) searchButton.hidden = view !== 'feed';
  if (view !== 'feed') {
    const panel = $('#feed-search-panel');
    if (panel) panel.hidden = true;
  }
}

function openSettings() {
  settingsPreviousView = activeView === 'settings' ? 'profile' : activeView;
  setActiveView('settings');
  return loadSettings();
}

async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from('account_settings')
      .select('email_notifications, push_notifications, allow_messages_from, show_activity')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) throw error;
    currentSettings = data || { email_notifications: true, push_notifications: true, allow_messages_from: 'everyone', show_activity: true };
    $('#email-notifications').checked = currentSettings.email_notifications;
    $('#push-notifications').checked = currentSettings.push_notifications;
    $('#show-activity').checked = currentSettings.show_activity;
    $('#allow-messages-from').value = currentSettings.allow_messages_from;
    $('#account-private').checked = Boolean(currentProfile?.is_private);
    $('#show-follower-count').checked = currentProfile?.show_follower_count !== false;
    $('#comments-from').value = currentProfile?.comments_from || 'everyone';
    const selected = document.querySelector(`input[name="profile-theme"][value="${currentProfile?.profile_theme || 'nebula'}"]`);
    if (selected) selected.checked = true;
    setTheme(localStorage.getItem('sr-theme') || 'light');
    if (!selectedBackgroundImage && !clearBackgroundImage) renderBackgroundPreview(currentProfile?.background_url || null);
  } catch (error) {
    console.warn('Ajustes pendientes de activar.', error);
    showToast('Ejecuta supabase-social-extras.sql para guardar ajustes.', 'error');
  }
}

function renderBackgroundPreview(url) {
  const preview = $('#background-image-preview');
  if (!url) { preview.hidden = true; preview.innerHTML = ''; return; }
  preview.hidden = false;
  preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Vista previa del fondo" /><button id="clear-background-image" type="button">Quitar imagen</button>`;
  $('#clear-background-image').addEventListener('click', () => {
    selectedBackgroundImage = null;
    clearBackgroundImage = true;
    $('#background-image-input').value = '';
    renderBackgroundPreview(null);
  });
}

async function relationshipStates(ids) {
  const uniqueIds = [...new Set(ids.filter((id) => id && id !== currentUser.id))];
  const empty = { following: new Set(), pending: new Set() };
  if (!uniqueIds.length) return empty;
  const [{ data: followRows, error: followError }, { data: requestRows, error: requestError }] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', currentUser.id).in('following_id', uniqueIds),
    supabase.from('follow_requests').select('target_id').eq('requester_id', currentUser.id).in('target_id', uniqueIds),
  ]);
  if (followError) throw followError;
  if (requestError) throw requestError;
  return { following: new Set(followRows.map((row) => row.following_id)), pending: new Set(requestRows.map((row) => row.target_id)) };
}

async function loadFollowRequests() {
  const container = $('#pending-follow-requests');
  if (!container || !currentUser) return;
  const { data, error } = await supabase
    .from('follow_requests')
    .select('requester_id, created_at')
    .eq('target_id', currentUser.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!data.length) { container.innerHTML = ''; return; }
  const profiles = await profilesForIds(data.map((request) => request.requester_id));
  container.innerHTML = `<b>Solicitudes para seguirte</b>${data.map((request) => {
    const profile = profiles.get(request.requester_id) || {};
    return `<article class="follow-request">${avatarMarkup(profile)}<span>${escapeHtml(profile.display_name || 'Miembro de SR')}</span><button type="button" data-accept-follow-request="${request.requester_id}">Aceptar</button><button type="button" data-reject-follow-request="${request.requester_id}">×</button></article>`;
  }).join('')}`;
}

function profilePostTile(post, profile, reactions = {}) {
  const mediaType = post.media_type || (post.image_url ? 'image' : null);
  const mediaUrl = post.media_url || post.image_url || '';
  const isVideo = mediaType === 'video' || /\.(mp4|webm|mov|m4v)(?:\?|#|$)/i.test(mediaUrl) || post.media_provider === 'youtube';
  const media = mediaMarkup(post.media_url || post.image_url, mediaType, 'profile-post-media', post.media_provider, { preload: 'metadata', loading: 'eager' });
  const visual = media || `<div class="profile-text-tile">${escapeHtml(post.content || 'Publicación').replaceAll('\\n','<br>')}</div>`;
  return `<button class="profile-post-tile" type="button" data-profile-post="${post.id}" data-profile-content-type="${isVideo ? 'video' : 'post'}" aria-label="Abrir publicación">
    ${visual}
    <span class="profile-post-overlay"><span>♡ ${compactNumber(post.like_count)}</span><span>◯ ${compactNumber(post.comment_count)}</span></span>
  </button>`;
}

function setProfileContentTab(tab) {
  const list = $('#profile-posts-list');
  if (!list) return;
  $$('.profile-tab').forEach((button) => {
    const active = button.dataset.profileTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('#profile-posts-list .profile-post-tile').forEach((tile) => {
    tile.hidden = tile.dataset.profileContentType !== tab;
  });
  const visible = $$('#profile-posts-list .profile-post-tile:not([hidden])');
  let empty = $('#profile-filter-empty');
  if (!visible.length) {
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'profile-filter-empty';
      empty.className = 'empty-state profile-filter-empty';
      list.appendChild(empty);
    }
    empty.innerHTML = tab === 'video'
      ? '<strong>Aún no hay videos</strong><span>Los videos que publiques aparecerán aquí.</span>'
      : '<strong>Aún no hay publicaciones</strong><span>Las fotos y publicaciones que compartas aparecerán aquí.</span>';
    empty.hidden = false;
  } else if (empty) {
    empty.hidden = true;
  }
}

async function showProfile(id = currentUser.id) {
  viewedProfileId = id;
  setActiveView('profile');
  const target = $('#profile-page-content');
  target.innerHTML = '<div class="feed-status">Cargando perfil…</div>';
  $('#profile-posts-list').innerHTML = '';
  try {
    const profile = await getProfile(id);
    if (!profile) throw new Error('No encontramos este perfil.');
    const ownProfile = id === currentUser.id;
    let follows = false;
    let pending = false;
    if (!ownProfile) {
      const states = await relationshipStates([id]);
      follows = states.following.has(id);
      pending = states.pending.has(id);
    }
    const name = profile.display_name || 'Miembro de SR';
    const backgroundStyle = profileBackgroundStyle(profile.background_url);
    const canSeeFollowerCount = ownProfile || profile.show_follower_count !== false;
    const isProtected = profile.is_private && !ownProfile && !follows;
    const followLabel = follows ? 'Siguiendo' : pending ? 'Solicitud enviada' : profile.is_private ? 'Solicitar seguir' : 'Seguir';
    target.innerHTML = `
      <section class="profile-hero theme-${escapeHtml(profile.profile_theme || 'nebula')}${backgroundStyle ? ' has-custom-background' : ''}"${backgroundStyle}>
        <div class="profile-identity">${avatarMarkup(profile, 'avatar avatar-xl')}<div class="profile-info"><div class="profile-topline"><h1>${escapeHtml(name)}${badgeMarkup(profile)}${profile.is_private ? '<span class="private-profile-badge">⌑ Privada</span>' : ''}</h1>${ownProfile ? `
              <div class="profile-menu-wrap">
                <button id="profile-menu-button" class="profile-menu-button" type="button" aria-label="Más opciones" aria-haspopup="menu" aria-expanded="false">⋯</button>
                <div id="profile-menu" class="profile-menu" role="menu" hidden>
                  <button id="profile-menu-settings" class="profile-menu-item" type="button" role="menuitem"><span>⚙</span>Ajustes</button>
                  <button id="profile-menu-sign-out" class="profile-menu-item profile-menu-danger" type="button" role="menuitem"><span>↪</span>Cerrar sesión</button>
                </div>
              </div>` : ''}</div><p class="handle">${escapeHtml(usernameFor(profile))}</p></div></div>
        <p class="bio">${escapeHtml(profile.bio || 'Esta persona aún no agregó una bio.')}</p>
        <div class="profile-stats">
          <button class="profile-stat" type="button"><b>${compactNumber(profile.post_count)}</b> publicaciones</button>
          <button class="profile-stat" type="button"><b>${compactNumber(profile.following_count)}</b> siguiendo</button>
          <button class="profile-stat" type="button"><b>${canSeeFollowerCount ? compactNumber(effectiveFollowers(profile)) : '—'}</b>${canSeeFollowerCount ? 'seguidores' : 'seguidores privados'}</button>
        </div>
        <div class="profile-actions">
          ${ownProfile ? '<button id="profile-edit-page" class="button button-secondary" type="button">Editar perfil</button><section id="pending-follow-requests" class="follow-requests"></section>' : `<button id="follow-button" class="button ${follows || pending ? 'button-secondary' : 'button-primary'}" type="button" data-following="${follows}" data-pending="${pending}">${followLabel}</button><button id="profile-message-button" class="button button-secondary" type="button">Mensaje</button>`}
        </div>
      </section>
      <section id="profile-highlights" class="profile-highlights" aria-label="Historias destacadas"></section>
      <div class="profile-tabs" role="tablist" aria-label="Contenido del perfil">
        <button class="profile-tab active" type="button" role="tab" data-profile-tab="post" aria-selected="true">▦ <span>Publicaciones</span></button>
        <button class="profile-tab" type="button" role="tab" data-profile-tab="video" aria-selected="false">▷ <span>Videos</span></button>
      </div>`;

    await loadHighlights(id);
    if (ownProfile) await loadFollowRequests();

    if (isProtected) {
      $('#profile-posts-list').innerHTML = emptyPosts('Esta cuenta es privada. Sigue a la persona y espera su aprobación para ver sus publicaciones.');
    } else {
      const { posts, profiles, reactions } = await fetchPosts(id);
      $('#profile-posts-list').innerHTML = posts.length
        ? posts.map((post) => profilePostTile(post, profiles.get(post.author_id), reactions.get(post.id))).join('')
        : emptyPosts('Todavía no ha publicado.');
    }

    $$('.profile-tab').forEach((button) => {
      button.addEventListener('click', () => setProfileContentTab(button.dataset.profileTab));
    });
    setProfileContentTab('post');

    $('#profile-edit-page')?.addEventListener('click', openProfileDialog);

    const profileMenuButton = $('#profile-menu-button');
    const profileMenu = $('#profile-menu');
    const profileMenuSettings = $('#profile-menu-settings');
    const profileMenuSignOut = $('#profile-menu-sign-out');

    const closeProfileMenu = () => {
      if (!profileMenu || profileMenu.hidden) return;
      profileMenu.hidden = true;
      profileMenuButton?.setAttribute('aria-expanded', 'false');
    };

    profileMenuButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!profileMenu) return;
      const willOpen = profileMenu.hidden;
      profileMenu.hidden = !willOpen;
      profileMenuButton.setAttribute('aria-expanded', String(willOpen));
    });

    profileMenuSettings?.addEventListener('click', async () => {
      closeProfileMenu();
      await openSettings();
    });

    profileMenuSignOut?.addEventListener('click', async () => {
      closeProfileMenu();
      const signOutButton = $('#sign-out-button');
      if (signOutButton) {
        signOutButton.click();
        return;
      }
      const { error } = await supabase.auth.signOut();
      if (error) showToast(error.message, 'error');
    });

    $('#follow-button')?.addEventListener('click', () => toggleFollow(profile, follows, pending));
    $('#profile-message-button')?.addEventListener('click', async () => { await openChat(profile); });
  } catch (error) {
    console.error(error);
    target.innerHTML = `<section class="empty-state"><strong>No se pudo abrir el perfil.</strong>${escapeHtml(error.message || 'Intenta de nuevo.')}</section>`;
  }
}

document.addEventListener('click', (event) => {
  const menu = $('#profile-menu');
  const wrapper = event.target.closest?.('.profile-menu-wrap');
  if (menu && !wrapper) {
    menu.hidden = true;
    $('#profile-menu-button')?.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menu = $('#profile-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $('#profile-menu-button')?.setAttribute('aria-expanded', 'false');
});

async function updateRelationship(profile, follows, pending = false) {
  if (profile.is_private && !follows) {
    const request = pending
      ? supabase.from('follow_requests').delete().eq('requester_id', currentUser.id).eq('target_id', profile.id)
      : supabase.from('follow_requests').insert({ requester_id: currentUser.id, target_id: profile.id });
    const { error } = await request;
    if (error) throw error;
    return pending ? 'Solicitud cancelada.' : `Solicitud enviada a ${profile.display_name || 'esta persona'}.`;
  }
  const follow = follows
    ? supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', profile.id)
    : supabase.from('follows').insert({ follower_id: currentUser.id, following_id: profile.id });
  const { error } = await follow;
  if (error) throw error;
  return follows ? 'Ya no sigues a esta persona.' : `Ahora sigues a ${profile.display_name || 'esta persona'}.`;
}

async function toggleFollow(profile, follows, pending = false) {
  const button = $('#follow-button');
  setBusy(button, true, follows ? 'Dejando de seguir…' : pending ? 'Cancelando…' : 'Actualizando…');
  try {
    const message = await updateRelationship(profile, follows, pending);
    await loadCurrentProfile();
    await showProfile(profile.id);
    showToast(message);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No pudimos actualizar el seguimiento.', 'error');
    setBusy(button, false);
  }
}

function hideUserSearch() {
  const results = $('#user-search-results');
  results.hidden = true;
  results.innerHTML = '';
  searchResults = [];
}

function renderUserSearchResults(profiles, states) {
  const container = $('#user-search-results');
  searchResults = profiles;
  if (!profiles.length) {
    container.innerHTML = '<p class="search-empty">No encontramos personas con ese nombre.</p>';
    container.hidden = false;
    return;
  }
  container.innerHTML = profiles.map((profile) => {
    const follows = states.following.has(profile.id);
    const pending = states.pending.has(profile.id);
    const followers = profile.show_follower_count === false ? 'seguidores privados' : `${compactNumber(effectiveFollowers(profile))} seguidores`;
    const label = follows ? 'Siguiendo' : pending ? 'Solicitado' : profile.is_private ? 'Solicitar' : 'Seguir';
    return `<article class="search-result" data-search-profile="${profile.id}">${avatarMarkup(profile)}<div><b>${escapeHtml(profile.display_name || 'Miembro de SR')}${badgeMarkup(profile)}${profile.is_private ? ' ⌑' : ''}</b><small>${escapeHtml(usernameFor(profile))} · ${followers}</small></div><div class="search-result-actions"><button type="button" data-search-follow="${profile.id}" data-following="${follows}" data-pending="${pending}">${label}</button><button type="button" data-search-message="${profile.id}">Mensaje</button></div></article>`;
  }).join('');
  container.hidden = false;
}

async function searchUsers(rawQuery) {
  const query = rawQuery.trim().replace(/[,.()%]/g, '').slice(0, 60);
  if (query.length < 2 || !currentUser) { hideUserSearch(); return; }
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
    .neq('id', currentUser.id)
    .limit(8);
  if (error) throw error;
  const ids = data.map((profile) => profile.id);
  const states = await relationshipStates(ids);
  renderUserSearchResults(data, states);
}

async function toggleSearchFollow(profile, follows, pending = false) {
  const message = await updateRelationship(profile, follows, pending);
  await Promise.all([loadCurrentProfile(), loadContacts(), loadStories()]);
  showToast(message);
}

function renderContacts() {
  const list = $('#contacts-list');
  const query = contactsQuery.trim().toLocaleLowerCase('es');

  const filteredChats = contacts.filter((profile) => {
    const haystack = `${profile.display_name || ''} ${usernameFor(profile)}`.toLocaleLowerCase('es');
    return !query || haystack.includes(query);
  });

  const chatMarkup = filteredChats.map((profile) => {
    const active = selectedChat?.id === profile.id;
    const preview = contactPreviews.get(profile.id) || usernameFor(profile);
    return `<button class="contact${active ? ' active' : ''}" type="button" data-contact-id="${profile.id}">${avatarMarkup(profile)}<span class="contact-copy"><span class="contact-line"><b class="contact-name">${escapeHtml(profile.display_name || 'Miembro de SR')}${badgeMarkup(profile)}</b><time>${escapeHtml(chatTime(contactActivity.get(profile.id)))}</time></span><span class="contact-preview">${escapeHtml(preview)}</span></span></button>`;
  }).join('');

  if (query.length >= 2 && contactsSearchResults === null) {
    list.innerHTML = `${chatMarkup}<p class="notification-empty">Buscando personas…</p>`;
    return;
  }

  const userResults = (query.length >= 2 ? contactsSearchResults : [])
    .filter((profile) => !contacts.some((chat) => chat.id === profile.id));

  const userMarkup = userResults.length ? `
    <div class="contacts-search-section">
      <span class="contacts-search-title">Personas</span>
      ${userResults.map((profile) => {
        const follows = contactsSearchResultsFollowing.has(profile.id);
        const pending = contactsSearchResultsPending.has(profile.id);
        const label = follows ? 'Siguiendo' : pending ? 'Solicitado' : profile.is_private ? 'Solicitar' : 'Seguir';
        return `<article class="contact-user-result">${avatarMarkup(profile)}<div class="contact-user-copy"><b>${escapeHtml(profile.display_name || 'Miembro de SR')}${badgeMarkup(profile)}${profile.is_private ? ' ⌑' : ''}</b><small>${escapeHtml(usernameFor(profile))}</small><div class="contact-user-actions"><button type="button" data-contact-search-follow="${profile.id}" data-following="${follows}" data-pending="${pending}">${label}</button><button type="button" data-contact-search-message="${profile.id}">Mensaje</button></div></div></article>`;
      }).join('')}
    </div>` : '';

  if (query.length >= 2) {
    if (!chatMarkup && !userMarkup) {
      list.innerHTML = '<p class="notification-empty">No encontramos chats ni personas que coincidan.</p>';
    } else {
      list.innerHTML = `${chatMarkup}${userMarkup}`;
    }
    return;
  }

  if (!filteredChats.length) {
    list.innerHTML = `<p class="notification-empty">${contacts.length ? 'No encontramos chats que coincidan.' : 'Aún no hay conversaciones. Busca una persona para comenzar.'}</p>`;
    return;
  }

  list.innerHTML = chatMarkup;
}

async function searchContactsUsers(rawQuery) {
  const query = rawQuery.trim().replace(/[,.()%]/g, '').slice(0, 60);
  if (query.length < 2 || !currentUser) {
    contactsSearchResults = [];
    contactsSearchResultsFollowing = new Set();
    contactsSearchResultsPending = new Set();
    renderContacts();
    return;
  }

  contactsSearchResults = null;
  renderContacts();

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
    .neq('id', currentUser.id)
    .limit(12);

  if (error) throw error;

  const states = await relationshipStates((data || []).map((profile) => profile.id));
  contactsSearchResultsFollowing = states.following;
  contactsSearchResultsPending = states.pending;
  contactsSearchResults = data || [];
  renderContacts();
}

async function loadContacts() {
  if (!currentUser) return;
  if (contactsLoading) { contactsReloadQueued = true; return; }
  contactsLoading = true;
  try {
    // Primero se muestran las personas con las que ya hay conversación. Así
    // quien acaba de escribir nunca queda oculto detrás de sugerencias.
    const { data: activityRows, error: activityError } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, content, media_type, seen_at, created_at')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false })
      .limit(160);
    if (activityError) throw activityError;

    const conversationIds = [];
    const seenIds = new Set();
    contactActivity = new Map();
    contactUnreadIds = new Set();
    contactPreviews = new Map();
    contactUnreadCounts = new Map();
    (activityRows || []).forEach((message) => {
      const contactId = message.sender_id === currentUser.id ? message.receiver_id : message.sender_id;
      if (!contactId || contactId === currentUser.id) return;
      if (!seenIds.has(contactId)) { seenIds.add(contactId); conversationIds.push(contactId); }
      if (!contactActivity.has(contactId)) {
        contactActivity.set(contactId, message.created_at);
        const mediaPreview = message.media_type === 'video' ? '🎬 Video' : message.media_type === 'audio' ? '🎵 Audio' : message.media_type === 'image' ? '▧ Foto' : 'Mensaje';
        contactPreviews.set(contactId, message.content?.trim() || mediaPreview);
      }
      if (message.receiver_id === currentUser.id && !message.seen_at) {
        contactUnreadIds.add(contactId);
        contactUnreadCounts.set(contactId, (contactUnreadCounts.get(contactId) || 0) + 1);
      }
    });

    const conversationProfiles = conversationIds.length
      ? await supabase.from('profiles').select(PROFILE_FIELDS).in('id', conversationIds)
      : { data: [], error: null };
    if (conversationProfiles.error) throw conversationProfiles.error;

    // En Mensajes solo mostramos conversaciones reales.
    // El orden siempre depende de la fecha del último mensaje, de más reciente a más antiguo.
    const merged = new Map();
    (conversationProfiles.data || []).forEach((profile) => merged.set(profile.id, profile));
    if (selectedChat && !merged.has(selectedChat.id)) merged.set(selectedChat.id, selectedChat);
    contacts = [...merged.values()].sort((a, b) => {
      const recentA = contactActivity.get(a.id);
      const recentB = contactActivity.get(b.id);
      if (recentA || recentB) return new Date(recentB || 0) - new Date(recentA || 0);
      return effectiveFollowers(b) - effectiveFollowers(a);
    }).slice(0, 50);
    renderContacts();
    $('#messages-nav-dot').hidden = contactUnreadIds.size === 0;
  } finally {
    contactsLoading = false;
    if (contactsReloadQueued) {
      contactsReloadQueued = false;
      loadContacts().catch((error) => console.warn('No pudimos actualizar contactos pendientes.', error));
    }
  }
}

function messageMarkup(message, messagesById, reactionsByMessage) {
  const mine = message.sender_id === currentUser.id;
  const parent = message.reply_to_id ? messagesById.get(message.reply_to_id) : null;
  const reply = message.reply_to_id ? `<div class="message-reply"><b>${parent?.sender_id === currentUser.id ? 'Tú' : escapeHtml(selectedChat?.display_name || 'SR')}</b>${parent ? escapeHtml(parent.content || 'Archivo compartido').slice(0, 100) : 'Mensaje eliminado'}</div>` : '';
  const reactions = reactionsByMessage.get(message.id) || [];
  const reactionMarkup = ['❤️', '👍', '😂'].map((emoji) => {
    const count = reactions.filter((reaction) => reaction.emoji === emoji).length;
    const active = reactions.some((reaction) => reaction.emoji === emoji && reaction.user_id === currentUser.id);
    return `<button type="button" class="${active ? 'active' : ''}" data-message-react="${message.id}" data-emoji="${emoji}" aria-label="Reaccionar con ${emoji}">${emoji}${count ? ` ${count}` : ''}</button>`;
  }).join('');
  return `<article class="message-bubble${mine ? ' mine' : ''}" data-message-id="${message.id}">${reply}${message.media_url ? mediaMarkup(message.media_url, message.media_type, 'message-media', message.media_provider) : ''}${message.content ? `<span>${escapeHtml(message.content).replaceAll('\n', '<br>')}</span>` : ''}<div class="message-reactions">${reactionMarkup}</div><div class="message-actions"><button type="button" data-message-reply="${message.id}">Responder</button>${mine ? `<button type="button" data-message-delete="${message.id}">Eliminar</button>` : ''}</div><time>${escapeHtml(prettyDate(message.created_at))}</time></article>`;
}

async function loadMessages({ scrollToLatest = false } = {}) {
  if (!selectedChat) return;
  const scroll = $('#messages-list');
  const wasNearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 110;
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, content, media_url, media_type, media_provider, media_public_id, reply_to_id, seen_at, created_at')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const messageIds = data.map((message) => message.id);
  const { data: reactions, error: reactionError } = messageIds.length
    ? await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', messageIds)
    : { data: [], error: null };
  if (reactionError) throw reactionError;
  currentMessages = data;
  const messagesById = new Map(data.map((message) => [message.id, message]));
  const reactionsByMessage = new Map(messageIds.map((id) => [id, []]));
  reactions.forEach((reaction) => reactionsByMessage.get(reaction.message_id)?.push(reaction));
  $('#messages-list').innerHTML = data.length ? data.map((message) => messageMarkup(message, messagesById, reactionsByMessage)).join('') : '<div class="conversation-empty"><strong>Inicia la conversación</strong><span>Envía el primer mensaje.</span></div>';
  if (scrollToLatest || wasNearBottom) {
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  }
  const { error: seenError } = await supabase.from('messages').update({ seen_at: new Date().toISOString() }).eq('sender_id', selectedChat.id).eq('receiver_id', currentUser.id).is('seen_at', null);
  if (seenError) console.warn('No pudimos marcar los mensajes como leídos.', seenError);
  await loadContacts();
}

function setMessagesChatOpen(open) {
  $('#messages-view')?.classList.toggle('chat-open', open);
}

function closeChatToContacts() {
  if (chatRealtimeChannel) { supabase.removeChannel(chatRealtimeChannel); chatRealtimeChannel = null; }
  window.clearTimeout(typingTimer);
  selectedChat = null;
  currentMessages = [];
  clearReply();
  $('#conversation-content').hidden = true;
  $('#conversation-empty').hidden = false;
  setMessagesChatOpen(false);
  renderContacts();
}

async function openChat(profile) {
  selectedChat = profile;
  setActiveView('messages');
  setMessagesChatOpen(true);
  renderContacts();
  $('#conversation-empty').hidden = true;
  $('#conversation-content').hidden = false;
  $('#conversation-header').innerHTML = `<button id="back-to-contacts" class="chat-back" type="button" aria-label="Volver a chats">‹</button>${avatarMarkup(profile)}<button id="chat-profile-button" class="chat-profile-button" type="button"><strong>${escapeHtml(profile.display_name || 'Miembro de SR')}${badgeMarkup(profile)}</strong><span>${escapeHtml(usernameFor(profile))}</span></button>`;
  $('#back-to-contacts').addEventListener('click', closeChatToContacts);
  $('#chat-profile-button').addEventListener('click', async () => { await showProfile(profile.id); });
  startChatPresence();
  await loadMessages({ scrollToLatest: true });
}

function clearReply() {
  replyingToMessage = null;
  const context = $('#reply-context');
  context.hidden = true;
  context.innerHTML = '';
}

function setReply(message) {
  replyingToMessage = message;
  const context = $('#reply-context');
  context.hidden = false;
  context.innerHTML = `<span><b>Respondiendo a ${message.sender_id === currentUser.id ? 'ti' : escapeHtml(selectedChat?.display_name || 'SR')}</b>${escapeHtml(message.content || 'Archivo compartido').slice(0, 90)}</span><button id="cancel-message-reply" type="button" aria-label="Cancelar respuesta">×</button>`;
  $('#cancel-message-reply').addEventListener('click', clearReply);
  $('#message-content').focus();
}

function showTyping(active) {
  const indicator = $('#typing-indicator');
  if (!selectedChat) { indicator.hidden = true; return; }
  indicator.textContent = active ? `${selectedChat.display_name || 'Esta persona'} está escribiendo…` : '';
  indicator.hidden = !active;
}

function startChatPresence() {
  if (!currentUser || !selectedChat) return;
  if (chatRealtimeChannel) supabase.removeChannel(chatRealtimeChannel);
  const room = [currentUser.id, selectedChat.id].sort().join('-');
  chatRealtimeChannel = supabase.channel(`sr-chat-${room}`)
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload?.sender_id === selectedChat?.id) showTyping(Boolean(payload.typing));
    })
    .subscribe();
}

function sendTypingState(typing) {
  if (!chatRealtimeChannel || !selectedChat) return;
  chatRealtimeChannel.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUser.id, typing } }).catch(() => {});
}

function reportTyping() {
  sendTypingState(true);
  window.clearTimeout(typingTimer);
  typingTimer = window.setTimeout(() => sendTypingState(false), 1500);
}

async function toggleMessageReaction(messageId, emoji) {
  const { data: existing, error: readError } = await supabase
    .from('message_reactions').select('message_id').eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji).maybeSingle();
  if (readError) throw readError;
  const { error } = existing
    ? await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', currentUser.id).eq('emoji', emoji)
    : await supabase.from('message_reactions').insert({ message_id: messageId, user_id: currentUser.id, emoji });
  if (error) throw error;
  await loadMessages();
}

async function cleanupProcessedVideo(media) {
  if (media?.media_provider !== 'cloudinary' || !media.media_public_id) return;
  const { error } = await supabase.functions.invoke('delete-cloudinary-video', { body: { public_id: media.media_public_id } });
  if (error) console.warn('No pudimos liberar el video procesado.', error);
}

async function cleanupStoredMedia(media) {
  if (!media?.media_path) return;
  const { error } = await supabase.storage.from('media').remove([media.media_path]);
  if (error) console.warn('No pudimos liberar el archivo de Storage.', error);
}

async function deleteMessage(messageId) {
  if (!window.confirm('¿Eliminar este mensaje para ambos?')) return;
  const message = currentMessages.find((item) => item.id === messageId);
  const { error } = await supabase.from('messages').delete().eq('id', messageId).eq('sender_id', currentUser.id);
  if (error) throw error;
  await cleanupProcessedVideo(message);
  if (replyingToMessage?.id === messageId) clearReply();
  await loadMessages();
  showToast('Mensaje eliminado.');
}

function notificationIcon(type) {
  return ({ follow: '＋', like: '♥', comment: '◌', repost: '↻', message: '✉' })[type] || '•';
}

function notificationText(notification, profile) {
  const actor = profile?.display_name || 'Alguien';
  const message = {
    follow: 'empezó a seguirte', like: 'indicó que le gusta tu publicación', comment: 'comentó tu publicación', repost: 'reposteó tu publicación', message: 'te envió un mensaje',
  }[notification.type] || 'interactuó contigo';
  return `<b>${escapeHtml(actor)}</b> ${message}`;
}

function renderNotifications(notifications, profiles) {
  const html = notifications.length ? notifications.map((notification) => `
    <button class="notification-item${notification.read_at ? '' : ' unread'}" type="button" data-notification-id="${notification.id}" data-notification-post="${notification.post_id || ''}" data-notification-actor="${notification.actor_id}">
      <span class="notification-icon">${notificationIcon(notification.type)}</span><span class="notification-text">${notificationText(notification, profiles.get(notification.actor_id))}<span class="notification-time">${escapeHtml(prettyDate(notification.created_at))}</span></span>
    </button>`).join('') : '<p class="notification-empty">Todo al día por ahora.</p>';
  $('#notification-list').innerHTML = html;
  $('#notification-list-dialog').innerHTML = html;
  const unread = notifications.filter((notification) => !notification.read_at).length;
  $('#notification-badge').hidden = unread === 0;
  $('#notification-badge').textContent = unread > 9 ? '9+' : unread;
}

async function loadNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, actor_id, type, post_id, read_at, created_at')
    .eq('recipient_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  const profiles = await profilesForIds(data.map((notification) => notification.actor_id));
  renderNotifications(data, profiles);
}

async function openPostDialog(postId) {
  focusedPostId = Number(postId);
  $('#focused-post').innerHTML = '<div class="feed-status">Cargando publicación…</div>';
  $('#comments-list').innerHTML = '';
  $('#comments-total').textContent = '0';
  if (!postDialog.open) postDialog.showModal();
  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, content, image_url, media_url, media_type, media_provider, like_count, comment_count, repost_count, created_at')
      .eq('id', focusedPostId).single();
    if (postError) throw postError;
    const [profiles, reactions, commentsResponse, permissionResponse] = await Promise.all([
      profilesForIds([post.author_id]),
      reactionState([post.id]),
      supabase.from('comments').select('id, post_id, author_id, content, created_at').eq('post_id', post.id).order('created_at', { ascending: true }),
      supabase.rpc('sr_can_comment_post', { post_to_check: post.id }),
    ]);
    if (commentsResponse.error) throw commentsResponse.error;
    if (permissionResponse.error) throw permissionResponse.error;
    const commentProfiles = await profilesForIds(commentsResponse.data.map((comment) => comment.author_id));
    $('#focused-post').innerHTML = postCard(post, profiles.get(post.author_id), reactions.get(post.id), true);
    $('#comments-total').textContent = compactNumber(commentsResponse.data.length);
    $('#comments-list').innerHTML = commentsResponse.data.length ? commentsResponse.data.map((comment) => {
      const author = commentProfiles.get(comment.author_id) || {};
      return `<article class="comment"><header><b>${escapeHtml(author.display_name || 'Miembro de SR')}</b><span>${escapeHtml(prettyDate(comment.created_at))}</span></header><p>${escapeHtml(comment.content).replaceAll('\n', '<br>')}</p></article>`;
    }).join('') : '<p class="notification-empty">Sé la primera persona en comentar.</p>';
    $('#comment-form').hidden = !permissionResponse.data;
    if (!permissionResponse.data) $('#comments-list').insertAdjacentHTML('beforeend', '<p class="notification-empty">Esta persona restringió los comentarios.</p>');
  } catch (error) {
    console.error(error);
    $('#focused-post').innerHTML = `<p class="notification-empty">${escapeHtml(error.message || 'No se pudo abrir la publicación.')}</p>`;
  }
}

async function toggleReaction(postId, kind) {
  const table = kind === 'like' ? 'likes' : 'reposts';
  const { data: existing, error: existingError } = await supabase.from(table).select('post_id').eq('post_id', postId).eq('user_id', currentUser.id).maybeSingle();
  if (existingError) throw existingError;
  const nextActive = !existing;
  const { error } = existing
    ? await supabase.from(table).delete().eq('post_id', postId).eq('user_id', currentUser.id)
    : await supabase.from(table).insert({ post_id: postId, user_id: currentUser.id });
  if (error) throw error;
  return { active: nextActive, delta: nextActive ? 1 : -1 };
}

function updateReactionUI(postId, kind, active, delta) {
  document.querySelectorAll(`[data-action=\"${kind}\"][data-post-id=\"${postId}\"]`).forEach((button) => {
    button.classList.toggle('active', active);
    if (kind === 'like') button.classList.toggle('liked', active);
    const count = button.querySelector('span');
    if (!count) return;
    const current = Number(String(count.textContent).replace(/[^0-9-]/g, '')) || 0;
    count.textContent = compactNumber(Math.max(0, current + delta));
  });
}

async function openEditPost(postId) {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, author_id, content, media_url, image_url')
      .eq('id', postId)
      .eq('author_id', currentUser.id)
      .single();
    if (error) throw error;
    editingPostId = data.id;
    editingPostHasMedia = Boolean(data.media_url || data.image_url);
    $('#edit-post-content').value = data.content || '';
    editPostDialog.showModal();
    $('#edit-post-content').focus();
  } catch (error) {
    showToast(error.message || 'No pudimos abrir la publicación.', 'error');
  }
}

async function handlePostAction(event) {
  const profileButton = event.target.closest('[data-open-profile]');
  if (profileButton) { await showProfile(profileButton.dataset.openProfile); return; }
  const deleteButton = event.target.closest('[data-delete-post]');
  if (deleteButton) {
    if (!window.confirm('¿Eliminar esta publicación? Esta acción no se puede deshacer.')) return;
    const { data: post, error: readError } = await supabase.from('posts').select('id, media_provider, media_public_id, media_path').eq('id', deleteButton.dataset.deletePost).eq('author_id', currentUser.id).maybeSingle();
    if (readError) { showToast(readError.message, 'error'); return; }
    const { error } = await supabase.from('posts').delete().eq('id', deleteButton.dataset.deletePost);
    if (error) showToast(error.message, 'error'); else { await cleanupStoredMedia(post); await cleanupProcessedVideo(post); showToast('Publicación eliminada.'); await refreshActiveContent(); }
    return;
  }
  const editButton = event.target.closest('[data-edit-post]');
  if (editButton) { await openEditPost(Number(editButton.dataset.editPost)); return; }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  try {
    if (action.dataset.action === 'comments') {
      await openPostDialog(action.dataset.postId);
    } else {
      const result = await toggleReaction(Number(action.dataset.postId), action.dataset.action);
      updateReactionUI(Number(action.dataset.postId), action.dataset.action, result.active, result.delta);
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'No pudimos completar la acción.', 'error');
  }
}

async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || !('createImageBitmap' in window)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1920;
    const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .78));
    bitmap.close();
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}

function optimizedCloudinaryVideoUrl(url) {
  const marker = '/video/upload/';
  return url.includes(marker) ? url.replace(marker, '/video/upload/f_auto,q_auto:eco,w_1280,c_limit/') : url;
}

async function uploadServerOptimizedVideo(file) {
  const { data: signature, error: signatureError } = await supabase.functions.invoke('sign-video-upload', { body: { filename: file.name } });
  if (signatureError || !signature?.upload_url) throw signatureError || new Error('El procesador de video no está configurado.');
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.api_key);
  form.append('timestamp', String(signature.timestamp));
  form.append('folder', signature.folder);
  form.append('signature', signature.signature);
  const response = await fetch(signature.upload_url, { method: 'POST', body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url) throw new Error(result.error?.message || 'El servidor no pudo procesar este video.');
  return { url: optimizedCloudinaryVideoUrl(result.secure_url), type: 'video', path: null, provider: 'cloudinary', publicId: result.public_id || null, processedOnServer: true };
}

async function uploadMedia(file, kind = 'post') {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  if (!isImage && !isVideo && !isAudio) throw new Error('El archivo debe ser una imagen, un video o un audio válido.');
  if (kind === 'avatar' && !isImage) throw new Error('La foto de perfil debe ser una imagen.');
  if (kind === 'post' && isAudio) throw new Error('Las publicaciones aceptan fotos o videos. El audio se envía por mensajes.');
  if ((isVideo && file.size > 40 * 1024 * 1024) || (isAudio && file.size > 20 * 1024 * 1024)) throw new Error('El archivo supera el límite permitido.');
  if (isVideo && kind !== 'story') {
    try {
      return await uploadServerOptimizedVideo(file);
    } catch (error) {
      console.info('El procesamiento de video en servidor no está activo; se usará Storage.', error);
      showToast('El video se subirá sin optimización de servidor hasta que configures el procesador.');
    }
  }
  const optimized = isImage ? await compressImage(file) : file;
  if (optimized.size > 10 * 1024 * 1024 && isImage) throw new Error('La imagen sigue siendo demasiado grande después de optimizarla.');
  const mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';
  const extension = optimized.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || mediaType;
  const path = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('media').upload(path, optimized, { contentType: optimized.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return { url: data.publicUrl, type: mediaType, path, provider: 'supabase', publicId: null };
}

async function refreshActiveContent() {
  if (!currentUser) return;
  if (activeView === 'profile') await showProfile(viewedProfileId || currentUser.id);
  else if (activeView === 'messages') {
    if (selectedChat) await loadMessages();
    else await loadContacts();
  }
  else if (activeView === 'settings') await loadSettings();
  else await loadFeed();
  await loadCurrentProfile();
  await loadNotifications();
  await loadStories();
}

// La interfaz NO se actualiza automáticamente.
// Los datos solo se vuelven a cargar cuando el usuario pulsa el botón ↻
// (excepto los mensajes del chat abierto, que siguen funcionando en tiempo real).
function scheduleLiveRefresh() {
  // Las publicaciones, likes, comentarios, reposts y notificaciones no
  // refrescan la interfaz automáticamente. El usuario decide cuándo actualizar.
}

async function handleRealtimeMessage(payload) {
  if (!currentUser) return;
  const message = payload?.new || payload?.old;
  if (message?.sender_id && message?.receiver_id
    && message.sender_id !== currentUser.id && message.receiver_id !== currentUser.id) return;
  await loadContacts();
  const otherPerson = message?.sender_id === currentUser.id ? message.receiver_id : message?.sender_id;
  if (activeView === 'messages' && selectedChat && otherPerson === selectedChat.id) await loadMessages();
}

function startRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  // Solo mantenemos tiempo real para mensajes. Los cambios de publicaciones,
  // likes, comentarios, reposts, historias y notificaciones esperan al botón
  // de actualización para no mover el feed mientras el usuario lee.
  realtimeChannel = supabase.channel(`sr-live-${currentUser.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
      handleRealtimeMessage(payload).catch((error) => console.warn('No pudimos actualizar el mensaje.', error));
    })
    .subscribe();
}


function syncAuthVisibility(isAuthenticated) {
  if (!authView || !appView) return;

  if (isAuthenticated) {
    authView.hidden = true;
    authView.setAttribute('aria-hidden', 'true');

    appView.hidden = false;
    appView.removeAttribute('aria-hidden');

    const mobileNav = $('#mobile-nav');
    const notificationsToggle = $('#notifications-toggle');
    if (mobileNav) mobileNav.hidden = false;
    if (notificationsToggle) notificationsToggle.hidden = false;
  } else {
    appView.hidden = true;
    appView.setAttribute('aria-hidden', 'true');

    authView.hidden = false;
    authView.removeAttribute('aria-hidden');

    const mobileNav = $('#mobile-nav');
    const notificationsToggle = $('#notifications-toggle');
    if (mobileNav) mobileNav.hidden = true;
    if (notificationsToggle) notificationsToggle.hidden = true;
  }
}

async function showApp(user) {
  const loadId = ++appLoadId;
  currentUser = user;
  // Cambiar ambas vistas de forma atómica: nunca mostrar
  // registro/inicio de sesión y la aplicación al mismo tiempo.
  syncAuthVisibility(true);
  setActiveView('feed');
  try {
    await loadCurrentProfile();
    if (loadId !== appLoadId) return;
    await Promise.all([loadFeed(), loadNotifications(), loadContacts(), loadStories()]);
    startRealtime();
    if (currentSettings?.push_notifications !== false && Notification?.permission === 'granted') {
      ensurePushSubscription().catch(() => {});
    }
  } catch (error) {
    console.error(error);
    const migrationError = ['42703', '42P01', '42883'].includes(error?.code);
    showToast(migrationError ? 'Ejecuta supabase-social-advanced.sql en Supabase para activar privacidad, Explorar y el chat mejorado.' : 'Falta activar las funciones sociales: ejecuta las migraciones SQL de SR en Supabase.', 'error');
  }
}

function showAuth() {
  ++appLoadId;
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
  if (chatRealtimeChannel) { supabase.removeChannel(chatRealtimeChannel); chatRealtimeChannel = null; }
  window.clearTimeout(typingTimer);
  currentUser = null;
  currentProfile = null;
  selectedChat = null;
  currentMessages = [];
  setMessagesChatOpen(false);
  clearReply();
  syncAuthVisibility(false);
  authForm.reset();
  setAuthMode('register');
}

function openProfileDialog() {
  $('#profile-display-name').value = currentProfile?.display_name || '';
  $('#profile-username').value = currentProfile?.username || '';
  $('#profile-bio-input').value = currentProfile?.bio || '';
  selectedProfileAvatar = null;
  $('#profile-avatar-input').value = '';
  $('#profile-avatar-preview').hidden = true;
  $('#profile-avatar-preview').innerHTML = '';
  profileDialog.showModal();
  $('#profile-display-name').focus();
}

async function markNotificationRead(notificationId) {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
}

// Tema y autenticación.
setTheme(localStorage.getItem('sr-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme-toggle')?.addEventListener('click', () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
$('#settings-theme-toggle')?.addEventListener('click', () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
$$('[data-auth-mode]').forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode)));

function hideMessageUserSearch() {
  const results = $('#message-user-search-results');
  if (!results) return;
  results.hidden = true;
  results.innerHTML = '';
  searchResults = [];
}

function renderMessageUserSearchResults(profiles, states) {
  const container = $('#message-user-search-results');
  if (!container) return;
  searchResults = profiles;
  if (!profiles.length) {
    container.innerHTML = '<p class="search-empty">No encontramos personas con ese nombre.</p>';
    container.hidden = false;
    return;
  }
  container.innerHTML = profiles.map((profile) => {
    const follows = states.following.has(profile.id);
    const pending = states.pending.has(profile.id);
    const followers = profile.show_follower_count === false ? 'seguidores privados' : `${compactNumber(effectiveFollowers(profile))} seguidores`;
    const label = follows ? 'Siguiendo' : pending ? 'Solicitado' : profile.is_private ? 'Solicitar' : 'Seguir';
    return `<article class="search-result" data-message-search-profile="${profile.id}">${avatarMarkup(profile)}<div><b>${escapeHtml(profile.display_name || 'Miembro de SR')}${badgeMarkup(profile)}${profile.is_private ? ' ⌑' : ''}</b><small>${escapeHtml(usernameFor(profile))} · ${followers}</small></div><div class="search-result-actions"><button type="button" data-message-search-follow="${profile.id}" data-following="${follows}" data-pending="${pending}">${label}</button><button type="button" data-message-search-open="${profile.id}">Mensaje</button></div></article>`;
  }).join('');
  container.hidden = false;
}

async function searchMessageUsers(rawQuery) {
  const query = rawQuery.trim().replace(/[,.()%]/g, '').slice(0, 60);
  if (query.length < 2 || !currentUser) { hideMessageUserSearch(); return; }
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
    .neq('id', currentUser.id)
    .limit(8);
  if (error) throw error;
  const states = await relationshipStates(data.map((profile) => profile.id));
  renderMessageUserSearchResults(data, states);
}

$('#message-user-search-input')?.addEventListener('input', (event) => {
  window.clearTimeout(searchTimer);
  const query = event.target.value;
  if (query.trim().length < 2) { hideMessageUserSearch(); return; }
  searchTimer = window.setTimeout(async () => {
    try { await searchMessageUsers(query); }
    catch (error) { showToast(error.message || 'No pudimos buscar usuarios.', 'error'); }
  }, 260);
});
$('#message-user-search-input')?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.currentTarget.value = ''; hideMessageUserSearch(); event.currentTarget.blur(); }
});
$('#message-user-search-results')?.addEventListener('click', async (event) => {
  const row = event.target.closest('[data-message-search-profile]');
  if (!row) return;
  const profile = searchResults.find((item) => item.id === row.dataset.messageSearchProfile);
  if (!profile) return;
  try {
    const follow = event.target.closest('[data-message-search-follow]');
    const open = event.target.closest('[data-message-search-open]');
    if (follow) {
      const message = await updateRelationship(profile, follow.dataset.following === 'true', follow.dataset.pending === 'true');
      await Promise.all([loadCurrentProfile(), loadContacts()]);
      await searchMessageUsers($('#message-user-search-input').value);
      showToast(message);
      return;
    }
    if (open) {
      hideMessageUserSearch();
      $('#message-user-search-input').value = '';
      await openChat(profile);
    }
  } catch (error) { showToast(error.message || 'No pudimos completar esa acción.', 'error'); }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.message-user-search')) hideMessageUserSearch();
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('#auth-email').value.trim();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim();
  if (!email || !password || (authMode === 'register' && !displayName)) { showToast('Completa los campos requeridos.', 'error'); return; }
  if (authMode === 'register' && password.length < 8) { showToast('Usa una contraseña de al menos 8 caracteres.', 'error'); return; }
  setBusy(authSubmit, true, authMode === 'register' ? 'Creando cuenta…' : 'Entrando…');
  try {
    if (authMode === 'register') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
      if (error) throw error;
      if (!data.session) { showToast('Revisa tu correo y confirma tu cuenta antes de entrar.'); setAuthMode('login'); }
      else showToast('Tu cuenta está lista. ¡Bienvenido a SR!');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showToast('¡Bienvenido de vuelta a SR!');
    }
  } catch (error) {
    console.error(error);
    showToast(error.message === 'Invalid login credentials' ? 'El correo o la contraseña no son correctos.' : (error.message || 'No pudimos completar la operación.'), 'error');
  } finally { setBusy(authSubmit, false); }
});

// Texto largo: mantiene el feed compacto y permite expandir solo lo necesario.
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-post-expand]');
  if (!button) return;
  const wrapper = button.closest('.post-content-wrap');
  const content = wrapper?.querySelector('.post-content');
  if (!wrapper || !content) return;
  const expanded = !wrapper.classList.contains('is-expanded');
  wrapper.classList.toggle('is-expanded', expanded);
  content.classList.toggle('is-expanded', expanded);
  content.classList.toggle('is-collapsed', !expanded);
  button.textContent = expanded ? 'Ver menos' : 'Ver más';
  button.setAttribute('aria-expanded', String(expanded));
  event.preventDefault();
  event.stopPropagation();
});

// Navegación y perfil.
$$('[data-view]').forEach((button) => button.addEventListener('click', async () => {
  const view = button.dataset.view;
  if (view === 'profile') await showProfile(currentUser.id);
  else if (view === 'messages') { setActiveView('messages'); setMessagesChatOpen(Boolean(selectedChat)); await loadContacts(); if (selectedChat) await loadMessages(); }
  else { setActiveView('feed'); await loadFeed(); }
}));

$('#sidebar-settings-button')?.addEventListener('click', async () => { await openSettings(); });
$('#settings-back-button')?.addEventListener('click', async () => {
  if (settingsPreviousView === 'feed') { setActiveView('feed'); await loadFeed(); }
  else if (settingsPreviousView === 'messages') { setActiveView('messages'); setMessagesChatOpen(Boolean(selectedChat)); await loadContacts(); if (selectedChat) await loadMessages(); }
  else await showProfile(currentUser.id);
});
$('#create-post-button')?.addEventListener('click', () => {
  const form = $('#post-form');
  if (!form) return;
  form.classList.toggle('post-composer-collapsed');
  if (!form.classList.contains('post-composer-collapsed')) $('#post-content')?.focus();
});

$('#feed-search-toggle')?.addEventListener('click', () => {
  const panel = $('#feed-search-panel');
  if (!panel) return;
  const open = panel.hidden;
  panel.hidden = !open;
  if (open) $('#explore-query')?.focus();
});

$('#message-search-toggle')?.addEventListener('click', () => {
  const panel = $('.message-user-search');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) $('#message-user-search-input')?.focus();
});
$('#message-search-close')?.addEventListener('click', () => {
  const panel = $('.message-user-search');
  if (panel) panel.hidden = true;
  const input = $('#message-user-search-input');
  if (input) input.value = '';
  hideMessageUserSearch();
});

$('#floating-refresh-button')?.addEventListener('click', async () => {
  const button = $('#floating-refresh-button');
  button.classList.add('spinning');
  try { await refreshActiveContent(); showToast('SR está actualizado.'); }
  finally { window.setTimeout(() => button.classList.remove('spinning'), 350); }
});
['#sidebar-edit-profile', '#top-edit-profile'].forEach((selector) => $(selector).addEventListener('click', openProfileDialog));
$$('.close-dialog').forEach((button) => button.addEventListener('click', () => profileDialog.close()));
$('#profile-posts-list').addEventListener('click', async (event) => {
  const tile = event.target.closest('[data-profile-post]');
  if (tile) await openPostDialog(tile.dataset.profilePost);
});

$('#profile-page-content').addEventListener('click', async (event) => {
  const accept = event.target.closest('[data-accept-follow-request]');
  const reject = event.target.closest('[data-reject-follow-request]');
  if (!accept && !reject) return;
  try {
    if (accept) {
      const { data, error } = await supabase.rpc('sr_accept_follow_request', { requester: accept.dataset.acceptFollowRequest });
      if (error) throw error;
      if (!data) throw new Error('La solicitud ya no está disponible.');
      showToast('Solicitud aprobada.');
    }
    if (reject) {
      const { error } = await supabase.from('follow_requests').delete().eq('requester_id', reject.dataset.rejectFollowRequest).eq('target_id', currentUser.id);
      if (error) throw error;
      showToast('Solicitud eliminada.');
    }
    await Promise.all([loadCurrentProfile(), showProfile(currentUser.id)]);
  } catch (error) { showToast(error.message || 'No pudimos actualizar la solicitud.', 'error'); }
});

$('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const displayName = $('#profile-display-name').value.trim();
  const username = $('#profile-username').value.trim().toLowerCase();
  const bio = $('#profile-bio-input').value.trim();
  if (!displayName) { showToast('El nombre visible es obligatorio.', 'error'); return; }
  if (username && !/^[a-z0-9_]+$/.test(username)) { showToast('El usuario solo admite letras, números y guion bajo.', 'error'); return; }
  const button = $('#save-profile-button');
  setBusy(button, true, 'Guardando…');
  try {
    let uploadedAvatar;
    if (selectedProfileAvatar) uploadedAvatar = await uploadMedia(selectedProfileAvatar, 'avatar');
    const { error } = await supabase.from('profiles').update({ display_name: displayName, username: username || null, bio: bio || null, avatar_url: uploadedAvatar?.url || currentProfile?.avatar_url || null }).eq('id', currentUser.id);
    if (error) throw error;
    await loadCurrentProfile();
    profileDialog.close();
    if (activeView === 'profile') await showProfile(currentUser.id);
    showToast('Perfil actualizado.');
  } catch (error) {
    console.error(error);
    showToast(error.code === '23505' ? 'Ese nombre de usuario ya está en uso.' : (error.message || 'No pudimos guardar el perfil.'), 'error');
  } finally { setBusy(button, false); }
});

$('#profile-avatar-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0] || null;
  selectedProfileAvatar = file;
  const preview = $('#profile-avatar-preview');
  if (!file) { preview.hidden = true; preview.innerHTML = ''; return; }
  if (!file.type.startsWith('image/')) { showToast('La foto de perfil debe ser una imagen.', 'error'); event.target.value = ''; selectedProfileAvatar = null; return; }
  const url = URL.createObjectURL(file);
  preview.hidden = false;
  preview.innerHTML = `<img src="${url}" alt="Vista previa de foto de perfil" /><span>Esta será tu nueva foto.</span>`;
});

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const profileTheme = document.querySelector('input[name="profile-theme"]:checked')?.value || 'nebula';
  const settings = {
    email_notifications: $('#email-notifications').checked,
    push_notifications: $('#push-notifications').checked,
    show_activity: $('#show-activity').checked,
    allow_messages_from: $('#allow-messages-from').value,
  };
  const profilePrivacy = {
    is_private: $('#account-private').checked,
    show_follower_count: $('#show-follower-count').checked,
    comments_from: $('#comments-from').value,
  };
  const button = $('#save-settings-button');
  setBusy(button, true, 'Guardando…');
  let uploadedBackground;
  try {
    if (selectedBackgroundImage) uploadedBackground = await uploadMedia(selectedBackgroundImage, 'background');
    const backgroundUrl = uploadedBackground?.url ?? (clearBackgroundImage ? null : currentProfile?.background_url || null);
    const [{ error: profileError }, { error: settingsError }] = await Promise.all([
      supabase.from('profiles').update({ profile_theme: profileTheme, background_url: backgroundUrl, ...profilePrivacy }).eq('id', currentUser.id),
      supabase.from('account_settings').update(settings).eq('user_id', currentUser.id),
    ]);
    if (profileError) throw profileError;
    if (settingsError) throw settingsError;

    if (settings.push_notifications) {
      const result = await ensurePushSubscription({ requestPermission: true });
      if (!result.ok) {
        const messages = {
          'missing-vapid-key': 'Falta configurar la clave pública VAPID en push-config.js.',
          denied: 'El navegador bloqueó las notificaciones. Actívalas desde los permisos del sitio.',
          unsupported: 'Este navegador no admite notificaciones Push.',
        };
        if (result.reason !== 'permission-needed') {
          showToast(messages[result.reason] || 'No se pudo activar el Push.', 'error');
        }
      } else {
        showToast('Notificaciones Push activadas en este dispositivo.');
      }
    } else {
      await removePushSubscriptionForCurrentDevice();
    }

    currentSettings = settings;
    selectedBackgroundImage = null;
    clearBackgroundImage = false;
    await loadCurrentProfile();
    showToast('Tus ajustes se guardaron.');
  } catch (error) {
    if (uploadedBackground?.path) await supabase.storage.from('media').remove([uploadedBackground.path]);
    showToast(error.message || 'No pudimos guardar los ajustes.', 'error');
  } finally { setBusy(button, false); }
});

$('#background-image-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0] || null;
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('El fondo debe ser una imagen.', 'error'); event.target.value = ''; return; }
  selectedBackgroundImage = file;
  clearBackgroundImage = false;
  renderBackgroundPreview(URL.createObjectURL(file));
});

// Publicaciones y archivos.
postContent.addEventListener('input', () => { $('#character-count').textContent = `${postContent.value.length} / 1000`; });
postMediaInput.addEventListener('change', () => {
  selectedPostMedia = postMediaInput.files?.[0] || null;
  selectedFilePreview(selectedPostMedia, $('#post-media-preview'), () => { selectedPostMedia = null; postMediaInput.value = ''; selectedFilePreview(null, $('#post-media-preview'), () => {}); });
});
postForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = postContent.value.trim();
  const linkValue = $('#post-video-link').value.trim();
  if (selectedPostMedia && linkValue) { showToast('Usa un archivo o un enlace de video, no ambos a la vez.', 'error'); return; }
  if (!content && !selectedPostMedia && !linkValue) { showToast('Escribe algo, adjunta una foto/video o pega un enlace de video.', 'error'); return; }
  const button = $('#post-submit');
  setBusy(button, true, selectedPostMedia ? 'Subiendo…' : 'Publicando…');
  let uploaded;
  try {
    if (selectedPostMedia) uploaded = await uploadMedia(selectedPostMedia, 'post');
    else if (linkValue) uploaded = sharedMediaFromLink(linkValue);
    const { error } = await supabase.from('posts').insert({ author_id: currentUser.id, content: content || '', media_url: uploaded?.url || null, media_type: uploaded?.type || null, media_provider: uploaded?.provider || null, media_public_id: uploaded?.publicId || null, media_path: uploaded?.path || null });
    if (error) throw error;
    postForm.reset(); selectedPostMedia = null; $('#character-count').textContent = '0 / 1000'; selectedFilePreview(null, $('#post-media-preview'), () => {});
    await loadFeed(); await loadCurrentProfile();
    showToast('Tu publicación ya está en SR.');
  } catch (error) {
    console.error(error);
    if (uploaded?.path) await supabase.storage.from('media').remove([uploaded.path]);
    showToast(error.message || 'No pudimos publicar.', 'error');
  } finally { setBusy(button, false); }
});
[postsList, $('#explore-results'), $('#profile-posts-list'), $('#focused-post'), reelsList].forEach((container) => container?.addEventListener('click', handlePostAction));
reelsList?.addEventListener('click', (event) => {
  const soundButton = event.target.closest('[data-reel-sound]');
  if (!soundButton) return;
  const video = soundButton.closest('.reel-card')?.querySelector('video');
  if (!video) return;
  video.muted = !video.muted;
  soundButton.classList.toggle('active', !video.muted);
  soundButton.setAttribute('aria-label', video.muted ? 'Activar sonido' : 'Silenciar sonido');
  if (!video.paused) video.play().catch(() => {});
});
loadMoreReelsButton?.addEventListener('click', () => loadReels({ append: true }));
loadMorePostsButton?.addEventListener('click', () => loadFeed({ append: true }));
$('#feed-search-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await loadExplore($('#explore-query').value);
});
$('#comment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = $('#comment-content').value.trim();
  if (!content || !focusedPostId) return;
  try {
    const { error } = await supabase.from('comments').insert({ post_id: focusedPostId, author_id: currentUser.id, content });
    if (error) throw error;
    $('#comment-content').value = '';
    await openPostDialog(focusedPostId);
    // Actualiza solo el contador visible; no recarga el feed ni cambia la posición.
    document.querySelectorAll(`[data-action=\"comments\"][data-post-id=\"${focusedPostId}\"]`).forEach((button) => {
      const count = button.querySelector('span');
      if (!count) return;
      const current = Number(String(count.textContent).replace(/[^0-9-]/g, '')) || 0;
      count.textContent = compactNumber(current + 1);
    });
  } catch (error) { showToast(error.message || 'No pudimos publicar el comentario.', 'error'); }
});
$$('.close-post-dialog').forEach((button) => button.addEventListener('click', () => postDialog.close()));

$$('.close-edit-post-dialog').forEach((button) => button.addEventListener('click', () => editPostDialog.close()));
$('#edit-post-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = $('#edit-post-content').value.trim();
  if (!content && !editingPostHasMedia) { showToast('Una publicación no puede quedar vacía.', 'error'); return; }
  const button = $('#save-post-button');
  setBusy(button, true, 'Guardando…');
  try {
    const { error } = await supabase.from('posts').update({ content }).eq('id', editingPostId).eq('author_id', currentUser.id);
    if (error) throw error;
    editPostDialog.close();
    await refreshActiveContent();
    showToast('Publicación actualizada.');
  } catch (error) {
    showToast(error.message || 'No pudimos guardar la publicación.', 'error');
  } finally { setBusy(button, false); }
});

function openStoryDialog() {
  selectedStoryMedia = null;
  $('#story-form').reset();
  $('#story-media-preview').hidden = true;
  $('#story-media-preview').innerHTML = '';
  storyDialog.showModal();
}

['#feed-new-story'].forEach((selector) => $(selector)?.addEventListener('click', openStoryDialog));
$$('.close-story-dialog').forEach((button) => button.addEventListener('click', () => storyDialog.close()));
$('#story-media').addEventListener('change', (event) => {
  selectedStoryMedia = event.target.files?.[0] || null;
  selectedFilePreview(selectedStoryMedia, $('#story-media-preview'), () => { selectedStoryMedia = null; $('#story-media').value = ''; selectedFilePreview(null, $('#story-media-preview'), () => {}); });
});
$('#story-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedStoryMedia) { showToast('Elige una foto o video para tu historia.', 'error'); return; }
  const button = $('#publish-story-button');
  setBusy(button, true, 'Publicando…');
  let uploaded;
  try {
    uploaded = await uploadMedia(selectedStoryMedia, 'story');
    const { error } = await supabase.from('stories').insert({
      author_id: currentUser.id,
      caption: $('#story-caption').value.trim() || null,
      media_url: uploaded.url,
      media_path: uploaded.path,
      media_type: uploaded.type,
    });
    if (error) throw error;
    storyDialog.close();
    await loadStories();
    showToast('Tu historia estará disponible durante 12 horas.');
  } catch (error) {
    if (uploaded?.path) await supabase.storage.from('media').remove([uploaded.path]);
    showToast(error.message || 'No pudimos publicar la historia.', 'error');
  } finally { setBusy(button, false); }
});
$('#stories-list').addEventListener('click', async (event) => {
  const create = event.target.closest('[data-create-story]');
  if (create) { openStoryDialog(); return; }
  const story = event.target.closest('[data-open-story]');
  if (story) await openStoryViewer(story.dataset.openStory);
});
$('#close-story-viewer').addEventListener('click', () => storyViewerDialog.close());
$('#story-viewer-content').addEventListener('click', async (event) => {
  const reaction = event.target.closest('[data-story-reaction]');
  const highlight = event.target.closest('[data-story-highlight]');
  const remove = event.target.closest('[data-story-delete]');
  const previous = event.target.closest('[data-story-prev]');
  const next = event.target.closest('[data-story-next]');
  try {
    if (previous && activeStoryIndex > 0) { activeStoryIndex -= 1; await openStoryViewer(activeStoryQueue[activeStoryIndex].id, true); return; }
    if (next && activeStoryIndex < activeStoryQueue.length - 1) { activeStoryIndex += 1; await openStoryViewer(activeStoryQueue[activeStoryIndex].id, true); return; }
    if (reaction) { await toggleStoryReaction(reaction.dataset.storyReaction); return; }
    if (highlight) { await highlightStory(highlight.dataset.storyHighlight); return; }
    if (remove) await deleteStory(remove.dataset.storyDelete);
  } catch (error) { showToast(error.message || 'No pudimos completar esa acción.', 'error'); }
});
$('#story-viewer-content').addEventListener('submit', async (event) => {
  if (event.target.id !== 'story-comment-form') return;
  event.preventDefault();
  const content = $('#story-comment-input').value.trim();
  if (!content || !focusedStoryId) return;
  try {
    const { error } = await supabase.from('story_comments').insert({ story_id: focusedStoryId, author_id: currentUser.id, content });
    if (error) throw error;
    await openStoryViewer(focusedStoryId, true);
  } catch (error) { showToast(error.message || 'No pudimos enviar la respuesta.', 'error'); }
});

// Mensajes.
$('#contacts-list').addEventListener('click', async (event) => {
  const contact = event.target.closest('[data-contact-id]');
  const follow = event.target.closest('[data-contact-search-follow]');
  const message = event.target.closest('[data-contact-search-message]');
  try {
    if (follow) {
      const profile = contactsSearchResults?.find((item) => item.id === follow.dataset.contactSearchFollow);
      if (!profile) return;
      const toastMessage = await updateRelationship(profile, follow.dataset.following === 'true', follow.dataset.pending === 'true');
      await Promise.all([loadCurrentProfile(), loadContacts(), searchContactsUsers($('#contacts-filter').value)]);
      showToast(toastMessage);
      return;
    }
    if (message) {
      const profile = contactsSearchResults?.find((item) => item.id === message.dataset.contactSearchMessage);
      if (!profile) return;
      await openChat(profile);
      return;
    }
    if (!contact) return;
    const profile = contacts.find((item) => item.id === contact.dataset.contactId);
    if (profile) await openChat(profile);
  } catch (error) {
    showToast(error.message || 'No pudimos completar esa acción.', 'error');
  }
});
$('#contacts-filter')?.addEventListener('input', (event) => {
  contactsQuery = event.target.value || '';
  window.clearTimeout(contactsSearchTimer);
  if (contactsQuery.trim().length < 2) {
    contactsSearchResults = [];
    contactsSearchResultsFollowing = new Set();
    contactsSearchResultsPending = new Set();
    renderContacts();
    return;
  }
  contactsSearchResults = null;
  renderContacts();
  contactsSearchTimer = window.setTimeout(async () => {
    try {
      await searchContactsUsers(contactsQuery);
    } catch (error) {
      contactsSearchResults = [];
      renderContacts();
      showToast(error.message || 'No pudimos buscar personas.', 'error');
    }
  }, 260);
});
$$('[data-contact-filter]').forEach((button) => button.addEventListener('click', () => {
  contactsFilter = button.dataset.contactFilter || 'all';
  $$('[data-contact-filter]').forEach((item) => item.classList.toggle('active', item === button));
  renderContacts();
}));
$('#reload-contacts').addEventListener('click', async () => { await loadContacts(); showToast('Lista de personas actualizada.'); });
$('#message-content').addEventListener('input', reportTyping);
$('#message-media').addEventListener('change', (event) => {
  selectedMessageMedia = event.target.files?.[0] || null;
  $('#message-media-name').hidden = !selectedMessageMedia;
  $('#message-media-name').textContent = selectedMessageMedia ? `Adjunto: ${selectedMessageMedia.name}` : '';
});
$('#messages-list').addEventListener('click', async (event) => {
  const reaction = event.target.closest('[data-message-react]');
  const reply = event.target.closest('[data-message-reply]');
  const remove = event.target.closest('[data-message-delete]');
  try {
    if (reaction) { await toggleMessageReaction(reaction.dataset.messageReact, reaction.dataset.emoji); return; }
    if (reply) {
      const message = currentMessages.find((item) => item.id === reply.dataset.messageReply);
      if (message) setReply(message);
      return;
    }
    if (remove) await deleteMessage(remove.dataset.messageDelete);
  } catch (error) { showToast(error.message || 'No pudimos completar esa acción.', 'error'); }
});
$('#message-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedChat) return;
  const content = $('#message-content').value.trim();
  if (!content && !selectedMessageMedia) { showToast('Escribe o adjunta un archivo.', 'error'); return; }
  const isOnlyLink = /^https:\/\/\S+$/i.test(content);
  if (selectedMessageMedia && isOnlyLink) { showToast('Usa un archivo o un enlace, no ambos a la vez.', 'error'); return; }
  const button = $('#message-submit');
  setBusy(button, true, '…');
  let uploaded;
  try {
    if (selectedMessageMedia) uploaded = await uploadMedia(selectedMessageMedia, 'message');
    else if (isOnlyLink) uploaded = sharedMediaFromLink(content, true);
    const { error } = await supabase.from('messages').insert({ sender_id: currentUser.id, receiver_id: selectedChat.id, content: uploaded && isOnlyLink ? null : (content || null), media_url: uploaded?.url || null, media_type: uploaded?.type || null, media_provider: uploaded?.provider || null, media_public_id: uploaded?.publicId || null, reply_to_id: replyingToMessage?.id || null });
    if (error) throw error;
    $('#message-form').reset(); selectedMessageMedia = null; $('#message-media-name').hidden = true; clearReply(); sendTypingState(false);
    await loadMessages();
  } catch (error) {
    if (uploaded?.path) await supabase.storage.from('media').remove([uploaded.path]);
    showToast(error.message || 'No pudimos enviar el mensaje.', 'error');
  } finally { setBusy(button, false); }
});

// Notificaciones.
$('#notifications-toggle').addEventListener('click', () => notificationsDialog.showModal());
$$('.close-notifications-dialog').forEach((button) => button.addEventListener('click', () => notificationsDialog.close()));
async function handleNotificationClick(event) {
  const item = event.target.closest('[data-notification-id]');
  if (!item) return;
  await markNotificationRead(item.dataset.notificationId);
  await loadNotifications();
  if (item.dataset.notificationPost) { notificationsDialog.close(); await openPostDialog(item.dataset.notificationPost); }
  else if (item.dataset.notificationActor) { notificationsDialog.close(); await showProfile(item.dataset.notificationActor); }
}
[$('#notification-list'), $('#notification-list-dialog')].forEach((list) => list.addEventListener('click', handleNotificationClick));
$('#mark-notifications-read').addEventListener('click', async () => {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', currentUser.id).is('read_at', null);
  if (error) showToast(error.message, 'error'); else { await loadNotifications(); showToast('Notificaciones marcadas como leídas.'); }
});

$('#sign-out-button').addEventListener('click', async () => { const { error } = await supabase.auth.signOut(); if (error) showToast(error.message, 'error'); });

// Estado inicial seguro: una sola pantalla visible.
syncAuthVisibility(false);

supabase.auth.onAuthStateChange((event, session) => {
  // Los refrescos automáticos del token de Supabase (TOKEN_REFRESHED)
  // no deben reconstruir la aplicación ni volver a cargar el Inicio.
  // La interfaz solo se carga al entrar/salir realmente de la sesión.
  if (event === 'SIGNED_OUT' || !session?.user) {
    showAuth();
    return;
  }
  if (currentUser?.id === session.user.id && event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
  showApp(session.user);
});
