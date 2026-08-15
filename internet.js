const login = document.querySelector('[data-login]');
const userBox = document.querySelector('[data-user]');
const avatar = document.querySelector('[data-avatar]');
const composerAvatar = document.querySelector('[data-composer-avatar]');
const name = document.querySelector('[data-name]');
const rank = document.querySelector('[data-rank]');
const composer = document.querySelector('[data-composer]');
const signedOut = document.querySelector('[data-signed-out]');
const content = document.querySelector('[data-post-content]');
const count = document.querySelector('[data-character-count]');
const postButton = document.querySelector('[data-post-button]');
const postMessage = document.querySelector('[data-post-message]');
const composerHighlight = document.querySelector('[data-composer-highlight]');
const list = document.querySelector('[data-post-list]');
const note = document.querySelector('[data-feed-note]');
const admin = document.querySelector('[data-admin]');
const targetId = document.querySelector('[data-target-id]');
const banReason = document.querySelector('[data-ban-reason]');
const banDuration = document.querySelector('[data-ban-duration]');
const ipBanOption = document.querySelector('[data-ip-ban]');
const adminMessage = document.querySelector('[data-admin-message]');
const banScreen = document.querySelector('[data-ban-screen]');
const joinRequiredScreen = document.querySelector('[data-join-required-screen]');
const banReasonDisplay = document.querySelector('[data-ban-reason-display]');
const banDurationDisplay = document.querySelector('[data-ban-duration-display]');
const search = document.querySelector('[data-search]');
const profileTitle = document.querySelector('[data-profile-title]');
const profileCopy = document.querySelector('[data-profile-copy]');
const profileBanner = document.querySelector('[data-profile-banner]');
const profileDiscord = document.querySelector('[data-profile-discord]');
const profileAvatar = document.querySelector('[data-profile-avatar]');
const profileHandle = document.querySelector('[data-profile-handle]');
const profileVerified = document.querySelector('[data-profile-verified]');
const profilePostCount = document.querySelector('[data-profile-post-count]');
const profileList = document.querySelector('[data-profile-list]');
const staffLink = document.querySelector('[data-staff-link]');
const governmentLink = document.querySelector('[data-government-link]');
const staffContent = document.querySelector('[data-staff-content]');
const warningNotice = document.querySelector('[data-warning-notice]');
const warningReasons = document.querySelector('[data-warning-reasons]');
const messagesList = document.querySelector('[data-messages-list]');
const notificationList = document.querySelector('[data-notification-list]');
const notificationCount = document.querySelector('[data-notification-count]');
const notificationDot = document.querySelector('[data-notification-dot]');
const messageDot = document.querySelector('[data-message-dot]');
const moderationModal = document.querySelector('[data-moderation-modal]');
const moderationForm = document.querySelector('[data-moderation-form]');
const moderationReason = document.querySelector('[data-moderation-reason]');
const moderationDurationWrap = document.querySelector('[data-moderation-duration-wrap]');
const moderationDuration = document.querySelector('[data-moderation-duration]');
const moderationError = document.querySelector('[data-moderation-error]');
const gifButton = document.querySelector('[data-gif-button]');
const imageButton = document.querySelector('[data-image-button]');
const imageUpload = document.querySelector('[data-image-upload]');
const emojiButton = document.querySelector('[data-emoji-button]');
const mentionButton = document.querySelector('[data-mention-button]');
const pollButton = document.querySelector('[data-poll-button]');
const pollBuilder = document.querySelector('[data-poll-builder]');
const gifPreview = document.querySelector('[data-gif-preview]');
const gifModal = document.querySelector('[data-gif-modal]');
const gifSearch = document.querySelector('[data-gif-search]');
const gifQuery = document.querySelector('[data-gif-query]');
const gifResults = document.querySelector('[data-gif-results]');
const gifMessage = document.querySelector('[data-gif-message]');
const mentionModal = document.querySelector('[data-mention-modal]');
const mentionQuery = document.querySelector('[data-mention-query]');
const mentionResults = document.querySelector('[data-mention-results]');
const emojiModal = document.querySelector('[data-emoji-modal]');
const emojiQuery = document.querySelector('[data-emoji-query]');
const emojiGrid = document.querySelector('[data-emoji-grid]');
const trendingList = document.querySelector('[data-trending-list]');
const bookmarkList = document.querySelector('[data-bookmark-list]');
const profileModal = document.querySelector('[data-profile-modal]');
const messageModal = document.querySelector('[data-message-modal]');
const connectionsModal = document.querySelector('[data-connections-modal]');
const connectionsTitle = document.querySelector('[data-connections-title]');
const connectionsList = document.querySelector('[data-connections-list]');
const messageForm = document.querySelector('[data-message-form]');
const messageUserSearch = document.querySelector('[data-message-user-search]');
const messageUserResults = document.querySelector('[data-message-user-results]');
const postDetail = document.querySelector('[data-post-detail]');
const postModal = document.querySelector('[data-post-modal]');
const postModalForm = document.querySelector('[data-post-modal-form]');
const shareModal = document.querySelector('[data-share-modal]');
const repostPopup = document.querySelector('[data-repost-popup]');
const conversationForm = document.querySelector('[data-conversation-form]');
const conversationInput = document.querySelector('[data-conversation-input]');
const conversationMessages = document.querySelector('[data-conversation-messages]');
const conversationGifPreview = document.querySelector('[data-conversation-gif-preview]');
const conversationError = document.querySelector('[data-conversation-error]');
const accountSwitch = document.querySelector('[data-account-switch]');
const accountSwitchButton = document.querySelector('[data-account-switch-button]');
const accountSwitchMenu = document.querySelector('[data-account-switch-menu]');
const accountSwitchAvatar = document.querySelector('[data-account-switch-avatar]');
const accountSwitchName = document.querySelector('[data-account-switch-name]');
const accountSwitchHandle = document.querySelector('[data-account-switch-handle]');
const officialAccountOption = document.querySelector('[data-official-account-option]');
const officialProfileControls = document.querySelector('[data-official-profile-controls]');
const INTERNET_VERSION = '20260815-perf';
let walletTransferType = 'send';
let walletTransferTarget = null;
let adMedia = null;
let adLogo = null;
let adPlacement = 'sidebar';
let adVideoSeconds = 0;
const MAX_AD_MEDIA_BYTES = 40 * 1024 * 1024;
const AUTOMOD_HOLD_MESSAGE = 'That was held for staff review and was not delivered.';
const AUTOMOD_HOLD_PREVIEW = 'This may be held for staff review when you send it.';
const MAX_REEL_BYTES = 2 * 1024 * 1024 * 1024;
const SMALL_REEL_BYTES = 3_200_000;
const BLOB_LIMIT_MESSAGE = 'Cloud storage hit this month’s Vercel Blob limit, so large uploads are paused. Photos under 3 MB still work. Videos and ads need Blob to reset next billing cycle, or a new/upgraded Blob store in Vercel.';

function blobUploadFailedMessage(raw, { large = true } = {}) {
  const text = String(raw || '');
  if (/suspended|quota|limit|billing|exceeded/i.test(text)) return BLOB_LIMIT_MESSAGE;
  if (/token|blob store|No token|Failed to retrieve/i.test(text)) {
    return large
      ? 'Large uploads need Vercel Blob storage. A photo under 3 MB still works without it.'
      : 'Cloud upload is not configured.';
  }
  return text || 'Could not upload this file.';
}

const MAX_REEL_SLIDES = 10;
const MAX_REEL_AUDIO_BYTES = 40 * 1024 * 1024;
const REEL_SLIDE_MS = 3500;
const INTERNET_PATH = '/internet';

function signInUrl(nextPath = '') {
  let path = String(nextPath || '').trim();
  if (!path) {
    path = String(location.pathname || INTERNET_PATH).replace(/\/+$/, '').replace(/\.html$/i, '') || INTERNET_PATH;
  }
  path = (path.split('?')[0].split('#')[0] || INTERNET_PATH).replace(/\/+$/, '') || INTERNET_PATH;
  if (!(path === '/' || path === INTERNET_PATH || path.startsWith(`${INTERNET_PATH}/`))) path = INTERNET_PATH;
  return `/signin?next=${encodeURIComponent(path)}`;
}

const INTERNET_VIEWS = new Set(['home', 'notifications', 'messages', 'profile', 'member', 'conversation', 'settings', 'staff', 'government', 'wallet', 'post', 'sponsored', 'bookmarks']);

const siteDialog = document.querySelector('[data-site-dialog]');
const siteDialogForm = document.querySelector('[data-site-dialog-form]');
const siteDialogTitle = document.querySelector('[data-site-dialog-title]');
const siteDialogMessage = document.querySelector('[data-site-dialog-message]');
const siteDialogField = document.querySelector('[data-site-dialog-field]');
const siteDialogLabel = document.querySelector('[data-site-dialog-label]');
const siteDialogInput = document.querySelector('[data-site-dialog-input]');
const siteDialogError = document.querySelector('[data-site-dialog-error]');
const siteDialogCancel = document.querySelector('[data-site-dialog-cancel]');
const siteDialogConfirm = document.querySelector('[data-site-dialog-confirm]');
let siteDialogResolver = null;
let siteDialogMode = 'alert';

function closeSiteDialog(result) {
  if (siteDialog) siteDialog.hidden = true;
  const resolve = siteDialogResolver;
  siteDialogResolver = null;
  if (resolve) resolve(result);
}

function openSiteDialog({
  title = 'Notice',
  message = '',
  mode = 'alert',
  label = 'Details',
  value = '',
  placeholder = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  required = false,
  maxLength = 500,
} = {}) {
  return new Promise((resolve) => {
    if (!siteDialog || !siteDialogForm) {
      resolve(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined);
      return;
    }
    if (siteDialogResolver) closeSiteDialog(mode === 'confirm' ? false : mode === 'prompt' ? null : undefined);
    siteDialogMode = mode;
    siteDialogResolver = resolve;
    if (siteDialogTitle) siteDialogTitle.textContent = title;
    if (siteDialogMessage) {
      siteDialogMessage.hidden = !message;
      siteDialogMessage.textContent = message || '';
    }
    if (siteDialogError) siteDialogError.textContent = '';
    if (siteDialogField) siteDialogField.hidden = mode !== 'prompt';
    if (siteDialogLabel) siteDialogLabel.textContent = label;
    if (siteDialogInput) {
      siteDialogInput.value = mode === 'prompt' ? (value || '') : '';
      siteDialogInput.placeholder = placeholder || '';
      siteDialogInput.maxLength = maxLength;
      siteDialogInput.required = mode === 'prompt' && required === true;
    }
    if (siteDialogConfirm) siteDialogConfirm.textContent = confirmLabel;
    if (siteDialogCancel) {
      siteDialogCancel.hidden = mode === 'alert';
      siteDialogCancel.textContent = cancelLabel;
    }
    siteDialog.hidden = false;
    if (mode === 'prompt') siteDialogInput?.focus();
    else siteDialogConfirm?.focus();
  });
}

function siteAlert(message, title = 'Notice') {
  return openSiteDialog({ title, message, mode: 'alert', confirmLabel: 'OK' });
}

function siteConfirm(message, title = 'Confirm', confirmLabel = 'Confirm') {
  return openSiteDialog({ title, message, mode: 'confirm', confirmLabel, cancelLabel: 'Cancel' });
}

function sitePrompt({
  title = 'Edit',
  message = '',
  label = 'Details',
  value = '',
  placeholder = '',
  confirmLabel = 'Save',
  required = true,
  maxLength = 500,
} = {}) {
  return openSiteDialog({
    title,
    message,
    mode: 'prompt',
    label,
    value,
    placeholder,
    confirmLabel,
    cancelLabel: 'Cancel',
    required,
    maxLength,
  });
}

siteDialogCancel?.addEventListener('click', () => {
  closeSiteDialog(siteDialogMode === 'confirm' ? false : siteDialogMode === 'prompt' ? null : undefined);
});
siteDialog?.addEventListener('click', (event) => {
  if (event.target === siteDialog) {
    closeSiteDialog(siteDialogMode === 'confirm' ? false : siteDialogMode === 'prompt' ? null : undefined);
  }
});
siteDialogForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (siteDialogMode === 'prompt') {
    const text = String(siteDialogInput?.value || '').trim();
    if (siteDialogInput?.required && !text) {
      if (siteDialogError) siteDialogError.textContent = 'Please fill this out.';
      return;
    }
    closeSiteDialog(text);
    return;
  }
  closeSiteDialog(siteDialogMode === 'confirm' ? true : undefined);
});

function profileUsernameSlug(username = '') {
  return String(username || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .slice(0, 32);
}

function looksLikeMemberId(value = '') {
  return /^(?:\d{16,22}|u1_[a-f0-9]+|biz_[A-Za-z0-9._-]+|pending:[A-Za-z0-9._:-]+)$/i.test(String(value || '').trim());
}

function findMemberByUsername(username = '') {
  const needle = profileUsernameSlug(username);
  if (!needle) return null;
  return [...internetUsers.values()].find((user) => profileUsernameSlug(user.username) === needle) || null;
}

function profileSharePath(userOrUsername = '') {
  const slug = typeof userOrUsername === 'object' && userOrUsername
    ? profileUsernameSlug(userOrUsername.username)
    : profileUsernameSlug(userOrUsername);
  return slug ? `/profiles/${encodeURIComponent(slug)}` : '';
}

function profileShareUrl(userOrUsername = '') {
  const path = profileSharePath(userOrUsername);
  return path ? `${location.origin}${path}` : '';
}

function internetUrl(view = 'home', id = '') {
  if (view === 'home') return INTERNET_PATH;
  if (view === 'post' && id) return `${INTERNET_PATH}/post/${encodeURIComponent(id)}`;
  if (view === 'member' && id) {
    const user = internetUsers.get(id) || findInternetMember(id) || findMemberByUsername(id);
    const slug = profileUsernameSlug(user?.username || (!looksLikeMemberId(id) ? id : ''));
    if (slug) return `/profiles/${encodeURIComponent(slug)}`;
    return `${INTERNET_PATH}/member/${encodeURIComponent(id)}`;
  }
  if (view === 'sponsored' && id) return `${INTERNET_PATH}/sponsored/${encodeURIComponent(id)}`;
  if (view === 'conversation') return `${INTERNET_PATH}/messages`;
  return `${INTERNET_PATH}/${view}`;
}

function currentInternetPath() {
  return String(location.pathname || '/').replace(/\/+$/, '').replace(/\.html$/i, '') || '/';
}

function readInternetRoute() {
  const hash = String(location.hash || '').replace(/^#/, '');
  if (hash.startsWith('post-')) return { view: 'post', id: hash.slice(5) };
  if (hash.startsWith('member-')) return { view: 'member', id: hash.slice(7) };
  if (INTERNET_VIEWS.has(hash) && hash !== 'post' && hash !== 'member') {
    return { view: hash === 'conversation' ? 'messages' : hash, id: '' };
  }
  const path = currentInternetPath();
  const profileMatch = path.match(/^\/profiles\/([^/]+)$/i);
  if (profileMatch) {
    return { view: 'member', id: decodeURIComponent(profileMatch[1]), byUsername: true };
  }
  const parts = path.startsWith(`${INTERNET_PATH}/`) ? path.slice(INTERNET_PATH.length + 1).split('/').filter(Boolean) : [];
  if (!parts.length) return { view: 'home', id: '' };
  if (parts[0] === 'post' && parts[1]) return { view: 'post', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'member' && parts[1]) return { view: 'member', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'sponsored') return { view: 'sponsored', id: parts[1] ? decodeURIComponent(parts[1]) : '' };
  if (parts[0] === 'reels' || parts[0] === 'phone' || parts[0] === 'marketplace' || parts[0] === 'mail') return { view: 'home', id: '' };
  if (INTERNET_VIEWS.has(parts[0]) && parts[0] !== 'post' && parts[0] !== 'member' && parts[0] !== 'sponsored') {
    return { view: parts[0], id: '' };
  }
  return { view: 'home', id: '' };
}

function setInternetRoute(view, id = '', replace = false) {
  const url = internetUrl(view, id);
  if (currentInternetPath() === url && !location.hash) return;
  const write = replace || location.hash || /\.html$/i.test(location.pathname) ? history.replaceState : history.pushState;
  write.call(history, {}, '', url);
}
let officialAccountId = '';
const OFFICIAL_ACCOUNT_FALLBACK = Object.freeze({
  id: '',
  displayName: 'Clearwater Roleplay',
  username: 'clearwaterroleplay',
  avatarUrl: 'assets/clearwater-logo.png',
  bannerUrl: 'assets/clearwater-police-night.png',
  bio: 'Official Clearwater Roleplay updates and announcements.',
  staffRank: 'Official account',
  verified: true,
  badges: [],
});
let allPosts = [];
let currentUserId = null;
let internetUsers = new Map();
let loadingPosts = false;
let loadPostsQueued = false;
let lastFeedFingerprint = '';
const likeBaseline = new Map();
const likeFlushTimers = new Map();
const inFlightBookmarks = new Set();
let accountBanned = false;
let activeBan = null;
let sessionIsOwner = false;
let sessionStaffPanel = null;
let sessionCanStaff = false;
let sessionCanGovernment = false;
let sessionCanGovernmentReview = false;
let activeAccount = 'personal';
let sessionUser = null;
let pendingReportReview = null;
let selectedGif = null;
let selectedImage = null;
let messageGif = null;
let reelsSoundOn = (() => {
  try {
    const saved = localStorage.getItem('clearwater-reels-sound');
    if (saved === '0') return false;
    if (saved === '1') return true;
  } catch { /* keep default */ }
  return true;
})();
let reelsVolume = (() => {
  try {
    const saved = Number(localStorage.getItem('clearwater-reels-volume'));
    if (Number.isFinite(saved)) return Math.min(1, Math.max(0, saved));
  } catch { /* keep default */ }
  return 1;
})();
let reelsAudioUnlocked = false;
let pickerTarget = 'post';
let socialState = { following: [], followers: [], blocked: [], muted: [], bookmarks: [], bookmarkCollections: [], unreadNotifications: 0, unreadMessages: 0 };
let activeBookmarkCollectionId = '';
let postBoostPricing = { cost: 250, hours: 12, dailyCap: 5, paused: false };
const POST_BOOST_COST_FALLBACK = 250;
let onboardingWalletVisited = false;
let composerDraftTimer = 0;
let viewedMember = null;
let profileTab = 'posts';
let memberTab = 'posts';
let connectionModalScope = null;
let connectionModalKind = null;
let preferenceState = {};
let profileDraft = null;
let profileBannerBusy = false;
let pendingPostAction = null;
let openPostId = null;
let moderationSnapshot = null;
let selectedReportId = null;
let feedTab = ['foryou', 'recent', 'following', 'official'].includes(localStorage.getItem('clearwater-feed-tab')) ? localStorage.getItem('clearwater-feed-tab') : 'foryou';
let selectedLocation = null;
let dropLocationTimer = 0;
let dropLocationBusy = false;
let selectedQuoteId = null;
let activeReelId = null;
let reelMedia = null;
let reelAudio = null;
let reelSlideTimers = new Map();
let reelObserver = null;
let reelScrollSyncTimer = 0;
let reelTapTimer = 0;
let reelTapCard = null;
let reelTapAt = 0;
let reelTapX = 0;
let reelTapY = 0;
let reelPointer = null;
let staffTab = 'overview';
let staffQueueFilter = 'pending';
let staffHistoryFilter = 'all';
let staffHistoryQuery = '';
let staffUserQuery = '';
let staffUsersFilter = 'all';
let staffSearchResults = null;
let staffSearchBusy = false;
let staffSearchTimer = 0;
let selectedStaffUserId = null;
let staffUserDetail = null;
let staffMessagesState = null;
let staffUserBusy = false;
let sidebarAds = [];
let feedAds = [];
let reelAds = [];
let myAds = [];
let adBusinessAccounts = [];
let myBusinessAccounts = [];
let myVerificationApp = null;
let accountVerified = false;
let businessAvatarDraft = null;
const businessEditAvatarDrafts = new Map();
let adPricing = {
  base: 1200,
  boost: 300,
  maxBoost: 5,
  durationHours: 48,
  reelDurationMultipliers: { upTo15: 1, upTo30: 1.25, upTo45: 1.5, upTo60: 1.75, over60: 2 },
};
let adRotateTimer = 0;
let adWalletTab = 'create';
const expandedPollVoters = new Set();
const clearwaterEmojiChoices = [
  ['🚓', 'Police'], ['🚒', 'Fire rescue'], ['🚑', 'EMS'], ['🌴', 'Clearwater'],
  ['🌊', 'Gulf Coast'], ['☀️', 'Florida'], ['🛟', 'Lifeguard'], ['📍', 'Location'],
  ['✅', 'Approved'], ['⚠️', 'Alert'], ['📢', 'Announcement'], ['💙', 'Clearwater blue'],
];
const emojiChoices = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','😘','🥰','😎','🤩','🥳','🤔','😢','😭','😡','🤯','😴','👀','💀','❤️','💙','💚','🔥','✨','🎉','🚓','🚒','🚑','👍','👎','✅','❌','⚠️','📌','📷','🎮'];

function scanClientContent(value) {
  const raw = String(value || '');
  if (!raw.trim()) return null;
  const compact = raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[а]/gi, 'a').replace(/[с]/gi, 'c').replace(/[е]/gi, 'e').replace(/[һ]/gi, 'h').replace(/[іı]/gi, 'i').replace(/[ј]/gi, 'j').replace(/[к]/gi, 'k').replace(/[оο]/gi, 'o').replace(/[р]/gi, 'p').replace(/[ѕ]/gi, 's').replace(/[т]/gi, 't').replace(/[х]/gi, 'x').toLowerCase().replace(/ph/g, 'f').replace(/[@$0]/g, 'o').replace(/[1!|]/g, 'i').replace(/[3]/g, 'e').replace(/[4]/g, 'a').replace(/[5$]/g, 's').replace(/[7]/g, 't').replace(/v/g, 'u');
  const folded = compact.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const collapsed = compact.replace(/[^a-z0-9]+/g, '');
  const fuzzy = ['nigger', 'nigga', 'faggot', 'fagot', 'kike', 'tranny', 'trannie', 'retard', 'wetback', 'chink', 'gook', 'spic', 'beaner', 'raghead', 'towelhead', 'fuck', 'fuk', 'fck', 'fvck', 'phuck', 'fcuk', 'shit', 'bitch', 'pussy', 'whore', 'slut', 'dick', 'dildo', 'handjob', 'blowjob', 'nudes'];
  const words = ['asshole', 'jackass', 'dumbass', 'dickhead', 'dipshit', 'bullshit', 'motherfucker', 'cunt', 'twat', 'stfu', 'rape', 'rapist', 'incest'];
  const hitFuzzy = fuzzy.some((term) => {
    const letters = term.replace(/[^a-z0-9]/g, '');
    return new RegExp(letters.split('').map((letter) => `${letter}+`).join('[^a-z0-9]*')).test(collapsed);
  });
  const hitWord = words.some((term) => new RegExp(`\\b${term}\\b`, 'i').test(folded));
  const hitHate = /\b(?:nigg(?:a|er)s?|fag+ots?|kikes?|trann(?:y|ies)|retard(?:ed|s)?)\b/i.test(raw) || /n+i+g{2,}(?:a|e+r?)s?/.test(collapsed);
  const hitThreat = /\b(?:kys|kill\s+your\s*self|unalive\s+yourself)\b/i.test(raw);
  if (hitFuzzy || hitWord || hitHate || hitThreat) return { reason: AUTOMOD_HOLD_MESSAGE };
  return null;
}

function automodHoldError(result, fallback) {
  if (result?.held || /held for staff/i.test(result?.error || fallback || '')) return AUTOMOD_HOLD_MESSAGE;
  return result?.error || fallback;
}

function setConversationHold(message = '') {
  if (!conversationError) return;
  conversationError.hidden = !message;
  conversationError.textContent = message;
}

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const safeCssImageUrl = (value) => {
  const candidate = String(value || '').trim();
  if (/^assets\/[a-z0-9._-]+$/i.test(candidate)) return candidate;
  // Discord CDN images are served through the privacy proxy; CSS backgrounds
  // need the same relative path the <img> tags already use.
  if (/^\/api\/media\?t=[A-Za-z0-9_-]+$/.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || /["'()\\\s]/.test(candidate)) return '';
    return url.href;
  } catch {
    return '';
  }
};
const safeBannerColor = (value) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || '').trim()) ? String(value).trim() : '';
const accentRgb = (value) => {
  const hex = safeBannerColor(value).slice(1, 7);
  if (!hex) return '';
  const full = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex.padEnd(6, '0');
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  return channels.some((channel) => Number.isNaN(channel)) ? '' : channels.join(', ');
};
const setBannerImage = (element, url, color, accent = '') => {
  if (!element) return;
  const image = safeCssImageUrl(url);
  const tint = safeBannerColor(color);
  const rgb = accentRgb(accent);
  const wash = rgb
    ? `linear-gradient(110deg, rgba(3, 10, 22, .55), rgba(${rgb}, .45))`
    : 'linear-gradient(110deg, rgba(3, 10, 22, .48), rgba(18, 87, 163, .25))';
  if (image) {
    element.style.backgroundImage = `${wash}, url("${image}")`;
    return;
  }
  if (tint) {
    element.style.backgroundImage = `linear-gradient(110deg, ${tint}, #061221)`;
    return;
  }
  if (rgb) {
    element.style.backgroundImage = `linear-gradient(110deg, rgba(${rgb}, .9), #061221)`;
    return;
  }
  element.style.backgroundImage = '';
};
const setProfileAccent = (root, accent) => {
  if (!root) return;
  const rgb = accentRgb(accent);
  if (rgb) {
    root.style.setProperty('--profile-accent', safeBannerColor(accent));
    root.style.setProperty('--profile-accent-rgb', rgb);
    root.classList.add('has-accent');
  } else {
    root.style.removeProperty('--profile-accent');
    root.style.removeProperty('--profile-accent-rgb');
    root.classList.remove('has-accent');
  }
};
const safeLinkUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
};
const joinedLabel = (value) => {
  const joined = new Date(value);
  return Number.isNaN(joined.getTime()) ? '' : joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};
const profileMetaMarkup = (user = {}) => {
  const items = [];
  const joined = joinedLabel(user.createdAt);
  if (joined) items.push(`<span><span aria-hidden="true">◷</span> Joined ${escapeHtml(joined)}</span>`);
  return items.join('');
};
const renderProfileMeta = (element, user) => {
  if (!element) return;
  const markup = profileMetaMarkup(user);
  element.innerHTML = markup;
  element.hidden = !markup;
};
const timeAgo = (value) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return 'just now';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return `${hours} hour${hours === 1 ? '' : 's'}${remainingMinutes ? ` and ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}` : ''} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
const verifiedBadge = (gold = false) => `<span class="verified${gold ? ' verified-gold' : ''}" role="img" aria-label="${gold ? 'Business verified' : 'Verified'}" data-tooltip="${gold ? 'Business verified' : 'Verified'}"><img src="assets/verified-badge.png" alt="" /></span>`;
const businessBadge = () => '<span class="role-badge business-badge" role="img" aria-label="Business" data-tooltip="Business account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l1.7-1.7 2.7 2.7 8.3-8.3 1.7 1.7z"/></svg></span>';
const warningBadge = (tooltip) => {
  const label = String(tooltip || 'Account warning').trim() || 'Account warning';
  return `<span class="role-badge warning-badge" role="img" aria-label="${escapeHtml(label)}" data-tooltip="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 22 20.6H2L12 3.4Zm0 5.2c-.7 0-1.2.5-1.1 1.2l.4 5.2h1.4l.4-5.2c.1-.7-.4-1.2-1.1-1.2Zm0 9.3a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z"/></svg></span>`;
};
const isBusinessAccountUser = (user) => /^biz_/i.test(String(user?.id || user?.authorId || ''));
const roleBadges = (user, { skipBusiness = false } = {}) => {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  const premium = badges.includes('clearwater-role')
    ? '<span class="role-badge" role="img" aria-label="Premium" data-tooltip="Premium"><img src="assets/clearwater-role-badge.webp" alt="" /></span>'
    : '';
  const staff = badges.includes('staff')
    ? '<span class="role-badge staff-badge" role="img" aria-label="Staff" data-tooltip="Staff"><img src="assets/clearwater-staff-badge.png" alt="" /></span>'
    : '';
  const developer = badges.includes('developer')
    ? '<span class="role-badge developer-badge" role="img" aria-label="Developer" data-tooltip="Developer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 7.2 3.8 12l4.4 4.8 1.5-1.4L6.7 12l3-3.4-1.5-1.4Zm7.6 0-1.5 1.4 3 3.4-3 3.4 1.5 1.4L20.2 12l-4.4-4.8Z"/></svg></span>'
    : '';
  // Business checkmark is only for biz_* accounts — never personal handlers.
  const business = !skipBusiness && isBusinessAccountUser(user) && badges.includes('business')
    ? businessBadge()
    : '';
  const warning = badges.includes('warning') ? warningBadge(user?.warningBadgeText) : '';
  return `${premium}${staff}${developer}${business}${warning}`;
};
const identityBadges = (user) => {
  const accountId = String(user?.id || user?.authorId || '');
  const business = /^biz_/i.test(accountId);
  const verified = business || user?.verified === true;
  // Gold business-verified is exclusive to business accounts.
  return `${verified ? verifiedBadge(business) : ''}${roleBadges({ ...user, id: accountId || user?.id }, { skipBusiness: true })}`;
};
const currentAuthor = (post) => internetUsers.get(post.authorId) || null;
const isVerified = (post) => {
  const author = currentAuthor(post);
  if (author) return author.verified === true || isBusinessAccountUser(author);
  return post?.verified === true || isBusinessAccountUser({ id: post?.authorId });
};

function refreshProfileVerified() {
  // Own profile is always the personal Discord account, even if posting as a business.
  const me = internetUsers.get(currentUserId);
  const business = isBusinessAccountUser(me);
  if (profileVerified) {
    profileVerified.hidden = !(me?.verified === true || business);
    profileVerified.classList.toggle('verified-gold', business);
    profileVerified.setAttribute('aria-label', business ? 'Business verified' : 'Verified');
    profileVerified.dataset.tooltip = business ? 'Business verified' : 'Verified';
  }
  const staffBadge = document.querySelector('[data-profile-staff-badge]');
  if (staffBadge) staffBadge.hidden = !Array.isArray(me?.badges) || !me.badges.includes('staff');
  const businessBadgeEl = document.querySelector('[data-profile-business-badge]');
  if (businessBadgeEl) businessBadgeEl.hidden = true;
  const warning = document.querySelector('[data-profile-warning-badge]');
  if (warning) {
    const on = Array.isArray(me?.badges) && me.badges.includes('warning');
    warning.hidden = !on;
    if (on) {
      const label = String(me.warningBadgeText || 'Account warning').trim() || 'Account warning';
      warning.setAttribute('aria-label', label);
      warning.dataset.tooltip = label;
    }
  }
}

function activeBusinessAccount() {
  if (!String(activeAccount || '').startsWith('business:')) return null;
  const id = activeAccount.slice('business:'.length);
  return myBusinessAccounts.find((biz) => biz.id === id && biz.status === 'active' && biz.canPost) || null;
}

function activeAuthor() {
  if (activeAccount === 'official') return internetUsers.get(officialAccountId) || OFFICIAL_ACCOUNT_FALLBACK;
  const biz = activeBusinessAccount();
  if (biz) {
    return internetUsers.get(biz.id) || {
      id: biz.id,
      username: biz.username,
      displayName: biz.displayName,
      avatarUrl: biz.avatarUrl || 'assets/clearwater-logo.png',
      verified: true,
      business: true,
      badges: ['business'],
    };
  }
  return null;
}

function activeUserId() {
  if (activeAccount === 'official') return officialAccountId;
  const biz = activeBusinessAccount();
  if (biz) return biz.id;
  return currentUserId;
}

function activeAccountRequest() {
  if (activeAccount === 'official') return { asOfficial: true };
  const biz = activeBusinessAccount();
  if (biz) return { asBusinessId: biz.id };
  return {};
}

function postingBusinessAccounts() {
  return (Array.isArray(myBusinessAccounts) ? myBusinessAccounts : [])
    .filter((biz) => biz.status === 'active' && biz.canPost);
}

function renderBusinessAccountOptions() {
  const host = document.querySelector('[data-business-account-options]');
  if (!host) return;
  const accounts = postingBusinessAccounts();
  host.innerHTML = accounts.map((biz) => {
    const selected = activeAccount === `business:${biz.id}`;
    return `<button type="button" data-select-account="business:${escapeHtml(biz.id)}"><img src="${escapeHtml(biz.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(biz.displayName)}</b><small>@${escapeHtml(biz.username)} · Business</small></span><em ${selected ? '' : 'hidden'}>✓</em></button>`;
  }).join('');
}

function updateAccountSwitcher() {
  if (!sessionUser || !accountSwitch) return;
  renderBusinessAccountOptions();
  const selected = activeAuthor() || sessionUser;
  accountSwitchAvatar.src = selected.avatarUrl || 'assets/clearwater-logo.png';
  accountSwitchName.textContent = selected.displayName || selected.username || 'Clearwater account';
  accountSwitchHandle.textContent = `@${selected.username || 'clearwater'}`;
  document.querySelector('[data-personal-account-selected]')?.toggleAttribute('hidden', activeAccount !== 'personal');
  document.querySelector('[data-official-account-selected]')?.toggleAttribute('hidden', activeAccount !== 'official');
  if (composerAvatar) composerAvatar.src = selected.avatarUrl || 'assets/clearwater-logo.png';
  if (avatar) avatar.src = selected.avatarUrl || 'assets/clearwater-logo.png';
  if (name) name.textContent = selected.displayName || selected.username || 'Clearwater account';
  if (rank) {
    if (activeAccount === 'official') rank.textContent = 'Official';
    else if (activeBusinessAccount()) rank.textContent = 'Business';
    else rank.textContent = sessionUser.staffRank || '';
  }
}

function selectPostingAccount(account) {
  if (account === 'official' && !sessionIsOwner) return;
  if (String(account || '').startsWith('business:')) {
    const id = account.slice('business:'.length);
    const biz = postingBusinessAccounts().find((item) => item.id === id);
    if (!biz) return;
    activeAccount = `business:${biz.id}`;
    if (!internetUsers.has(biz.id)) {
      internetUsers.set(biz.id, {
        id: biz.id,
        username: biz.username,
        displayName: biz.displayName,
        avatarUrl: biz.avatarUrl || 'assets/clearwater-logo.png',
        verified: true,
        business: true,
        badges: ['business'],
      });
    }
  } else {
    activeAccount = account === 'official' ? 'official' : 'personal';
  }
  if (activeAccount === 'official' && officialAccountId && !internetUsers.has(officialAccountId)) {
    internetUsers.set(officialAccountId, { ...OFFICIAL_ACCOUNT_FALLBACK, id: officialAccountId });
  }
  localStorage.setItem(`clearwater-posting-account-${currentUserId}`, activeAccount);
  updateAccountSwitcher();
  accountSwitchMenu.hidden = true;
  accountSwitchButton?.setAttribute('aria-expanded', 'false');
  void loadSocial();
  messagesRenderKey = '';
  notificationsRenderKey = '';
  void loadMessages();
  void loadNotifications();
  if (activeAccount === 'official') openMemberProfile(officialAccountId);
  else if (activeBusinessAccount()) openMemberProfile(activeBusinessAccount().id);
}

async function readApiJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(fallbackMessage);
  try {
    const payload = await response.json();
    if (payload?.code === 'VPN_BLOCKED' || /vpns? and proxies are not allowed/i.test(String(payload?.error || ''))) {
      throw new Error(payload.error || 'VPNs and proxies are not allowed on Clearwater.');
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && /vpns? and proxies/i.test(error.message)) throw error;
    throw new Error(fallbackMessage);
  }
}

function postMenu(post) {
  if (!currentUserId) return '';
  const ownPost = post.authorId === activeUserId();
  const boostable = !post.parentId && post.kind !== 'reel' && !post.boostActive;
  const buttons = ownPost
    ? '<button type="button" data-post-action="edit">Edit post</button><button type="button" data-post-action="delete">Delete post</button>'
    : `<button type="button" data-post-action="report">Report post</button>${sessionIsOwner ? '<button type="button" class="danger" data-post-action="delete">Delete post</button>' : ''}`;
  const tip = boostable && !postBoostPricing.paused
    ? `<button type="button" data-post-boost="${escapeHtml(post.id)}">Tip into For You · C$${Number(postBoostPricing.cost) || 250}</button>`
    : (post.boostActive ? '<button type="button" disabled>Boosted in For You</button>' : '');
  return `<details class="post-menu"><summary aria-label="Post actions">•••</summary><div data-post-id="${escapeHtml(post.id)}">${tip}${buttons}</div></details>`;
}

function postActionIcon(type, filled = false) {
  const icons = {
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.7 8.7 0 0 1-3.7-.8L3.5 21l1.3-3.8A7.7 7.7 0 0 1 3.5 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" /></svg>',
    repost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>',
    like: `<svg viewBox="0 0 24 24" aria-hidden="true"${filled ? ' class="filled"' : ''}><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.8 1.8Z" /></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" aria-hidden="true"${filled ? ' class="filled"' : ''}><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.6L6 21V4.5Z" /></svg>`,
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>',
  };
  return icons[type] || '';
}

function isNativeRepost(post) {
  return Boolean(post?.repostOf) && !post.quoteId && !String(post.content || '').trim();
}

function sourcePost(post) {
  if (!isNativeRepost(post)) return post;
  return allPosts.find((item) => item.id === post.repostOf) || post;
}

function formatPostBody(post) {
  const text = typeof post === 'string' ? post : post?.content;
  return escapeHtml(text)
    .replace(/(^|[\s([{'"“‘])(#[a-z0-9_]{1,60})/gi, '$1<a href="/internet" class="post-hashtag" data-topic="$2">$2</a>')
    .replace(/(^|[\s([{'"“‘])(@[a-z0-9._-]{1,80})/gi, (full, leading, handle) => {
      const mentioned = [...internetUsers.values()].find((user) => String(user.username || '').toLowerCase() === handle.slice(1).toLowerCase());
      return mentioned ? `${leading}<button type="button" class="post-mention" data-open-member="${escapeHtml(mentioned.id)}">${handle}</button>` : `${leading}<span class="post-mention">${handle}</span>`;
    });
}

function canComposePost() {
  return Boolean(String(content?.value || '').trim() || selectedGif || selectedImage || selectedLocation || selectedQuoteId);
}

function renderDropPreview() {
  const preview = document.querySelector('[data-drop-preview]');
  if (!preview) return;
  if (!selectedLocation) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  preview.hidden = false;
  preview.innerHTML = `${dropMapMarkup(selectedLocation)}<button type="button" data-remove-location>Remove location</button>`;
  composer?.classList.add('composer-expanded');
}

function locationLine(location) {
  if (!location) return '';
  // Keep street addresses off the post body so automod does not treat drops as doxxing.
  // The full label still shows on the map caption.
  if (location.postal) return `📍 Postal ${location.postal}`;
  return '📍 Location dropped from ER:LC';
}

function applyDroppedLocation(location) {
  const previousLine = locationLine(selectedLocation);
  selectedLocation = location;
  const line = locationLine(location);
  if (content && line) {
    if (previousLine && content.value.includes(previousLine) && previousLine !== line) {
      content.value = content.value.split(previousLine).join(line);
    } else if (!content.value.includes(line)) {
      content.value = content.value.trim() ? `${content.value.trim()}\n${line}` : line;
    }
    count.textContent = `${content.value.length} / 500`;
    updateComposerHighlight();
  }
  renderDropPreview();
  postButton.disabled = !canComposePost();
}

function stopDropLocationRefresh() {
  if (dropLocationTimer) {
    window.clearInterval(dropLocationTimer);
    dropLocationTimer = 0;
  }
}

function startDropLocationRefresh() {
  stopDropLocationRefresh();
  dropLocationTimer = window.setInterval(() => {
    void refreshDropLocation({ silent: true });
  }, 15_000);
}

async function refreshDropLocation({ silent = false } = {}) {
  if (!currentUserId || dropLocationBusy) return false;
  dropLocationBusy = true;
  const button = document.querySelector('[data-drop-location]');
  if (!silent && button) button.disabled = true;
  if (!silent) postMessage.textContent = 'Checking your ER:LC location...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'erlc-location', ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not read your in-game location.');
    if (!response.ok) throw new Error(result.error || 'Could not read your in-game location.');
    applyDroppedLocation(result.location);
    if (!silent) postMessage.textContent = 'Location dropped from ER:LC.';
    startDropLocationRefresh();
    return true;
  } catch (error) {
    if (!silent) postMessage.textContent = error.message || 'Could not read your in-game location.';
    return false;
  } finally {
    dropLocationBusy = false;
    if (button) button.disabled = false;
  }
}

// Official map images are full-bleed 3121² over the 3120² stud plane.
// Live player payloads use northwest-origin studs (0..3120). Centre-origin
// (negative axes) is also supported if the API returns that shape.
const LIBERTY_WORLD = 3120;

function libertyMapPoint(x, z) {
  const nx = Number(x);
  const nz = Number(z);
  if (!Number.isFinite(nx) || !Number.isFinite(nz)) return null;
  const centreOrigin = nx < 0 || nz < 0;
  const left = centreOrigin ? 0.5 + (nx / LIBERTY_WORLD) : nx / LIBERTY_WORLD;
  const top = centreOrigin ? 0.5 + (nz / LIBERTY_WORLD) : nz / LIBERTY_WORLD;
  return {
    left: Math.min(1, Math.max(0, left)),
    top: Math.min(1, Math.max(0, top)),
  };
}

function mapPinFromLocation(location) {
  const fromWorld = libertyMapPoint(location?.x, location?.z);
  if (fromWorld) return fromWorld;
  const left = Number(location?.left);
  const top = Number(location?.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

function dropMapMarkup(location) {
  const pin = mapPinFromLocation(location);
  if (!pin) return '';
  // Mild zoom so edge pins stay on the terrain instead of sitting in black void.
  const zoom = 1.85;
  const minTranslate = (1 - zoom) * 100;
  const tx = Math.max(minTranslate, Math.min(0, 50 - pin.left * 100 * zoom));
  const ty = Math.max(minTranslate, Math.min(0, 50 - pin.top * 100 * zoom));
  // Keep the pin in view coordinates (outside the scaled scene) so the tip
  // stays on the true map point and does not drift when zoomed.
  const screenX = pin.left * 100 * zoom + tx;
  const screenY = pin.top * 100 * zoom + ty;
  const caption = location.label && location.postal && !String(location.label).includes(String(location.postal))
    ? `${location.label} · Postal ${location.postal}`
    : (location.label || (location.postal ? `Postal ${location.postal}` : ''));
  return `<figure class="drop-map"><div class="drop-map-view"><div class="drop-map-scene" style="transform:translate(${tx.toFixed(2)}%,${ty.toFixed(2)}%) scale(${zoom})"><img src="assets/liberty-county-map.jpg" alt="Liberty County map" draggable="false" /></div><i class="drop-map-pin" style="left:${screenX.toFixed(2)}%;top:${screenY.toFixed(2)}%" aria-hidden="true"><span></span></i></div>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}

function postMediaMarkup(post, displayName, { reelOpenId = '' } = {}) {
  const gif = safeGifUrl(post.gifUrl) ? `<img class="post-gif" src="${escapeHtml(post.gifUrl)}" alt="${escapeHtml(post.gifTitle || 'GIF')}" />` : '';
  const image = safeImageUrl(post.imageUrl) ? `<img class="post-image" src="${escapeHtml(post.imageUrl)}" alt="Image shared by ${escapeHtml(displayName || 'a Clearwater member')}" />` : '';
  const videoSrc = safeVideoUrl(post.videoUrl) ? post.videoUrl : (post.videoUrl && post.kind === 'reel' ? reelMediaProxyUrl(post.id, 'video') : '');
  const video = videoSrc
    ? `<video class="post-reel-video" src="${escapeHtml(videoSrc)}" muted loop playsinline preload="metadata" controls></video>`
    : '';
  const reelChip = reelOpenId
    ? `<button type="button" class="search-reel-chip" data-open-reel="${escapeHtml(reelOpenId)}">Open Reel</button>`
    : '';
  const reelBlock = video
    ? (reelChip ? `<div class="post-reel-frame" data-reel-frame>${video}${reelChip}</div>` : video)
    : '';
  return `${gif}${image}${reelBlock}${dropMapMarkup(post.location)}`;
}

function syncReelOpenChip(frame) {
  const video = frame?.querySelector?.('video.post-reel-video, video');
  const chip = frame?.querySelector?.('.search-reel-chip');
  if (!video || !chip) return;
  const place = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const frameRect = frame.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    if (!vw || !vh || frameRect.width < 1 || videoRect.width < 1) {
      frame.style.setProperty('--reel-chip-left', '12px');
      frame.style.setProperty('--reel-chip-bottom', '12px');
      return;
    }
    const scale = Math.min(videoRect.width / vw, videoRect.height / vh);
    const dispW = vw * scale;
    const dispH = vh * scale;
    const padX = (videoRect.width - dispW) / 2;
    const padY = (videoRect.height - dispH) / 2;
    const left = (videoRect.left - frameRect.left) + padX + 12;
    const bottom = (frameRect.bottom - videoRect.bottom) + padY + 12;
    frame.style.setProperty('--reel-chip-left', `${Math.max(8, left)}px`);
    frame.style.setProperty('--reel-chip-bottom', `${Math.max(8, bottom)}px`);
  };
  place();
  if (video.readyState < 1) video.addEventListener('loadedmetadata', place, { once: true });
  video.addEventListener('loadeddata', place, { once: true });
}

function syncAllReelOpenChips(root = document) {
  root.querySelectorAll('[data-reel-frame]').forEach(syncReelOpenChip);
}

function quoteCardMarkup(quoted, { interactive = true } = {}) {
  if (!quoted) return '<div class="quote-card quote-card-missing">This post is unavailable.</div>';
  const author = currentAuthor(quoted) || quoted;
  const displayName = author?.displayName || quoted.displayName || 'Clearwater member';
  const open = interactive ? ` data-open-post="${escapeHtml(quoted.id)}"` : '';
  const start = interactive ? `<button type="button" class="quote-card"${open}>` : '<div class="quote-card">';
  const end = interactive ? '</button>' : '</div>';
  return `${start}<span class="quote-card-head"><img src="${escapeHtml(author?.avatarUrl || quoted.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><b>${escapeHtml(displayName)}</b>${identityBadges(author?.id ? author : { ...quoted, id: quoted.authorId })}<small>@${escapeHtml(author?.username || quoted.username || 'member')} · ${timeAgo(quoted.createdAt)}</small></span>${quoted.content ? `<p>${escapeHtml(quoted.content)}</p>` : ''}${postMediaMarkup(quoted, displayName)}${end}`;
}

function renderQuotePreview() {
  const preview = document.querySelector('[data-quote-preview]');
  if (!preview) return;
  if (!selectedQuoteId) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  const quoted = sourcePost(allPosts.find((item) => item.id === selectedQuoteId));
  preview.hidden = false;
  preview.innerHTML = `${quoteCardMarkup(quoted, { interactive: false })}<button type="button" data-remove-quote>Remove quote</button>`;
  composer?.classList.add('composer-expanded');
}

function attachQuote(postId) {
  if (!currentUserId) { window.location.href = signInUrl(); return; }
  const post = sourcePost(allPosts.find((item) => item.id === postId));
  if (!post?.id) return;
  selectedQuoteId = post.id;
  document.querySelectorAll('.repost-inline[open]').forEach((item) => item.removeAttribute('open'));
  if (repostPopup) repostPopup.hidden = true;
  if (postModal) postModal.hidden = true;
  if (feedTab !== 'foryou' && feedTab !== 'recent') {
    feedTab = 'foryou';
    localStorage.setItem('clearwater-feed-tab', 'foryou');
  }
  history.pushState({}, '', internetUrl('home'));
  showView('home');
  renderQuotePreview();
  postButton.disabled = !canComposePost();
  content?.focus();
  composer?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function postMarkup(post, profile = false) {
  const wrapper = isNativeRepost(post) ? post : null;
  const display = sourcePost(post);
  const author = currentAuthor(display);
  const displayName = author?.displayName || display.displayName;
  const username = author?.username || display.username;
  const avatarUrl = author?.avatarUrl || display.avatarUrl || 'assets/clearwater-logo.png';
  const staffRank = author?.staffRank || null;
  const body = formatPostBody(display);
  const pollVotes = display.poll?.votes && typeof display.poll.votes === 'object' ? display.poll.votes : {};
  const selectedPollOption = Number.isInteger(Number(pollVotes[activeUserId()])) ? Number(pollVotes[activeUserId()]) : -1;
  const totalPollVotes = Object.keys(pollVotes).length;
  const pollRemaining = (() => {
    const endsAt = new Date(display.poll?.endsAt || 0).getTime();
    if (!endsAt) return '1 day left';
    const hours = Math.ceil((endsAt - Date.now()) / 3_600_000);
    if (hours <= 0) return 'Poll ended';
    return hours >= 48 ? `${Math.ceil(hours / 24)} days left` : `${hours}h left`;
  })();
  const showPollVoters = expandedPollVoters.has(display.id);
  const poll = display.poll?.question && Array.isArray(display.poll.options) ? `<section class="post-poll"><b>${escapeHtml(display.poll.question)}</b>${display.poll.options.map((option, index) => {
    const voterIds = Object.entries(pollVotes).filter(([, vote]) => Number(vote) === index).map(([id]) => id);
    const optionVotes = voterIds.length;
    const percentage = totalPollVotes ? Math.round((optionVotes / totalPollVotes) * 100) : 0;
    const voters = showPollVoters && voterIds.length ? `<div class="poll-voter-list">${voterIds.map((id) => { const voter = internetUsers.get(id) || {}; return `<span class="poll-voter"><img src="${escapeHtml(voter.avatarUrl || 'assets/clearwater-logo.png')}" alt="" />${escapeHtml(voter.displayName || 'Clearwater member')}</span>`; }).join('')}</div>` : '';
    return `<div class="poll-option ${selectedPollOption === index ? 'selected' : ''}"><button type="button" data-poll-vote="${index}" data-post-id="${escapeHtml(display.id)}" ${pollRemaining === 'Poll ended' ? 'disabled' : ''}><span>${escapeHtml(option)}</span><span>${optionVotes} &middot; ${percentage}%</span></button>${voters}</div>`;
  }).join('')}<div class="post-poll-footer"><span>${totalPollVotes} ${totalPollVotes === 1 ? 'vote' : 'votes'} &middot; ${pollRemaining}</span><button type="button" class="post-poll-link" data-poll-voters="${escapeHtml(display.id)}">${showPollVoters ? 'Hide votes' : 'See who voted'}</button>${selectedPollOption >= 0 ? `<button type="button" class="post-poll-link" data-poll-remove="${escapeHtml(display.id)}">Remove my vote</button>` : ''}</div></section>` : '';
  const replies = allPosts.filter((item) => item.parentId === display.id).length;
  const likes = Array.isArray(display.likes) ? display.likes : [];
  const liked = likes.includes(activeUserId());
  const alreadyReposted = allPosts.some((item) => item.authorId === activeUserId() && isNativeRepost(item) && item.repostOf === display.id);
  const bookmarked = Array.isArray(socialState.bookmarks) && socialState.bookmarks.includes(display.id);
  const quoted = display.quoteId ? allPosts.find((item) => item.id === display.quoteId) : null;
  const quoteMarkup = display.quoteId ? quoteCardMarkup(quoted) : '';
  const repostLabel = wrapper
    ? `<small class="reposted-label">↻ ${escapeHtml(wrapper.displayName || 'A member')} reposted</small>`
    : '';
  const boostChip = display.boostActive ? '<span class="post-boost-chip">Tipped</span>' : '';
  const media = postMediaMarkup(display, displayName, display.kind === 'reel' ? { reelOpenId: display.id } : undefined);
  return `<article class="post" data-post-card="${escapeHtml(display.id)}">${repostLabel}<div class="post-layout"><img class="post-avatar" src="${escapeHtml(avatarUrl)}" alt="" /><div class="post-main"><div class="post-top"><button class="post-author" type="button" data-open-member="${escapeHtml(display.authorId)}"><span class="post-name">${escapeHtml(displayName)}</span>${identityBadges(author || { ...display, id: display.authorId })}${boostChip}${display.kind === 'reel' ? '<span class="post-reel-tag">Reel</span>' : ''}<span class="post-meta">@${escapeHtml(username)} &middot; ${timeAgo(display.createdAt)}${display.editedAt ? ' &middot; edited' : ''}${staffRank && !profile ? `<span class="post-rank"> &middot; ${escapeHtml(staffRank)}</span>` : ''}</span></button>${postMenu(display)}</div>${display.content ? `<p class="post-content">${body}</p>` : ''}${quoteMarkup}${media}${poll}<div class="post-action-row"><button type="button" data-engage="reply" data-post-id="${escapeHtml(display.id)}">${postActionIcon('reply')}<span>${replies || ''}</span></button><details class="repost-inline"><summary aria-label="Repost options" class="${alreadyReposted ? 'reposted' : ''}">${postActionIcon('repost')}</summary><div><button type="button" data-engage="repost-now" data-post-id="${escapeHtml(display.id)}">${alreadyReposted ? 'Undo repost' : 'Repost'}</button><button type="button" data-engage="quote" data-post-id="${escapeHtml(display.id)}">Quote</button></div></details><button type="button" data-engage="like" data-post-id="${escapeHtml(display.id)}" class="${liked ? 'liked' : ''}">${postActionIcon('like', liked)}<span>${likes.length || ''}</span></button><button type="button" data-engage="bookmark" data-post-id="${escapeHtml(display.id)}" class="${bookmarked ? 'bookmarked' : ''}" aria-label="${bookmarked ? 'Remove bookmark' : 'Bookmark'}" aria-pressed="${bookmarked ? 'true' : 'false'}">${postActionIcon('bookmark', bookmarked)}</button><button type="button" data-engage="share" data-post-id="${escapeHtml(display.id)}">${postActionIcon('share')}</button></div></div></div></article>`;
}

function safeGifUrl(value) {
  try { return /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(new URL(String(value)).href); } catch { return false; }
}

function isHostedMediaUrl(value) {
  const raw = String(value || '').trim();
  if (/^\/api\/media\?(?:reel|t)=/i.test(raw)) return true;
  try {
    const url = new URL(raw, location.origin);
    if (url.origin === location.origin && url.pathname === '/api/media') return true;
    if (url.protocol === 'https:' && /(^|\.)blob\.vercel-storage\.com$/i.test(url.hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

function safeImageUrl(value) {
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(String(value || '')) || isHostedMediaUrl(value);
}

function safeVideoUrl(value) {
  return /^data:video\/(?:mp4|webm|quicktime);base64,[a-z0-9+/=]+$/i.test(String(value || '')) || isHostedMediaUrl(value);
}

function safeAudioUrl(value) {
  return /^data:audio\/(?:mpeg|mp3|mp4|wav|ogg|webm|aac|x-m4a);base64,[a-z0-9+/=]+$/i.test(String(value || '')) || isHostedMediaUrl(value);
}

function isReelsTab() {
  return false;
}

function isHomeViewActive() {
  return !document.querySelector('[data-view="home"]')?.hidden;
}

function isSearchingFeed() {
  return Boolean(String(search?.value || '').trim());
}

function isVisibleReelsTab() {
  return isHomeViewActive() && isReelsTab() && !isSearchingFeed();
}

function pauseReelVideos() {
  document.querySelectorAll('[data-reels-viewport] video, [data-reels-viewport] audio[data-reel-track]').forEach((media) => {
    media.pause();
    media.muted = true;
  });
  document.querySelectorAll('[data-reels-viewport] .reel-card').forEach((card) => stopReelSlideshow(card));
}

function reelMediaElements(scope = document) {
  return [...scope.querySelectorAll('[data-reels-viewport] video, [data-reels-viewport] audio[data-reel-track]')];
}

function cardReelMedia(card) {
  if (!card) return null;
  return card.querySelector('video') || card.querySelector('audio[data-reel-track]');
}

function persistReelAudioPrefs() {
  try {
    localStorage.setItem('clearwater-reels-sound', reelsSoundOn ? '1' : '0');
    localStorage.setItem('clearwater-reels-volume', String(reelsVolume));
  } catch {
    // Ignore private-mode storage failures.
  }
}

function soundIcon(on = false) {
  return on
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5.2a4 4 0 0 1 0 5.6m2.7-8.3a8 8 0 0 1 0 11" /></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12 1.6 5 4.8m0-4.8-5 4.8" /></svg>';
}

function reelAudioControlsMarkup(reelId = '') {
  const volumePct = Math.round(reelsVolume * 100);
  return `<div class="reel-audio">
    <button type="button" class="reel-mute${reelsSoundOn ? ' is-on' : ''}" data-reel-sound="${escapeHtml(reelId)}" aria-pressed="${reelsSoundOn ? 'true' : 'false'}" aria-label="${reelsSoundOn ? 'Mute reel' : 'Unmute reel'}">${soundIcon(reelsSoundOn)}<span class="sr-only">${reelsSoundOn ? 'Sound on' : 'Muted'}</span></button>
    <label class="reel-volume${reelsSoundOn ? '' : ' is-muted'}" aria-label="Reel volume">
      <input type="range" min="0" max="100" step="1" value="${volumePct}" data-reel-volume />
      <span data-reel-volume-label>${volumePct}%</span>
    </label>
  </div>`;
}

function syncReelSoundControls() {
  document.querySelectorAll('[data-reels-viewport] [data-reel-sound]').forEach((button) => {
    button.classList.toggle('is-on', reelsSoundOn);
    button.setAttribute('aria-pressed', reelsSoundOn ? 'true' : 'false');
    button.setAttribute('aria-label', reelsSoundOn ? 'Mute reel' : 'Unmute reel');
    button.innerHTML = `${soundIcon(reelsSoundOn)}<span class="sr-only">${reelsSoundOn ? 'Sound on' : 'Muted'}</span>`;
  });
  document.querySelectorAll('[data-reels-viewport] .reel-volume').forEach((wrap) => {
    wrap.classList.toggle('is-muted', !reelsSoundOn);
    const slider = wrap.querySelector('[data-reel-volume]');
    const label = wrap.querySelector('[data-reel-volume-label]');
    const volumePct = Math.round(reelsVolume * 100);
    if (slider && Number(slider.value) !== volumePct) slider.value = String(volumePct);
    if (label) label.textContent = `${volumePct}%`;
  });
}

function applyReelVolume(media) {
  if (!media) return;
  media.volume = reelsVolume;
  media.muted = !reelsSoundOn || media.paused || reelsVolume <= 0;
}

function setReelVolume(value) {
  const next = Math.min(1, Math.max(0, Number(value)));
  reelsVolume = Number.isFinite(next) ? next : 1;
  if (reelsVolume > 0 && !reelsSoundOn) reelsSoundOn = true;
  if (reelsVolume <= 0) reelsSoundOn = false;
  persistReelAudioPrefs();
  reelMediaElements().forEach((media) => applyReelVolume(media));
  syncReelSoundControls();
}

function setReelSound(on) {
  reelsSoundOn = Boolean(on);
  if (reelsSoundOn && reelsVolume <= 0) reelsVolume = 1;
  persistReelAudioPrefs();
  reelMediaElements().forEach((media) => applyReelVolume(media));
  syncReelSoundControls();
}

function unlockReelAudio() {
  if (reelsAudioUnlocked) return;
  reelsAudioUnlocked = true;
  if (isReelAutoplayEnabled() && !reelsSoundOn && reelsVolume > 0) {
    reelsSoundOn = true;
    persistReelAudioPrefs();
  }
  const active = cardReelMedia(centeredReelCard());
  if (active && !active.paused) applyReelVolume(active);
  syncReelSoundControls();
}

function toggleReelSound(card) {
  unlockReelAudio();
  setReelSound(!reelsSoundOn);
  const media = cardReelMedia(card);
  if (!media) return;
  applyReelVolume(media);
  if (!reelsSoundOn) return;
  void media.play().then(() => {
    applyReelVolume(media);
  }).catch(() => {
    setReelSound(false);
    void media.play().catch(() => {});
  });
}

function isReelAutoplayEnabled() {
  return preferenceState.autoplayReels !== false;
}

function wantsReelAutoSound() {
  return isReelAutoplayEnabled() && reelsSoundOn && reelsVolume > 0;
}

function centeredReelCard(viewport = document.querySelector('[data-reels-viewport]')) {
  if (!viewport) return null;
  const cards = [...viewport.querySelectorAll('.reel-card')];
  if (!cards.length) return null;
  // Use viewport geometry — offsetTop breaks when the scroll parent is not the offsetParent (common on mobile).
  const root = viewport.getBoundingClientRect();
  const mid = root.top + (root.height / 2);
  let best = cards[0];
  let bestDist = Infinity;
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const dist = Math.abs((rect.top + (rect.height / 2)) - mid);
    if (dist < bestDist) {
      best = card;
      bestDist = dist;
    }
  });
  return best;
}

function playReelVideo(video) {
  if (!video) return;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  playReelMediaElement(video);
}

function playReelMediaElement(media) {
  if (!media) return;
  media.volume = reelsVolume;
  const wantSound = wantsReelAutoSound();

  const startMutedThenUnmute = () => {
    media.defaultMuted = true;
    media.muted = true;
    void media.play().then(() => {
      if (!wantSound || !wantsReelAutoSound()) return;
      media.muted = false;
      media.volume = reelsVolume;
    }).catch(() => {
      setReelSound(false);
      media.muted = true;
      void media.play().catch(() => {});
    });
  };

  // With autoplay + sound on, try unmuted first (works after a user gesture / scroll).
  if (wantSound && (reelsAudioUnlocked || document.hasFocus())) {
    media.defaultMuted = false;
    media.muted = false;
    void media.play().then(() => {
      applyReelVolume(media);
      reelsAudioUnlocked = true;
    }).catch(() => {
      startMutedThenUnmute();
    });
    return;
  }

  startMutedThenUnmute();
}

function stopReelSlideshow(card) {
  const reelId = card?.dataset?.reelId || '';
  if (!reelId || !reelSlideTimers.has(reelId)) return;
  window.clearInterval(reelSlideTimers.get(reelId));
  reelSlideTimers.delete(reelId);
}

function advanceReelSlideshow(card, { restart = true } = {}) {
  if (!card) return false;
  const root = card.querySelector('[data-reel-slideshow="1"]');
  if (!root) return false;
  const slides = [...root.querySelectorAll('img[data-slide-index]')];
  const dots = [...root.querySelectorAll('[data-reel-slide-dot]')];
  if (slides.length < 2) return false;
  let index = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  slides[index]?.classList.remove('is-active');
  dots[index]?.classList.remove('is-active');
  index = (index + 1) % slides.length;
  slides[index]?.classList.add('is-active');
  dots[index]?.classList.add('is-active');
  if (restart && isReelAutoplayEnabled()) startReelSlideshow(card);
  return true;
}

function startReelSlideshow(card) {
  if (!card) return;
  stopReelSlideshow(card);
  const root = card.querySelector('[data-reel-slideshow="1"]');
  if (!root) return;
  const slides = [...root.querySelectorAll('img[data-slide-index]')];
  if (slides.length < 2) return;
  const timer = window.setInterval(() => {
    advanceReelSlideshow(card, { restart: false });
  }, REEL_SLIDE_MS);
  if (card.dataset.reelId) reelSlideTimers.set(card.dataset.reelId, timer);
}

function syncActiveReelPlayback(viewport = document.querySelector('[data-reels-viewport]')) {
  if (!viewport || !isVisibleReelsTab()) return;
  if (isReelAutoplayEnabled() && reelsSoundOn) unlockReelAudio();
  const active = centeredReelCard(viewport);
  if (!active) return;
  const reelId = active.dataset.reelId || '';
  if (reelId && reelId !== activeReelId) renderReelPanel(reelId);

  viewport.querySelectorAll('.reel-card').forEach((card) => {
    const video = card.querySelector('video');
    const audio = card.querySelector('audio[data-reel-track]');
    if (card === active && isReelAutoplayEnabled()) {
      if (video) {
        stopReelSlideshow(card);
        if (video.paused) playReelVideo(video);
        else applyReelVolume(video);
        return;
      }
      startReelSlideshow(card);
      if (audio) {
        if (audio.paused) playReelMediaElement(audio);
        else applyReelVolume(audio);
      }
      return;
    }
    if (video) {
      if (!video.paused) video.pause();
      video.muted = true;
    }
    if (audio) {
      if (!audio.paused) audio.pause();
      audio.muted = true;
    }
    stopReelSlideshow(card);
  });
}

function scheduleActiveReelPlayback(viewport = document.querySelector('[data-reels-viewport]')) {
  if (reelScrollSyncTimer) cancelAnimationFrame(reelScrollSyncTimer);
  reelScrollSyncTimer = requestAnimationFrame(() => {
    reelScrollSyncTimer = 0;
    syncActiveReelPlayback(viewport);
  });
}

function bindReelAutoplay() {
  reelObserver?.disconnect();
  const viewport = document.querySelector('[data-reels-viewport]');
  if (!viewport) return;

  // When Reels autoplay is enabled, default to sound on so scroll-start includes audio.
  if (isReelAutoplayEnabled() && reelsSoundOn) unlockReelAudio();

  // Scroll is the source of truth: whichever reel is centered plays; others pause.
  reelObserver = new IntersectionObserver(() => {
    scheduleActiveReelPlayback(viewport);
  }, { root: viewport, threshold: [0, 0.25, 0.5, 0.75, 1] });
  viewport.querySelectorAll('.reel-card').forEach((card) => reelObserver.observe(card));

  if (viewport.dataset.reelScrollBound !== '1') {
    viewport.dataset.reelScrollBound = '1';
    const onScrollGesture = () => {
      unlockReelAudio();
      scheduleActiveReelPlayback(viewport);
    };
    viewport.addEventListener('scroll', onScrollGesture, { passive: true });
    viewport.addEventListener('scrollend', () => syncActiveReelPlayback(viewport), { passive: true });
    // iOS often finishes momentum scrolling without a reliable scrollend; touch end re-syncs play.
    viewport.addEventListener('touchend', onScrollGesture, { passive: true });
    viewport.addEventListener('pointerdown', () => unlockReelAudio(), { passive: true });
  }

  bindReelGestures(viewport);
  const firstCard = viewport.querySelector('.reel-card');
  const stillVisible = activeReelId
    && [...viewport.querySelectorAll('.reel-card')].some((card) => card.dataset.reelId === activeReelId);
  if (firstCard?.dataset.reelId && !stillVisible) renderReelPanel(firstCard.dataset.reelId);
  requestAnimationFrame(() => {
    syncReelCardHeights(viewport);
    syncActiveReelPlayback(viewport);
    // Second pass after mobile layout settles (address bar / dvh changes).
    window.setTimeout(() => {
      syncReelCardHeights(viewport);
      syncActiveReelPlayback(viewport);
    }, 120);
  });
}

function clearReelTap() {
  if (reelTapTimer) window.clearTimeout(reelTapTimer);
  reelTapTimer = 0;
  reelTapCard = null;
}

function flashReelGlyph(card, paused) {
  if (!card) return;
  card.querySelector('.reel-tap-glyph')?.remove();
  const glyph = document.createElement('div');
  glyph.className = 'reel-tap-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = paused
    ? '<svg viewBox="0 0 24 24"><path d="M9 5h2.6v14H9zm3.4 0H15v14h-2.6z" /></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 5.2v13.6L19 12z" /></svg>';
  card.append(glyph);
  glyph.addEventListener('animationend', () => glyph.remove(), { once: true });
  window.setTimeout(() => glyph.remove(), 1200);
}

function burstReelHeart(card) {
  if (!card) return;
  const burst = document.createElement('div');
  burst.className = 'reel-heart-burst';
  burst.setAttribute('aria-hidden', 'true');
  burst.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.8 1.8Z" /></svg>';
  card.append(burst);
  burst.addEventListener('animationend', () => burst.remove(), { once: true });
  window.setTimeout(() => burst.remove(), 1400);
}

function toggleReelPlayback(card) {
  if (!card) return;
  // Multi-photo slideshows: tap advances to the next image instead of pausing.
  if (card.querySelector('[data-reel-slideshow="1"]')) {
    unlockReelAudio();
    const audio = card.querySelector('audio[data-reel-track]');
    if (audio && audio.paused) {
      applyReelVolume(audio);
      void audio.play().then(() => applyReelVolume(audio)).catch(() => {
        setReelSound(false);
        void audio.play().catch(() => {});
      });
    }
    advanceReelSlideshow(card, { restart: isReelAutoplayEnabled() });
    return;
  }
  const video = card.querySelector('video');
  const audio = card.querySelector('audio[data-reel-track]');
  const media = video || audio;
  if (!media) return;
  unlockReelAudio();
  if (media.paused) {
    flashReelGlyph(card, false);
    applyReelVolume(media);
    void media.play().then(() => {
      applyReelVolume(media);
    }).catch(() => {
      setReelSound(false);
      void media.play().catch(() => {});
    });
    return;
  }
  media.pause();
  flashReelGlyph(card, true);
}

function likeReelFromTap(card) {
  const button = card?.querySelector('[data-reel-like]');
  if (!button) return;
  burstReelHeart(card);
  // Double tap only ever likes; unliking stays on the side rail button.
  if (button.classList.contains('liked')) return;
  void handlePostEngagement('like', button.dataset.reelLike, button);
}

function handleReelTap(card, x, y) {
  const now = Date.now();
  const nearby = Math.abs(x - reelTapX) < 56 && Math.abs(y - reelTapY) < 56;
  if (reelTapTimer && reelTapCard === card && now - reelTapAt < 320 && nearby) {
    clearReelTap();
    likeReelFromTap(card);
    return;
  }
  clearReelTap();
  reelTapCard = card;
  reelTapAt = now;
  reelTapX = x;
  reelTapY = y;
  reelTapTimer = window.setTimeout(() => {
    reelTapTimer = 0;
    reelTapCard = null;
    toggleReelPlayback(card);
  }, 260);
}

function bindReelGestures(viewport) {
  if (!viewport || viewport.dataset.reelGestures === 'on') return;
  viewport.dataset.reelGestures = 'on';
  viewport.addEventListener('pointerdown', (event) => {
    reelPointer = null;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const card = event.target.closest('.reel-card');
    if (!card || event.target.closest('button, a, input, textarea, label, summary, details, .reel-actions, .reel-audio, .reel-card-more, .reel-more')) return;
    reelPointer = { id: event.pointerId, card, x: event.clientX, y: event.clientY, at: Date.now() };
  });
  viewport.addEventListener('pointerup', (event) => {
    const start = reelPointer;
    reelPointer = null;
    if (!start || start.id !== event.pointerId) return;
    // Anything that drifted is a swipe between reels, not a tap.
    if (Math.abs(event.clientX - start.x) > 12 || Math.abs(event.clientY - start.y) > 12) return;
    if (Date.now() - start.at > 700) return;
    handleReelTap(start.card, event.clientX, event.clientY);
  });
  viewport.addEventListener('pointercancel', () => { reelPointer = null; });
  viewport.addEventListener('dblclick', (event) => {
    if (event.target.closest('.reel-card')) event.preventDefault();
  });
}

function updateReelStats(card, reel) {
  if (!card || !reel) return;
  const likes = Array.isArray(reel.likes) ? reel.likes : [];
  const liked = likes.includes(activeUserId());
  const comments = reelCommentsFor(reel.id).length;
  const likeButton = card.querySelector('[data-reel-like]');
  if (likeButton) {
    likeButton.classList.toggle('liked', liked);
    likeButton.innerHTML = `${postActionIcon('like', liked)}<span>${likes.length || ''}</span>`;
  }
  const commentCount = card.querySelector('[data-reel-comments] span');
  if (commentCount) commentCount.textContent = comments || '';
  if (activeReelId === reel.id) syncReelPanelStats(reel);
}

function contentKindLabel(post) {
  if (post?.parentId) return 'comment';
  if (post?.kind === 'reel') return 'reel';
  return 'post';
}

function uniquePostsById(posts) {
  const seen = new Set();
  return posts.filter((post) => {
    const id = String(post?.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function reelCommentsFor(reelId) {
  return uniquePostsById(allPosts.filter((item) => item.parentId === reelId))
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
}

function reelCommentMarkup(comment) {
  const author = internetUsers.get(comment.authorId) || {};
  const isCreator = activeReelId && (allPosts.find((post) => post.id === activeReelId)?.authorId === comment.authorId);
  const own = comment.authorId === activeUserId();
  const action = !currentUserId
    ? ''
    : own
      ? `<button type="button" class="reel-comment-action" data-delete-post="${escapeHtml(comment.id)}">Delete</button>`
      : `<button type="button" class="reel-comment-action" data-report-post="${escapeHtml(comment.id)}">Report</button>`;
  return `<article class="reel-comment" data-comment-id="${escapeHtml(comment.id)}">
    <img src="${escapeHtml(author.avatarUrl || comment.avatarUrl || 'assets/clearwater-logo.png')}" alt="" />
    <div>
      <header><b>@${escapeHtml(author.username || comment.username || 'member')}</b>${isCreator ? '<em>Creator</em>' : ''}<small>${timeAgo(comment.createdAt)}</small>${action}</header>
      <p>${escapeHtml(comment.content || '')}</p>
    </div>
  </article>`;
}

function syncReelPanelStats(reel) {
  if (!reel) return;
  const likes = Array.isArray(reel.likes) ? reel.likes : [];
  const liked = likes.includes(activeUserId());
  const comments = reelCommentsFor(reel.id).length;
  const likeButton = document.querySelector('[data-reel-panel-like]');
  const likeIcon = document.querySelector('[data-reel-panel-like-icon]');
  const likeCount = document.querySelector('[data-reel-panel-like-count]');
  const commentIcon = document.querySelector('[data-reel-panel-comment-icon]');
  const commentCount = document.querySelector('[data-reel-panel-comment-count]');
  const shareIcon = document.querySelector('[data-reel-panel-share-icon]');
  const tabCount = document.querySelector('[data-reel-panel-tab-count]');
  if (likeButton) {
    likeButton.classList.toggle('liked', liked);
    likeButton.dataset.reelLike = reel.id;
  }
  if (likeIcon) likeIcon.innerHTML = postActionIcon('like', liked);
  if (commentIcon) commentIcon.innerHTML = postActionIcon('reply');
  if (shareIcon) shareIcon.innerHTML = postActionIcon('share');
  if (likeCount) likeCount.textContent = String(likes.length);
  if (commentCount) commentCount.textContent = String(comments);
  if (tabCount) tabCount.textContent = String(comments);
}

function renderReelPanel(reelId, { focusInput = false } = {}) {
  const empty = document.querySelector('[data-reel-panel-empty]');
  const body = document.querySelector('[data-reel-panel-body]');
  const reel = allPosts.find((post) => post.id === reelId && post.kind === 'reel' && !post.parentId);
  if (!reel || !body) {
    if (empty) empty.hidden = false;
    if (body) body.hidden = true;
    return;
  }
  activeReelId = reelId;
  const author = internetUsers.get(reel.authorId) || {};
  const displayName = author.displayName || reel.displayName || reel.username || 'Member';
  const username = author.username || reel.username || 'member';
  const avatarUrl = author.avatarUrl || reel.avatarUrl || 'assets/clearwater-logo.png';
  const following = socialState.following.includes(reel.authorId);
  const isSelf = reel.authorId === activeUserId();
  if (empty) empty.hidden = true;
  body.hidden = false;
  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };
  const avatar = document.querySelector('[data-reel-panel-avatar]');
  if (avatar) avatar.src = avatarUrl;
  setText('[data-reel-panel-name]', displayName);
  setText('[data-reel-panel-handle]', `@${username}`);
  setText('[data-reel-panel-time]', timeAgo(reel.createdAt));
  setText('[data-reel-panel-caption]', reel.content || '');
  const caption = document.querySelector('[data-reel-panel-caption]');
  if (caption) caption.hidden = !reel.content;
  const authorButton = document.querySelector('[data-reel-panel-author]');
  if (authorButton) authorButton.dataset.openMember = reel.authorId;
  const follow = document.querySelector('[data-reel-panel-follow]');
  if (follow) {
    follow.hidden = isSelf || !currentUserId;
    follow.textContent = following ? 'Following' : 'Follow';
    follow.classList.toggle('following', following);
    follow.dataset.reelPanelFollow = reel.authorId;
  }
  const more = document.querySelector('[data-reel-panel-more]');
  const reportReel = document.querySelector('[data-reel-panel-report]');
  const deleteReel = document.querySelector('[data-reel-panel-delete]');
  if (more) {
    more.hidden = !currentUserId;
    more.open = false;
  }
  if (reportReel) {
    reportReel.hidden = isSelf;
    reportReel.dataset.reportPost = reel.id;
  }
  if (deleteReel) {
    deleteReel.hidden = !isSelf;
    deleteReel.dataset.deletePost = reel.id;
  }
  const share = document.querySelector('[data-reel-panel-share]');
  if (share) share.dataset.reelShare = reel.id;
  const selfAvatar = document.querySelector('[data-reel-panel-self-avatar]');
  if (selfAvatar) selfAvatar.src = document.querySelector('[data-avatar]')?.src || 'assets/clearwater-logo.png';
  syncReelPanelStats(reel);
  const comments = reelCommentsFor(reelId);
  const panelList = document.querySelector('[data-reel-panel-comments]');
  if (panelList) {
    panelList.innerHTML = comments.length
      ? comments.map((comment) => reelCommentMarkup(comment)).join('')
      : '<p class="reels-empty">No comments yet. Be the first.</p>';
  }
  if (focusInput) document.querySelector('[data-reel-panel-comment-input]')?.focus();
}

function setActiveReel(reelId, { openSheet = false, focusInput = false } = {}) {
  if (!reelId) return;
  renderReelPanel(reelId, { focusInput: focusInput && !openSheet });
  if (openSheet) openReelComments(reelId);
}

function reelMediaProxyUrl(reelId, kind = 'video', index = null) {
  const params = new URLSearchParams({
    reel: String(reelId || ''),
    kind: String(kind || 'video'),
  });
  if (index != null && index !== '') params.set('index', String(index));
  return `/api/media?${params.toString()}`;
}

function markReelMediaBroken(card, message) {
  if (!card || card.querySelector('.reel-missing')) return;
  card.querySelector('video, .reel-slideshow, img')?.remove();
  const note = document.createElement('p');
  note.className = 'reel-missing';
  note.textContent = message || 'This Reel could not be loaded.';
  card.prepend(note);
}

function markReelSlideBroken(image) {
  if (!image) return;
  const root = image.closest('.reel-slideshow');
  const card = image.closest('.reel-card');
  if (!root || !card) {
    markReelMediaBroken(card, 'This Reel photo could not be loaded.');
    return;
  }
  const slidesBefore = [...root.querySelectorAll('img[data-slide-index]')];
  const brokenIndex = slidesBefore.indexOf(image);
  const wasActive = image.classList.contains('is-active');
  const dotsBefore = [...root.querySelectorAll('[data-reel-slide-dot]')];
  image.remove();
  if (brokenIndex >= 0) dotsBefore[brokenIndex]?.remove();
  const slides = [...root.querySelectorAll('img[data-slide-index]')];
  if (!slides.length) {
    markReelMediaBroken(card, 'This Reel photo could not be loaded.');
    return;
  }
  slides.forEach((slide, slideIndex) => {
    slide.dataset.slideIndex = String(slideIndex);
  });
  const dots = [...root.querySelectorAll('[data-reel-slide-dot]')];
  if (wasActive || !root.querySelector('img.is-active')) {
    slides.forEach((slide) => slide.classList.remove('is-active'));
    slides[0].classList.add('is-active');
    dots.forEach((dot, dotIndex) => dot.classList.toggle('is-active', dotIndex === 0));
  }
  root.dataset.reelSlideshow = slides.length > 1 ? '1' : '0';
  if (slides.length > 1 && isReelAutoplayEnabled() && card === centeredReelCard()) {
    startReelSlideshow(card);
  } else {
    stopReelSlideshow(card);
  }
}

function syncReelCardHeights(viewport = document.querySelector('[data-reels-viewport]')) {
  if (!viewport) return;
  const height = Math.max(240, Math.round(viewport.clientHeight || 0));
  if (!height) return;
  viewport.querySelectorAll('.reel-card').forEach((card) => {
    card.style.height = `${height}px`;
    card.style.minHeight = `${height}px`;
  });
}

function bindReelMediaFallback(viewport) {
  viewport.querySelectorAll('.reel-card > video').forEach((video) => {
    if (video.dataset.fallbackBound === '1') return;
    video.dataset.fallbackBound = '1';
    video.addEventListener('error', () => {
      const card = video.closest('.reel-card');
      const reelId = card?.dataset.reelId;
      if (!reelId) return;
      const attempt = Number(video.dataset.fallbackTried || 0);
      if (attempt < 2) {
        video.dataset.fallbackTried = String(attempt + 1);
        video.src = `${reelMediaProxyUrl(reelId, 'video')}&retry=${attempt + 1}&t=${Date.now()}`;
        video.load();
        return;
      }
      const unsupported = video.error?.code === 4;
      markReelMediaBroken(
        card,
        unsupported
          ? 'This Reel video cannot play here. Re-upload as MP4 (H.264) or WebM.'
          : 'This Reel video could not be loaded. Refresh and try again.',
      );
    });
  });
  viewport.querySelectorAll('.reel-slideshow img').forEach((image) => {
    if (image.dataset.fallbackBound === '1') return;
    image.dataset.fallbackBound = '1';
    image.addEventListener('error', () => {
      const card = image.closest('.reel-card');
      const reelId = card?.dataset.reelId;
      if (!reelId) return;
      const slideIndex = image.dataset.slideIndex;
      const attempt = Number(image.dataset.fallbackTried || 0);
      if (attempt < 2) {
        image.dataset.fallbackTried = String(attempt + 1);
        image.src = `${reelMediaProxyUrl(reelId, 'image', slideIndex ?? 0)}&retry=${attempt + 1}&t=${Date.now()}`;
        return;
      }
      markReelSlideBroken(image);
    });
  });
  viewport.querySelectorAll('audio[data-reel-track]').forEach((audio) => {
    if (audio.dataset.fallbackBound === '1') return;
    audio.dataset.fallbackBound = '1';
    audio.addEventListener('error', () => {
      const card = audio.closest('.reel-card');
      const reelId = card?.dataset.reelId;
      if (!reelId) return;
      const attempt = Number(audio.dataset.fallbackTried || 0);
      if (attempt < 2) {
        audio.dataset.fallbackTried = String(attempt + 1);
        audio.src = `${reelMediaProxyUrl(reelId, 'audio')}&retry=${attempt + 1}&t=${Date.now()}`;
        audio.load();
      }
    });
  });
}

function renderReels() {
  const viewport = document.querySelector('[data-reels-viewport]');
  if (!viewport) return;
  const reels = allPosts.filter((post) => post.kind === 'reel' && !post.parentId && !socialState.muted.includes(post.authorId) && !socialState.blocked.includes(post.authorId));
  if (!reels.length) {
    viewport.dataset.reelSignature = '';
    viewport.innerHTML = '<div class="reels-empty"><p>No Reels yet.</p><p>Post a photo slideshow, clip, or short video to start the feed.</p></div>';
    activeReelId = null;
    renderReelPanel('');
    return;
  }
  const ads = Array.isArray(reelAds) ? reelAds.filter(Boolean) : [];
  const items = [];
  let adIndex = 0;
  reels.forEach((reel, index) => {
    items.push({ type: 'reel', reel });
    if (ads.length && (index + 1) % 4 === 0) {
      items.push({ type: 'ad', ad: ads[adIndex % ads.length] });
      adIndex += 1;
    }
  });
  // Patch counts in place when the line-up is unchanged so liking never restarts playback or loses scroll position.
  const signature = items.map((item) => (item.type === 'ad' ? `ad:${item.ad.id}` : item.reel.id)).join('|');
  const cards = viewport.querySelectorAll('.reel-card');
  if (viewport.dataset.reelSignature === signature && cards.length === items.length) {
    cards.forEach((card, index) => {
      const item = items[index];
      if (item?.type === 'reel') updateReelStats(card, item.reel);
    });
    syncReelCardHeights(viewport);
    if (activeReelId) {
      const active = reels.find((reel) => reel.id === activeReelId);
      if (active) {
        syncReelPanelStats(active);
        const panelList = document.querySelector('[data-reel-panel-comments]');
        const composing = document.querySelector('[data-reel-panel-comment-input]');
        if (panelList && document.activeElement !== composing) {
          const comments = reelCommentsFor(activeReelId);
          panelList.innerHTML = comments.length
            ? comments.map((comment) => reelCommentMarkup(comment)).join('')
            : '<p class="reels-empty">No comments yet. Be the first.</p>';
        }
      }
    }
    // Returning to Reels after another tab pauses videos; restart the centered one.
    bindReelAutoplay();
    return;
  }
  viewport.dataset.reelSignature = signature;
  clearReelTap();
  const anchorId = [...cards].find((card) => card.offsetTop + card.offsetHeight > viewport.scrollTop + 8)?.dataset.reelId
    || [...cards].find((card) => card.offsetTop + card.offsetHeight > viewport.scrollTop + 8)?.dataset.sponsoredReelId
    || activeReelId
    || '';
  viewport.innerHTML = items.map((item) => {
    if (item.type === 'ad') return sponsoredReelMarkup(item.ad);
    const reel = item.reel;
    const likes = Array.isArray(reel.likes) ? reel.likes : [];
    const liked = likes.includes(activeUserId());
    const comments = reelCommentsFor(reel.id).length;
    const author = internetUsers.get(reel.authorId) || {};
    const displayName = author.displayName || reel.displayName || reel.username || 'member';
    const username = author.username || reel.username || 'member';
    const avatarUrl = author.avatarUrl || reel.avatarUrl || 'assets/clearwater-logo.png';
    // Always load through /api/media so blob-hosted Reels stay same-origin and reliable.
    const videoSrc = reel.videoUrl ? reelMediaProxyUrl(reel.id, 'video') : '';
    const slides = !videoSrc && Array.isArray(reel.slideshowUrls) && reel.slideshowUrls.length
      ? reel.slideshowUrls.map((_, index) => reelMediaProxyUrl(reel.id, 'image', index))
      : (!videoSrc && reel.imageUrl ? [reelMediaProxyUrl(reel.id, 'image', 0)] : []);
    const audioSrc = !videoSrc && reel.audioUrl ? reelMediaProxyUrl(reel.id, 'audio') : '';
    let media = '<p class="reel-missing">This Reel could not be loaded.</p>';
    if (videoSrc) {
      media = `<video src="${escapeHtml(videoSrc)}" loop muted playsinline webkit-playsinline preload="auto" autoplay></video>`;
    } else if (slides.length) {
      const imgs = slides.map((src, index) => `<img src="${escapeHtml(src)}" alt="" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" data-slide-index="${index}" class="${index === 0 ? 'is-active' : ''}" />`).join('');
      const dots = slides.length > 1
        ? `<div class="reel-slide-dots" aria-hidden="true">${slides.map((_, index) => `<span data-reel-slide-dot class="${index === 0 ? 'is-active' : ''}"></span>`).join('')}</div>`
        : '';
      const track = audioSrc
        ? `<audio src="${escapeHtml(audioSrc)}" loop preload="auto" playsinline data-reel-track></audio>`
        : '';
      media = `<div class="reel-slideshow" data-reel-slideshow="${slides.length > 1 ? '1' : '0'}">${imgs}${track}${dots}</div>`;
    }
    const sound = (videoSrc || audioSrc) ? reelAudioControlsMarkup(reel.id) : '';
    const isSelf = reel.authorId === activeUserId();
    const following = socialState.following.includes(reel.authorId);
    const canFollow = Boolean(currentUserId) && !isSelf;
    const follow = canFollow
      ? `<button type="button" class="reel-follow${following ? ' following' : ''}" data-reel-follow="${escapeHtml(reel.authorId)}">${following ? 'Following' : 'Follow'}</button>`
      : '';
    const moreItem = !currentUserId
      ? ''
      : isSelf
        ? `<button type="button" data-delete-post="${escapeHtml(reel.id)}">Delete Reel</button>`
        : `<button type="button" data-report-post="${escapeHtml(reel.id)}">Report Reel</button>`;
    const more = moreItem
      ? `<details class="reel-more reel-actions-more"><summary aria-label="More reel actions"><span aria-hidden="true">⋯</span><span>More</span></summary><div class="reel-more-menu">${moreItem}</div></details>`
      : '';
    return `<article class="reel-card" data-reel-id="${escapeHtml(reel.id)}">${media}<div class="reel-gradient" aria-hidden="true"></div>${sound}<div class="reel-meta"><div class="reel-meta-user"><button type="button" data-open-member="${escapeHtml(reel.authorId)}"><img src="${escapeHtml(avatarUrl)}" alt="" /><span class="reel-author"><b>${escapeHtml(displayName)}</b><small>@${escapeHtml(username)}</small></span></button>${follow}</div>${reel.content ? `<p>${formatPostBody(reel)}</p>` : ''}</div><div class="reel-actions"><button type="button" data-reel-like="${escapeHtml(reel.id)}" class="${liked ? 'liked' : ''}" aria-label="Like">${postActionIcon('like', liked)}<span>${likes.length || ''}</span></button><button type="button" data-reel-comments="${escapeHtml(reel.id)}" aria-label="Comments">${postActionIcon('reply')}<span>${comments || ''}</span></button><button type="button" data-reel-share="${escapeHtml(reel.id)}" aria-label="Share">${postActionIcon('share')}</button>${more}</div></article>`;
  }).join('');
  syncReelCardHeights(viewport);
  if (anchorId) {
    const stayOn = [...viewport.querySelectorAll('.reel-card')].find((card) => (
      card.dataset.reelId === anchorId || card.dataset.sponsoredReelId === anchorId
    ));
    if (stayOn) viewport.scrollTo({ top: stayOn.offsetTop, behavior: 'instant' });
  }
  bindReelMediaFallback(viewport);
  bindReelAutoplay();
  renderSideSuggestions();
}

function canShowComposer() {
  return Boolean(currentUserId) && !isSearchingFeed() && (feedTab === 'foryou' || feedTab === 'recent');
}

function syncHomeSurfaces() {
  // Reels must only control layout while Home is actually visible. Otherwise a
  // previously opened Reel can lock Settings, Profile, or other pages to the
  // fixed full-screen Reel height.
  const reelsOn = isVisibleReelsTab();
  document.body.classList.toggle('reels-watching', reelsOn);
  document.querySelector('[data-reels-stage]')?.toggleAttribute('hidden', !reelsOn);
  document.querySelector('.posts')?.toggleAttribute('hidden', reelsOn);
  document.querySelector('[data-feed-tabs]')?.classList.toggle('reels-tabs', reelsOn);
  if (composer) composer.hidden = !canShowComposer();
  if (!reelsOn) {
    pauseReelVideos();
    document.querySelector('[data-reel-comments]')?.setAttribute('hidden', '');
  }
  renderSideSuggestions();
}

function openReelComments(reelId) {
  const sheet = document.querySelector('[data-reel-comments]');
  const list = document.querySelector('[data-reel-comment-list]');
  if (!sheet || !list) return;
  renderReelPanel(reelId);
  const comments = reelCommentsFor(reelId);
  list.innerHTML = comments.length
    ? comments.map((comment) => reelCommentMarkup(comment)).join('')
    : '<p class="reels-empty">No comments yet. Be the first.</p>';
  sheet.hidden = false;
  document.querySelector('[data-reel-comment-input]')?.focus();
}

let reelCommentBusy = false;

async function submitReelComment(input) {
  if (reelCommentBusy) return;
  const text = String(input?.value || '').trim();
  if (!activeReelId || !text) return;
  if (!currentUserId) {
    window.location.href = signInUrl();
    return;
  }
  reelCommentBusy = true;
  const forms = [
    document.querySelector('[data-reel-panel-comment-form]'),
    document.querySelector('[data-reel-comment-form]'),
  ].filter(Boolean);
  const inputs = document.querySelectorAll('[data-reel-panel-comment-input], [data-reel-comment-input]');
  forms.forEach((form) => {
    form.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
  });
  // Clear immediately so a second Enter/click cannot resubmit the same text.
  inputs.forEach((el) => { el.value = ''; });
  try {
    await postInteraction({ postId: activeReelId, type: 'reply', content: text });
    renderReelPanel(activeReelId);
    const sheet = document.querySelector('[data-reel-comments]');
    if (sheet && !sheet.hidden) openReelComments(activeReelId);
  } finally {
    reelCommentBusy = false;
    forms.forEach((form) => {
      form.querySelectorAll('button, input').forEach((el) => { el.disabled = false; });
    });
  }
}

function renderTrending() {
  if (!trendingList) return;
  const counts = new Map();
  allPosts.forEach((post) => String(post.content || '').match(/#[a-z0-9_]{1,60}/gi)?.forEach((tag) => {
    const key = tag.toLowerCase(); counts.set(key, (counts.get(key) || 0) + 1);
  }));
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!tags.length) return;
  trendingList.innerHTML = tags.map(([tag, amount]) => `<a href="/internet" data-topic="${escapeHtml(tag)}">${escapeHtml(tag)} <span>${amount} post${amount === 1 ? '' : 's'}</span></a>`).join('');
}

function collapseReposts(posts) {
  const ids = new Set(posts.map((post) => post.id));
  return posts.filter((post) => !isNativeRepost(post) || !ids.has(post.repostOf));
}

function showPosts(posts, emptyMessage) {
  const visible = collapseReposts(posts);
  note.hidden = Boolean(visible.length);
  note.textContent = visible.length ? '' : (emptyMessage || 'No posts yet. Be the first to share an update.');
  const heading = isSearchingFeed() && visible.length ? '<h2 class="search-posts-heading">Posts</h2>' : '';
  const injectAds = !isSearchingFeed() && Array.isArray(feedAds) && feedAds.length > 0;
  let markup = '';
  if (!injectAds) {
    markup = visible.map((post) => postMarkup(post)).join('');
  } else {
    let adIndex = 0;
    visible.forEach((post, index) => {
      markup += postMarkup(post);
      if ((index + 1) % 5 === 0) {
        markup += sponsoredFeedMarkup(feedAds[adIndex % feedAds.length]);
        adIndex += 1;
      }
    });
  }
  list.innerHTML = `${heading}${markup}`;
  syncAllReelOpenChips(list);
}

function trendingTagKeys() {
  const counts = new Map();
  allPosts.forEach((post) => String(post.content || '').match(/#[a-z0-9_]{1,60}/gi)?.forEach((tag) => {
    const key = tag.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }));
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8).map(([tag]) => tag);
}

function isLowEffortPost(post) {
  if (post.gifUrl || post.imageUrl || post.poll || post.location) return false;
  const text = String(post.content || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 2 || text.length <= 8;
}

function stableJitter(id) {
  let hash = 0;
  for (const char of String(id || '')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return ((hash >>> 0) % 1000) / 1000;
}

function scoreForYouPost(post, trending) {
  const likes = Array.isArray(post.likes) ? post.likes.length : 0;
  const replies = allPosts.filter((item) => item.parentId === post.id).length;
  const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000);
  const recency = Math.exp(-ageHours / 20);
  const text = String(post.content || '').toLowerCase();
  const hasMedia = Boolean(post.gifUrl || post.imageUrl || post.poll || post.location);
  const official = post.authorId === officialAccountId || post.verified === true;
  const trendingHit = trending.some((tag) => text.includes(tag));
  let score = Math.log2(likes + 1) * 3.2 + Math.log2(replies + 1) * 4.4 + recency * 24;
  if (hasMedia) score += 7;
  if (official) score += 8;
  if (trendingHit) score += 6;
  if (isLowEffortPost(post)) score -= 26;
  if (text.length > 80) score += 3;
  if (likes <= 2 && recency > 0.35) score += 8;
  // Paid tips are injected separately (one at a time) — do not score-boost them here.
  score += (stableJitter(post.id) - 0.5) * 5;
  return score;
}

/** Rotate which tipped post wins exposure, and whether it sits 1st or 2nd. */
function tipRotationBucket() {
  return Math.floor(Date.now() / (5 * 60_000));
}

function pickTippedPost(boosted) {
  if (!boosted.length) return null;
  const ids = boosted.map((post) => String(post.id)).sort();
  const seed = `${tipRotationBucket()}:${ids.join('|')}`;
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return boosted[Math.abs(hash) % boosted.length];
}

function tippedPostSlot(boostedCount) {
  if (boostedCount <= 0) return 0;
  // Alternate 1st / 2nd every rotation window so tips are not always #1.
  return tipRotationBucket() % 2;
}

function rankedForYouPosts(posts) {
  const trending = trendingTagKeys();
  const boosted = posts.filter((post) => post.boostActive);
  const organic = posts.filter((post) => !post.boostActive);
  const scored = [...organic].map((post) => ({
    post,
    score: scoreForYouPost(post, trending),
    likes: Array.isArray(post.likes) ? post.likes.length : 0,
  }));
  scored.sort((left, right) => right.score - left.score || new Date(right.post.createdAt) - new Date(left.post.createdAt));
  const quieter = scored.filter((item) => item.likes <= 2);
  const result = [];
  const used = new Set();
  let quietPtr = 0;
  scored.forEach((item, index) => {
    if (used.has(item.post.id)) return;
    result.push(item.post);
    used.add(item.post.id);
    if ((index + 1) % 3 !== 0) return;
    while (quietPtr < quieter.length && used.has(quieter[quietPtr].post.id)) quietPtr += 1;
    if (quietPtr < quieter.length) {
      result.push(quieter[quietPtr].post);
      used.add(quieter[quietPtr].post.id);
      quietPtr += 1;
    }
  });

  const tip = pickTippedPost(boosted);
  if (tip) {
    const withoutTip = result.filter((post) => post.id !== tip.id);
    const slot = Math.min(tippedPostSlot(boosted.length), withoutTip.length);
    withoutTip.splice(slot, 0, tip);
    return withoutTip;
  }
  return result;
}

function matchingSearchUsers(query) {
  const needle = String(query || '').trim().toLowerCase().replace(/^@+/, '');
  if (!needle) return [];
  return [...internetUsers.values()]
    .filter((user) => user && !user.deactivated && !user.bank && !socialState.blocked.includes(user.id))
    .filter((user) => `${user.displayName || ''} ${user.username || ''} ${user.staffRank || ''}`.toLowerCase().includes(needle))
    .sort((left, right) => {
      const leftUser = String(left.username || '').toLowerCase();
      const rightUser = String(right.username || '').toLowerCase();
      const leftName = String(left.displayName || '').toLowerCase();
      const rightName = String(right.displayName || '').toLowerCase();
      const rank = (username, name) => {
        if (username === needle) return 0;
        if (name === needle) return 1;
        if (username.startsWith(needle)) return 2;
        if (name.startsWith(needle)) return 3;
        return 4;
      };
      return rank(leftUser, leftName) - rank(rightUser, rightName) || leftName.localeCompare(rightName);
    })
    .slice(0, 12);
}

function postSearchText(post) {
  const author = internetUsers.get(post.authorId) || {};
  return [
    author.displayName,
    author.username,
    author.staffRank,
    post.displayName,
    post.username,
    post.content,
    post.gifTitle,
    post.location?.name,
    post.kind === 'reel' ? 'reel' : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

function matchingSearchPosts(query) {
  const needle = String(query || '').trim().toLowerCase().replace(/^@+/, '');
  if (!needle) return [];
  return allPosts.filter((post) => (
    !post.parentId
    && !socialState.muted.includes(post.authorId)
    && !socialState.blocked.includes(post.authorId)
    && postSearchText(post).includes(needle)
  ));
}

function searchPersonButton(user) {
  return `<button type="button" class="search-person" data-open-member="${escapeHtml(user.id)}"><img class="search-person-avatar" src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span class="search-person-copy"><span class="search-person-name"><b>${escapeHtml(user.displayName || 'Clearwater member')}</b>${identityBadges(user)}</span><small>@${escapeHtml(user.username || 'member')}${user.staffRank ? ` · ${escapeHtml(user.staffRank)}` : ''}</small></span></button>`;
}

function renderSearchResults(query, postCount) {
  const people = matchingSearchUsers(query);
  const searching = Boolean(query);
  const feedPeople = document.querySelector('[data-search-people]');
  const sideResults = document.querySelector('[data-search-results]');
  const searchHeader = document.querySelector('[data-search-header]');
  const searchSummary = document.querySelector('[data-search-summary]');
  const trendingPanel = document.querySelector('[data-trending-panel]');
  const feedTabs = document.querySelector('[data-feed-tabs]');

  if (feedTabs) feedTabs.hidden = searching;
  if (searchHeader) searchHeader.hidden = !searching;
  if (searchSummary) {
    searchSummary.textContent = searching
      ? `${people.length} ${people.length === 1 ? 'person' : 'people'} · ${postCount} ${postCount === 1 ? 'post' : 'posts'}`
      : 'People and posts';
  }
  if (trendingPanel) trendingPanel.hidden = searching;

  if (!searching) {
    if (feedPeople) { feedPeople.hidden = true; feedPeople.innerHTML = ''; }
    if (sideResults) { sideResults.hidden = true; sideResults.innerHTML = ''; }
    return;
  }

  // People stay in the main search column only — never duplicate them in the sidebar.
  if (sideResults) { sideResults.hidden = true; sideResults.innerHTML = ''; }

  const peopleMarkup = people.length
    ? `<h2>People</h2><div class="search-people-list">${people.map(searchPersonButton).join('')}</div>`
    : '<h2>People</h2><p class="search-empty">No people match that search.</p>';
  if (feedPeople) {
    feedPeople.hidden = false;
    feedPeople.innerHTML = peopleMarkup;
  }
}

function renderPosts() {
  const query = String(search?.value || '').trim();
  const visible = allPosts.filter((post) => post.kind !== 'reel' && !post.parentId && !socialState.muted.includes(post.authorId) && !socialState.blocked.includes(post.authorId));
  let posts = visible;
  let empty = 'No posts yet. Be the first to share an update.';
  if (query) {
    // Search ignores the active feed tab so people/posts/reels all stay findable.
    posts = matchingSearchPosts(query)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    empty = matchingSearchUsers(query).length
      ? 'No posts match that search.'
      : 'No people or posts match that search.';
  } else if (feedTab === 'following') {
    posts = visible.filter((post) => post.authorId === activeUserId() || socialState.following.includes(post.authorId));
    empty = 'Posts from people you follow will show up here.';
  } else if (feedTab === 'official') {
    posts = visible.filter((post) => post.authorId === officialAccountId);
    empty = 'Official Clearwater Roleplay posts will appear here.';
  } else if (feedTab === 'recent') {
    posts = visible.filter((post) => !isNativeRepost(post))
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    empty = 'No posts yet. Be the first to share an update.';
  } else if (feedTab === 'reels') {
    posts = [];
  } else {
    posts = rankedForYouPosts(visible.filter((post) => !isNativeRepost(post)));
    empty = 'Nothing trending yet. Post something with more than a hello.';
  }
  syncHomeSurfaces();
  renderSearchResults(query, posts.length);
  if (isVisibleReelsTab()) renderReels();
  else showPosts(posts, empty);
  document.querySelectorAll('[data-feed-tab]').forEach((button) => button.classList.toggle('selected', button.dataset.feedTab === feedTab));
  document.querySelectorAll('[data-reels-link]').forEach((link) => link.classList.toggle('selected', isVisibleReelsTab()));
  renderProfilePosts();
  renderTrending();
  renderBookmarks();
}

function profileTabPosts(userId, tab) {
  const authored = allPosts.filter((post) => post.authorId === userId);
  if (tab === 'replies') return authored.filter((post) => post.parentId);
  if (tab === 'mentions') {
    const handle = String(internetUsers.get(userId)?.username || '').toLowerCase();
    if (!handle) return [];
    const mention = new RegExp(`(?:^|[^\\w])@${handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\w])`, 'i');
    return allPosts.filter((post) => post.authorId !== userId && post.kind !== 'reel' && mention.test(String(post.content || '')));
  }
  if (tab === 'media') return authored.filter((post) => !post.parentId && (post.imageUrl || post.videoUrl || post.gifUrl));
  if (tab === 'likes') return allPosts.filter((post) => !post.parentId && Array.isArray(post.likes) && post.likes.includes(userId));
  return authored.filter((post) => post.kind !== 'reel' && !post.parentId);
}

// Profile post lists stay reverse-chronological; there is no pin control anymore.
function profileListMarkup(posts, _tab, _pinnedPostId, emptyMessage) {
  if (!posts.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  return posts.map((post) => postMarkup(post, true)).join('');
}

function renderProfilePosts() {
  if (!profileList) return;
  if (!currentUserId) {
    profileList.innerHTML = '<p>Sign in to see your posts.</p>';
    return;
  }

  const me = internetUsers.get(currentUserId);
  const posts = profileTabPosts(currentUserId, profileTab);
  if (profilePostCount) profilePostCount.textContent = profileTabPosts(currentUserId, 'posts').length.toLocaleString();
  const empty = {
    posts: 'You have not posted yet.',
    replies: 'Your replies will appear here.',
    mentions: 'Posts that mention you will appear here.',
    media: 'Photos, GIFs, and Reels you post will appear here.',
    likes: 'Posts you like will appear here.',
  }[profileTab] || 'Nothing here yet.';
  profileList.innerHTML = profileListMarkup(posts, profileTab, me?.pinnedPostId, empty);
  syncAllReelOpenChips(profileList);
}

function profileBannerFor(user, fallbackSession = null) {
  // Empty string means the member cleared their custom banner. Missing/null
  // still allows the Discord session banner as a fallback.
  if (typeof user?.bannerUrl === 'string') return user.bannerUrl;
  return fallbackSession?.bannerUrl || '';
}

function mutualFriendIds(member) {
  const memberFollowerIds = Array.isArray(member?.followers) ? member.followers : [];
  // Mutuals = people you follow who also follow this profile (Twitter-style),
  // not only two-way friendships between both of you.
  return socialState.following.filter((id) => id !== activeUserId() && memberFollowerIds.includes(id) && internetUsers.has(id));
}

function mutualFriendsMarkup(mutualIds) {
  if (!mutualIds.length) return '';
  const faces = mutualIds.slice(0, 3).map((id) => `<img src="${escapeHtml(internetUsers.get(id).avatarUrl || 'assets/clearwater-logo.png')}" alt="" />`).join('');
  const label = mutualIds.length === 1
    ? `${escapeHtml(internetUsers.get(mutualIds[0]).displayName || 'One member')} is a mutual`
    : `${mutualIds.length} mutuals`;
  return `<span class="mutual-faces">${faces}</span><button type="button" data-open-member="${escapeHtml(mutualIds[0])}">${label}</button>`;
}

function connectionListMarkup(ids, labelFor, emptyCopy) {
  const known = ids.filter((id) => internetUsers.has(id));
  if (!known.length) return `<p class="connections-modal-empty">${escapeHtml(emptyCopy)}</p>`;
  return known.slice(0, 48).map((id) => {
    const member = internetUsers.get(id);
    return `<button type="button" data-open-member="${escapeHtml(id)}"><img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(member.displayName || 'Clearwater member')}</b><small>@${escapeHtml(member.username || 'member')} · ${escapeHtml(labelFor(id, member))}</small></span></button>`;
  }).join('');
}

function setConnectionButtonsState(scope, kind) {
  const followingButton = document.querySelector(scope === 'member' ? '[data-member-page-following]' : '[data-profile-following]');
  const followersButton = document.querySelector(scope === 'member' ? '[data-member-page-followers]' : '[data-profile-followers]');
  const otherScope = scope === 'member' ? 'profile' : 'member';
  const otherFollowing = document.querySelector(otherScope === 'member' ? '[data-member-page-following]' : '[data-profile-following]');
  const otherFollowers = document.querySelector(otherScope === 'member' ? '[data-member-page-followers]' : '[data-profile-followers]');
  followingButton?.setAttribute('aria-expanded', kind === 'following' ? 'true' : 'false');
  followersButton?.setAttribute('aria-expanded', kind === 'followers' ? 'true' : 'false');
  followingButton?.classList.toggle('active', kind === 'following');
  followersButton?.classList.toggle('active', kind === 'followers');
  otherFollowing?.setAttribute('aria-expanded', 'false');
  otherFollowers?.setAttribute('aria-expanded', 'false');
  otherFollowing?.classList.remove('active');
  otherFollowers?.classList.remove('active');
}

function closeConnectionsModal() {
  connectionModalScope = null;
  connectionModalKind = null;
  if (connectionsModal) connectionsModal.hidden = true;
  if (connectionsList) connectionsList.innerHTML = '';
  setConnectionButtonsState('profile', null);
  setConnectionButtonsState('member', null);
}

function openConnectionsModal(scope, kind) {
  if (!connectionsModal || !connectionsList || !kind) {
    closeConnectionsModal();
    return;
  }

  let title = kind === 'followers' ? 'Followers' : 'Following';
  let ids = [];
  let emptyCopy = kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.';
  let labelFor = () => (kind === 'followers' ? 'Follower' : 'Following');

  if (scope === 'profile') {
    const me = internetUsers.get(activeUserId()) || {};
    if (preferenceState.hideStats === true || me.hideStats === true) {
      closeConnectionsModal();
      return;
    }
    ids = kind === 'followers'
      ? (Array.isArray(me.followers) ? me.followers : [])
      : (Array.isArray(me.following) ? me.following : []);
    labelFor = () => (kind === 'followers' ? 'Follows you' : 'Following');
  } else {
    const user = viewedMember || {};
    if (user.hideStats === true) {
      closeConnectionsModal();
      return;
    }
    const hiddenFollowing = kind === 'following' && user.hideFollowing === true && user.id !== activeUserId();
    ids = hiddenFollowing
      ? []
      : (kind === 'followers'
        ? (Array.isArray(user.followers) ? user.followers : [])
        : (Array.isArray(user.following) ? user.following : []));
    emptyCopy = hiddenFollowing
      ? 'This member hides who they follow.'
      : emptyCopy;
    labelFor = () => (kind === 'followers' ? 'Follows them' : 'They follow');
  }

  connectionModalScope = scope;
  connectionModalKind = kind;
  if (connectionsTitle) connectionsTitle.textContent = title;
  connectionsList.innerHTML = connectionListMarkup(ids, labelFor, emptyCopy);
  connectionsModal.hidden = false;
  setConnectionButtonsState(scope, kind);
}

function toggleProfileConnections(kind) {
  if (connectionModalScope === 'profile' && connectionModalKind === kind && connectionsModal && !connectionsModal.hidden) {
    closeConnectionsModal();
    return;
  }
  openConnectionsModal('profile', kind);
}

function toggleMemberConnections(kind) {
  if (connectionModalScope === 'member' && connectionModalKind === kind && connectionsModal && !connectionsModal.hidden) {
    closeConnectionsModal();
    return;
  }
  openConnectionsModal('member', kind);
}

function renderOwnProfileDetails() {
  if (!currentUserId) return;
  const me = internetUsers.get(currentUserId);
  if (!me) return;
  const root = document.querySelector('[data-profile-root]');
  setProfileAccent(root, me.accentColor);
  setBannerImage(profileBanner, profileBannerFor(me, sessionUser), sessionUser?.bannerColor, me.accentColor);
  if (profileCopy) {
    profileCopy.textContent = me.bio
      || sessionUser?.bio
      || (sessionUser?.staffRank ? `${sessionUser.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.');
  }
  renderProfileMeta(document.querySelector('[data-profile-meta]'), { ...me, createdAt: me.createdAt });
  refreshProfileVerified();
  const following = Array.isArray(me.following) ? me.following : [];
  const followers = Array.isArray(me.followers) ? me.followers : [];
  const followingButton = document.querySelector('[data-profile-following]');
  const followersButton = document.querySelector('[data-profile-followers]');
  const hideStats = preferenceState.hideStats === true || me.hideStats === true;
  if (followingButton) {
    followingButton.hidden = hideStats;
    followingButton.innerHTML = `<b>${Number(me.followingCount ?? following.length).toLocaleString()}</b> Following`;
  }
  if (followersButton) {
    followersButton.hidden = hideStats;
    followersButton.innerHTML = `<b>${Number(me.followerCount ?? followers.length).toLocaleString()}</b> Followers`;
  }
  if (hideStats && connectionModalScope === 'profile') closeConnectionsModal();
  else if (connectionModalScope === 'profile' && connectionModalKind) openConnectionsModal('profile', connectionModalKind);
  else setConnectionButtonsState('profile', connectionModalScope === 'profile' ? connectionModalKind : null);
  const mutuals = document.querySelector('[data-profile-mutuals]');
  if (mutuals) {
    mutuals.hidden = true;
    mutuals.innerHTML = '';
  }
}

function renderBookmarks() {
  if (!bookmarkList) return;
  const collections = Array.isArray(socialState.bookmarkCollections) ? socialState.bookmarkCollections : [];
  const collectionHost = document.querySelector('[data-bookmark-collections]');
  if (collectionHost) {
    const allSelected = !activeBookmarkCollectionId;
    collectionHost.innerHTML = [
      `<button type="button" class="${allSelected ? 'selected' : ''}" data-bookmark-collection="">All saved</button>`,
      ...collections.map((item) => `<button type="button" class="${activeBookmarkCollectionId === item.id ? 'selected' : ''}" data-bookmark-collection="${escapeHtml(item.id)}">${escapeHtml(item.name)} <small>${item.postIds.length}</small></button>`),
    ].join('');
  }
  let ids = Array.isArray(socialState.bookmarks) ? socialState.bookmarks : [];
  if (activeBookmarkCollectionId) {
    const collection = collections.find((item) => item.id === activeBookmarkCollectionId);
    ids = collection?.postIds || [];
  }
  const posts = allPosts.filter((post) => ids.includes(post.id));
  bookmarkList.innerHTML = posts.length ? posts.map((post) => postMarkup(post)).join('') : '<p class="feed-note">Your saved posts will appear here.</p>';
  syncAllReelOpenChips(bookmarkList);
}

function showView(view) {
  const availableViews = new Set(['home', 'notifications', 'messages', 'profile', 'member', 'conversation', 'settings', 'staff', 'government', 'wallet', 'post', 'sponsored', 'bookmarks']);
  let activeView = availableViews.has(view) ? view : 'home';
  if (activeView === 'staff' && !sessionCanStaff) activeView = 'home';
  if (activeView === 'government' && !sessionCanGovernment) activeView = 'home';
  const shell = document.querySelector('.internet-shell');
  const feed = document.querySelector('.internet-feed');
  shell?.classList.toggle('staff-mode', activeView === 'staff');
  document.body.classList.toggle('conversation-open', activeView === 'conversation');
  document.body.classList.toggle('messages-open', activeView === 'messages' || activeView === 'conversation');
  if (feed) feed.dataset.activeView = activeView;
  document.querySelectorAll('[data-view]').forEach((section) => {
    const on = section.dataset.view === activeView;
    section.hidden = !on;
    section.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
  const navView = activeView === 'conversation' ? 'messages' : activeView;
  const reelsActive = activeView === 'home' && feedTab === 'reels';
  document.querySelectorAll('[data-view-link]').forEach((link) => {
    const selected = link.dataset.viewLink === navView && !(reelsActive && link.dataset.viewLink === 'home');
    link.classList.toggle('selected', selected);
    link.toggleAttribute('aria-current', selected);
  });
  document.querySelectorAll('[data-reels-link]').forEach((link) => {
    link.classList.toggle('selected', reelsActive);
    link.toggleAttribute('aria-current', reelsActive);
  });
  if (activeView !== 'home') {
    // Clear the full-screen Reel surface immediately. Waiting for a later
    // refresh leaves non-Home pages stuck in the Reel layout with scrolling
    // disabled.
    document.querySelector('[data-reels-stage]')?.setAttribute('hidden', '');
    pauseReelVideos();
  }
  renderSideSuggestions();
  if (activeView === 'home') {
    renderPosts();
    maybeShowNewsletterPromo();
  }
  if (activeView === 'bookmarks') renderBookmarks();
  if (activeView === 'messages') void loadMessages();
  if (activeView === 'notifications') void loadNotifications();
  if (activeView === 'staff') void loadModeration();
  if (activeView === 'government') void loadGovernment();
  if (activeView === 'wallet') {
    onboardingWalletVisited = true;
    if (currentUserId) localStorage.setItem(`clearwater-onboarding-wallet-${currentUserId}`, '1');
    renderWalletStore();
    maybeStartRobloxClaim();
    maybeOpenWalletHubs();
    void loadWallet();
    void loadAds();
    renderOnboardingChecklist();
  } else {
    setWalletTab('home');
  }
  if (activeView === 'sponsored') fillSponsoredReportForm();
  if (activeView === 'profile') renderOwnProfileDetails();
  if (activeView === 'settings' && currentUserId) void loadProfileEditor();
  if (currentUserId) void pulsePresence(activeView);
}

function showViewFromAddress() {
  const route = readInternetRoute();
  setInternetRoute(route.view, route.id, true);
  if (route.view === 'post' && route.id) {
    showPostDetail(route.id, false);
    return;
  }
  if (route.view === 'member' && route.id) {
    openMemberProfile(route.id, false);
    return;
  }
  if (route.view === 'sponsored') {
    showSponsoredPage(route.id || '', false);
    return;
  }
  showView(route.view || 'home');
}

function detailReplyComposerMarkup(postId) {
  if (!currentUserId) {
    return `<section class="detail-reply-composer signed-out"><p>Sign in to reply.</p><a href="${signInUrl()}">Continue with Discord</a></section>`;
  }
  const me = activeAuthor() || internetUsers.get(currentUserId) || sessionUser || {};
  const avatar = me.avatarUrl || sessionUser?.avatarUrl || 'assets/clearwater-logo.png';
  return `<section class="detail-reply-composer" data-detail-reply>
    <img src="${escapeHtml(avatar)}" alt="" draggable="false" />
    <form data-detail-reply-form data-post-id="${escapeHtml(postId)}">
      <textarea data-detail-reply-content maxlength="500" placeholder="Post your reply" rows="2"></textarea>
      <div class="detail-reply-actions">
        <button type="submit" data-detail-reply-submit disabled>Post</button>
      </div>
      <p class="detail-reply-error" data-detail-reply-error role="status"></p>
    </form>
  </section>`;
}

function focusDetailReplyComposer() {
  const input = document.querySelector('[data-detail-reply-content]');
  if (!input) return;
  input.focus({ preventScroll: true });
  input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openReelFromDeepLink() {
  showView('home');
}

function showPostDetail(postId, updateHash = true, { focusReply = false, highlightReplyId = null } = {}) {
  let id = String(postId || '');
  if (!id) return showView('home');
  openPostId = id;
  if (updateHash) setInternetRoute('post', id);

  // Posts may not be loaded yet (Discord "View post" deep link). Keep the URL
  // and wait for loadPosts() instead of bouncing to the home feed.
  if (!allPosts.length) {
    showView('post');
    if (postDetail) postDetail.innerHTML = '<p class="feed-note">Loading post…</p>';
    return;
  }

  let post = allPosts.find((item) => item.id === id);
  let focusCommentId = highlightReplyId ? String(highlightReplyId) : '';

  // Reply notification / deep links may still point at a comment. Open the
  // parent thread instead of treating the comment as a root post.
  if (post?.parentId) {
    focusCommentId = focusCommentId || post.id;
    const parent = allPosts.find((item) => item.id === post.parentId);
    if (parent) {
      post = parent;
      id = parent.id;
      openPostId = id;
      if (updateHash) setInternetRoute('post', id);
    }
  }

  if (!post) {
    showView('post');
    if (postDetail) postDetail.innerHTML = '<p class="feed-note">This post is unavailable or was removed.</p>';
    return;
  }

  if (post.kind === 'reel' && !post.parentId) {
    showView('post');
    if (postDetail) postDetail.innerHTML = '<p class="feed-note">This post is unavailable or was removed.</p>';
    return;
  }

  if (!postDetail) return showView('home');
  showView('post');
  const replies = allPosts.filter((item) => item.parentId === id);
  postDetail.innerHTML = `${postMarkup(post)}${detailReplyComposerMarkup(post.id)}<section class="detail-replies">${replies.length ? replies.map((reply) => {
    const active = focusCommentId && reply.id === focusCommentId;
    return active ? postMarkup(reply).replace('class="post"', 'class="post post-reply-target"') : postMarkup(reply);
  }).join('') : '<p>There are no replies yet.</p>'}</section>`;
  syncAllReelOpenChips(postDetail);
  if (focusReply) queueMicrotask(focusDetailReplyComposer);
  else if (focusCommentId) {
    queueMicrotask(() => {
      postDetail.querySelector('.post-reply-target')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
}

function showBan(ban) {
  activeBan = ban || null;
  accountBanned = Boolean(ban);
  document.body.classList.toggle('account-banned', accountBanned);
  document.body.classList.remove('account-membership-required');
  if (joinRequiredScreen) joinRequiredScreen.hidden = true;
  if (!banScreen) return;
  banScreen.hidden = !accountBanned;
  if (!accountBanned) return;
  if (banReasonDisplay) banReasonDisplay.textContent = ban.reason || 'No reason was provided.';
  updateBanCountdown();
}

function showJoinRequired() {
  activeBan = null;
  accountBanned = false;
  document.body.classList.remove('account-banned');
  document.body.classList.add('account-membership-required');
  if (banScreen) banScreen.hidden = true;
  if (joinRequiredScreen) joinRequiredScreen.hidden = false;
}

function updateBanCountdown() {
  if (!accountBanned || !banDurationDisplay || !activeBan) return;
  if (!activeBan.until) { banDurationDisplay.textContent = 'Forever'; return; }
  const remaining = new Date(activeBan.until).getTime() - Date.now();
  if (remaining <= 0) {
    banDurationDisplay.textContent = 'Unbanning now…';
    void loadBanStatus();
    return;
  }
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  const endDate = new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(activeBan.until));
  banDurationDisplay.textContent = `${days} day${days === 1 ? '' : 's'} remaining · Ends ${endDate}`;
}

async function loadBanStatus() {
  if (!currentUserId) return;
  try {
    const view = currentInternetView();
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', view }),
    });
    const result = await readApiJson(response, 'Could not check account access.');
    if (!response.ok) {
      if (/network is banned/i.test(result.error || '')) showBan(result.ban || { reason: result.error, until: null });
      else if (/member of the Clearwater Roleplay Discord server/i.test(result.error || '')) showJoinRequired();
      return;
    }
    showBan(result.banned ? result.ban : null);
    // Status already marks presence — only pull warning bodies when needed.
    if (Number(result.unreadWarnings || 0) > 0) void loadWarnings();
  } catch {
    // Do not hide the normal site if the bot connection is briefly unavailable.
  }
}

function currentInternetView() {
  const open = document.querySelector('.internet-view:not([hidden])');
  return open?.dataset?.view || 'home';
}

let presencePulseBusy = false;
let presenceScrollTimer = 0;
let lastPresencePulseAt = 0;

async function pulsePresence(forceView = '') {
  if (!currentUserId || presencePulseBusy || document.hidden) return;
  // Status heartbeats already count as presence — keep this rare.
  if (Date.now() - lastPresencePulseAt < 90_000) return;
  const view = forceView || currentInternetView();
  if (!view) return;
  presencePulseBusy = true;
  try {
    await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'presence', view }),
    });
    lastPresencePulseAt = Date.now();
  } catch {
    // Presence is best-effort.
  } finally {
    presencePulseBusy = false;
  }
}

function queuePresenceFromScroll() {
  if (!currentUserId) return;
  if (currentInternetView() !== 'home') return;
  if (presenceScrollTimer) return;
  presenceScrollTimer = window.setTimeout(() => {
    presenceScrollTimer = 0;
    void pulsePresence('home');
  }, 8000);
}

function reportSourceLabel(report) {
  if (report?.source === 'automod') return 'Automod';
  return report?.reporterName || 'Member report';
}

function reportKindLabel(report) {
  if (report?.kind === 'message') return 'Direct message';
  if (report?.kind === 'comment') return 'Comment';
  if (report?.kind === 'reel') return 'Reel';
  if (report?.kind === 'ad') return 'Sponsored ad';
  return 'Post';
}

function staffMemberLookup(id, fallback = {}) {
  const fromMap = internetUsers.get(id) || {};
  const fromSnapshot = (moderationSnapshot?.users || []).find((user) => user.id === id) || {};
  return {
    id,
    displayName: fromMap.displayName || fromSnapshot.displayName || fallback.authorName || fallback.displayName || 'Discord user',
    username: fromMap.username || fromSnapshot.username || fallback.authorUsername || fallback.username || '',
    avatarUrl: fromMap.avatarUrl || fromSnapshot.avatarUrl || fallback.authorAvatarUrl || fallback.avatarUrl || 'assets/clearwater-logo.png',
    verified: fromSnapshot.verified === true || fromMap.verified === true,
    banned: fromSnapshot.banned === true || fromMap.banned === true,
    muted: fromSnapshot.muted === true,
    watched: fromSnapshot.watched === true,
    warningCount: Number(fromSnapshot.warningCount || 0),
    official: fromSnapshot.official === true || fromMap.official === true,
    staffRank: fromSnapshot.staffRank || fromMap.staffRank || null,
    lockPosts: fromSnapshot.lockPosts === true,
    lockMessages: fromSnapshot.lockMessages === true,
    lockReels: fromSnapshot.lockReels === true,
    lockProfile: fromSnapshot.lockProfile === true,
    deactivated: fromSnapshot.deactivated === true,
    shadowbanned: fromSnapshot.shadowbanned === true,
    reportCount: Number(fromSnapshot.reportCount || 0),
    postCount: Number(fromSnapshot.postCount || 0),
  };
}

function staffAvatarMarkup(url) {
  return `<img src="${escapeHtml(url || 'assets/clearwater-logo.png')}" alt="" draggable="false" />`;
}

function staffReportStatus(report) {
  if (report?.status === 'accepted') return { key: 'actioned', label: 'Actioned' };
  if (report?.status === 'denied') return { key: 'dismissed', label: 'Dismissed' };
  return { key: 'open', label: 'Open' };
}

function staffReportCategory(report) {
  if (Array.isArray(report?.categories) && report.categories[0]) return String(report.categories[0]).replace(/-/g, ' ');
  if (report?.source === 'automod') return 'automod';
  return report?.kind === 'message' ? 'direct message' : 'post';
}

function staffReportReporter(report) {
  if (!report || report.source === 'automod') return null;
  return staffMemberLookup(report.reporterId, { displayName: report.reporterName, avatarUrl: report.reporterAvatarUrl });
}

function staffReportQueueMarkup(report, selected) {
  const author = staffMemberLookup(report.authorId, report);
  const reporter = staffReportReporter(report);
  const status = staffReportStatus(report);
  const reportedBy = reporter ? `Reported by ${reporter.displayName}` : 'Flagged by automod';
  return `<button type="button" class="staff-case-row ${report.id === selected ? 'selected' : ''}" data-staff-select="${escapeHtml(report.id)}">
    <span class="staff-case-row-avatar">
      ${staffAvatarMarkup(author.avatarUrl)}
      ${reporter ? `<img class="staff-case-row-reporter" src="${escapeHtml(reporter.avatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" />` : '<span class="staff-case-row-reporter automod" aria-hidden="true">A</span>'}
    </span>
    <span class="staff-case-row-body">
      <span class="staff-case-row-head"><b>${escapeHtml(author.displayName)}</b><i>${escapeHtml(timeAgo(report.createdAt))}</i></span>
      <span class="staff-case-row-text">${escapeHtml(report.content || report.reason || 'No text captured')}</span>
      <span class="staff-case-row-tags"><em>${escapeHtml(staffReportCategory(report))}</em><span>${escapeHtml(reportedBy)}</span></span>
    </span>
    <span class="staff-case-row-status ${status.key}">${status.label}</span>
  </button>`;
}

const STAFF_RESTRICTIONS = [
  { key: 'banned', label: 'Banned', untilKey: 'banUntil', tone: 'danger' },
  { key: 'muted', label: 'Muted', untilKey: 'mutedUntil', tone: 'warn' },
  { key: 'shadowbanned', label: 'Shadowbanned', untilKey: '', tone: 'warn' },
  { key: 'lockPosts', label: 'Posting locked', untilKey: 'lockPostsUntil', tone: '' },
  { key: 'lockMessages', label: 'Messages locked', untilKey: 'lockMessagesUntil', tone: '' },
  { key: 'lockReels', label: 'Reels locked', untilKey: 'lockReelsUntil', tone: '' },
  { key: 'lockProfile', label: 'Profile locked', untilKey: 'lockProfileUntil', tone: '' },
  { key: 'watched', label: 'On the watchlist', untilKey: '', tone: 'watch' },
  { key: 'deactivated', label: 'Account deactivated', untilKey: '', tone: '' },
];

// `detailed` is only true for the staff user panel, where the store sends the
// expiry timestamps. The report queue lookup only knows the on/off state.
function staffActiveRestrictions(user, detailed = false) {
  return STAFF_RESTRICTIONS.filter((item) => user?.[item.key] === true).map((item) => {
    const until = item.untilKey ? user[item.untilKey] : null;
    return {
      label: item.label,
      tone: item.tone,
      expires: until ? staffUntil(until) : (detailed && item.untilKey ? 'No expiry' : ''),
    };
  });
}

function staffCaseMarkup(selected) {
  if (!selected) return '<div class="staff-empty staff-empty-lg">Select a report to review it here.</div>';
  const closed = selected.status && selected.status !== 'open';
  const canDelete = selected.kind !== 'message' && Boolean(selected.postId);
  const author = staffMemberLookup(selected.authorId, selected);
  const reporter = selected.source === 'automod'
    ? null
    : staffMemberLookup(selected.reporterId, { displayName: selected.reporterName, avatarUrl: selected.reporterAvatarUrl });
  const target = selected.targetId
    ? staffMemberLookup(selected.targetId, { displayName: selected.targetName, username: selected.targetUsername, avatarUrl: selected.targetAvatarUrl })
    : null;
  const categories = Array.isArray(selected.categories) ? selected.categories : [];
  const status = staffReportStatus(selected);
  const restrictions = staffActiveRestrictions(author);
  const facts = [
    reportKindLabel(selected),
    reportSourceLabel(selected),
    timeAgo(selected.createdAt),
  ].filter(Boolean);
  const resolve = closed
    ? `<p class="staff-case-outcome">${escapeHtml(staffHistoryLabel(selected))} · ${escapeHtml(timeAgo(selected.reviewedAt || selected.createdAt))}${selected.reviewerName ? ` · by ${escapeHtml(selected.reviewerName)}` : ''}</p>`
    : `<div class="staff-case-actions">
        <button type="button" class="staff-action-btn primary" data-report-review="accept" data-report-action="warning" data-report-id="${escapeHtml(selected.id)}">Warn</button>
        <button type="button" class="staff-action-btn" data-report-review="accept" data-report-action="delete" data-report-id="${escapeHtml(selected.id)}">${canDelete ? 'Delete post' : 'Confirm hold'}</button>
        <button type="button" class="staff-action-btn" data-report-review="deny" data-report-id="${escapeHtml(selected.id)}">${selected.source === 'automod' && !selected.postId ? 'Mark false & release' : 'Dismiss'}</button>
        <button type="button" class="staff-action-btn danger" data-report-review="accept" data-report-action="ban" data-report-id="${escapeHtml(selected.id)}">Ban</button>
      </div>`;
  return `<article class="staff-case" data-report-card>
    <header class="staff-case-head">
      <button type="button" class="staff-case-identity" data-staff-open-user="${escapeHtml(author.id)}">
        ${staffAvatarMarkup(author.avatarUrl)}
        <div>
          <b>${escapeHtml(author.displayName)}</b>
          <small>@${escapeHtml(author.username || 'member')}</small>
        </div>
      </button>
      <div class="staff-case-head-actions">
        <button type="button" class="staff-case-open" data-staff-open-user="${escapeHtml(author.id)}">Open user</button>
        <span class="staff-case-badge ${status.key}">${status.label}</span>
      </div>
    </header>
    <p class="staff-case-meta">${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join('')}</p>
    <div class="staff-case-body">
      <section class="staff-case-panel">
        <h4>Reported content</h4>
        <blockquote class="staff-case-copy">${escapeHtml(selected.content || 'No text captured')}</blockquote>
        ${selected.hasVideo && selected.postId
          ? `<div class="staff-case-links"><button type="button" class="staff-action-btn primary" data-staff-view-video="${escapeHtml(selected.postId)}" data-staff-view-kind="${escapeHtml(selected.kind === 'reel' ? 'reel' : 'post')}">View video</button></div>`
          : ''}
        <div class="staff-case-field"><span>Reason given</span><p>${escapeHtml(selected.reason || 'No reason given')}</p></div>
        ${categories.length ? `<div class="staff-chip-row">${categories.map((category) => `<span class="staff-chip warn">${escapeHtml(String(category).replace(/-/g, ' '))}</span>`).join('')}</div>` : ''}
        <div class="staff-case-parties">
          ${reporter ? `<p class="staff-case-target">Reported by <button type="button" data-staff-open-user="${escapeHtml(reporter.id)}">${staffAvatarMarkup(reporter.avatarUrl)}<b>${escapeHtml(reporter.displayName)}</b></button></p>` : '<p class="staff-case-target">Flagged automatically by automod.</p>'}
          ${target ? `<p class="staff-case-target">Sent to <button type="button" data-staff-open-user="${escapeHtml(target.id)}">${staffAvatarMarkup(target.avatarUrl)}<b>${escapeHtml(target.displayName)}</b></button></p>` : ''}
        </div>
      </section>
      <aside class="staff-case-panel staff-case-standing">
        <h4>Author standing</h4>
        <dl class="staff-case-counts">
          <div><dt>Warnings</dt><dd>${Number(author.warningCount || 0)}</dd></div>
          <div><dt>Reports</dt><dd>${Number(author.reportCount || 0)}</dd></div>
          <div><dt>Posts</dt><dd>${Number(author.postCount || 0)}</dd></div>
        </dl>
        ${restrictions.length
          ? `<ul class="staff-standing-list">${restrictions.map((item) => `<li class="${item.tone}"><b>${escapeHtml(item.label)}</b></li>`).join('')}</ul>`
          : '<p class="staff-standing-clear">No active restrictions.</p>'}
        <div class="staff-chip-row">${staffUserChips(author)}</div>
        <div class="staff-case-links">
          <button type="button" class="staff-action-btn" data-staff-open-user="${escapeHtml(author.id)}">Open user panel</button>
          <button type="button" class="staff-action-btn" data-open-member="${escapeHtml(author.id)}">Public profile</button>
        </div>
      </aside>
    </div>
    <footer class="staff-case-resolve">
      <h4>${closed ? 'Outcome' : 'Resolve this report'}</h4>
      ${resolve}
    </footer>
  </article>`;
}

function staffWhen(value) {
  if (!value) return 'Unknown';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Unknown';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time));
}

function staffUntil(until) {
  if (!until) return 'Forever';
  const time = new Date(until).getTime();
  if (!Number.isFinite(time)) return 'Forever';
  return `Until ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(time))}`;
}

function staffDateLabel(value) {
  if (!value) return 'Unknown';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Unknown';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time));
}

function staffDurationSelect(field = 'duration', selected = '7') {
  const options = [['forever', 'Forever'], ['1', '1 day'], ['3', '3 days'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days']];
  return `<select data-staff-field="${escapeHtml(field)}">${options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

function staffUserChips(user) {
  const chips = [];
  if (user.official) chips.push('<span class="staff-chip official">Official</span>');
  if (user.verified) chips.push('<span class="staff-chip is-verified">Verified</span>');
  if (user.developer || (Array.isArray(user.badges) && user.badges.includes('developer'))) chips.push('<span class="staff-chip developer">Developer</span>');
  if (user.business) chips.push('<span class="staff-chip business">Business</span>');
  if (user.warningBadge) chips.push('<span class="staff-chip warn">Warning tag</span>');
  if (user.banned) chips.push('<span class="staff-chip danger">Banned</span>');
  if (user.muted) chips.push('<span class="staff-chip warn">Muted</span>');
  if (user.watched) chips.push('<span class="staff-chip watch">Watched</span>');
  if (user.shadowbanned) chips.push('<span class="staff-chip warn">Shadowbanned</span>');
  if (user.lockPosts) chips.push('<span class="staff-chip">Post lock</span>');
  if (user.lockMessages) chips.push('<span class="staff-chip">DM lock</span>');
  if (user.lockReels) chips.push('<span class="staff-chip">Reel lock</span>');
  if (user.lockProfile) chips.push('<span class="staff-chip">Profile lock</span>');
  if (user.deactivated) chips.push('<span class="staff-chip">Deactivated</span>');
  if (user.staffRank) chips.push(`<span class="staff-chip">${escapeHtml(user.staffRank)}</span>`);
  return chips.join('');
}

function staffToggleMarkup({ active, onAction, offAction, label, expires = '', tone = '' }) {
  const action = active ? offAction : onAction;
  const state = active ? (expires || 'Active') : 'Off';
  return `<button type="button" class="staff-toggle${active ? ' on' : ''}${tone ? ` ${tone}` : ''}" role="switch" aria-checked="${active ? 'true' : 'false'}" data-staff-user-action="${escapeHtml(action)}" data-staff-toggle-on="${escapeHtml(onAction)}" data-staff-toggle-off="${escapeHtml(offAction)}">
    <span class="staff-toggle-switch" aria-hidden="true"></span>
    <span class="staff-toggle-label"><b>${escapeHtml(label)}</b><small>${escapeHtml(state)}</small></span>
  </button>`;
}

function staffActionGroupMarkup(title, hint, body) {
  return `<section class="staff-action-group">
    <header><h4>${escapeHtml(title)}</h4>${hint ? `<span>${escapeHtml(hint)}</span>` : ''}</header>
    ${body}
  </section>`;
}

function staffMemberRowMeta(member) {
  const handle = `@${member.discordUsername || member.username || 'member'}`;
  if (member.isBusinessAccount || member.business) {
    const ownerHandle = member.businessOwnerUsername
      ? `@${member.businessOwnerUsername}`
      : (member.businessOwnerName || member.businessOwnerId || 'handler');
    return `${handle} · linked to ${ownerHandle}`;
  }
  return `${handle} · ${member.discordId || member.id || ''}`;
}

function staffActiveSeenLabel(lastSeenAt) {
  const seen = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(seen)) return 'Online';
  const seconds = Math.max(0, Math.round((Date.now() - seen) / 1000));
  if (seconds < 8) return 'Active now';
  if (seconds < 60) return `Seen ${seconds}s ago`;
  return `Seen ${Math.round(seconds / 60)}m ago`;
}

function staffActiveRowMarkup(member) {
  const handle = `@${member.discordUsername || member.username || 'member'}`;
  const discordId = member.discordId || member.id || '';
  const viewLabel = member.activeView === 'home' || !member.activeView
    ? 'Viewing home'
    : `Viewing ${String(member.activeView).replace(/-/g, ' ')}`;
  return `<button type="button" class="staff-user-row staff-active-row" data-staff-open-user="${escapeHtml(member.id)}">
    <img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" />
    <span>
      <b>${escapeHtml(member.displayName || 'Discord user')} <em class="staff-active-dot">Online</em></b>
      <small>${escapeHtml(handle)}${discordId ? ` · ${escapeHtml(discordId)}` : ''}</small>
      <small class="staff-active-seen">${escapeHtml(viewLabel)} · ${escapeHtml(staffActiveSeenLabel(member.lastSeenAt))}</small>
      <span class="staff-chip-row">${staffUserChips(member)}</span>
    </span>
  </button>`;
}

function staffUserPanelMarkup(detail) {
  if (!detail?.user) return '<div class="staff-empty staff-empty-lg">Select a user to open their staff panel.</div>';
  const fullStaff = sessionStaffPanel === 'full';
  const user = { ...detail.user, banUntil: detail.user.ban?.until || null };
  const isBiz = Boolean(user.isBusinessAccount || user.business || /^biz_/i.test(String(user.id || '')));
  const posts = Array.isArray(detail.posts) ? detail.posts : [];
  const warnings = Array.isArray(detail.warnings) ? detail.warnings : [];
  const reports = Array.isArray(detail.reports) ? detail.reports : [];
  const restrictions = staffActiveRestrictions(user, true);
  const button = (action, label, extra = '') => `<button type="button" class="staff-action-btn${extra ? ` ${extra}` : ''}" data-staff-user-action="${action}">${label}</button>`;
  const accountStatusToggles = [
    fullStaff && !isBiz ? staffToggleMarkup({ active: user.verified === true, onAction: 'verify', offAction: 'unverify', label: 'Verified' }) : '',
    staffToggleMarkup({ active: user.banned === true, onAction: 'ban', offAction: 'unban', label: 'Banned', expires: user.banUntil ? staffUntil(user.banUntil) : '', tone: 'danger' }),
  ].filter(Boolean).join('');
  const idLabel = isBiz ? 'Business ID' : 'Discord ID';
  const idValue = isBiz ? user.id : (user.discordId || user.id);
  const discordHrefId = isBiz ? (user.businessOwnerId || '') : (user.discordId || user.id);
  const linkedBlock = isBiz && user.businessOwnerId
    ? `<section class="staff-user-block staff-linked-handler">
        <h3>Linked handler</h3>
        <button type="button" class="staff-linked-handler-btn" data-staff-open-user="${escapeHtml(user.businessOwnerId)}">
          <img src="${escapeHtml(user.businessOwnerAvatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" />
          <span>
            <b>${escapeHtml(user.businessOwnerName || 'Handler')}</b>
            <small>${user.businessOwnerUsername ? `@${escapeHtml(user.businessOwnerUsername)}` : 'Personal account'} · ${escapeHtml(user.businessOwnerId)}</small>
          </span>
        </button>
        <p class="staff-action-hint">Ads and tips for this business spend the handler’s Clearwater credits wallet.</p>
      </section>`
    : (isBiz ? '<section class="staff-user-block staff-linked-handler"><h3>Linked handler</h3><p class="staff-empty">No personal account is linked to this business.</p></section>' : '');
  return `<article class="staff-user-dossier" data-staff-target-id="${escapeHtml(isBiz ? user.id : (user.discordId || user.id))}">
    <header class="staff-user-hero">
      <img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" />
      <div>
        <b>${escapeHtml(user.displayName || (isBiz ? 'Business account' : 'Discord user'))}</b>
        <small>@${escapeHtml(user.discordUsername || user.username || 'member')}${user.staffRank ? ` · ${escapeHtml(user.staffRank)}` : ''}${isBiz ? ' · Business' : ''}</small>
        <p class="staff-user-id"><span>${escapeHtml(idLabel)}</span><button type="button" data-staff-copy-id="${escapeHtml(idValue)}">${escapeHtml(idValue)}</button></p>
        <div class="staff-chip-row">${staffUserChips(user)}</div>
      </div>
      <div class="staff-user-hero-actions">
        <button type="button" data-open-member="${escapeHtml(user.id)}">Public profile</button>
        <button type="button" data-staff-view-messages="${escapeHtml(user.id)}">View messages</button>
        ${discordHrefId ? `<a href="https://discord.com/users/${encodeURIComponent(discordHrefId)}" target="_blank" rel="noopener">${isBiz ? 'Handler Discord' : 'Discord'}</a>` : ''}
      </div>
    </header>
    ${linkedBlock}
    <dl class="staff-user-stats">
      <div><dt>Posts</dt><dd>${Number(user.postCount || 0)}</dd></div>
      <div><dt>Reels</dt><dd>${Number(user.reelCount || 0)}</dd></div>
      <div><dt>Warnings</dt><dd>${Number(user.warningCount || 0)}</dd></div>
      <div><dt>Reports</dt><dd>${Number(user.reportCount || 0)}</dd></div>
      <div><dt>Followers</dt><dd>${Number(user.followerCount || 0)}</dd></div>
      <div><dt>Following</dt><dd>${Number(user.followingCount || 0)}</dd></div>
      <div><dt>DMs</dt><dd><button type="button" class="staff-stat-link" data-staff-view-messages="${escapeHtml(user.id)}">${Number(user.messageCount || 0)}</button></dd></div>
      ${fullStaff ? `<div><dt>Networks</dt><dd>${Number(user.ipHashCount || 0)}</dd></div>` : ''}
    </dl>
    <p class="staff-user-timeline"><span>Joined ${escapeHtml(staffDateLabel(user.createdAt))}</span><span>Last seen ${escapeHtml(staffDateLabel(user.lastSeenAt))}</span></p>
    ${fullStaff ? `<section class="staff-user-block staff-wallet-controls" data-staff-wallet-user="${escapeHtml(isBiz && user.businessOwnerId ? user.businessOwnerId : user.id)}">
      <h3>Clearwater credits</h3>
      <p class="staff-wallet-balance">${isBiz ? 'Handler balance' : 'Current balance'} <b>C$${Number(isBiz ? (user.businessOwnerCredits ?? 0) : (user.credits || 0)).toLocaleString()}</b></p>
      ${isBiz ? '<p class="staff-action-hint">Business ads spend this linked personal wallet. Adjustments here update the handler.</p>' : ''}
      <div class="staff-wallet-fields"><label>Amount<input data-staff-wallet-amount type="number" min="1" max="1000000" step="1" value="75" inputmode="numeric" /></label><label>Note <input data-staff-wallet-note maxlength="220" placeholder="Reason for this adjustment" /></label></div>
      <div class="staff-user-actions"><button type="button" class="staff-action-btn" data-staff-wallet-adjust="add">Add credits</button><button type="button" class="staff-action-btn danger" data-staff-wallet-adjust="remove">Remove credits</button></div>
      <p class="staff-user-status" data-staff-wallet-status role="status"></p>
    </section>` : ''}
    <section class="staff-user-block staff-standing-block">
      <h3>Current standing</h3>
      ${restrictions.length
        ? `<ul class="staff-standing-list">${restrictions.map((item) => `<li class="${item.tone}"><b>${escapeHtml(item.label)}</b>${item.expires ? `<small>${escapeHtml(item.expires)}</small>` : ''}</li>`).join('')}</ul>`
        : '<p class="staff-standing-clear">No restrictions are active on this account.</p>'}
      ${user.ban ? `<p class="staff-user-alert">Ban reason: ${escapeHtml(user.ban.reason)} · ${escapeHtml(staffUntil(user.ban.until))}</p>` : ''}
      ${user.mute ? `<p class="staff-user-alert">Mute reason: ${escapeHtml(user.mute.reason)} · ${escapeHtml(staffUntil(user.mute.until))}</p>` : ''}
    </section>
    ${user.bio ? `<p class="staff-user-bio">${escapeHtml(user.bio)}</p>` : ''}
    <section class="staff-user-block staff-actions-card">
      <h3>Moderation actions</h3>
      <div class="staff-action-context">
        <label>Reason or notice<textarea data-staff-field="reason" maxlength="300" placeholder="Explain the warn, ban, mute, lock, or notice"></textarea></label>
        <div class="staff-action-context-side">
          <label>Duration${staffDurationSelect('duration')}</label>
          ${fullStaff ? '<label class="staff-check"><input type="checkbox" data-staff-field="ipBan" /><span>Also block known networks on ban</span></label>' : '<p class="staff-action-hint">Limited staff can ban up to 3 people per hour.</p>'}
          <p class="staff-action-hint">The reason and duration above are applied to every action in this panel.</p>
        </div>
      </div>
      <div class="staff-action-groups">
        ${staffActionGroupMarkup('Account status', fullStaff ? 'Verification and account access' : 'Account access', `<div class="staff-toggle-grid">${accountStatusToggles}</div>`)}
        ${staffActionGroupMarkup('Profile tags', 'Shown next to the display name on posts and profiles', `<div class="staff-action-grid">
          ${user.warningBadge
            ? `<p class="staff-action-hint">Warning hover text: ${escapeHtml(user.warningBadgeText || 'Account warning')}</p>${button('unbadge-warning', 'Remove warning tag')}`
            : `${button('badge-warning', 'Add warning tag', 'primary')}<p class="staff-action-hint">Uses the reason box above as the hover text.</p>`}
        </div>`)}
        ${staffActionGroupMarkup('Restrictions', 'Reversible limits, shown with their expiry', `<div class="staff-toggle-grid">
          ${staffToggleMarkup({ active: user.muted === true, onAction: 'mute', offAction: 'unmute', label: 'Muted', expires: user.mutedUntil ? staffUntil(user.mutedUntil) : '', tone: 'warn' })}
          ${staffToggleMarkup({ active: user.lockPosts === true, onAction: 'lock-posts', offAction: 'unlock-posts', label: 'Posting locked', expires: user.lockPostsUntil ? staffUntil(user.lockPostsUntil) : '' })}
          ${staffToggleMarkup({ active: user.lockMessages === true, onAction: 'lock-messages', offAction: 'unlock-messages', label: 'Messages locked', expires: user.lockMessagesUntil ? staffUntil(user.lockMessagesUntil) : '' })}
          ${staffToggleMarkup({ active: user.lockReels === true, onAction: 'lock-reels', offAction: 'unlock-reels', label: 'Reels locked', expires: user.lockReelsUntil ? staffUntil(user.lockReelsUntil) : '' })}
          ${staffToggleMarkup({ active: user.lockProfile === true, onAction: 'lock-profile', offAction: 'unlock-profile', label: 'Profile locked', expires: user.lockProfileUntil ? staffUntil(user.lockProfileUntil) : '' })}
          ${staffToggleMarkup({ active: user.shadowbanned === true, onAction: 'shadowban', offAction: 'unshadowban', label: 'Shadowbanned', tone: 'warn' })}
          ${staffToggleMarkup({ active: user.watched === true, onAction: 'watch', offAction: 'unwatch', label: 'On the watchlist', tone: 'watch' })}
        </div>`)}
        ${staffActionGroupMarkup('Notices', 'Messages this member will see', `<div class="staff-action-grid">
          ${button('warn', 'Send a warning', 'primary')}
          ${button('send-notice', 'Send a staff notice')}
          ${button('clear-warnings', 'Clear warning history')}
        </div>`)}
      </div>
      <details class="staff-danger-zone" data-staff-group="danger">
        <summary><b>Destructive actions</b><span>${fullStaff ? 'Content removal and network blocks cannot be undone' : 'Content removal cannot be undone'}</span></summary>
        <div class="staff-action-grid">
          ${button('wipe-posts', 'Delete all posts', 'danger')}
          ${button('wipe-reels', 'Delete all Reels', 'danger')}
          ${button('wipe-comments', 'Delete all comments', 'danger')}
          ${button('wipe-messages', 'Wipe stored DMs', 'danger')}
          ${button('reset-profile', 'Reset public profile', 'danger')}
          ${fullStaff && !isBiz ? `${button('ip-ban', `Block ${Number(user.ipHashCount || 0)} network hash${Number(user.ipHashCount || 0) === 1 ? '' : 'es'}`, 'danger')}${button('clear-ip-ban', 'Lift network block')}` : ''}
        </div>
      </details>
      <p class="staff-user-status" data-staff-user-status role="status"></p>
    </section>
    <section class="staff-user-block" data-staff-messages-panel>
      <h3>Direct messages</h3>
      <p class="staff-action-hint">Inspect this account’s DMs with other members. Opening a thread does not mark messages as read.</p>
      ${staffMessagesPanelMarkup(user)}
    </section>
    <section class="staff-user-block">
      <h3>Staff note</h3>
      <textarea data-staff-field="note" maxlength="500" placeholder="Private note for staff only">${escapeHtml(user.note || '')}</textarea>
      <div class="staff-action-grid">${button('note', 'Save note')}</div>
    </section>
    <section class="staff-user-block">
      <h3>Recent content</h3>
      ${posts.length ? posts.map((post) => `<article class="staff-user-content"><b>${escapeHtml(post.kind)}</b><p>${escapeHtml(post.content || 'No text')}</p><small>${escapeHtml(timeAgo(post.createdAt))} · ${Number(post.likes || 0)} likes</small><button type="button" class="staff-action-btn danger" data-staff-user-action="delete-post" data-staff-post-id="${escapeHtml(post.id)}">Delete</button></article>`).join('') : '<p class="staff-empty">No posts, Reels, or comments on file.</p>'}
    </section>
    <section class="staff-user-block">
      <h3>Warnings</h3>
      ${warnings.length ? warnings.map((warning) => `<article class="staff-compact"><b>${warning.kind === 'notice' ? 'Notice · ' : ''}${escapeHtml(warning.reason)}</b><small>${escapeHtml(timeAgo(warning.createdAt))}${warning.readAt ? ' · seen' : ' · unread'}</small></article>`).join('') : '<p class="staff-empty">No warnings.</p>'}
    </section>
    <section class="staff-user-block">
      <h3>Reports</h3>
      ${reports.length ? reports.map((report) => `<article class="staff-compact"><b>${escapeHtml(report.role)} · ${escapeHtml(report.status)}${report.action ? ` · ${escapeHtml(report.action)}` : ''}</b><span>${escapeHtml(report.reason || report.content || 'No details')}</span><small>${escapeHtml(timeAgo(report.createdAt))}</small></article>`).join('') : '<p class="staff-empty">No reports involving this account.</p>'}
    </section>
  </article>`;
}

function staffHistoryLabel(report) {
  if (report.status === 'denied') return 'Dismiss report';
  return String(report.action || 'Take action').replace(/_/g, ' ');
}

function syncStaffPanes() {
  if (staffTab === 'search') staffTab = 'users';
  if (staffTab === 'controls' && sessionStaffPanel !== 'full') staffTab = 'overview';
  document.querySelectorAll('[data-staff-pane]').forEach((pane) => {
    const on = pane.dataset.staffPane === staffTab;
    pane.hidden = !on;
  });
  document.querySelectorAll('[data-staff-tab]').forEach((button) => {
    const isControls = button.dataset.staffTab === 'controls';
    button.hidden = isControls && sessionStaffPanel !== 'full';
    button.classList.toggle('selected', button.dataset.staffTab === staffTab);
  });
}

function renderStaffDashboard() {
  syncStaffPanes();
  if (!moderationSnapshot) return;
  const reports = moderationSnapshot.reports || [];
  const history = moderationSnapshot.history || [];
  const bans = moderationSnapshot.bans || [];
  const logs = moderationSnapshot.logs || [];
  const stats = moderationSnapshot.stats || {};
  const overview = document.querySelector('[data-staff-overview]');
  const queueList = document.querySelector('[data-staff-queue-list]');
  const casePane = document.querySelector('[data-staff-case]');
  const historyList = document.querySelector('[data-staff-history-list]');
  const usersPane = document.querySelector('[data-staff-users]');
  const reportCount = document.querySelector('[data-staff-report-count]');
  const operator = document.querySelector('[data-staff-operator]');
  document.querySelectorAll('[data-staff-queue]').forEach((button) => button.classList.toggle('selected', button.dataset.staffQueue === staffQueueFilter));
  document.querySelectorAll('[data-history-filter]').forEach((button) => button.classList.toggle('selected', button.dataset.historyFilter === staffHistoryFilter));
  if (operator) operator.textContent = sessionUser?.username ? `@${sessionUser.username}` : '';
  if (!reports.some((report) => report.id === selectedReportId) && staffQueueFilter === 'pending') selectedReportId = reports[0]?.id || null;
  const selected = reports.find((report) => report.id === selectedReportId) || history.find((report) => report.id === selectedReportId) || null;
  const queueItems = staffQueueFilter === 'pending'
    ? reports
    : history.filter((report) => staffQueueFilter === 'actioned' ? report.status === 'accepted' : report.status === 'denied');
  if (reportCount) reportCount.textContent = String(reports.length);
  const queueCounts = {
    pending: reports.length,
    actioned: history.filter((report) => report.status === 'accepted').length,
    dismissed: history.filter((report) => report.status === 'denied').length,
  };
  document.querySelectorAll('[data-staff-queue-count]').forEach((badge) => {
    badge.textContent = String(queueCounts[badge.dataset.staffQueueCount] ?? 0);
  });
  const queueEmpty = {
    pending: 'The queue is clear. New reports land here.',
    actioned: 'No reports have been actioned yet.',
    dismissed: 'No reports have been dismissed yet.',
  };
  if (queueList) {
    queueList.innerHTML = queueItems.length
      ? queueItems.map((report) => staffReportQueueMarkup(report, selectedReportId)).join('')
      : `<p class="staff-empty">${escapeHtml(queueEmpty[staffQueueFilter] || 'Nothing in this queue.')}</p>`;
  }
  if (casePane) casePane.innerHTML = selected ? staffCaseMarkup(selected) : '<div class="staff-empty staff-empty-lg">Pick a case from the queue to review it here.</div>';
  const historyQuery = staffHistoryQuery.trim().toLowerCase();
  const historyRevertButton = (source, id, canRevert, blockedReason, revertedAt) => {
    if (revertedAt) return '<small class="staff-history-reverted">Reverted</small>';
    if (canRevert) {
      return `<button type="button" class="staff-history-revert" data-history-revert="${escapeHtml(id)}" data-history-source="${escapeHtml(source)}">Revert</button>`;
    }
    return `<button type="button" class="staff-history-revert is-disabled" disabled title="${escapeHtml(blockedReason || 'This action cannot be restored')}">Revert</button>`;
  };
  const historyCards = history.filter((report) => {
    const haystack = `${report.authorName || ''} ${report.action || ''} ${report.content || ''} ${report.reviewerName || ''} ${report.reason || ''}`.toLowerCase();
    if (historyQuery && !haystack.includes(historyQuery)) return false;
    if (staffHistoryFilter === 'users') return /ban|warn|user|account|mute|verify|watch|shadow/i.test(`${report.action || ''} ${report.reason || ''}`);
    if (staffHistoryFilter === 'posts') return report.kind !== 'message' || /post|automod|delete|hold|reel/i.test(`${report.action || ''} ${report.reason || ''}`);
    return true;
  }).map((report) => ({
    kind: 'report',
    at: report.reviewedAt || report.createdAt || '',
    markup: `<article class="staff-history-item ${report.status === 'accepted' ? 'actioned' : 'dismissed'}${report.revertedAt ? ' is-reverted' : ''}"><div class="staff-history-copy"><b>${escapeHtml(staffHistoryLabel(report))}</b><span>@${escapeHtml((report.authorName || 'member').replace(/\s+/g, '').toLowerCase())}</span><small>${timeAgo(report.reviewedAt || report.createdAt)}</small></div>${historyRevertButton('report', report.id, report.canRevert === true, report.revertBlockedReason, report.revertedAt)}</article>`,
  }));
  const logCards = logs.filter((log) => {
    const message = String(log.message || '').toLowerCase();
    if (historyQuery && !message.includes(historyQuery)) return false;
    if (staffHistoryFilter === 'users') return /banned|warned|unban|mute|verify|watch|shadow|badge|business|warning badge|account/i.test(message);
    if (staffHistoryFilter === 'posts') return /post|automod|deleted|hold|reel|comment/i.test(message);
    return true;
  }).map((log) => ({
    kind: 'log',
    at: log.createdAt || '',
    markup: `<article class="staff-history-item${log.revertedAt ? ' is-reverted' : ''}"><div class="staff-history-copy"><b>${escapeHtml(log.message)}</b><small>${timeAgo(log.createdAt)}</small></div>${historyRevertButton('log', log.id, log.canRevert === true, log.revertBlockedReason, log.revertedAt)}</article>`,
  }));
  const historyItems = [...historyCards, ...logCards].sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0));
  if (historyList) {
    historyList.innerHTML = historyItems.length
      ? historyItems.map((item) => item.markup).join('')
      : '<p class="staff-empty">No staff actions yet.</p>';
  }
  const query = staffUserQuery.trim().toLowerCase();
  const sourceUsers = (query && Array.isArray(staffSearchResults))
    ? staffSearchResults
    : (Array.isArray(moderationSnapshot.users) && moderationSnapshot.users.length
      ? moderationSnapshot.users
      : [...internetUsers.values()].map((member) => ({
        ...member,
        discordId: member.id,
        discordUsername: member.username,
        flagged: Boolean(member.banned),
        warningCount: 0,
        postCount: 0,
      })));
  const staffMembers = sourceUsers.filter((member) => {
    if (query && !Array.isArray(staffSearchResults)) {
      const haystack = `${member.displayName || ''} ${member.username || ''} ${member.discordUsername || ''} ${member.discordId || ''} ${member.id || ''}`.toLowerCase();
      if (!haystack.includes(query.replace(/^@/, ''))) return false;
    }
    if (staffUsersFilter === 'flagged') return member.flagged === true;
    if (staffUsersFilter === 'banned') return member.banned === true;
    if (staffUsersFilter === 'watched') return member.watched === true;
    return true;
  });
  document.querySelectorAll('[data-staff-users-filter]').forEach((button) => button.classList.toggle('selected', button.dataset.staffUsersFilter === staffUsersFilter));
  if (usersPane) {
    usersPane.innerHTML = staffSearchBusy && query
      ? '<p class="staff-loading">Searching Discord-linked accounts...</p>'
      : (staffMembers.length
        ? staffMembers.slice(0, 80).map((member) => `<button type="button" class="staff-user-row ${member.id === selectedStaffUserId ? 'selected' : ''}" data-staff-open-user="${escapeHtml(member.id)}"><img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" /><span><b>${escapeHtml(member.displayName || 'Discord user')}</b><small>${escapeHtml(staffMemberRowMeta(member))}</small><span class="staff-chip-row">${staffUserChips(member)}</span></span></button>`).join('')
        : `<p class="staff-empty">${query ? 'No Discord-linked Internet accounts match that search.' : 'No members match that search.'}</p>`);
  }
  const activeUsers = Array.isArray(moderationSnapshot.activeUsers) ? moderationSnapshot.activeUsers : [];
  const activeCountBadge = document.querySelector('[data-staff-active-count]');
  const activeLive = document.querySelector('[data-staff-active-live]');
  const activeList = document.querySelector('[data-staff-active-list]');
  if (activeCountBadge) activeCountBadge.textContent = String(activeUsers.length);
  if (activeLive) activeLive.textContent = `${activeUsers.length} online`;
  if (activeList) {
    activeList.innerHTML = activeUsers.length
      ? activeUsers.map((member) => staffActiveRowMarkup(member)).join('')
      : '<p class="staff-empty">Nobody is actively browsing the website right now.</p>';
  }
  const userPanel = document.querySelector('[data-staff-user-panel]');
  const keepUserPanel = Boolean(staffUserBusy || (userPanel && userPanel.contains(document.activeElement) && (
    document.activeElement.matches('input, textarea, select')
  )));
  if (userPanel && !keepUserPanel) {
    if (!selectedStaffUserId) userPanel.innerHTML = '<div class="staff-empty staff-empty-lg">Select a user to open their staff panel.</div>';
    else if (
      staffUserDetail?.user?.id === selectedStaffUserId
      || staffUserDetail?.user?.discordId === selectedStaffUserId
    ) userPanel.innerHTML = staffUserPanelMarkup(staffUserDetail);
    else userPanel.innerHTML = '<p class="staff-loading">Loading this account...</p>';
  }
  const settings = moderationSnapshot.settings || {};
  const siteTools = document.querySelector('[data-staff-site-tools]');
  if (siteTools) {
    const siteToggle = (action, enabled, label, onCopy, offCopy) => `<button type="button" class="staff-toggle${enabled ? ' on warn' : ''}" role="switch" aria-checked="${enabled ? 'true' : 'false'}" data-staff-site-action="${action}" data-staff-enabled="${enabled ? 'false' : 'true'}">
      <span class="staff-toggle-switch" aria-hidden="true"></span>
      <span class="staff-toggle-label"><b>${label}</b><small>${enabled ? onCopy : offCopy}</small></span>
    </button>`;
    const banner = settings.siteBanner || null;
    const bannerBusy = siteTools.contains(document.activeElement);
    const bannerMessage = bannerBusy ? (siteTools.querySelector('[data-staff-banner-message]')?.value || '') : (banner?.message || '');
    const bannerDetails = bannerBusy ? (siteTools.querySelector('[data-staff-banner-details]')?.value || '') : (banner?.details || '');
    const bannerLink = bannerBusy ? (siteTools.querySelector('[data-staff-banner-link]')?.value || '') : (banner?.linkUrl || '');
    const bannerLinkLabel = bannerBusy ? (siteTools.querySelector('[data-staff-banner-link-label]')?.value || '') : (banner?.linkLabel || '');
    siteTools.innerHTML = `<h2>Site controls</h2>
      <p>Site-wide switches apply to everyone except the official account.</p>
      <div class="staff-action-groups">
        ${staffActionGroupMarkup('Site banner', 'Shown at the very top of the homepage and Clearwater Internet', `<div class="staff-banner-form">
          ${banner ? `<p class="staff-banner-live"><b>Live now:</b> ${escapeHtml(banner.message)}${banner.linkUrl ? ` · <a href="${escapeHtml(banner.linkUrl)}" target="_blank" rel="noopener">link</a>` : ''}</p>` : '<p class="staff-empty">No site banner is live.</p>'}
          <label><span>Message</span><input data-staff-banner-message maxlength="160" placeholder="Scheduled maintenance tonight" value="${escapeHtml(bannerMessage)}" /></label>
          <label><span>Details (optional)</span><textarea data-staff-banner-details maxlength="800" rows="3" placeholder="Optional secondary line under the message">${escapeHtml(bannerDetails)}</textarea></label>
          <label><span>Link URL</span><input data-staff-banner-link maxlength="300" placeholder="https://status.cwrpvc.lol/" value="${escapeHtml(bannerLink)}" /></label>
          <label><span>Link label</span><input data-staff-banner-link-label maxlength="40" placeholder="View status" value="${escapeHtml(bannerLinkLabel)}" /></label>
          <div class="staff-action-grid">
            <button type="button" class="staff-action-btn ghost" data-staff-banner-preset="maintenance">Maintenance preset</button>
            <button type="button" class="staff-action-btn ghost" data-staff-banner-preset="update">Update preset</button>
            <button type="button" class="staff-action-btn" data-staff-site-action="set-site-banner">Publish banner</button>
            <button type="button" class="staff-action-btn danger" data-staff-site-action="clear-site-banner"${banner ? '' : ' disabled'}>Take down</button>
          </div>
        </div>`)}
        ${staffActionGroupMarkup('Community pauses', 'Stop new activity without banning anyone', `<div class="staff-toggle-grid">
          ${siteToggle('pause-posts', settings.pausePosts === true, 'Posting', 'Paused for members', 'Open to members')}
          ${siteToggle('pause-messages', settings.pauseMessages === true, 'Direct messages', 'Paused for members', 'Open to members')}
          ${siteToggle('pause-post-boosts', settings.pausePostBoosts === true, 'Post tips / For You boosts', 'Paused for members', 'Open to members')}
        </div>`)}
        ${staffActionGroupMarkup('Queue maintenance', 'Housekeeping for the reports queue', `<div class="staff-action-grid">
          <button type="button" class="staff-action-btn" data-staff-site-action="clear-dismissed-reports">Clear dismissed reports</button>
        </div>`)}
        ${staffActionGroupMarkup('Network blocks', `${Number(stats.ipBans || 0)} hashed network ban${Number(stats.ipBans || 0) === 1 ? '' : 's'} active`, `<div class="staff-action-grid">
          <button type="button" class="staff-action-btn danger" data-staff-site-action="clear-ip-bans">Lift every network ban</button>
        </div>`)}
      </div>
      <div class="staff-site-lists">
        <section><h3>Watchlist</h3>${(moderationSnapshot.watched || []).length ? moderationSnapshot.watched.map((member) => `<button type="button" data-staff-open-user="${escapeHtml(member.id)}">${escapeHtml(member.displayName)}</button>`).join('') : '<p class="staff-empty">Nobody is on the watchlist.</p>'}</section>
        <section><h3>Muted</h3>${(moderationSnapshot.mutes || []).length ? moderationSnapshot.mutes.map((member) => `<button type="button" data-staff-open-user="${escapeHtml(member.id)}">${escapeHtml(member.displayName)}</button>`).join('') : '<p class="staff-empty">Nobody is muted.</p>'}</section>
        <section><h3>Banned</h3>${bans.length ? bans.slice(0, 12).map((ban) => `<button type="button" data-staff-open-user="${escapeHtml(ban.id)}">${escapeHtml(ban.displayName)}</button>`).join('') : '<p class="staff-empty">Nobody is banned.</p>'}</section>
      </div>
      <p data-staff-site-status role="status"></p>`;
  }
  const pendingAds = Array.isArray(moderationSnapshot.pendingAds) ? moderationSnapshot.pendingAds : [];
  const activeAds = Array.isArray(moderationSnapshot.activeAds) ? moderationSnapshot.activeAds : [];
  const pendingVerifications = Array.isArray(moderationSnapshot.pendingVerifications) ? moderationSnapshot.pendingVerifications : [];
  const pendingBusinesses = Array.isArray(moderationSnapshot.pendingBusinesses) ? moderationSnapshot.pendingBusinesses : [];
  const adCount = document.querySelector('[data-staff-ad-count]');
  if (adCount) adCount.textContent = String(Number(stats.pendingAds || pendingAds.length) + Number(stats.activeAds || activeAds.length));
  const appCount = document.querySelector('[data-staff-app-count]');
  if (appCount) appCount.textContent = String(Number(stats.pendingVerifications || pendingVerifications.length) + Number(stats.pendingBusinesses || pendingBusinesses.length));
  const appsPane = document.querySelector('[data-staff-applications]');
  if (appsPane) {
    const verifyCards = pendingVerifications.length
      ? pendingVerifications.map((item) => `<article class="staff-ad-card"><div><b>${escapeHtml(item.applicantName || 'Member')}</b><small>@${escapeHtml(item.applicantUsername || '')} · ${timeAgo(item.createdAt)}</small><p>${escapeHtml(item.reason || '')}</p></div><div class="staff-ad-actions"><button type="button" class="staff-action-btn primary" data-verify-review="accept" data-application-id="${escapeHtml(item.id)}">Approve</button><button type="button" class="staff-action-btn danger" data-verify-review="deny" data-application-id="${escapeHtml(item.id)}">Deny</button></div></article>`).join('')
      : '<div class="staff-empty">No verification requests waiting.</div>';
    const businessCards = pendingBusinesses.length
      ? pendingBusinesses.map((biz) => `<article class="staff-ad-card"><div><b>${escapeHtml(biz.displayName)}</b><small>@${escapeHtml(biz.username)} · ${escapeHtml(biz.category)} · ${timeAgo(biz.createdAt)}</small>${biz.avatarUrl ? `<img class="staff-ad-media" src="${escapeHtml(biz.avatarUrl)}" alt="" style="max-height:64px;width:auto" />` : ''}${biz.bio ? `<p>${escapeHtml(biz.bio)}</p>` : ''}<small>Handler ID ${escapeHtml(biz.ownerId)}</small></div><div class="staff-ad-actions"><button type="button" class="staff-action-btn primary" data-business-review="accept" data-business-id="${escapeHtml(biz.id)}">Approve</button><button type="button" class="staff-action-btn danger" data-business-review="deny" data-business-id="${escapeHtml(biz.id)}">Deny</button></div></article>`).join('')
      : '<div class="staff-empty">No business account requests waiting.</div>';
    appsPane.innerHTML = `
      <section class="staff-ads-section"><header><h2>Verification requests</h2><span>${pendingVerifications.length}</span></header>${verifyCards}</section>
      <section class="staff-ads-section"><header><h2>Business accounts</h2><span>${pendingBusinesses.length}</span></header>${businessCards}</section>`;
  }
  const adsPane = document.querySelector('[data-staff-ads]');
  if (adsPane) {
    const adCard = (ad, mode) => {
      const media = safeVideoUrl(ad.videoUrl)
        ? `<video class="staff-ad-media" src="${escapeHtml(ad.videoUrl)}" controls playsinline muted></video>`
        : (safeImageUrl(ad.imageUrl) ? `<img class="staff-ad-media" src="${escapeHtml(ad.imageUrl)}" alt="" />` : '');
      const logo = safeImageUrl(ad.logoUrl) ? `<img class="staff-ad-media" src="${escapeHtml(ad.logoUrl)}" alt="" style="max-height:64px;width:auto" />` : '';
      const placement = adPlacementLabel(ad.placement);
      const durationNote = ad.placement === 'reel' && ad.videoSeconds
        ? ` · ${Math.ceil(Number(ad.videoSeconds) || 0)}s video`
        : '';
      const actions = mode === 'pending'
        ? `<div class="staff-ad-actions"><button type="button" class="staff-action-btn primary" data-ad-review="accept" data-ad-id="${escapeHtml(ad.id)}">Approve 48h</button><button type="button" class="staff-action-btn" data-ad-review="deny" data-ad-id="${escapeHtml(ad.id)}">Deny & refund</button><button type="button" class="staff-action-btn danger" data-ad-manage="remove" data-ad-id="${escapeHtml(ad.id)}">Remove</button></div>`
        : `<div class="staff-ad-actions"><button type="button" class="staff-action-btn" data-ad-manage="extend" data-ad-hours="12" data-ad-id="${escapeHtml(ad.id)}">+12h</button><button type="button" class="staff-action-btn" data-ad-manage="extend" data-ad-hours="24" data-ad-id="${escapeHtml(ad.id)}">+24h</button><button type="button" class="staff-action-btn" data-ad-manage="extend" data-ad-hours="48" data-ad-id="${escapeHtml(ad.id)}">+48h</button><button type="button" class="staff-action-btn danger" data-ad-manage="remove" data-ad-id="${escapeHtml(ad.id)}">End now</button></div>`;
      return `<article class="staff-ad-card"><div><b>${escapeHtml(ad.title)}</b><small>${escapeHtml(placement)} · ${escapeHtml(ad.category)} · ${escapeHtml(ad.businessName)} · ${escapeHtml(ad.advertiserName || 'Member')}${ad.weight > 1 ? ` · ${ad.weight}x` : ''}${durationNote}${ad.cost ? ` · C$${Number(ad.cost)}` : ''}${mode === 'active' ? ` · ${escapeHtml(adRemainingCopy(ad))}` : ''}</small><p>${escapeHtml(ad.body)}</p>${logo}${media}</div>${actions}</article>`;
    };
    adsPane.innerHTML = `
      <section class="staff-ads-section"><header><h2>Awaiting approval</h2><span>${pendingAds.length}</span></header>${pendingAds.length ? pendingAds.map((ad) => adCard(ad, 'pending')).join('') : '<div class="staff-empty">No ads waiting for review.</div>'}</section>
      <section class="staff-ads-section"><header><h2>Live placements</h2><span>${activeAds.length}</span></header>${activeAds.length ? activeAds.map((ad) => adCard(ad, 'active')).join('') : '<div class="staff-empty">No live sponsored ads right now.</div>'}</section>`;
  }
  const metrics = `<div class="staff-metrics"><article><b>${Number(stats.pending || reports.length)}</b><span>Pending</span></article><article><b>${Number(stats.pendingVerifications || pendingVerifications.length) + Number(stats.pendingBusinesses || pendingBusinesses.length)}</b><span>Apps</span></article><article><b>${Number(stats.pendingAds || pendingAds.length)}</b><span>Ads</span></article><article><b>${Number(stats.active || activeUsers.length)}</b><span>Active</span></article><article><b>${Number(stats.banned || bans.length)}</b><span>Bans</span></article><article><b>${Number(stats.users || internetUsers.size)}</b><span>Users</span></article></div>`;
  if (overview) {
    overview.innerHTML = `${metrics}<div class="staff-overview-grid"><section class="staff-column"><header><h2>Oldest pending reports</h2><span>${reports.length}</span></header>${reports.length ? reports.slice(0, 8).map((report) => {
      const author = staffMemberLookup(report.authorId, report);
      return `<button type="button" class="staff-report-card ${report.id === selectedReportId ? 'selected' : ''}" data-staff-select="${escapeHtml(report.id)}">${staffAvatarMarkup(author.avatarUrl)}<div><b>${escapeHtml(author.displayName)}</b><small>${escapeHtml(reportSourceLabel(report))} · ${escapeHtml(reportKindLabel(report))}</small><p>${escapeHtml(report.content || 'No text captured')}</p></div></button>`;
    }).join('') : '<div class="staff-empty">Nothing in this queue.</div>'}</section><section class="staff-column"><header><h2>Applications & ads</h2><span>${pendingVerifications.length + pendingBusinesses.length + pendingAds.length}</span></header>
      ${pendingVerifications.length ? `<article class="staff-ad-card"><div><b>${pendingVerifications.length} verification request${pendingVerifications.length === 1 ? '' : 's'}</b><small>Awaiting review</small></div><div class="staff-ad-actions"><button type="button" class="staff-action-btn primary" data-staff-tab-jump="applications">Open Applications</button></div></article>` : ''}
      ${pendingBusinesses.length ? `<article class="staff-ad-card"><div><b>${pendingBusinesses.length} business account${pendingBusinesses.length === 1 ? '' : 's'}</b><small>Awaiting review</small></div><div class="staff-ad-actions"><button type="button" class="staff-action-btn primary" data-staff-tab-jump="applications">Open Applications</button></div></article>` : ''}
      ${pendingAds.length ? pendingAds.slice(0, 4).map((ad) => {
      const placement = adPlacementLabel(ad.placement);
      return `<article class="staff-ad-card"><div><b>${escapeHtml(ad.title)}</b><small>${escapeHtml(placement)} · ${escapeHtml(ad.businessName)}</small><p>${escapeHtml(ad.body)}</p></div><div class="staff-ad-actions"><button type="button" class="staff-action-btn primary" data-staff-tab-jump="ads">Open Ads desk</button></div></article>`;
    }).join('') : (!pendingVerifications.length && !pendingBusinesses.length ? '<div class="staff-empty">No applications or ads waiting.</div>' : '')}
    </section></div>`;
  }
}

async function loadModeration() {
  if (!sessionCanStaff || !staffContent) return;
  if (staffUserBusy) return;
  const overview = document.querySelector('[data-staff-overview]');
  if (overview && !moderationSnapshot) overview.innerHTML = '<p class="staff-loading">Loading the moderation desk...</p>';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'moderation' }) });
    const result = await readApiJson(response, 'Could not load the staff panel.');
    if (!response.ok) throw new Error(result.error || 'Could not load the staff panel.');
    if (staffUserBusy) return;
    moderationSnapshot = result;
    renderStaffDashboard();
    if (selectedStaffUserId && staffTab === 'users' && !staffUserBusy) void loadStaffUserDetail(selectedStaffUserId, true);
  } catch (error) {
    if (overview) overview.innerHTML = `<p class="staff-loading">${escapeHtml(error.message || 'Could not load the staff panel.')}</p>`;
  }
}

function staffMessagesPanelMarkup(user = {}) {
  if (!staffMessagesState || staffMessagesState.targetId !== selectedStaffUserId) {
    return `<div class="staff-messages-idle">
      <button type="button" class="staff-action-btn" data-staff-view-messages="${escapeHtml(user.id || selectedStaffUserId || '')}">Load conversations</button>
    </div>`;
  }
  if (staffMessagesState.loading) {
    return '<p class="staff-loading">Loading messages…</p>';
  }
  if (staffMessagesState.error) {
    return `<p class="staff-loading">${escapeHtml(staffMessagesState.error)}</p>
      <button type="button" class="staff-action-btn" data-staff-view-messages="${escapeHtml(selectedStaffUserId || '')}">Try again</button>`;
  }
  if (staffMessagesState.mode === 'thread') {
    const peer = staffMessagesState.peer || {};
    const messages = Array.isArray(staffMessagesState.messages) ? staffMessagesState.messages : [];
    const targetName = staffMessagesState.target?.displayName || 'This member';
    return `<div class="staff-messages-thread">
      <div class="staff-messages-thread-head">
        <button type="button" data-staff-messages-back>← All conversations</button>
        <div>
          <b>${escapeHtml(peer.displayName || 'Member')}</b>
          <small>@${escapeHtml(peer.username || 'member')} · thread with ${escapeHtml(targetName)}</small>
        </div>
        ${peer.id ? `<button type="button" class="staff-action-btn" data-staff-open-user="${escapeHtml(peer.id)}">Open peer</button>` : ''}
      </div>
      <div class="staff-messages-thread-list">
        ${messages.length
          ? messages.map((message) => {
            const gif = safeGifUrl(message.gifUrl) ? `<img src="${escapeHtml(message.gifUrl)}" alt="${escapeHtml(message.gifTitle || 'GIF')}" />` : '';
            const transfer = message.transferId
              ? `<div class="staff-message-transfer">${escapeHtml(message.transferType === 'request' ? 'Credit request' : 'Credit transfer')}${message.transferAmount != null ? ` · C$${Number(message.transferAmount).toLocaleString()}` : ''} · ${escapeHtml(message.transferStatus || 'pending')}</div>`
              : '';
            return `<article class="staff-message-bubble ${message.fromTarget ? 'from-target' : 'from-peer'}">
              <header><b>${message.fromTarget ? escapeHtml(targetName) : escapeHtml(peer.displayName || 'Peer')}</b><small>${escapeHtml(timeAgo(message.createdAt))}${message.fromTarget ? ' · sent' : ' · received'}${message.readAt ? '' : (message.fromTarget ? '' : ' · unread')}</small></header>
              ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ''}
              ${gif}
              ${transfer}
            </article>`;
          }).join('')
          : '<p class="staff-empty">No messages in this thread.</p>'}
      </div>
    </div>`;
  }

  const conversations = Array.isArray(staffMessagesState.conversations) ? staffMessagesState.conversations : [];
  if (!conversations.length) {
    return '<p class="staff-empty">This account has no stored direct messages.</p>';
  }
  return `<div class="staff-messages-list">
    ${conversations.map((item) => `<button type="button" class="staff-message-row" data-staff-open-thread="${escapeHtml(item.otherId)}" data-staff-open-thread-username="${escapeHtml(item.otherUsername || '')}">
      <img src="${escapeHtml(item.otherAvatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" />
      <span>
        <b>${escapeHtml(item.otherDisplayName || 'Member')}${item.otherStaffRank ? ` · ${escapeHtml(item.otherStaffRank)}` : ''}</b>
        <small>@${escapeHtml(item.otherUsername || 'member')} · ${Number(item.messageCount || 0)} message${Number(item.messageCount || 0) === 1 ? '' : 's'} · ${Number(item.outboundCount || 0)} sent</small>
        <em>${escapeHtml(item.preview || 'Message')} · ${escapeHtml(timeAgo(item.createdAt))}${item.lastFromTarget ? ' · last from them' : ' · last from peer'}</em>
      </span>
    </button>`).join('')}
  </div>`;
}

async function loadStaffUserMessages(userId) {
  if (!sessionCanStaff || !userId) return;
  selectedStaffUserId = userId;
  staffMessagesState = { targetId: userId, loading: true, mode: 'list' };
  const panel = document.querySelector('[data-staff-user-panel]');
  if (staffUserDetail?.user?.id === userId && panel) {
    panel.innerHTML = staffUserPanelMarkup(staffUserDetail);
  } else {
    await loadStaffUserDetail(userId);
  }
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staff-user-messages', targetId: staffActionTargetId(userId) }),
    });
    const result = await readApiJson(response, 'Could not load messages.');
    if (!response.ok) throw new Error(result.error || 'Could not load messages.');
    if (selectedStaffUserId !== userId) return;
    staffMessagesState = {
      targetId: userId,
      mode: 'list',
      target: result.target || null,
      conversations: Array.isArray(result.conversations) ? result.conversations : [],
    };
  } catch (error) {
    if (selectedStaffUserId !== userId) return;
    staffMessagesState = { targetId: userId, mode: 'list', error: error.message || 'Could not load messages.' };
  }
  if (staffUserDetail?.user?.id === userId) {
    const next = document.querySelector('[data-staff-user-panel]');
    if (next) next.innerHTML = staffUserPanelMarkup(staffUserDetail);
  }
}

async function loadStaffUserConversation(peerId, username = '') {
  if (!sessionCanStaff || !selectedStaffUserId || !peerId) return;
  const targetId = staffActionTargetId(selectedStaffUserId);
  staffMessagesState = {
    ...(staffMessagesState || {}),
    targetId,
    loading: true,
    mode: 'thread',
    peer: { id: peerId, username },
  };
  const panel = document.querySelector('[data-staff-user-panel]');
  if (staffUserDetail?.user?.id === targetId && panel) panel.innerHTML = staffUserPanelMarkup(staffUserDetail);
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'staff-user-conversation',
        targetId,
        withUserId: peerId,
        username,
      }),
    });
    const result = await readApiJson(response, 'Could not load this conversation.');
    if (!response.ok) throw new Error(result.error || 'Could not load this conversation.');
    if (selectedStaffUserId !== targetId) return;
    staffMessagesState = {
      targetId,
      mode: 'thread',
      target: result.target || null,
      peer: result.peer || { id: peerId, username },
      messages: Array.isArray(result.messages) ? result.messages : [],
      conversations: staffMessagesState?.conversations || [],
    };
  } catch (error) {
    if (selectedStaffUserId !== targetId) return;
    staffMessagesState = {
      targetId,
      mode: 'list',
      conversations: staffMessagesState?.conversations || [],
      error: error.message || 'Could not load this conversation.',
    };
  }
  if (staffUserDetail?.user?.id === targetId) {
    const next = document.querySelector('[data-staff-user-panel]');
    if (next) next.innerHTML = staffUserPanelMarkup(staffUserDetail);
  }
}

async function loadStaffUserDetail(userId, silent = false) {
  if (!sessionCanStaff || !userId) return;
  if (staffUserBusy) return;
  const panel = document.querySelector('[data-staff-user-panel]');
  if (!silent && panel && !panel.contains(document.activeElement)) panel.innerHTML = '<p class="staff-loading">Loading this account...</p>';
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staff-user-detail', targetId: staffActionTargetId(userId) }),
    });
    const result = await readApiJson(response, 'Could not load this user.');
    if (!response.ok) throw new Error(result.error || 'Could not load this user.');
    if (staffUserBusy) return;
    const returnedId = String(result?.user?.id || '');
    if (
      selectedStaffUserId
      && selectedStaffUserId !== userId
      && selectedStaffUserId !== returnedId
      && selectedStaffUserId !== String(result?.user?.discordId || '')
    ) return;
    staffUserDetail = result;
    if (returnedId) selectedStaffUserId = returnedId;
    if (staffMessagesState?.targetId && staffMessagesState.targetId !== selectedStaffUserId) staffMessagesState = null;
    if (panel && !panel.contains(document.activeElement)) panel.innerHTML = staffUserPanelMarkup(result);
  } catch (error) {
    if (staffUserBusy) return;
    if (panel && (selectedStaffUserId === userId || !selectedStaffUserId)) {
      panel.innerHTML = `<p class="staff-loading">${escapeHtml(error.message || 'Could not load this user.')}</p>`;
    }
  }
}

function staffPanelFields() {
  const panel = document.querySelector('[data-staff-user-panel]');
  return {
    reason: panel?.querySelector('[data-staff-field="reason"]')?.value || '',
    note: panel?.querySelector('[data-staff-field="note"]')?.value || '',
    durationDays: panel?.querySelector('[data-staff-field="duration"]')?.value || 'forever',
    ipBan: panel?.querySelector('[data-staff-field="ipBan"]')?.checked === true,
  };
}

function staffPanelUiState() {
  const panel = document.querySelector('[data-staff-user-panel]');
  return {
    fields: staffPanelFields(),
    openGroups: panel ? [...panel.querySelectorAll('details[data-staff-group]')].filter((group) => group.open).map((group) => group.dataset.staffGroup) : [],
    scrollTop: panel ? panel.scrollTop : 0,
  };
}

// Toggles only read correctly when the panel redraws after every action, so the
// typed reason, chosen duration, open groups, and scroll position are restored.
function redrawStaffUserPanel(detail, state) {
  const panel = document.querySelector('[data-staff-user-panel]');
  if (!panel || !detail?.user) return;
  const fields = state?.fields || {};
  panel.innerHTML = staffUserPanelMarkup(detail);
  panel.querySelectorAll('details[data-staff-group]').forEach((group) => {
    group.open = (state?.openGroups || []).includes(group.dataset.staffGroup);
  });
  const reason = panel.querySelector('[data-staff-field="reason"]');
  const duration = panel.querySelector('[data-staff-field="duration"]');
  const ipBan = panel.querySelector('[data-staff-field="ipBan"]');
  if (reason && fields.reason) reason.value = fields.reason;
  if (duration && fields.durationDays) duration.value = fields.durationDays;
  if (ipBan) ipBan.checked = fields.ipBan === true;
  panel.scrollTop = state?.scrollTop || 0;
}

async function openStaffUser(userId) {
  const nextId = String(userId || '');
  if (staffMessagesState?.targetId !== nextId) staffMessagesState = null;
  selectedStaffUserId = nextId;
  staffTab = 'users';
  staffUserDetail = staffUserDetail?.user?.id === selectedStaffUserId
    || staffUserDetail?.user?.discordId === selectedStaffUserId
    ? staffUserDetail
    : null;
  renderStaffDashboard();
  await loadStaffUserDetail(selectedStaffUserId);
}

function staffActionTargetId(fallback = selectedStaffUserId) {
  const panelTarget = document.querySelector('[data-staff-user-panel] [data-staff-target-id]')?.dataset?.staffTargetId;
  if (panelTarget && (/^\d{16,22}$/.test(panelTarget) || /^biz_/i.test(panelTarget))) return String(panelTarget);
  const detail = staffUserDetail?.user;
  if (detail?.discordId && /^\d{16,22}$/.test(String(detail.discordId))) return String(detail.discordId);
  if (detail?.id && (/^\d{16,22}$/.test(String(detail.id)) || /^biz_/i.test(String(detail.id)))) return String(detail.id);
  if (fallback && (/^\d{16,22}$/.test(String(fallback)) || /^biz_/i.test(String(fallback)) || /^u1_/.test(String(fallback)))) {
    return String(fallback);
  }
  return String(fallback || '');
}

function setStaffTogglePending(button, turningOn) {
  if (!button?.classList?.contains('staff-toggle')) return;
  button.classList.toggle('on', turningOn);
  button.setAttribute('aria-checked', turningOn ? 'true' : 'false');
  const small = button.querySelector('small');
  if (small) small.textContent = turningOn ? 'Active' : 'Off';
  button.dataset.staffUserAction = turningOn
    ? (button.dataset.staffToggleOff || button.dataset.staffUserAction)
    : (button.dataset.staffToggleOn || button.dataset.staffUserAction);
}

function staffToggleFlag(staffAction) {
  switch (String(staffAction || '')) {
    case 'ban':
    case 'unban':
      return 'banned';
    case 'mute':
    case 'unmute':
      return 'muted';
    case 'verify':
    case 'unverify':
      return 'verified';
    case 'shadowban':
    case 'unshadowban':
      return 'shadowbanned';
    case 'watch':
    case 'unwatch':
      return 'watched';
    case 'lock-posts':
    case 'unlock-posts':
      return 'lockPosts';
    case 'lock-messages':
    case 'unlock-messages':
      return 'lockMessages';
    case 'lock-reels':
    case 'unlock-reels':
      return 'lockReels';
    case 'lock-profile':
    case 'unlock-profile':
      return 'lockProfile';
    default:
      return '';
  }
}

function normalizeStaffDurationDays(value) {
  if (value === 'forever' || value == null || value === '') return 'forever';
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : 'forever';
}

async function runStaffUserAction(staffAction, postId = '', sourceButton = null) {
  const targetId = staffActionTargetId();
  if (!targetId) {
    void siteAlert('Select a user before running a staff action.');
    return;
  }
  if (staffUserBusy) return;
  const panelState = staffPanelUiState();
  const fields = panelState.fields;
  const destructive = new Set(['ban', 'ip-ban', 'wipe-posts', 'wipe-reels', 'wipe-comments', 'wipe-messages', 'delete-post', 'reset-profile', 'shadowban']);
  if (destructive.has(staffAction) && !(await siteConfirm(`Run "${staffAction.replace(/-/g, ' ')}" on this account? This cannot be undone.`, 'Staff action'))) return;
  staffUserBusy = true;
  const isToggle = sourceButton?.classList?.contains('staff-toggle');
  // Prefer the visible switch state so on/off intent cannot invert if action attrs drift.
  const currentlyOn = isToggle && (
    sourceButton.getAttribute('aria-checked') === 'true'
    || sourceButton.classList.contains('on')
  );
  const turningOn = Boolean(isToggle && !currentlyOn);
  if (isToggle) setStaffTogglePending(sourceButton, turningOn);
  const status = document.querySelector('[data-staff-user-status]');
  if (status) status.textContent = 'Saving...';
  try {
    if (document.activeElement?.blur) document.activeElement.blur();
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'staff-user',
        staffAction,
        targetId,
        reason: fields.reason,
        note: staffAction === 'note' ? fields.note : fields.reason,
        durationDays: normalizeStaffDurationDays(fields.durationDays),
        ipBan: fields.ipBan,
        postId,
      }),
    });
    const result = await readApiJson(response, 'Could not update this user.');
    if (!response.ok) throw new Error(result.error || 'Could not update this user.');
    const flag = isToggle ? staffToggleFlag(staffAction) : '';
    if (flag && result?.user && (result.user[flag] === true) !== turningOn) {
      throw new Error('That switch did not stick. Pull the latest bot files and restart the bot host, then try again.');
    }
    staffUserDetail = result;
    if (result?.user?.id) selectedStaffUserId = result.user.id;
    else if (result?.user?.discordId) selectedStaffUserId = result.user.discordId;
    if (result.snapshot) moderationSnapshot = result.snapshot;
    renderStaffDashboard();
    redrawStaffUserPanel(result, panelState);
    const nextStatus = document.querySelector('[data-staff-user-status]');
    if (nextStatus) nextStatus.textContent = 'Saved.';
  } catch (error) {
    if (isToggle) setStaffTogglePending(sourceButton, currentlyOn);
    const nextStatus = document.querySelector('[data-staff-user-status]');
    if (nextStatus) nextStatus.textContent = error.message || 'Could not update this user.';
    else void siteAlert(error.message || 'Could not update this user.');
    staffUserBusy = false;
    if (selectedStaffUserId) void loadStaffUserDetail(selectedStaffUserId, true);
  } finally {
    staffUserBusy = false;
  }
}

async function runStaffWalletAdjustment(button) {
  const panel = document.querySelector('[data-staff-user-panel]');
  const userId = staffActionTargetId(panel?.querySelector('[data-staff-wallet-user]')?.dataset.staffWalletUser || selectedStaffUserId);
  const rawAmount = Number(panel?.querySelector('[data-staff-wallet-amount]')?.value);
  const note = panel?.querySelector('[data-staff-wallet-note]')?.value || '';
  const amount = button.dataset.staffWalletAdjust === 'remove' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const status = panel?.querySelector('[data-staff-wallet-status]');
  if (!userId || !Number.isSafeInteger(amount) || Math.abs(amount) < 1 || Math.abs(amount) > 1000000) {
    if (status) status.textContent = 'Enter an amount between 1 and 1,000,000.';
    return;
  }
  if (amount < 0 && !(await siteConfirm(`Remove C$${Math.abs(amount).toLocaleString()} from this member?`, 'Remove credits'))) return;
  if (status) status.textContent = 'Saving...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staff-wallet', targetId: userId, amount, note }) });
    const result = await readApiJson(response, 'Could not update this wallet.');
    if (!response.ok) throw new Error(result.error || 'Could not update this wallet.');
    staffUserDetail = result;
    if (result?.user?.id) selectedStaffUserId = result.user.id;
    if (result.snapshot) moderationSnapshot = result.snapshot;
    renderStaffDashboard();
    redrawStaffUserPanel(result, staffPanelUiState());
    document.querySelector('[data-staff-wallet-status]')?.replaceChildren(document.createTextNode(`Saved ${amount > 0 ? 'C$' : '-C$'}${Math.abs(result.applied ?? amount).toLocaleString()}.`));
  } catch (error) {
    if (status) status.textContent = error.message || 'Could not update this wallet.';
  }
}

async function runStaffSiteAction(staffAction, enabled, banner) {
  if (staffAction === 'clear-ip-bans' && !(await siteConfirm('Clear every hashed network ban?', 'Clear network bans'))) return;
  if (staffAction === 'clear-site-banner' && !(await siteConfirm('Take down the live site banner?', 'Take down banner'))) return;
  const status = document.querySelector('[data-staff-site-status]');
  if (status) status.textContent = 'Saving...';
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staff-site', staffAction, enabled, banner }),
    });
    const result = await readApiJson(response, 'Could not update site controls.');
    if (!response.ok) throw new Error(result.error || 'Could not update site controls.');
    if (result.snapshot) moderationSnapshot = result.snapshot;
    if (result.settings?.siteBanner !== undefined || staffAction === 'set-site-banner' || staffAction === 'clear-site-banner') {
      applySiteBanner(result.settings?.siteBanner || result.snapshot?.settings?.siteBanner || null, true);
    }
    renderStaffDashboard();
    const nextStatus = document.querySelector('[data-staff-site-status]');
    if (nextStatus) nextStatus.textContent = 'Saved.';
  } catch (error) {
    const nextStatus = document.querySelector('[data-staff-site-status]');
    if (nextStatus) nextStatus.textContent = error.message || 'Could not update site controls.';
    else void siteAlert(error.message || 'Could not update site controls.');
  }
}

function siteBannerDismissedId() {
  try { return localStorage.getItem('cw-site-banner-dismissed') || ''; } catch { return ''; }
}

function dismissSiteBanner(id) {
  try { if (id) localStorage.setItem('cw-site-banner-dismissed', String(id)); } catch { /* ignore */ }
  applySiteBanner(null, false);
}

function applySiteBanner(banner, forceShow = false) {
  const root = document.querySelector('[data-site-banner]');
  if (!root) return;
  const message = document.querySelector('[data-site-banner-message]');
  const details = document.querySelector('[data-site-banner-details]');
  const link = document.querySelector('[data-site-banner-link]');
  const active = banner && banner.message && (forceShow || siteBannerDismissedId() !== String(banner.id || ''));
  if (!active) {
    root.hidden = true;
    document.body.classList.remove('has-site-banner');
    document.body.style.removeProperty('--site-banner-height');
    syncTopBannerOffset();
    return;
  }
  if (message) message.textContent = banner.message;
  if (details) {
    const detailText = String(banner.details || '').trim();
    // Keep linked banners (like maintenance + status) to one clean line.
    details.textContent = detailText;
    details.hidden = !detailText || Boolean(banner.linkUrl);
  }
  if (link) {
    if (banner.linkUrl) {
      link.hidden = false;
      link.href = banner.linkUrl;
      link.textContent = banner.linkLabel || 'Learn more';
    } else {
      link.hidden = true;
      link.removeAttribute('href');
    }
  }
  root.dataset.bannerId = String(banner.id || '');
  root.hidden = false;
  document.body.classList.add('has-site-banner');
  requestAnimationFrame(() => {
    document.body.style.setProperty('--site-banner-height', `${Math.max(36, root.offsetHeight)}px`);
    syncTopBannerOffset();
  });
}

function officialPostBannerDismissedId() {
  try { return localStorage.getItem('cw-official-post-banner-dismissed') || ''; } catch { return ''; }
}

function dismissOfficialPostBanner(id) {
  try { if (id) localStorage.setItem('cw-official-post-banner-dismissed', String(id)); } catch { /* ignore */ }
  applyOfficialPostBanner(null, false);
}

function syncTopBannerOffset() {
  const official = document.querySelector('[data-official-post-banner]');
  const site = document.querySelector('[data-site-banner]');
  const officialHeight = official && !official.hidden ? Math.max(36, official.offsetHeight) : 0;
  const siteHeight = site && !site.hidden ? Math.max(36, site.offsetHeight) : 0;
  if (officialHeight) document.body.style.setProperty('--official-post-banner-height', `${officialHeight}px`);
  else document.body.style.removeProperty('--official-post-banner-height');
  if (siteHeight) document.body.style.setProperty('--site-banner-height', `${siteHeight}px`);
  else document.body.style.removeProperty('--site-banner-height');
  document.body.style.setProperty('--top-banner-stack', `${officialHeight + siteHeight}px`);
}

function applyOfficialPostBanner(banner, forceShow = false) {
  const root = document.querySelector('[data-official-post-banner]');
  if (!root) return;
  const message = document.querySelector('[data-official-post-banner-message]');
  const link = document.querySelector('[data-official-post-banner-link]');
  const openBtn = document.querySelector('[data-official-post-banner-open]');
  const expiresAt = banner?.expiresAt ? new Date(banner.expiresAt).getTime() : 0;
  const stillLive = Number.isFinite(expiresAt) && expiresAt > Date.now();
  const active = banner
    && banner.postId
    && banner.message
    && stillLive
    && (forceShow || officialPostBannerDismissedId() !== String(banner.id || ''));
  if (!active) {
    root.hidden = true;
    root.dataset.postId = '';
    root.dataset.bannerId = '';
    document.body.classList.remove('has-official-post-banner');
    syncTopBannerOffset();
    return;
  }
  if (message) message.textContent = banner.message;
  if (link) link.textContent = banner.linkLabel || 'View post';
  if (openBtn) openBtn.setAttribute('aria-label', `${banner.message}. ${banner.linkLabel || 'View post'}`);
  root.dataset.postId = String(banner.postId || '');
  root.dataset.bannerId = String(banner.id || '');
  root.hidden = false;
  document.body.classList.add('has-official-post-banner');
  requestAnimationFrame(syncTopBannerOffset);
  const remaining = Math.max(1_000, expiresAt - Date.now());
  window.clearTimeout(applyOfficialPostBanner._timer);
  applyOfficialPostBanner._timer = window.setTimeout(() => {
    applyOfficialPostBanner(null, false);
  }, remaining + 250);
}

function formatCredits(value) {
  const amount = Math.trunc(Number(value) || 0);
  if (amount < 0) return `−C$${Math.abs(amount).toLocaleString()} debt`;
  return `C$${amount.toLocaleString()}`;
}

const CREDIT_STORE_PACKS = Object.freeze([
  {
    id: '109005087621617',
    assetId: '109005087621617',
    robux: 500,
    credits: 1000,
    label: 'Starter pack',
    url: 'https://www.roblox.com/catalog/109005087621617',
  },
  {
    id: '123843071072106',
    assetId: '123843071072106',
    robux: 1000,
    credits: 2200,
    label: 'Boost pack',
    url: 'https://www.roblox.com/catalog/123843071072106',
  },
  {
    id: '85562318217896',
    assetId: '85562318217896',
    robux: 1500,
    credits: 2750,
    label: 'Plus pack',
    url: 'https://www.roblox.com/catalog/85562318217896',
  },
  {
    id: '116068796281105',
    assetId: '116068796281105',
    robux: 2000,
    credits: 3400,
    label: 'City pack',
    url: 'https://www.roblox.com/catalog/116068796281105',
  },
]);

let robloxStoreLinked = false;
let robloxStoreSyncing = false;
let robloxStoreWatching = false;

function renderWalletStore(options = {}) {
  const root = document.querySelector('[data-wallet-store]');
  const status = document.querySelector('[data-wallet-store-status]');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const claim = params.get('robloxClaim');
  if (claim === 'ok' || claim === 'none') robloxStoreLinked = true;
  if (options.linked != null) robloxStoreLinked = Boolean(options.linked);

  root.innerHTML = `${CREDIT_STORE_PACKS.map((pack) => `
    <article class="wallet-store-pack">
      <div class="wallet-store-pack-copy">
        <strong>${formatCredits(pack.credits)}</strong>
        <span>${escapeHtml(pack.label)}</span>
        <small>R$${Number(pack.robux).toLocaleString()} on Roblox</small>
      </div>
      <a class="wallet-store-buy" href="${escapeHtml(pack.url)}" target="_blank" rel="noopener noreferrer" data-roblox-buy>Buy on Roblox</a>
    </article>
  `).join('')}
  ${robloxStoreLinked ? '' : `
  <div class="wallet-store-claim">
    <a class="wallet-store-claim-btn" href="/api/auth/roblox?next=${encodeURIComponent('/internet/wallet?market=1')}">Link Roblox</a>
    <p>Link once so purchases credit this wallet automatically and show in Transactions.</p>
  </div>`}`;

  root.querySelectorAll('[data-roblox-buy]').forEach((link) => {
    link.addEventListener('click', () => {
      if (!robloxStoreLinked) return;
      watchRobloxPurchaseReturn();
    });
  });

  if (!status) return;

  if (options.statusText) {
    status.dataset.tone = options.statusTone || 'wait';
    status.textContent = options.statusText;
    return;
  }

  if (claim === 'ok') {
    status.dataset.tone = 'ok';
    status.textContent = `Added ${formatCredits(params.get('credits') || 0)} from Roblox${params.get('packs') ? ` (${params.get('packs')} pack${params.get('packs') === '1' ? '' : 's'})` : ''}.`;
  } else if (claim === 'none') {
    status.dataset.tone = 'wait';
    status.textContent = 'Roblox linked. Buy a pack, then return here — credits add automatically.';
  } else if (claim === 'inventory') {
    status.dataset.tone = 'error';
    status.textContent = 'Could not read your Roblox inventory. Link again and allow inventory access.';
  } else if (claim === 'config') {
    status.dataset.tone = 'error';
    status.textContent = 'Roblox credit store is not configured on the website yet.';
  } else if (claim === 'error' || claim === 'denied') {
    status.dataset.tone = 'error';
    status.textContent = 'Roblox verification failed. Try linking again.';
  } else if (robloxStoreLinked) {
    status.dataset.tone = 'wait';
    status.textContent = 'Roblox linked. Buy a pack, then return here — credits add automatically.';
  } else {
    status.dataset.tone = 'wait';
    status.textContent = 'Link Roblox once. After that, purchases credit this wallet automatically.';
  }

  if (claim) {
    const clean = new URL(window.location.href);
    ['robloxClaim', 'credits', 'packs'].forEach((key) => clean.searchParams.delete(key));
    history.replaceState({}, '', `${clean.pathname}${clean.search}${clean.hash}`);
  }
}

async function syncRobloxPurchases({ silent = false } = {}) {
  if (!currentUserId || robloxStoreSyncing) return null;
  robloxStoreSyncing = true;
  const status = document.querySelector('[data-wallet-store-status]');
  if (!silent && status) {
    status.dataset.tone = 'wait';
    status.textContent = 'Checking Roblox purchases…';
  }
  try {
    const response = await fetch('/api/auth/roblox/sync', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (result.needsAuth || result.linked === false) {
      robloxStoreLinked = false;
      renderWalletStore({
        linked: false,
        statusText: silent ? undefined : 'Link Roblox once. After that, purchases credit this wallet automatically.',
        statusTone: 'wait',
      });
      return result;
    }

    robloxStoreLinked = true;
    const granted = Number(result.grantedCredits) || 0;
    if (result.wallet) renderWallet(result.wallet);
    else if (granted > 0) await loadWallet();

    renderWalletStore({
      linked: true,
      statusText: granted > 0
        ? `Added ${formatCredits(granted)} from Roblox${result.grantedPacks ? ` (${result.grantedPacks} pack${result.grantedPacks === 1 ? '' : 's'})` : ''}.`
        : (result.robloxUsername
          ? `Linked as ${result.robloxUsername}. New purchases credit this wallet automatically.`
          : 'Roblox linked. Buy a pack, then return here — credits add automatically.'),
      statusTone: granted > 0 ? 'ok' : 'wait',
    });
    return result;
  } catch {
    if (!silent && status) {
      status.dataset.tone = 'error';
      status.textContent = 'Could not check Roblox purchases right now.';
    }
    return null;
  } finally {
    robloxStoreSyncing = false;
  }
}

function watchRobloxPurchaseReturn() {
  if (robloxStoreWatching) return;
  robloxStoreWatching = true;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    robloxStoreWatching = false;
    void syncRobloxPurchases({ silent: false });
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
}

function maybeStartRobloxClaim() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('claimRoblox') !== '1') return;
  if (!currentUserId) return;
  const clean = new URL(window.location.href);
  clean.searchParams.delete('claimRoblox');
  history.replaceState({}, '', `${clean.pathname}${clean.search}${clean.hash}`);
  window.location.href = `/api/auth/roblox?next=${encodeURIComponent('/internet/wallet?market=1')}`;
}

function maybeOpenWalletHubs() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('robloxClaim') || params.get('market') === '1') {
    setWalletTab('market');
    if (params.get('market') === '1') {
      const clean = new URL(window.location.href);
      clean.searchParams.delete('market');
      history.replaceState({}, '', `${clean.pathname}${clean.search}${clean.hash}`);
    }
    if (params.get('robloxClaim') === 'ok' || params.get('robloxClaim') === 'none') {
      robloxStoreLinked = true;
    }
  }
}

function setWalletTab(tab = 'home') {
  const allowed = new Set(['home', 'advertise', 'market', 'levels', 'transfer']);
  const next = allowed.has(tab) ? tab : 'home';
  document.querySelectorAll('[data-wallet-tab]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.walletTab === next);
  });
  document.querySelectorAll('[data-wallet-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.walletPanel !== next;
  });
  if (next === 'advertise') {
    syncAdPlacementUi();
    syncAdBoostLabels();
    renderMyAds(myAds);
  }
  if (next === 'market') {
    renderWalletStore();
    void syncRobloxPurchases({ silent: true }).then((result) => {
      if (!result) return;
      if (result.needsAuth) renderWalletStore({ linked: false });
    });
  }
}

function walletClaimCopy(wallet) {
  if (wallet?.claimedNow) {
    const label = wallet.dailyLabel && wallet.dailyLabel !== 'Member' ? ` · ${wallet.dailyLabel}` : '';
    return `Collected ${formatCredits(wallet.dailyAmount || 75)}${label} for this drop.`;
  }
  const next = wallet?.nextClaimAt || wallet?.nextDailyAt;
  const nextAt = next ? new Date(next).getTime() : 0;
  if (!nextAt) return `Your next ${formatCredits(wallet?.dailyAmount || 75)} daily credit will be added automatically.`;
  const remaining = Math.max(0, nextAt - Date.now());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000));
  return hours >= 1
    ? `Next ${formatCredits(wallet?.dailyAmount || 75)} drop in ${hours}h ${minutes}m.`
    : `Next ${formatCredits(wallet?.dailyAmount || 75)} drop in ${minutes}m.`;
}

function renderWalletBoost(wallet) {
  const boost = wallet?.chatBoost || {};
  const level = document.querySelector('[data-wallet-boost-level]');
  const rate = document.querySelector('[data-wallet-boost-rate]');
  const fill = document.querySelector('[data-wallet-boost-fill]');
  const track = document.querySelector('[data-wallet-boost-track]');
  const next = document.querySelector('[data-wallet-boost-next]');
  const copy = document.querySelector('[data-wallet-boost-copy]');
  const perks = document.querySelector('[data-wallet-boost-perks]');
  const earnings = document.querySelector('[data-wallet-earnings]');
  const percent = Math.round(Math.max(0, Math.min(1, Number(boost.progress) || 0)) * 100);
  const chatDaily = Number(wallet?.chatDaily ?? boost.daily ?? 75);
  const totalDaily = Number(wallet?.dailyAmount || chatDaily);
  const roleExtra = Number(wallet?.roleExtra || 0);
  const roleLabel = wallet?.roleLabel || '';
  if (level) {
    level.textContent = `Level ${Number(boost.level) || 0}`;
  }
  if (rate) rate.textContent = `${formatCredits(totalDaily)} / day`;
  if (fill) fill.style.width = `${percent}%`;
  if (track) {
    track.setAttribute('aria-valuenow', String(percent));
    track.setAttribute('aria-label', `Daily chat level progress ${percent}%`);
  }
  if (copy) {
    copy.textContent = 'Send messages and posts to climb Level 1–5 and raise your daily drop.';
  }
  if (next) {
    next.textContent = boost.maxLevel
      ? `Max level · ${Number(boost.messages || 0).toLocaleString()} chats counted.`
      : `${Number(boost.messages || 0).toLocaleString()} / ${Number(boost.nextMessages || 0).toLocaleString()} chats to Level ${boost.nextLevel} (${formatCredits(boost.nextDaily || 0)}/day).`;
  }
  if (earnings) {
    earnings.hidden = false;
    if (roleExtra > 0 && roleLabel) {
      earnings.textContent = `You'll make ${formatCredits(totalDaily)}/day — ${formatCredits(chatDaily)} from chat + ${formatCredits(roleExtra)} extra from ${roleLabel}.`;
    } else if (roleLabel && Number(wallet?.roleAmount || 0) > 0) {
      earnings.textContent = `You'll make ${formatCredits(totalDaily)}/day from your chat level. Your ${roleLabel} role is at or below that.`;
    } else {
      earnings.textContent = `You'll make ${formatCredits(totalDaily)}/day from your current chat level.`;
    }
  }
  if (perks) {
    const levels = (Array.isArray(boost.levels) ? boost.levels : []).filter((entry) => Number(entry.level) >= 1);
    perks.innerHTML = levels.length
      ? levels.map((entry) => {
        const current = Number(entry.level) === Number(boost.level);
        return `<span class="${current ? 'current' : ''}">Level ${entry.level} — ${Number(entry.messages || 0).toLocaleString()} chats · ${formatCredits(entry.daily)}/day</span>`;
      }).join('')
      : '';
  }
}

function renderWalletPending(transfers = []) {
  const pending = document.querySelector('[data-wallet-pending]');
  if (!pending) return;
  if (!transfers.length) {
    pending.hidden = true;
    pending.innerHTML = '';
    return;
  }
  pending.hidden = false;
  pending.innerHTML = `<h3>Pending</h3>${transfers.map((transfer) => {
    const otherId = transfer.fromId === activeUserId() ? transfer.toId : transfer.fromId;
    const other = internetUsers.get(otherId);
    const name = other?.displayName || other?.username || 'member';
    const label = transfer.type === 'send'
      ? (transfer.actionable ? `${escapeHtml(name)} is sending you` : `Waiting on ${escapeHtml(name)} for`)
      : (transfer.actionable ? `${escapeHtml(name)} requested` : `Requested from ${escapeHtml(name)}`);
    const actions = transfer.actionable
      ? `<span class="wallet-pending-actions"><button type="button" data-wallet-transfer-respond="accept" data-transfer-id="${escapeHtml(transfer.id)}">Accept</button><button type="button" class="ghost" data-wallet-transfer-respond="decline" data-transfer-id="${escapeHtml(transfer.id)}">Decline</button></span>`
      : '';
    return `<article class="wallet-pending-item"><div><b>${label} ${escapeHtml(formatCredits(transfer.amount))}</b><small>${escapeHtml(transfer.note || timeAgo(transfer.createdAt))} · expires in 24h</small></div>${actions}</article>`;
  }).join('')}`;
}

function setWalletTransferTab(type) {
  walletTransferType = type === 'request' ? 'request' : 'send';
  document.querySelectorAll('[data-wallet-transfer-tab]').forEach((button) => {
    const selected = button.dataset.walletTransferTab === walletTransferType;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  const submit = document.querySelector('[data-wallet-transfer-submit]');
  if (submit) submit.textContent = walletTransferType === 'request' ? 'Request credits' : 'Send credits';
}

function selectWalletTransferTarget(user) {
  walletTransferTarget = user || null;
  const selected = document.querySelector('[data-wallet-transfer-selected]');
  const hidden = document.querySelector('[data-wallet-transfer-target]');
  const results = document.querySelector('[data-wallet-transfer-results]');
  if (hidden) hidden.value = user?.id || '';
  if (results) { results.hidden = true; results.innerHTML = ''; }
  if (!selected) return;
  if (!user) {
    selected.hidden = true;
    selected.innerHTML = '';
    return;
  }
  selected.hidden = false;
  selected.innerHTML = `To <b>${escapeHtml(user.displayName || 'member')}</b> <small>@${escapeHtml(user.username || 'member')}</small> <button type="button" data-wallet-transfer-clear>Change</button>`;
}

function renderWalletTransferResults(query = '') {
  const results = document.querySelector('[data-wallet-transfer-results]');
  if (!results) return;
  const needle = String(query || '').trim().toLowerCase().replace(/^@/, '');
  if (!needle) {
    results.hidden = true;
    results.innerHTML = '';
    return;
  }
  const users = [...internetUsers.values()]
    .filter((user) => user.id !== activeUserId() && !user.official && `${user.displayName || ''} ${user.username || ''}`.toLowerCase().includes(needle))
    .slice(0, 8);
  results.hidden = false;
  results.innerHTML = users.length
    ? users.map((user) => `<button type="button" data-wallet-transfer-pick="${escapeHtml(user.id)}"><img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(user.displayName || 'Member')}</b><small>@${escapeHtml(user.username || 'member')}</small></span></button>`).join('')
    : '<p>No members found.</p>';
}

function adStatusLabel(status) {
  if (status === 'pending') return 'Awaiting staff review';
  if (status === 'active') return 'Running';
  if (status === 'denied') return 'Denied · refunded';
  if (status === 'expired') return 'Ended';
  return status || 'Unknown';
}

function whoToFollowCandidates(limit = 3) {
  const me = activeUserId();
  const following = new Set(socialState.following || []);
  const blocked = new Set([...(socialState.blocked || []), ...(socialState.muted || [])]);
  return [...internetUsers.values()]
    .filter((user) => {
      if (!user?.id || user.id === me) return false;
      if (user.banned || user.deactivated || user.bank) return false;
      if (following.has(user.id) || blocked.has(user.id)) return false;
      return Boolean(user.username || user.displayName);
    })
    .sort((left, right) => {
      const score = (user) => (
        (user.official ? 1000 : 0)
        + (user.verified ? 200 : 0)
        + (user.staffRank ? 120 : 0)
        + (Number(user.followerCount) || 0)
        + (Array.isArray(user.badges) && user.badges.includes('business') ? 40 : 0)
      );
      return score(right) - score(left)
        || String(left.displayName || '').localeCompare(String(right.displayName || ''));
    })
    .slice(0, limit);
}

function renderWhoToFollow() {
  const panel = document.querySelector('[data-who-to-follow]');
  const list = document.querySelector('[data-who-to-follow-list]');
  if (!panel || !list) return;
  if (isVisibleReelsTab()) {
    panel.hidden = true;
    return;
  }
  if (!currentUserId) {
    panel.hidden = true;
    return;
  }
  const people = whoToFollowCandidates(3);
  panel.hidden = false;
  if (!people.length) {
    list.innerHTML = '<p class="who-to-follow-empty">You’re caught up. Follow people from search or profiles.</p>';
    return;
  }
  list.innerHTML = people.map((user) => {
    const following = socialState.following.includes(user.id);
    const handle = user.username ? `@${user.username}` : 'Clearwater member';
    return `<div class="who-to-follow-row">
      <button type="button" class="who-to-follow-avatar" data-open-member="${escapeHtml(user.id)}" aria-label="Open ${escapeHtml(user.displayName || 'member')}">
        <img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" />
      </button>
      <button type="button" class="who-to-follow-copy" data-open-member="${escapeHtml(user.id)}">
        <b>${escapeHtml(user.displayName || 'Clearwater member')}${identityBadges(user)}</b>
        <small>${escapeHtml(handle)}${user.staffRank ? ` · ${escapeHtml(user.staffRank)}` : ''}</small>
      </button>
      <button type="button" class="who-to-follow-action${following ? ' following' : ''}" data-who-follow="${escapeHtml(user.id)}" aria-pressed="${following ? 'true' : 'false'}">${following ? 'Following' : 'Follow'}</button>
    </div>`;
  }).join('');
}

function whoToWatchCandidates(limit = 3) {
  const me = activeUserId();
  const blocked = new Set([...(socialState.blocked || []), ...(socialState.muted || [])]);
  const reels = allPosts.filter((post) => (
    post.kind === 'reel'
    && !post.parentId
    && post.authorId
    && !blocked.has(post.authorId)
    && (post.videoUrl || post.imageUrl || (Array.isArray(post.slideshowUrls) && post.slideshowUrls.length))
  ));
  if (!reels.length) return [];
  const others = [];
  const mine = [];
  for (const reel of reels) {
    if (reel.authorId === me) mine.push(reel);
    else others.push(reel);
  }
  const ordered = [...others, ...mine];
  const picked = [];
  const seenAuthors = new Set();
  const skipActive = ordered.length > 1;
  for (const reel of ordered) {
    if (picked.length >= limit) break;
    if (skipActive && activeReelId && reel.id === activeReelId) continue;
    if (seenAuthors.has(reel.authorId)) continue;
    seenAuthors.add(reel.authorId);
    picked.push(reel);
  }
  for (const reel of ordered) {
    if (picked.length >= limit) break;
    if (picked.some((item) => item.id === reel.id)) continue;
    if (skipActive && activeReelId && reel.id === activeReelId && picked.length) continue;
    picked.push(reel);
  }
  if (!picked.length && ordered.length) return ordered.slice(0, limit);
  return picked;
}

function reelWatchThumbMarkup(reel) {
  if (reel.videoUrl) {
    return `<video src="${escapeHtml(reelMediaProxyUrl(reel.id, 'video'))}" muted playsinline preload="metadata"></video>`;
  }
  const slides = Array.isArray(reel.slideshowUrls) ? reel.slideshowUrls.filter(Boolean) : [];
  const imageSrc = slides.length || reel.imageUrl
    ? reelMediaProxyUrl(reel.id, 'image', 0)
    : '';
  if (imageSrc) return `<img src="${escapeHtml(imageSrc)}" alt="" loading="lazy" decoding="async" />`;
  return `<img src="assets/clearwater-logo.png" alt="" />`;
}

function renderWhoToWatch() {
  const panel = document.querySelector('[data-who-to-watch]');
  const list = document.querySelector('[data-who-to-watch-list]');
  if (!panel || !list) return;
  if (!isVisibleReelsTab()) {
    panel.hidden = true;
    return;
  }
  const reels = whoToWatchCandidates(3);
  panel.hidden = false;
  if (!reels.length) {
    list.innerHTML = '<p class="who-to-watch-empty">No Reels to watch yet. Be the first to post one.</p>';
    return;
  }
  list.innerHTML = reels.map((reel) => {
    const author = internetUsers.get(reel.authorId) || {};
    const displayName = author.displayName || reel.displayName || reel.username || 'member';
    const username = author.username || reel.username || 'member';
    const caption = String(reel.content || '').trim();
    const subtitle = caption || `@${username}`;
    const isVideo = Boolean(reel.videoUrl);
    return `<div class="who-to-watch-row">
      <button type="button" class="who-to-watch-thumb" data-open-reel="${escapeHtml(reel.id)}" aria-label="Watch Reel by ${escapeHtml(displayName)}">
        ${reelWatchThumbMarkup(reel)}
      </button>
      <button type="button" class="who-to-watch-copy" data-open-reel="${escapeHtml(reel.id)}">
        <b>${escapeHtml(displayName)}${identityBadges(author.id ? author : { ...reel, id: reel.authorId })}</b>
        <small>${escapeHtml(subtitle)}${isVideo ? ' · Video' : ''}</small>
      </button>
      <button type="button" class="who-to-watch-action" data-open-reel="${escapeHtml(reel.id)}">Watch</button>
    </div>`;
  }).join('');
}

function renderSideSuggestions() {
  renderWhoToFollow();
  renderWhoToWatch();
}

function adPlacementLabel(placement) {
  if (placement === 'feed') return 'Feed';
  if (placement === 'reel') return 'Reels';
  return 'Sidebar';
}

function findCachedAd(adId = '') {
  const id = String(adId || '');
  if (!id) return null;
  return sidebarAds.find((item) => item.id === id)
    || feedAds.find((item) => item.id === id)
    || reelAds.find((item) => item.id === id)
    || myAds.find((item) => item.id === id)
    || null;
}

function adBrandLogoUrl(ad) {
  const custom = safeImageUrl(ad?.logoUrl);
  return custom || 'assets/clearwater-logo.png';
}

function sponsoredFeedMarkup(ad) {
  if (!ad) return '';
  const media = safeVideoUrl(ad.videoUrl)
    ? `<video class="sponsored-feed-media" src="${escapeHtml(ad.videoUrl)}" muted loop playsinline autoplay></video>`
    : (safeImageUrl(ad.imageUrl) ? `<img class="sponsored-feed-media" src="${escapeHtml(ad.imageUrl)}" alt="" />` : '');
  return `<article class="post sponsored-feed-card" data-sponsored-feed-id="${escapeHtml(ad.id)}">
    <div class="post-layout">
      <img class="post-avatar" src="${escapeHtml(adBrandLogoUrl(ad))}" alt="" />
      <div class="post-main">
        <div class="post-top">
          <div class="post-author sponsored-feed-author">
            <span class="post-name">${escapeHtml(ad.businessName || 'Clearwater Ads')}</span>
            <span class="sponsored-pill">Sponsored</span>
          </div>
        </div>
        ${media}
        <h3 class="sponsored-feed-title">${escapeHtml(ad.title)}</h3>
        <p class="post-content">${escapeHtml(ad.body)}</p>
        <div class="sponsored-feed-actions">
          <a class="sidebar-ad-promo-btn" href="${escapeHtml(internetUrl('sponsored', ad.id))}" data-open-sponsored="${escapeHtml(ad.id)}">Learn</a>
          <button type="button" class="sidebar-ad-promo-btn sidebar-ad-promo-btn-secondary" data-open-ad-account data-ad-id="${escapeHtml(ad.id)}" data-ad-advertiser-id="${escapeHtml(ad.advertiserId || '')}" data-ad-advertiser-username="${escapeHtml(ad.advertiserUsername || '')}" data-ad-advertiser-name="${escapeHtml(ad.advertiserName || '')}">Account</button>
        </div>
      </div>
    </div>
  </article>`;
}

function sponsoredReelMarkup(ad) {
  if (!ad) return '';
  const media = safeVideoUrl(ad.videoUrl)
    ? `<video src="${escapeHtml(ad.videoUrl)}" loop muted playsinline webkit-playsinline preload="auto" autoplay></video>`
    : (safeImageUrl(ad.imageUrl) ? `<img src="${escapeHtml(ad.imageUrl)}" alt="" />` : '<p class="reel-missing">This sponsored Reel could not be loaded.</p>');
  return `<article class="reel-card reel-sponsored-card" data-sponsored-reel-id="${escapeHtml(ad.id)}">
    ${media}
    <div class="reel-gradient" aria-hidden="true"></div>
    <span class="sponsored-pill sponsored-reel-pill">Sponsored</span>
    <div class="reel-meta">
      <div class="reel-meta-user">
        <button type="button" data-open-ad-account data-ad-id="${escapeHtml(ad.id)}" data-ad-advertiser-id="${escapeHtml(ad.advertiserId || '')}" data-ad-advertiser-username="${escapeHtml(ad.advertiserUsername || '')}" data-ad-advertiser-name="${escapeHtml(ad.advertiserName || '')}">
          <img src="${escapeHtml(adBrandLogoUrl(ad))}" alt="" />
          <span class="reel-author"><b>${escapeHtml(ad.businessName || 'Clearwater Ads')}</b><small>Sponsored</small></span>
        </button>
      </div>
      <p><b>${escapeHtml(ad.title)}</b>${ad.body ? ` — ${escapeHtml(ad.body)}` : ''}</p>
    </div>
    <div class="reel-actions sponsored-reel-actions">
      <a class="sidebar-ad-promo-btn" href="${escapeHtml(internetUrl('sponsored', ad.id))}" data-open-sponsored="${escapeHtml(ad.id)}">Learn</a>
      <button type="button" class="sidebar-ad-promo-btn sidebar-ad-promo-btn-secondary" data-open-ad-account data-ad-id="${escapeHtml(ad.id)}" data-ad-advertiser-id="${escapeHtml(ad.advertiserId || '')}" data-ad-advertiser-username="${escapeHtml(ad.advertiserUsername || '')}" data-ad-advertiser-name="${escapeHtml(ad.advertiserName || '')}">Account</button>
    </div>
  </article>`;
}

function renderSidebarAds(ads = sidebarAds) {
  const list = document.querySelector('[data-sidebar-ad-list]');
  const panel = document.querySelector('[data-sidebar-ads]');
  if (!list) return;
  const items = Array.isArray(ads) ? ads.filter(Boolean) : [];
  const ad = items[0] || null;
  if (panel) panel.hidden = false;
  if (!ad) {
    list.innerHTML = `<article class="sidebar-ad-promo sidebar-ad-empty-card">
      <header class="sidebar-ad-promo-brand"><img src="assets/clearwater-logo.png" alt="" /><span>Clearwater Ads</span><i>Sponsored</i></header>
      <h3>Promote your department or business</h3>
      <p>Buy a 48-hour sidebar slot with Clearwater Credits.</p>
      <div class="sidebar-ad-promo-actions">
        <a class="sidebar-ad-promo-btn" href="/internet/sponsored" data-view-link="sponsored">Learn</a>
        <a class="sidebar-ad-promo-btn sidebar-ad-promo-btn-secondary" href="/internet/wallet" data-view-link="wallet">Advertise</a>
      </div>
    </article>`;
    return;
  }
  const media = safeVideoUrl(ad.videoUrl)
    ? `<video class="sidebar-ad-promo-media" src="${escapeHtml(ad.videoUrl)}" muted loop playsinline autoplay></video>`
    : (safeImageUrl(ad.imageUrl) ? `<img class="sidebar-ad-promo-media" src="${escapeHtml(ad.imageUrl)}" alt="" />` : '');
  list.innerHTML = `<article class="sidebar-ad-promo" data-sidebar-ad-id="${escapeHtml(ad.id)}">
    <header class="sidebar-ad-promo-brand"><img src="${escapeHtml(adBrandLogoUrl(ad))}" alt="" /><span>${escapeHtml(ad.businessName)}</span><i>Sponsored</i></header>
    ${media}
    <h3>${escapeHtml(ad.title)}</h3>
    ${ad.body ? `<p>${escapeHtml(ad.body)}</p>` : ''}
    <div class="sidebar-ad-promo-actions">
      <a class="sidebar-ad-promo-btn" href="${escapeHtml(internetUrl('sponsored', ad.id))}" data-open-sponsored="${escapeHtml(ad.id)}">Learn</a>
      <button type="button" class="sidebar-ad-promo-btn sidebar-ad-promo-btn-secondary" data-open-ad-account data-ad-id="${escapeHtml(ad.id)}" data-ad-advertiser-id="${escapeHtml(ad.advertiserId || '')}" data-ad-advertiser-username="${escapeHtml(ad.advertiserUsername || '')}" data-ad-advertiser-name="${escapeHtml(ad.advertiserName || '')}">Account</button>
    </div>
  </article>`;
}

function findInternetMember(memberId = '', username = '') {
  const id = String(memberId || '').trim();
  if (id && internetUsers.has(id)) return internetUsers.get(id);
  const byUsername = findMemberByUsername(username || memberId);
  return byUsername || null;
}

let pendingProfileUsername = '';

async function copyProfileShareLink(userOrUsername = '') {
  const url = profileShareUrl(userOrUsername);
  if (!url) {
    void siteAlert('This profile does not have a share link yet.');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    void siteAlert('Profile link copied.', 'Link copied');
  } catch {
    void siteAlert(`Copy this link: ${url}`);
  }
}

function openAdAdvertiserAccount(button) {
  const id = button?.dataset?.adAdvertiserId || '';
  const username = button?.dataset?.adAdvertiserUsername || '';
  const displayName = button?.dataset?.adAdvertiserName || '';
  const user = findInternetMember(id, username);
  if (user) {
    openMemberProfile(user.id);
    return;
  }
  if (id || username) {
    // Advertiser may not be in the current feed snapshot — still open a usable profile shell.
    const fallback = {
      id: id || `pending:${username || displayName || 'advertiser'}`,
      username: username || 'member',
      displayName: displayName || username || 'Clearwater member',
      avatarUrl: 'assets/clearwater-logo.png',
      bio: '',
      staffRank: null,
      verified: false,
      badges: [],
      following: [],
      followers: [],
      followingCount: 0,
      followerCount: 0,
    };
    internetUsers.set(fallback.id, fallback);
    openMemberProfile(fallback.id);
    return;
  }
  void siteAlert('That advertiser account is not available right now.');
}

function fillSponsoredReportForm(adId = '') {
  const route = readInternetRoute();
  const id = String(adId || route.id || '').trim();
  const input = document.querySelector('[data-sponsored-ad-id]');
  const target = document.querySelector('[data-sponsored-report-target]');
  const status = document.querySelector('[data-sponsored-report-status]');
  const ad = findCachedAd(id);
  if (input && id) input.value = id;
  if (target) {
    target.textContent = ad
      ? `Reporting “${ad.title}” from ${ad.businessName || ad.advertiserName || 'a Clearwater advertiser'}.`
      : (id
        ? 'Reporting this sponsored ad. Add a short reason for staff.'
        : 'Open Learn on a sponsored card to prefill the ad, or paste an ad ID below.');
  }
  if (status && !status.dataset.keep) status.textContent = '';
}

function showSponsoredPage(adId = '', updateRoute = true) {
  if (updateRoute) setInternetRoute('sponsored', adId || '');
  showView('sponsored');
  fillSponsoredReportForm(adId);
}

function reelMultiplierForSeconds(seconds) {
  const multipliers = adPricing.reelDurationMultipliers || {};
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return Number(multipliers.over60) || 2;
  if (s <= 15) return Number(multipliers.upTo15) || 1;
  if (s <= 30) return Number(multipliers.upTo30) || 1.25;
  if (s <= 45) return Number(multipliers.upTo45) || 1.5;
  if (s <= 60) return Number(multipliers.upTo60) || 1.75;
  return Number(multipliers.over60) || 2;
}

function estimateAdCost(boostLevel = 0, placement = adPlacement, videoSeconds = adVideoSeconds) {
  const base = Number(adPricing.base) || 1200;
  const boost = Number(adPricing.boost) || 300;
  const level = Math.min(Number(adPricing.maxBoost) || 5, Math.max(0, Number(boostLevel) || 0));
  const subtotal = base + (level * boost);
  if (placement !== 'reel') return subtotal;
  return Math.ceil(subtotal * reelMultiplierForSeconds(videoSeconds));
}

function setAdvertiseHubOpen(open = false) {
  setWalletTab(open ? 'advertise' : 'home');
}

function setMarketHubOpen(open = false) {
  setWalletTab(open ? 'market' : 'home');
}

function syncAdPlacementUi() {
  const placement = ['sidebar', 'feed', 'reel'].includes(adPlacement) ? adPlacement : 'sidebar';
  adPlacement = placement;
  document.querySelectorAll('[data-ad-placement-option]').forEach((button) => {
    const selected = button.dataset.adPlacementOption === placement;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
  const mediaLabel = document.querySelector('[data-ad-media-label]');
  const mediaHint = document.querySelector('[data-ad-media-hint]');
  const mediaInput = document.querySelector('[data-ad-media]');
  if (mediaLabel) mediaLabel.textContent = placement === 'reel' ? 'Reel video (required)' : 'Image or short video';
  if (mediaHint) mediaHint.hidden = placement !== 'reel';
  if (mediaInput) {
    mediaInput.accept = placement === 'reel'
      ? 'video/mp4,video/webm,video/quicktime'
      : 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
    mediaInput.required = placement === 'reel';
  }
  const copy = document.querySelector('[data-ad-card-copy]');
  if (copy) {
    const hours = Number(adPricing.durationHours) || 48;
    if (placement === 'reel') {
      copy.textContent = `Reel ads run ${hours} hours after approval. Base matches sidebar, then scales by video length (≤15s 1x · ≤30s 1.25x · ≤45s 1.5x · ≤60s 1.75x · longer 2x).`;
    } else if (placement === 'feed') {
      copy.textContent = `C$1,200 for ${hours} hours after staff approval. Sponsored cards appear while people scroll the feed.`;
    } else {
      copy.textContent = `C$1,200 for ${hours} hours after staff approval. Add an image or short video, and boost for more show chance.`;
    }
  }
}

function readVideoDurationSeconds(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve(0);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const finish = (seconds) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    };
    video.onloadedmetadata = () => finish(Number(video.duration) || 0);
    video.onerror = () => finish(0);
    video.src = url;
  });
}

function renderAdMediaPreview() {
  const preview = document.querySelector('[data-ad-media-preview]');
  if (!preview) return;
  if (!adMedia?.previewUrl) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  preview.hidden = false;
  preview.innerHTML = adMedia.isVideo
    ? `<video src="${escapeHtml(adMedia.previewUrl)}" muted loop playsinline controls></video><button type="button" data-remove-ad-media>Remove media</button>`
    : `<img src="${escapeHtml(adMedia.previewUrl)}" alt="Ad media preview" /><button type="button" data-remove-ad-media>Remove media</button>`;
}

function renderAdLogoPreview() {
  const preview = document.querySelector('[data-ad-logo-preview]');
  if (!preview) return;
  if (!adLogo?.previewUrl) {
    preview.hidden = true;
    preview.innerHTML = '';
    return;
  }
  preview.hidden = false;
  preview.innerHTML = `<img src="${escapeHtml(adLogo.previewUrl)}" alt="Ad logo preview" /><button type="button" data-remove-ad-logo>Remove logo</button>`;
}

async function uploadAdMedia(file, isVideo) {
  const upload = globalThis.VercelBlob?.upload;
  let blobError = '';
  if (typeof upload === 'function') {
    try {
      const safeName = String(file.name || (isVideo ? 'ad.mp4' : 'ad.jpg')).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || (isVideo ? 'ad.mp4' : 'ad.jpg');
      const blob = await upload(`ads/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/internet',
        multipart: file.size > 80_000_000,
        contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      });
      if (blob?.url) return isVideo ? { video: { url: blob.url } } : { image: { url: blob.url } };
    } catch (error) {
      blobError = String(error?.message || error || '');
      if (isVideo || file.size > SMALL_REEL_BYTES) {
        throw new Error(blobUploadFailedMessage(blobError, { large: true }));
      }
    }
  } else if (isVideo || file.size > SMALL_REEL_BYTES) {
    throw new Error('Ad video uploads need Vercel Blob storage. Use a smaller image under 3 MB, or configure Blob.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  if (isVideo) throw new Error('Short ad videos need Blob storage. Upload an image instead, or finish Blob setup.');
  if (!safeImageUrl(dataUrl)) throw new Error('Choose a supported image.');
  return { image: { dataUrl } };
}

function adRemainingCopy(ad) {
  const endsAt = ad?.endsAt ? new Date(ad.endsAt).getTime() : 0;
  if (!endsAt) return 'Running';
  const remaining = Math.max(0, endsAt - Date.now());
  if (!remaining) return 'Ending soon';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const left = hours % 24;
    return `${days}d ${left}h left`;
  }
  return hours >= 1 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

function activeMyAds(ads = myAds) {
  return (Array.isArray(ads) ? ads : []).filter((ad) => ad.status === 'active' && ad.endsAt && new Date(ad.endsAt).getTime() > Date.now());
}

function setAdWalletTab(tab = 'create') {
  const next = tab === 'analytics' ? 'analytics' : 'create';
  const hasAnalytics = activeMyAds().length > 0;
  adWalletTab = next === 'analytics' && hasAnalytics ? 'analytics' : 'create';
  const onAnalytics = adWalletTab === 'analytics';
  const tabs = document.querySelector('[data-ad-tabs]');
  if (tabs) tabs.hidden = !hasAnalytics;
  const intro = document.querySelector('[data-advertise-hub-intro]');
  if (intro) intro.hidden = onAnalytics;
  const placement = document.querySelector('[data-ad-placement]');
  if (placement) placement.hidden = onAnalytics;
  document.querySelectorAll('[data-ad-tab]').forEach((button) => {
    const selected = button.dataset.adTab === adWalletTab;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  document.querySelectorAll('[data-ad-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.adPanel !== adWalletTab;
  });
}

function renderAdAnalytics(ads = myAds) {
  const root = document.querySelector('[data-ad-analytics]');
  if (!root) return;
  const active = activeMyAds(ads);
  if (!active.length) {
    root.innerHTML = '<p class="wallet-empty">Analytics appear while your ad is running.</p>';
    return;
  }
  root.innerHTML = active.map((ad) => {
    const impressions = Number(ad.impressions) || 0;
    const clicks = Number(ad.clicks) || 0;
    const learn = Number(ad.learnClicks) || 0;
    const account = Number(ad.accountClicks) || 0;
    const rate = Number(ad.clickRate) || (impressions ? Number(((clicks / impressions) * 100).toFixed(1)) : 0);
    const perHour = Number(ad.showsPerHour) || 0;
    return `<article class="wallet-ad-analytics-card">
      <header>
        <div>
          <b>${escapeHtml(ad.title)}</b>
          <small>${escapeHtml(adPlacementLabel(ad.placement))} · ${escapeHtml(ad.businessName)} · ${escapeHtml(adRemainingCopy(ad))}${ad.weight > 1 ? ` · ${ad.weight}x chance` : ''}</small>
        </div>
      </header>
      <div class="wallet-ad-analytics-grid">
        <div><strong>${impressions.toLocaleString()}</strong><span>Impressions</span></div>
        <div><strong>${clicks.toLocaleString()}</strong><span>Clicks</span></div>
        <div><strong>${rate}%</strong><span>Click rate</span></div>
        <div><strong>${perHour.toLocaleString()}</strong><span>Shows / hour</span></div>
        <div><strong>${learn.toLocaleString()}</strong><span>Learn taps</span></div>
        <div><strong>${account.toLocaleString()}</strong><span>Account taps</span></div>
      </div>
      <p class="wallet-ad-analytics-note">${ad.lastShownAt ? `Last shown ${escapeHtml(timeAgo(ad.lastShownAt))}.` : `Waiting for the first ${escapeHtml(adPlacementLabel(ad.placement).toLowerCase())} show.`} Runs for ${Number(adPricing.durationHours) || 48} hours total.</p>
    </article>`;
  }).join('');
}

function renderMyAds(ads = myAds) {
  const root = document.querySelector('[data-ad-mine]');
  syncAdPlacementUi();
  if (root) {
    if (!ads.length) root.innerHTML = '';
    else {
      root.innerHTML = `<h3>Your ads</h3>${ads.slice(0, 8).map((ad) => `<article class="wallet-ad-row"><div><b>${escapeHtml(ad.title)}</b><small>${escapeHtml(adPlacementLabel(ad.placement))} · ${escapeHtml(ad.businessName)} · ${escapeHtml(adStatusLabel(ad.status))}${ad.weight > 1 ? ` · ${ad.weight}x chance` : ''}${ad.status === 'active' ? ` · ${escapeHtml(adRemainingCopy(ad))}` : ''}${ad.cost ? ` · C$${Number(ad.cost)}` : ''}</small></div></article>`).join('')}`;
    }
  }
  renderAdAnalytics(ads);
  const hadAnalytics = !document.querySelector('[data-ad-tabs]')?.hidden;
  setAdWalletTab(adWalletTab);
  if (!hadAnalytics && activeMyAds(ads).length) setAdWalletTab('analytics');
}

function trackAdClick(adId, kind = 'learn') {
  const id = String(adId || '');
  if (!id || !currentUserId) return;
  void fetch('/api/internet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ad-click', adId: id, kind: kind === 'account' ? 'account' : 'learn' }),
  }).then(async (response) => {
    if (!response.ok) return;
    const result = await readApiJson(response, '');
    if (result?.ok) void loadAds();
  }).catch(() => {});
}

function syncAdBoostLabels() {
  const select = document.querySelector('[data-ad-boost]');
  if (!select) return;
  [...select.options].forEach((option) => {
    const level = Number(option.value) || 0;
    const cost = estimateAdCost(level);
    const reelNote = adPlacement === 'reel' && adVideoSeconds
      ? ` · ${Math.ceil(adVideoSeconds)}s`
      : (adPlacement === 'reel' ? ' · duration TBD' : '');
    option.textContent = level
      ? `+${level} chance · C$${cost}${reelNote}`
      : `No boost · C$${cost}${reelNote}`;
  });
}

async function loadAds() {
  try {
    if (!currentUserId) {
      renderSidebarAds(sidebarAds);
      renderPosts();
      return;
    }
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ads' }) });
    const result = await readApiJson(response, 'Could not load ads.');
    if (!response.ok) throw new Error(result.error || 'Could not load ads.');
    sidebarAds = Array.isArray(result.ads) ? result.ads : [];
    feedAds = Array.isArray(result.feedAds) ? result.feedAds : [];
    reelAds = Array.isArray(result.reelAds) ? result.reelAds : [];
    myAds = Array.isArray(result.mine) ? result.mine : [];
    adBusinessAccounts = Array.isArray(result.businesses) ? result.businesses : [];
    if (result.pricing) adPricing = { ...adPricing, ...result.pricing };
    syncAdBoostLabels();
    renderAdBusinessOptions();
    renderSidebarAds(sidebarAds);
    renderMyAds(myAds);
    if (!document.querySelector('[data-view="home"]')?.hidden) renderPosts();
  } catch {
    renderSidebarAds(sidebarAds);
  }
}

function startAdRotation() {
  if (adRotateTimer) window.clearInterval(adRotateTimer);
  adRotateTimer = window.setInterval(() => { void loadAds(); }, 180_000);
}

function renderWallet(wallet) {
  if (!wallet) return;
  const balance = document.querySelector('[data-wallet-balance]');
  const status = document.querySelector('[data-wallet-claim-status]');
  const dailyCopy = document.querySelector('[data-wallet-daily-copy]');
  const count = document.querySelector('[data-wallet-transaction-count]');
  const list = document.querySelector('[data-wallet-transactions]');
  if (balance) balance.textContent = formatCredits(wallet.balance);
  document.querySelectorAll('[data-internet-cash-amount]').forEach((element) => { element.textContent = formatCredits(wallet.balance); });
  if (dailyCopy) {
    const roleExtra = Number(wallet.roleExtra || 0);
    const debtNote = wallet.inDebt || Number(wallet.balance) < 0
      ? ` You currently owe C$${Math.abs(Math.trunc(Number(wallet.balance) || 0)).toLocaleString()} in government debt — new credits pay it down first.`
      : '';
    const perk = roleExtra > 0 && wallet.roleLabel
      ? ` Chat pays ${formatCredits(wallet.chatDaily || 75)}; ${wallet.roleLabel} adds ${formatCredits(roleExtra)} extra (${formatCredits(wallet.dailyAmount || 75)} total).`
      : wallet.dailySource === 'chat'
        ? ` Your chat level pays ${formatCredits(wallet.dailyAmount || 75)}.`
        : ` Start at ${formatCredits(wallet.baseDailyAmount || 75)}; chat levels and Discord roles can raise it.`;
    dailyCopy.textContent = `You receive credits every 24 hours.${perk}${debtNote}`;
  }
  if (status) {
    status.dataset.tone = wallet.claimedNow ? 'ok' : 'wait';
    status.textContent = walletClaimCopy(wallet);
  }
  renderWalletStore();
  renderWalletBoost(wallet);
  renderWalletPending(wallet.pendingTransfers || []);
  const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
  if (count) count.textContent = String(transactions.length);
  if (list) {
    list.innerHTML = transactions.length ? transactions.map((transaction) => {
      const value = Number(transaction.amount) || 0;
      const plus = value >= 0;
      return `<article class="wallet-transaction ${plus ? 'credit' : 'debit'}"><div><b>${escapeHtml(transaction.note || (plus ? 'Credits added' : 'Credits removed'))}</b><small>${escapeHtml(timeAgo(transaction.createdAt))} · ${escapeHtml(transaction.actorName || 'Clearwater')}</small></div><strong>${plus ? '+' : '−'}${formatCredits(Math.abs(value))}</strong></article>`;
    }).join('') : '<p class="wallet-empty">No transactions yet. Your daily credits will show up here.</p>';
  }
}

async function respondWalletTransfer(transferId, decision) {
  const response = await fetch('/api/internet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'wallet-transfer-respond', transferId, decision }),
  });
  const result = await readApiJson(response, 'Could not update this transfer.');
  if (!response.ok) throw new Error(result.error || 'Could not update this transfer.');
  if (result.wallet) renderWallet(result.wallet);
  else await loadWallet();
  if (!document.querySelector('[data-view="conversation"]')?.hidden && viewedMember) void loadConversation(viewedMember);
  void loadMessages();
}

async function loadWallet() {
  const status = document.querySelector('[data-wallet-claim-status]');
  const list = document.querySelector('[data-wallet-transactions]');
  renderWalletStore();
  if (!currentUserId) {
    if (status) {
      status.dataset.tone = 'wait';
      status.textContent = 'Sign in with Discord to use Clearwater credits.';
    }
    return;
  }
  if (status) {
    status.dataset.tone = 'wait';
    status.textContent = 'Loading your wallet...';
  }
  if (list) list.innerHTML = '<p class="wallet-empty">Loading transactions...</p>';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'wallet' }) });
    const result = await readApiJson(response, 'Could not load your wallet.');
    if (!response.ok) {
      const detail = String(result.error || '');
      if (/unsupported action:\s*wallet/i.test(detail)) {
        throw new Error('Wallet is ready on the website, but the bot host still needs the latest GitHub files and a restart.');
      }
      throw new Error(detail || 'Could not load your wallet.');
    }
    renderWallet(result.wallet);
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not load your wallet.';
    }
    if (list) list.innerHTML = `<p class="wallet-empty">${escapeHtml(error.message || 'Could not load transactions.')}</p>`;
  }
}

function governmentFineCard(fine, { review = false } = {}) {
  const amount = Number(fine.amount) || 0;
  const status = String(fine.status || 'pending');
  const actions = review && status === 'pending'
    ? `<div class="government-fine-actions">
        <button type="button" class="settings-button primary" data-government-review="approve" data-fine-id="${escapeHtml(fine.id)}">Approve</button>
        <button type="button" class="settings-button ghost" data-government-review="deny" data-fine-id="${escapeHtml(fine.id)}">Deny</button>
      </div>`
    : '';
  const balanceNote = status === 'approved' && fine.balanceAfter != null
    ? `<small>Balance after fine: ${escapeHtml(formatCredits(fine.balanceAfter))}</small>`
    : '';
  return `<article class="government-fine-card status-${escapeHtml(status)}">
    <div>
      <b>${escapeHtml(fine.targetDisplayName || 'Member')} · ${escapeHtml(formatCredits(amount))}</b>
      <small>@${escapeHtml(fine.targetUsername || fine.targetId || 'member')} · ${escapeHtml(status)} · ${escapeHtml(timeAgo(fine.createdAt))}${fine.requesterName ? ` · by ${escapeHtml(fine.requesterName)}` : ''}</small>
      <p>${escapeHtml(fine.reason || 'No reason given')}</p>
      ${balanceNote}
    </div>
    ${actions}
  </article>`;
}

function renderGovernmentLists(fines = []) {
  const reviewCard = document.querySelector('[data-government-review-card]');
  const reviewList = document.querySelector('[data-government-review-list]');
  const mineList = document.querySelector('[data-government-mine-list]');
  if (reviewCard) reviewCard.hidden = !sessionCanGovernmentReview;
  const pending = fines.filter((fine) => fine.status === 'pending');
  if (reviewList) {
    const queue = sessionCanGovernmentReview ? pending : [];
    reviewList.innerHTML = queue.length
      ? queue.map((fine) => governmentFineCard(fine, { review: true })).join('')
      : '<p class="staff-empty">No pending fine requests.</p>';
  }
  if (mineList) {
    const rows = fines.filter((fine) => fine.requesterId === currentUserId).slice(0, 40);
    mineList.innerHTML = rows.length
      ? rows.map((fine) => governmentFineCard(fine)).join('')
      : '<p class="staff-empty">You have not submitted any fine requests yet.</p>';
  }
}

async function loadGovernment() {
  if (!sessionCanGovernment) return;
  const status = document.querySelector('[data-government-status]');
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'government-fines' }),
    });
    const result = await readApiJson(response, 'Could not load government fines.');
    if (!response.ok) {
      const detail = String(result.error || '');
      if (/unsupported action/i.test(detail)) {
        throw new Error('Government tools need the latest bot host files and a restart.');
      }
      throw new Error(detail || 'Could not load government fines.');
    }
    if (typeof result.governmentReview === 'boolean') sessionCanGovernmentReview = result.governmentReview;
    renderGovernmentLists(result.fines || result.pending || []);
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not load government tools.';
    }
  }
}

async function submitGovernmentFineRequest(event) {
  event.preventDefault();
  if (!sessionCanGovernment) return;
  const status = document.querySelector('[data-government-status]');
  const button = document.querySelector('[data-government-submit]');
  const targetId = String(document.querySelector('[data-government-target-id]')?.value || '').trim();
  const targetUsername = String(document.querySelector('[data-government-target-username]')?.value || '').trim();
  const amount = Number(document.querySelector('[data-government-amount]')?.value || 0);
  const reason = String(document.querySelector('[data-government-reason]')?.value || '').trim();
  if (button) button.disabled = true;
  if (status) {
    status.dataset.tone = 'wait';
    status.textContent = 'Submitting fine request...';
  }
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'government-fine-request',
        targetId,
        targetUsername,
        amount,
        reason,
      }),
    });
    const result = await readApiJson(response, 'Could not submit this fine request.');
    if (!response.ok) throw new Error(result.error || 'Could not submit this fine request.');
    if (status) {
      status.dataset.tone = 'ok';
      status.textContent = 'Fine request submitted for review.';
    }
    document.querySelector('[data-government-fine-form]')?.reset();
    renderGovernmentLists(result.fines || []);
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not submit this fine request.';
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function reviewGovernmentFineRequest(fineId, decision) {
  if (!sessionCanGovernmentReview || !fineId) return;
  const label = decision === 'approve' ? 'Approve this fine and charge the member?' : 'Deny this fine request?';
  if (!(await siteConfirm(label, decision === 'approve' ? 'Approve fine' : 'Deny fine'))) return;
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'government-fine-review', fineId, decision }),
    });
    const result = await readApiJson(response, 'Could not review this fine.');
    if (!response.ok) throw new Error(result.error || 'Could not review this fine.');
    renderGovernmentLists(result.fines || []);
    void siteAlert(decision === 'approve' ? 'Fine approved and applied.' : 'Fine request denied.');
  } catch (error) {
    void siteAlert(error.message || 'Could not review this fine.');
  }
}

async function loadWarnings() {
  if (!currentUserId || !warningNotice || !warningReasons) return;
  if (warningNotice.dataset.loading === '1') return;
  warningNotice.dataset.loading = '1';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'warnings' }) });
    const result = await readApiJson(response, 'Could not check warnings.');
    if (!response.ok || !result.warnings?.length) return;
    const items = result.warnings;
    const hasNotice = items.some((warning) => warning.kind === 'notice');
    const hasWarning = items.some((warning) => warning.kind !== 'notice');
    const title = document.getElementById('warning-title');
    if (title) {
      if (hasWarning && hasNotice) title.textContent = 'Staff message';
      else if (hasNotice) title.textContent = 'Staff notice';
      else title.textContent = items.length > 1 ? 'You received warnings' : 'You received a warning';
    }
    warningReasons.innerHTML = items.map((warning) => {
      const label = warning.kind === 'notice' ? 'Notice' : 'Warning';
      return `<p><strong>${label}</strong> · ${escapeHtml(warning.reason)}</p>`;
    }).join('');
    warningNotice.hidden = false;
  } catch {
    // The normal site remains available if warning status cannot be read.
  } finally {
    warningNotice.dataset.loading = '';
  }
}

let messagesLoadPromise = null;
let notificationsLoadPromise = null;
let messagesRenderKey = '';
let notificationsRenderKey = '';

function messagesListFingerprint(items) {
  return items.map((message) => [
    message.otherId || '',
    message.createdAt || '',
    Number(message.unread || 0),
    message.content || '',
    message.gifUrl ? '1' : '0',
    message.otherAvatarUrl || '',
    message.otherDisplayName || '',
  ].join('\u001f')).join('\u001e');
}

function notificationsListFingerprint(items) {
  return items.map((notification) => [
    notification.id || '',
    notification.type || '',
    notification.actorId || '',
    notification.postId || '',
    notification.createdAt || '',
    notification.actorAvatarUrl || '',
    notification.actorName || '',
    notification.postContent || '',
  ].join('\u001f')).join('\u001e');
}

async function loadMessages() {
  if (!messagesList || !currentUserId) return;
  if (messagesLoadPromise) return messagesLoadPromise;
  messagesLoadPromise = (async () => {
    try {
      const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'messages', ...activeAccountRequest() }) });
      const result = await readApiJson(response, 'Could not load messages.');
      if (!response.ok) throw new Error(result.error || 'Could not load messages.');
      // Prefer server-built conversation summaries (include peer name/avatar). Fall
      // back to grouping raw messages for older bot hosts.
      let items = Array.isArray(result.conversations) ? result.conversations : null;
      if (!items) {
        const conversations = new Map();
        (result.messages || []).forEach((message) => {
          if (message.kind !== 'direct') return;
          const otherId = message.otherId || (message.fromId === activeUserId() ? message.toId : message.fromId);
          if (!otherId) return;
          const previous = conversations.get(otherId);
          const unread = Number(message.unread || 0) || (message.toId === activeUserId() && !message.readAt ? 1 : 0);
          if (!previous || new Date(message.createdAt).getTime() > new Date(previous.createdAt).getTime()) {
            conversations.set(otherId, { ...message, otherId, unread: (previous?.unread || 0) + unread });
          } else {
            previous.unread = (previous.unread || 0) + unread;
          }
        });
        items = [...conversations.values()].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
      } else {
        items = items.slice().sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
      }

      // Seed the member cache so inbox rows stay openable even before the feed loads.
      items.forEach((item) => {
        const otherId = String(item.otherId || '');
        if (!otherId) return;
        const existing = internetUsers.get(otherId) || {};
        internetUsers.set(otherId, {
          ...existing,
          id: otherId,
          displayName: item.otherDisplayName || existing.displayName || 'Clearwater member',
          username: item.otherUsername || existing.username || 'member',
          avatarUrl: item.otherAvatarUrl || existing.avatarUrl || null,
          staffRank: item.otherStaffRank || existing.staffRank || null,
        });
      });

      const unreadTotal = items.reduce((total, message) => total + Number(message.unread || 0), 0);
      socialState.unreadMessages = unreadTotal;
      updateNotificationIndicators();

      const fingerprint = messagesListFingerprint(items);
      if (fingerprint === messagesRenderKey && messagesList.querySelector('.internet-message, .message-empty')) {
        return;
      }
      messagesRenderKey = fingerprint;
      messagesList.innerHTML = items.length
        ? items.map((message) => {
          const otherId = String(message.otherId || '');
          const member = internetUsers.get(otherId) || {};
          const name = message.otherDisplayName || member.displayName || 'Clearwater member';
          const avatar = message.otherAvatarUrl || member.avatarUrl || 'assets/clearwater-logo.png';
          const preview = message.content || (message.gifUrl ? 'GIF' : 'New message');
          const unread = Number(message.unread || 0) > 0;
          return `<button type="button" class="internet-message ${unread ? 'unread' : ''}" data-open-conversation="${escapeHtml(otherId)}"><img src="${escapeHtml(avatar)}" alt="" decoding="async" /><span><b>${escapeHtml(name)}</b><p>${escapeHtml(preview)}</p><small>${timeAgo(message.createdAt)}</small></span>${unread ? `<em>${message.unread > 9 ? '9+' : message.unread}</em>` : ''}</button>`;
        }).join('')
        : '<p class="message-empty">No messages yet.<span>Start a conversation with another Clearwater member.</span></p>';
    } catch (error) {
      messagesRenderKey = '';
      messagesList.innerHTML = `<p class="message-empty">${escapeHtml(error.message || 'Could not load messages.')}</p>`;
    }
  })().finally(() => {
    messagesLoadPromise = null;
  });
  return messagesLoadPromise;
}

function updateNotificationIndicators() {
  const unread = Number(socialState.unreadNotifications || 0);
  if (notificationDot) notificationDot.hidden = unread < 1;
  if (messageDot) messageDot.hidden = Number(socialState.unreadMessages || 0) < 1;
}

async function loadNotifications() {
  if (!notificationList || !currentUserId) return;
  if (notificationsLoadPromise) return notificationsLoadPromise;
  notificationsLoadPromise = (async () => {
    try {
      const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notifications', ...activeAccountRequest() }) });
      const result = await readApiJson(response, 'Could not load notifications.');
      if (!response.ok) throw new Error(result.error || 'Could not load notifications.');
      const notifications = result.notifications || [];
      const names = { follow: 'started following you', like: 'liked your post', reply: 'replied to your post', mention: 'mentioned you in a post', repost: 'reposted your post', quote: 'quoted your post', boost: 'tipped your post into For You' };
      const fingerprint = notificationsListFingerprint(notifications);
      const unread = Number(result.unreadCount || 0);
      if (notificationCount) { notificationCount.hidden = unread < 1; notificationCount.textContent = `${unread} unread`; }
      socialState.unreadNotifications = 0;
      updateNotificationIndicators();
      if (fingerprint === notificationsRenderKey && notificationList.querySelector('.notification-item, .feed-note')) {
        return;
      }
      notificationsRenderKey = fingerprint;
      notificationList.innerHTML = notifications.length
        ? notifications.map((notification) => {
          const attrs = notification.type === 'message'
            ? `data-notification-message="${escapeHtml(notification.actorId)}"`
            : notification.postId
              ? `data-notification-post="${escapeHtml(notification.postId)}"${notification.replyId ? ` data-notification-reply="${escapeHtml(notification.replyId)}"` : ''}`
              : `data-notification-member="${escapeHtml(notification.actorId)}"`;
          return `<button type="button" class="notification-item" ${attrs}><img src="${escapeHtml(notification.actorAvatarUrl || internetUsers.get(notification.actorId)?.avatarUrl || 'assets/clearwater-logo.png')}" alt="" decoding="async" /><span><b>${escapeHtml(notification.actorName || internetUsers.get(notification.actorId)?.displayName || 'Clearwater member')}</b> ${escapeHtml(names[notification.type] || 'interacted with you')}<small>${escapeHtml(notification.type === 'message' ? 'Open conversation' : notification.postContent || (notification.postId ? 'View post' : 'View profile'))} &middot; ${timeAgo(notification.createdAt)}</small></span></button>`;
        }).join('')
        : '<p class="feed-note">Nothing new yet.</p>';
    } catch (error) {
      notificationsRenderKey = '';
      notificationList.innerHTML = `<p>${escapeHtml(error.message || 'Could not load notifications.')}</p>`;
    }
  })().finally(() => {
    notificationsLoadPromise = null;
  });
  return notificationsLoadPromise;
}

async function loadSocial() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social-status', ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not load your social settings.');
    if (response.ok && result.social) {
      socialState = { ...socialState, ...result.social };
      if (!Array.isArray(socialState.bookmarkCollections)) socialState.bookmarkCollections = [];
      if (!Array.isArray(socialState.bookmarks)) socialState.bookmarks = [];
    }
    // Bookmarks always live on the personal account, even while posting as a business.
    if (activeAccount !== 'personal' && activeAccount) {
      const personalResponse = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social-status' }) });
      const personalResult = await readApiJson(personalResponse, 'Could not load bookmarks.');
      if (personalResponse.ok && personalResult.social) {
        socialState.bookmarks = Array.isArray(personalResult.social.bookmarks) ? personalResult.social.bookmarks : [];
        socialState.bookmarkCollections = Array.isArray(personalResult.social.bookmarkCollections)
          ? personalResult.social.bookmarkCollections
          : [];
      }
    }
    updateNotificationIndicators();
    if (!document.querySelector('[data-view="bookmarks"]')?.hidden) renderBookmarks();
    renderOnboardingChecklist();
  } catch { /* Feed stays usable during a temporary connection issue. */ }
}

function applyPreferenceState(preferences = {}) {
  preferenceState = { ...preferenceState, ...preferences };
  const root = document.documentElement;
  root.classList.toggle('pref-compact', preferenceState.compactPosts === true);
  root.classList.toggle('pref-large-text', preferenceState.largeText === true);
  root.classList.toggle('pref-reduce-motion', preferenceState.reduceMotion === true);
  document.querySelectorAll('[data-preference]').forEach((input) => {
    const key = input.dataset.preference;
    input.checked = key === 'autoplayReels'
      ? isReelAutoplayEnabled()
      : preferenceState[key] === true;
  });
  // Autoplay Reels should also start with audio unless the member muted them.
  if (isReelAutoplayEnabled() && reelsSoundOn) unlockReelAudio();
  if (feedTab === 'reels') bindReelAutoplay();
}

async function loadPreferences() {
  if (!currentUserId) return;
  const storageKey = `clearwater-preferences-${currentUserId}`;
  const localPreferences = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })();
  applyPreferenceState(localPreferences);
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preferences' }) });
    const result = await readApiJson(response, 'Could not load settings.');
    if (!response.ok) throw new Error(result.error || 'Could not load settings.');
    const server = result.preferences && typeof result.preferences === 'object' ? result.preferences : {};
    // Keep device appearance choices when the bot host has not stored them yet.
    const merged = { ...server };
    for (const key of ['compactPosts', 'largeText', 'reduceMotion', 'autoplayReels']) {
      if (server[key] !== true && localPreferences[key] === true) merged[key] = true;
      if (key === 'autoplayReels' && localPreferences[key] === false) merged[key] = false;
    }
    applyPreferenceState(merged);
    localStorage.setItem(storageKey, JSON.stringify(preferenceState));
    renderOnboardingChecklist();
  } catch { /* Settings remain usable if the bot host is briefly unavailable. */ }
}

const ACCENT_SWATCHES = ['#1257a3', '#0f8b8d', '#2f8f5b', '#c9a227', '#d4622e', '#c23b5a', '#7a4fd0', '#5a6b7d'];
const DEFAULT_ACCENT_HEX = '#1257a3';
let accentHue = 210;
let accentSat = 0.79;
let accentVal = 0.64;
let openCustomSelect = null;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function hexToRgbChannels(value) {
  const hex = safeBannerColor(value).slice(1);
  if (!hex) return null;
  const full = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex.slice(0, 6);
  if (full.length !== 6) return null;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  return channels.some((channel) => Number.isNaN(channel)) ? null : channels;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function hsvToHex(h, s, v) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const sat = clamp01(s);
  const val = clamp01(v);
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function hexToHsv(value) {
  const rgb = hexToRgbChannels(value);
  if (!rgb) return { h: 210, s: 0.79, v: 0.64 };
  const [r0, g0, b0] = rgb.map((channel) => channel / 255);
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r0) h = 60 * (((g0 - b0) / delta) % 6);
    else if (max === g0) h = 60 * ((b0 - r0) / delta + 2);
    else h = 60 * ((r0 - g0) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function closeCustomSelect(wrap = openCustomSelect) {
  if (!wrap) return;
  wrap.classList.remove('is-open');
  const trigger = wrap.querySelector('.cw-select-trigger');
  const menu = wrap.querySelector('.cw-select-menu');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (menu) menu.hidden = true;
  if (openCustomSelect === wrap) openCustomSelect = null;
}

function syncCustomSelect(wrap) {
  if (!wrap) return;
  const select = wrap.querySelector('select');
  const label = wrap.querySelector('.cw-select-label');
  const menu = wrap.querySelector('.cw-select-menu');
  if (!select || !label || !menu) return;
  const options = [...select.options];
  menu.innerHTML = options.map((option) => {
    const selected = option.value === select.value;
    return `<button type="button" role="option" class="cw-select-option${selected ? ' selected' : ''}" data-value="${escapeHtml(option.value)}" ${option.disabled ? 'disabled' : ''} aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(option.textContent)}</button>`;
  }).join('');
  const selected = options.find((option) => option.value === select.value) || options[0];
  label.textContent = selected?.textContent || 'Select';
  wrap.classList.toggle('is-empty', !String(select.value || '').trim());
  wrap.classList.toggle('is-disabled', select.disabled);
  const trigger = wrap.querySelector('.cw-select-trigger');
  if (trigger) trigger.disabled = select.disabled;
}

function enhanceSelect(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  let wrap = select.closest('[data-cw-select]');
  if (wrap && wrap.querySelector('select') !== select) wrap = null;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'cw-select';
    wrap.dataset.cwSelect = '';
    select.parentNode?.insertBefore(wrap, select);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cw-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span class="cw-select-label"></span><span class="cw-select-chevron" aria-hidden="true"></span>';
    const menu = document.createElement('div');
    menu.className = 'cw-select-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    wrap.appendChild(select);
    select.classList.add('cw-select-native');
    select.tabIndex = -1;
    select.dataset.cwEnhanced = '1';
    select.addEventListener('change', () => syncCustomSelect(wrap));

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (select.disabled) return;
      const opening = openCustomSelect !== wrap;
      closeCustomSelect();
      if (!opening) return;
      syncCustomSelect(wrap);
      wrap.classList.add('is-open');
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      openCustomSelect = wrap;
    });

    menu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-value]');
      if (!option || option.disabled) return;
      select.value = option.dataset.value || '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomSelect(wrap);
      closeCustomSelect(wrap);
      trigger.focus();
    });
  }
  syncCustomSelect(wrap);
}

function refreshCustomSelect(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  enhanceSelect(select);
}

function refreshCustomSelects(root = document) {
  root.querySelectorAll?.('select')?.forEach(refreshCustomSelect);
}

function bindCustomSelectChrome() {
  document.addEventListener('click', (event) => {
    if (!openCustomSelect) return;
    if (openCustomSelect.contains(event.target)) return;
    closeCustomSelect();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCustomSelect();
  });
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.('select')) refreshCustomSelect(node);
        node.querySelectorAll?.('select').forEach(refreshCustomSelect);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  refreshCustomSelects();
}

function currentAccentHex() {
  return hsvToHex(accentHue, accentSat, accentVal);
}

function setAccentHsvFromHex(hex, { draft = true, preview = true } = {}) {
  const hasColour = Boolean(safeBannerColor(hex));
  const safe = hasColour ? safeBannerColor(hex).toLowerCase() : DEFAULT_ACCENT_HEX;
  const hsv = hexToHsv(safe);
  accentHue = hsv.h;
  accentSat = hsv.s;
  accentVal = hsv.v;
  if (draft) {
    if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    profileDraft.accentColor = hasColour ? safe : '';
  }
  renderAccentPicker();
  if (preview) renderProfilePreview();
}

function renderAccentPicker() {
  const picker = document.querySelector('[data-accent-picker]');
  if (!picker) return;
  const hex = profileDraft?.accentColor ? currentAccentHex() : DEFAULT_ACCENT_HEX;
  const preview = picker.querySelector('[data-accent-preview]');
  const shade = picker.querySelector('[data-accent-shade]');
  const shadeThumb = picker.querySelector('[data-accent-shade-thumb]');
  const hueThumb = picker.querySelector('[data-accent-hue-thumb]');
  if (preview) preview.style.background = hex;
  if (shade) shade.style.background = hsvToHex(accentHue, 1, 1);
  if (shadeThumb) {
    shadeThumb.style.left = `${accentSat * 100}%`;
    shadeThumb.style.top = `${(1 - accentVal) * 100}%`;
  }
  if (hueThumb) hueThumb.style.left = `${(accentHue / 360) * 100}%`;
  picker.querySelectorAll('[data-accent-swatch]').forEach((button) => {
    button.classList.toggle('selected', Boolean(profileDraft?.accentColor) && button.dataset.accentSwatch === profileDraft.accentColor);
  });
}

function bindAccentPointer(target, handler) {
  if (!target) return;
  const move = (event) => {
    if (event.cancelable) event.preventDefault();
    const point = event.touches?.[0] || event;
    const rect = target.getBoundingClientRect();
    handler({
      x: clamp01((point.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clamp01((point.clientY - rect.top) / Math.max(rect.height, 1)),
    });
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('touchmove', move);
    window.removeEventListener('touchend', stop);
  };
  const start = (event) => {
    if (event.cancelable) event.preventDefault();
    move(event);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop);
  };
  target.addEventListener('pointerdown', start);
  target.addEventListener('touchstart', start, { passive: false });
}

function initAccentPicker() {
  const picker = document.querySelector('[data-accent-picker]');
  if (!picker || picker.dataset.bound === '1') return;
  picker.dataset.bound = '1';
  bindAccentPointer(picker.querySelector('[data-accent-shade]'), ({ x, y }) => {
    accentSat = x;
    accentVal = 1 - y;
    if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    profileDraft.accentColor = currentAccentHex();
    renderAccentPicker();
    renderProfilePreview();
  });
  bindAccentPointer(picker.querySelector('[data-accent-hue]'), ({ x }) => {
    accentHue = x * 360;
    if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    profileDraft.accentColor = currentAccentHex();
    renderAccentPicker();
    renderProfilePreview();
  });
}

const BANNER_PRESETS = [
  'assets/clearwater-police-night.png',
  'assets/clearwater-sunset-beach.png',
  'assets/clearwater-campfire.png',
  'assets/clearwater-home.png',
  'assets/state-trooper-night.png',
  'assets/sheriff-station.png',
  'assets/fire-rescue-scene.png',
];
const DEFAULT_PROFILE_DRAFT = { bio: '', pronouns: '', location: '', website: '', bannerUrl: '', accentColor: '', pinnedPostId: '', deactivated: false, presets: BANNER_PRESETS };

function setProfileStatus(message, tone = '') {
  const status = document.querySelector('[data-profile-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function renderProfilePreview() {
  if (!profileDraft) return;
  const preview = document.querySelector('[data-profile-preview]');
  setProfileAccent(preview, profileDraft.accentColor);
  setBannerImage(document.querySelector('[data-preview-banner]'), profileDraft.bannerUrl, '', profileDraft.accentColor);
  const previewAvatar = document.querySelector('[data-preview-avatar]');
  if (previewAvatar) previewAvatar.src = sessionUser?.avatarUrl || 'assets/clearwater-logo.png';
  const previewName = document.querySelector('[data-preview-name]');
  if (previewName) previewName.textContent = sessionUser?.displayName || sessionUser?.username || 'Your name';
  const previewHandle = document.querySelector('[data-preview-handle]');
  if (previewHandle) previewHandle.textContent = `@${sessionUser?.username || 'clearwater'}`;
  const previewBio = document.querySelector('[data-preview-bio]');
  if (previewBio) previewBio.textContent = profileDraft.bio || 'Add a bio so people know who you are.';
  renderProfileMeta(document.querySelector('[data-preview-meta]'), {
    ...profileDraft,
    createdAt: internetUsers.get(currentUserId)?.createdAt,
  });

  document.querySelectorAll('[data-banner-preset]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.bannerPreset === profileDraft.bannerUrl);
  });
  renderAccentPicker();
  const counter = document.querySelector('[data-bio-count]');
  if (counter) counter.textContent = `${profileDraft.bio.length} / 300`;
}

function renderProfileEditorChoices() {
  const presets = document.querySelector('[data-banner-presets]');
  if (presets) {
    const options = profileDraft?.presets?.length ? profileDraft.presets : DEFAULT_PROFILE_DRAFT.presets;
    presets.innerHTML = options.map((preset) => `<button type="button" data-banner-preset="${escapeHtml(preset)}" style="background-image:url('${escapeHtml(preset)}')" aria-label="Use ${escapeHtml(preset.replace(/^assets\/|\.[a-z]+$/gi, '').replace(/-/g, ' '))} banner"></button>`).join('');
  }
  const swatches = document.querySelector('[data-accent-swatches]');
  if (swatches) {
    swatches.innerHTML = ACCENT_SWATCHES.map((colour) => `<button type="button" data-accent-swatch="${escapeHtml(colour)}" style="background:${escapeHtml(colour)}" aria-label="Use accent ${escapeHtml(colour)}"></button>`).join('');
  }
}

function fillProfileEditor() {
  if (!profileDraft) return;
  const set = (selector, value) => { const field = document.querySelector(selector); if (field) field.value = value; };
  set('[data-profile-bio]', profileDraft.bio);
  setAccentHsvFromHex(profileDraft.accentColor || '', { draft: false, preview: false });
  renderProfileEditorChoices();
  renderProfilePreview();
}

function fillAccountPane() {
  const avatarImage = document.querySelector('[data-settings-avatar]');
  if (avatarImage) avatarImage.src = sessionUser?.avatarUrl || 'assets/clearwater-logo.png';
  const nameLabel = document.querySelector('[data-settings-name]');
  if (nameLabel) nameLabel.textContent = sessionUser?.displayName || sessionUser?.username || 'Clearwater member';
  const handleLabel = document.querySelector('[data-settings-handle]');
  if (handleLabel) handleLabel.textContent = `@${sessionUser?.username || 'clearwater'}`;
  const joined = document.querySelector('[data-settings-joined]');
  const joinedText = joinedLabel(internetUsers.get(currentUserId)?.createdAt);
  if (joined) joined.textContent = joinedText ? `Joined ${joinedText}` : '';
  const deactivated = profileDraft?.deactivated === true;
  const button = document.querySelector('[data-deactivate]');
  if (button) button.textContent = deactivated ? 'Reactivate' : 'Deactivate';
  const title = document.querySelector('[data-deactivate-title]');
  if (title) title.textContent = deactivated ? 'Account deactivated' : 'Deactivate account';
  const copy = document.querySelector('[data-deactivate-copy]');
  if (copy) {
    copy.textContent = deactivated
      ? 'Your profile, posts, and Reels are hidden from everyone else. Reactivate to bring them back.'
      : 'Hides your profile, posts, and Reels from everyone. Reactivate any time from this page.';
  }
  renderVerificationPane();
  renderBusinessAccountsPane();
}

function renderVerificationPane() {
  const form = document.querySelector('[data-verify-form]');
  const status = document.querySelector('[data-verify-status]');
  const submit = document.querySelector('[data-verify-submit]');
  const title = document.querySelector('[data-verify-title]');
  const hint = document.querySelector('[data-verify-hint]');
  if (!form || !status) return;
  const member = internetUsers.get(currentUserId);
  const verified = accountVerified || member?.verified === true || myVerificationApp?.status === 'approved';
  if (verified) {
    form.hidden = true;
    if (hint) hint.hidden = true;
    if (title) title.textContent = 'Verification';
    status.dataset.tone = 'ok';
    status.textContent = 'Completed';
    if (submit) submit.disabled = true;
    return;
  }
  form.hidden = false;
  if (hint) hint.hidden = false;
  if (title) title.textContent = 'Apply to be verified';
  if (submit) submit.disabled = false;
  if (myVerificationApp?.status === 'pending') {
    form.hidden = true;
    status.dataset.tone = 'wait';
    status.textContent = `Application pending since ${timeAgo(myVerificationApp.createdAt)}. Staff will review it soon.`;
  } else if (myVerificationApp?.status === 'denied') {
    status.dataset.tone = 'error';
    status.textContent = myVerificationApp.reviewNote
      ? `Last request was denied: ${myVerificationApp.reviewNote}`
      : 'Last request was denied. You can apply again after a short wait.';
  } else {
    status.dataset.tone = '';
    status.textContent = 'Share why your Clearwater presence should be verified.';
  }
}

function businessRoleLabel(role) {
  if (role === 'handler') return 'Handler';
  if (role === 'manager') return 'Manager';
  return 'Poster';
}

function businessStatusLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'pending') return 'Awaiting staff approval';
  if (status === 'denied') return 'Denied';
  return status || 'Unknown';
}

function hasCompletedBusinessAccount() {
  return (Array.isArray(myBusinessAccounts) ? myBusinessAccounts : []).some((biz) => (
    biz.status === 'active' && (biz.isHandler === true || biz.role === 'handler')
  ));
}

function canManageBusinessProfile(businessId) {
  const biz = (Array.isArray(myBusinessAccounts) ? myBusinessAccounts : [])
    .find((item) => item.id === String(businessId || ''));
  return Boolean(biz && biz.status === 'active' && (biz.canEditProfile || biz.canManageMembers));
}

function revokeBusinessEditAvatarDraft(businessId) {
  const id = String(businessId || '');
  const draft = businessEditAvatarDrafts.get(id);
  if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
  businessEditAvatarDrafts.delete(id);
}

function syncBusinessUserLocally(biz) {
  if (!biz?.id) return;
  const existing = internetUsers.get(biz.id) || {};
  internetUsers.set(biz.id, {
    ...existing,
    id: biz.id,
    username: biz.username || existing.username,
    displayName: biz.displayName || existing.displayName,
    avatarUrl: biz.avatarUrl || existing.avatarUrl || 'assets/clearwater-logo.png',
    bio: biz.bio != null ? biz.bio : (existing.bio || ''),
    verified: true,
    business: true,
    badges: Array.isArray(existing.badges) && existing.badges.includes('business')
      ? existing.badges
      : [...(Array.isArray(existing.badges) ? existing.badges.filter((badge) => badge !== 'business') : []), 'business'],
  });
}

function openBusinessProfileEditor(businessId) {
  history.pushState({}, '', internetUrl('settings'));
  showView('settings');
  showSettingsTab('account');
  const card = document.querySelector(`[data-business-id="${CSS.escape(String(businessId || ''))}"]`);
  const form = card?.querySelector('[data-biz-profile-form]');
  form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form?.querySelector('[data-biz-name]')?.focus();
}

function renderBusinessAccountsPane() {
  const list = document.querySelector('[data-business-list]');
  const form = document.querySelector('[data-business-form]');
  const hint = document.querySelector('[data-business-hint]');
  const title = document.querySelector('[data-business-title]');
  const completeStatus = document.querySelector('[data-business-complete-status]');
  const completed = hasCompletedBusinessAccount();
  if (title) title.textContent = 'Business accounts';
  if (form) form.hidden = completed;
  if (hint) hint.hidden = completed;
  if (completeStatus) {
    completeStatus.hidden = !completed;
    if (completed) {
      completeStatus.dataset.tone = 'ok';
      completeStatus.textContent = 'Completed';
    } else {
      completeStatus.textContent = '';
      completeStatus.dataset.tone = '';
    }
  }
  if (!list) return;
  if (!myBusinessAccounts.length) {
    list.innerHTML = completed ? '' : '<p class="settings-hint">No business accounts yet.</p>';
    return;
  }
  list.innerHTML = myBusinessAccounts.map((biz) => {
    const members = Array.isArray(biz.members) ? biz.members : [];
    const canManage = biz.canManageMembers && biz.status === 'active';
    const canEditProfile = (biz.canEditProfile || biz.canManageMembers) && biz.status === 'active';
    const memberRows = members.length
      ? members.map((member) => `<li><span><b>${escapeHtml(member.displayName || member.username || 'Member')}</b> <small>@${escapeHtml(member.username || '')} · ${escapeHtml(businessRoleLabel(member.role))}</small></span>${canManage ? `<span class="business-member-actions"><button type="button" data-biz-role="${escapeHtml(biz.id)}" data-member-id="${escapeHtml(member.id)}" data-role="${member.role === 'manager' ? 'poster' : 'manager'}">${member.role === 'manager' ? 'Make poster' : 'Make manager'}</button><button type="button" data-biz-remove="${escapeHtml(biz.id)}" data-member-id="${escapeHtml(member.id)}">Remove</button></span>` : ''}</li>`).join('')
      : '<li class="settings-hint">No extra members yet.</li>';
    const handlerRow = biz.isHandler
      ? '<li><span><b>You (handler)</b><small>Full access · ads · funds</small></span></li>'
      : '';
    const editDraft = businessEditAvatarDrafts.get(biz.id);
    const avatarPreviewSrc = editDraft?.previewUrl || biz.avatarUrl || '';
    const profileEditor = canEditProfile
      ? `<form class="business-profile-form settings-stack-form" data-biz-profile-form="${escapeHtml(biz.id)}">
          <h3>Edit profile</h3>
          <div class="settings-grid">
            <label class="settings-field"><span>Name</span><input data-biz-name maxlength="80" value="${escapeHtml(biz.displayName || '')}" required /></label>
            <label class="settings-field"><span>Username</span><input value="@${escapeHtml(biz.username || '')}" disabled aria-label="Business username (cannot be changed)" /></label>
          </div>
          <label class="settings-field"><span>Type</span>
            <select data-biz-category>
              <option value="business"${biz.category !== 'department' ? ' selected' : ''}>In-game business</option>
              <option value="department"${biz.category === 'department' ? ' selected' : ''}>In-game department</option>
            </select>
          </label>
          <label class="settings-field"><span>Logo / profile picture</span><input data-biz-avatar type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
          <div class="business-avatar-preview" data-biz-avatar-preview ${avatarPreviewSrc ? '' : 'hidden'}>${avatarPreviewSrc ? `<img src="${escapeHtml(avatarPreviewSrc)}" alt="Business logo preview" />` : ''}</div>
          <label class="settings-field"><span>About</span><textarea data-biz-bio maxlength="300" rows="3" placeholder="What does this business or department do in Clearwater RP?">${escapeHtml(biz.bio || '')}</textarea></label>
          <div class="settings-actions">
            <button type="submit" class="settings-button primary" data-biz-profile-save>Save business profile</button>
            <p class="settings-status" data-biz-profile-status role="status"></p>
          </div>
        </form>`
      : '';
    return `<article class="business-account-card" data-business-id="${escapeHtml(biz.id)}">
      <header><img src="${escapeHtml(biz.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><div><b>${escapeHtml(biz.displayName)}</b><small>@${escapeHtml(biz.username)} · ${escapeHtml(biz.category)} · ${escapeHtml(businessStatusLabel(biz.status))}</small><small>Your role: ${escapeHtml(businessRoleLabel(biz.role || (biz.isHandler ? 'handler' : 'poster')))}</small></div></header>
      ${biz.bio && !canEditProfile ? `<p>${escapeHtml(biz.bio)}</p>` : ''}
      ${biz.reviewNote && biz.status === 'denied' ? `<p class="settings-status" data-tone="error">${escapeHtml(biz.reviewNote)}</p>` : ''}
      ${profileEditor}
      ${canManage ? `<form class="business-member-form" data-biz-member-form="${escapeHtml(biz.id)}"><input data-member-username maxlength="80" placeholder="@username" required /><select data-member-role><option value="poster">Poster</option><option value="manager">Manager</option></select><button type="submit">Add member</button></form>` : ''}
      <ul class="business-member-list">${handlerRow}${memberRows}</ul>
    </article>`;
  }).join('');
}

async function loadAccountExtras() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'business-list' }) });
    const result = await readApiJson(response, 'Could not load account tools.');
    if (!response.ok) throw new Error(result.error || 'Could not load account tools.');
    myBusinessAccounts = Array.isArray(result.businesses) ? result.businesses : [];
    myVerificationApp = result.verification || null;
    accountVerified = result.verified === true;
    renderVerificationPane();
    renderBusinessAccountsPane();
    updateAccountSwitcher();
  } catch {
    /* Account extras are optional while the feed still works. */
  }
}

function draftStorageKey(kind = 'post') {
  return `clearwater-draft-${kind}-${currentUserId || 'anon'}`;
}

function saveComposerDraft() {
  if (!currentUserId || !content) return;
  const note = document.querySelector('[data-composer-draft-note]');
  const payload = {
    content: content.value || '',
    savedAt: Date.now(),
  };
  if (!payload.content.trim()) {
    localStorage.removeItem(draftStorageKey('post'));
    if (note) note.hidden = true;
    return;
  }
  localStorage.setItem(draftStorageKey('post'), JSON.stringify(payload));
  if (note) {
    note.hidden = false;
    note.textContent = 'Draft saved';
  }
}

function restoreComposerDraft() {
  if (!currentUserId || !content) return;
  try {
    const raw = localStorage.getItem(draftStorageKey('post'));
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft?.content || content.value) return;
    content.value = String(draft.content).slice(0, 500);
    if (count) count.textContent = `${content.value.length} / 500`;
    updateComposerHighlight();
    if (postButton) postButton.disabled = !canComposePost();
    const note = document.querySelector('[data-composer-draft-note]');
    if (note) {
      note.hidden = false;
      note.textContent = 'Draft restored';
    }
  } catch {
    /* Ignore corrupt drafts. */
  }
}

function clearComposerDraft() {
  localStorage.removeItem(draftStorageKey('post'));
  const note = document.querySelector('[data-composer-draft-note]');
  if (note) note.hidden = true;
}

function saveReelDraft() {
  if (!currentUserId) return;
  const caption = document.querySelector('[data-reel-caption]');
  const payload = { caption: caption?.value || '', savedAt: Date.now() };
  if (!payload.caption.trim()) {
    localStorage.removeItem(draftStorageKey('reel'));
    return;
  }
  localStorage.setItem(draftStorageKey('reel'), JSON.stringify(payload));
}

function restoreReelDraft() {
  if (!currentUserId) return;
  const caption = document.querySelector('[data-reel-caption]');
  if (!caption || caption.value) return;
  try {
    const raw = localStorage.getItem(draftStorageKey('reel'));
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft?.caption) caption.value = String(draft.caption).slice(0, 220);
  } catch {
    /* Ignore corrupt drafts. */
  }
}

function clearReelDraft() {
  localStorage.removeItem(draftStorageKey('reel'));
}

function renderOnboardingChecklist() {
  const card = document.querySelector('[data-onboarding-card]');
  const list = document.querySelector('[data-onboarding-list]');
  if (!card || !list || !currentUserId) return;
  if (preferenceState?.onboardingDismissed === true) {
    card.hidden = true;
    return;
  }
  const me = internetUsers.get(currentUserId) || {};
  const bio = String(profileDraft?.bio || me.bio || '').trim();
  const follows = Array.isArray(socialState.following) ? socialState.following.length : 0;
  const walletDone = onboardingWalletVisited || localStorage.getItem(`clearwater-onboarding-wallet-${currentUserId}`) === '1';
  const steps = [
    { id: 'bio', done: bio.length >= 8, label: 'Set a bio', href: '/internet/settings' },
    { id: 'follow', done: follows >= 3, label: `Follow 3 accounts (${Math.min(follows, 3)}/3)`, href: '/internet' },
    { id: 'wallet', done: walletDone, label: 'Open Wallet & claim daily credits', href: '/internet/wallet' },
  ];
  if (steps.every((step) => step.done)) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  list.innerHTML = steps.map((step) => `<li class="${step.done ? 'done' : ''}"><a href="${escapeHtml(step.href)}" data-view-link="${step.href.includes('wallet') ? 'wallet' : step.href.includes('settings') ? 'settings' : 'home'}">${step.done ? '✓' : '○'} ${escapeHtml(step.label)}</a></li>`).join('');
}

function renderAdBusinessOptions() {
  const select = document.querySelector('[data-ad-business-id]');
  if (!select) return;
  const current = select.value;
  const options = adBusinessAccounts.length
    ? adBusinessAccounts.map((biz) => `<option value="${escapeHtml(biz.id)}">${escapeHtml(biz.displayName)} (@${escapeHtml(biz.username)})</option>`).join('')
    : '';
  select.innerHTML = `<option value="">Select an approved business account</option>${options}`;
  if (current && adBusinessAccounts.some((biz) => biz.id === current)) select.value = current;
  else if (adBusinessAccounts.length === 1) select.value = adBusinessAccounts[0].id;
  refreshCustomSelect(select);
  syncAdBusinessAutofill();
}

function syncAdBusinessAutofill() {
  const select = document.querySelector('[data-ad-business-id]');
  const biz = adBusinessAccounts.find((item) => item.id === select?.value) || null;
  const name = document.querySelector('[data-ad-business]');
  const category = document.querySelector('[data-ad-category]');
  const categoryDisplay = document.querySelector('[data-ad-category-display]');
  const submit = document.querySelector('[data-ad-submit]');
  const hint = document.querySelector('[data-ad-business-hint]');
  if (name) name.value = biz?.displayName || '';
  if (category) category.value = biz?.category === 'department' ? 'department' : 'business';
  if (categoryDisplay) categoryDisplay.value = biz ? (biz.category === 'department' ? 'In-game department' : 'In-game business') : '';
  if (submit) submit.disabled = !biz;
  if (hint) {
    hint.textContent = biz
      ? `Advertising as ${biz.displayName}. Logo autofills from the business account. Paid from your personal wallet.`
      : 'Ads require an approved business account you handle. Create one in Settings → Account. Only the handler can run ads, paid from the handler’s wallet.';
  }
  if (biz?.avatarUrl && !adLogo) {
    const preview = document.querySelector('[data-ad-logo-preview]');
    if (preview) {
      preview.hidden = false;
      preview.innerHTML = `<img src="${escapeHtml(biz.avatarUrl)}" alt="Business logo" /><small>Using business logo</small>`;
    }
  } else if (!adLogo) {
    renderAdLogoPreview();
  }
}

async function loadProfileEditor() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'profile-get' }) });
    const result = await readApiJson(response, 'Could not load your profile.');
    if (!response.ok) throw new Error(result.error || 'Could not load your profile.');
    profileDraft = { ...DEFAULT_PROFILE_DRAFT, ...(result.profile || {}) };
    fillProfileEditor();
    fillAccountPane();
    void loadAccountExtras();
  } catch (error) {
    profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    fillProfileEditor();
    fillAccountPane();
    setProfileStatus(error.message || 'Could not load your profile.', 'error');
  }
}

function showSettingsTab(tab) {
  const available = new Set(['profile', 'privacy', 'appearance', 'account']);
  const active = available.has(tab) ? tab : 'profile';
  document.querySelectorAll('[data-settings-tab]').forEach((button) => button.classList.toggle('selected', button.dataset.settingsTab === active));
  document.querySelectorAll('[data-settings-pane]').forEach((pane) => { pane.hidden = pane.dataset.settingsPane !== active; });
  if (active === 'account') {
    fillAccountPane();
    void loadAccountExtras();
  }
}

function patchFollowGraphs(targetId, enabled) {
  const actorId = activeUserId();
  if (!actorId || !targetId || actorId === targetId) return;
  const actor = internetUsers.get(actorId);
  const target = internetUsers.get(targetId);
  if (actor) {
    const following = new Set(Array.isArray(actor.following) ? actor.following : []);
    if (enabled) following.add(targetId); else following.delete(targetId);
    actor.following = [...following];
    actor.followingCount = actor.following.length;
    internetUsers.set(actorId, actor);
  }
  if (target) {
    const followers = new Set(Array.isArray(target.followers) ? target.followers : []);
    if (enabled) followers.add(actorId); else followers.delete(actorId);
    target.followers = [...followers];
    target.followerCount = target.followers.length;
    internetUsers.set(targetId, target);
  }
}

async function socialAction(type, { targetId = '', postId = '', enabled = true, collectionId = '', collectionName = '' } = {}) {
  const bookmarkAction = String(type || '').startsWith('bookmark');
  // Bookmarks/collections always save to the signed-in personal account.
  const account = bookmarkAction ? {} : activeAccountRequest();
  const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social', type, targetId, postId, enabled, collectionId, collectionName, ...account }) });
  const result = await readApiJson(response, 'Could not save this change.');
  if (!response.ok) throw new Error(result.error || 'Could not save this change.');
  if (bookmarkAction && result.social) {
    socialState = {
      ...socialState,
      bookmarks: Array.isArray(result.social.bookmarks) ? result.social.bookmarks : (socialState.bookmarks || []),
      bookmarkCollections: Array.isArray(result.social.bookmarkCollections) ? result.social.bookmarkCollections : (socialState.bookmarkCollections || []),
    };
  } else {
    socialState = { ...socialState, ...result.social };
    if (!Array.isArray(socialState.bookmarkCollections)) socialState.bookmarkCollections = [];
  }
  if (type === 'follow' && targetId) patchFollowGraphs(targetId, enabled === true);
  renderPosts();
  renderSideSuggestions();
  renderOwnProfileDetails();
  renderBookmarks();
  renderOnboardingChecklist();
  return result;
}

function openMemberProfile(memberId, updateHash = true) {
  const user = findInternetMember(memberId) || internetUsers.get(memberId) || findMemberByUsername(memberId);
  if (!user) {
    pendingProfileUsername = profileUsernameSlug(memberId);
    if (pendingProfileUsername && updateHash) {
      const path = `/profiles/${encodeURIComponent(pendingProfileUsername)}`;
      if (currentInternetPath() !== path) history.replaceState({}, '', path);
    }
    showView('member');
    const nameEl = document.querySelector('[data-member-page-name]');
    const handleEl = document.querySelector('[data-member-page-handle]');
    const copyEl = document.querySelector('[data-member-page-copy]');
    const postsEl = document.querySelector('[data-member-page-posts]');
    if (nameEl) nameEl.textContent = pendingProfileUsername ? 'Loading profile…' : 'Profile not found';
    if (handleEl) handleEl.textContent = pendingProfileUsername ? `@${pendingProfileUsername}` : '@member';
    if (copyEl) copyEl.textContent = pendingProfileUsername ? 'Looking up this Clearwater member…' : 'That profile could not be found.';
    if (postsEl) postsEl.innerHTML = pendingProfileUsername ? '<p>Loading…</p>' : '<p>Profile not found.</p>';
    return;
  }
  pendingProfileUsername = '';
  if (viewedMember?.id !== user.id) {
    memberTab = 'posts';
    if (connectionModalScope === 'member') closeConnectionsModal();
  }
  viewedMember = user;
  const canSeeMemberLikes = user.id === activeUserId() || user.hideLikes !== true;
  const memberLikesTab = document.querySelector('[data-member-likes-tab]');
  if (memberLikesTab) memberLikesTab.hidden = !canSeeMemberLikes;
  if (!canSeeMemberLikes && memberTab === 'likes') memberTab = 'posts';
  document.querySelectorAll('[data-member-tab]').forEach((tab) => tab.classList.toggle('selected', tab.dataset.memberTab === memberTab));
  const posts = profileTabPosts(user.id, memberTab);
  const banner = document.querySelector('[data-member-page-banner]');
  setProfileAccent(document.querySelector('[data-member-root]'), user.accentColor);
  setBannerImage(banner, profileBannerFor(user) || 'assets/clearwater-police-night.png', '', user.accentColor);
  renderProfileMeta(document.querySelector('[data-member-page-meta]'), user);
  document.querySelector('[data-member-page-avatar]').src = user.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-member-page-name]').textContent = user.displayName;
  document.querySelector('[data-member-page-handle]').textContent = `@${user.username}`;
  document.querySelector('[data-member-page-copy]').textContent = user.bio || (user.staffRank ? `${user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.');
  document.querySelector('[data-member-page-verified]').hidden = !(user.verified === true || isBusinessAccountUser(user));
  document.querySelector('[data-member-page-verified]')?.classList.toggle('verified-gold', isBusinessAccountUser(user));
  const memberVerified = document.querySelector('[data-member-page-verified]');
  if (memberVerified) {
    const business = isBusinessAccountUser(user);
    memberVerified.setAttribute('aria-label', business ? 'Business verified' : 'Verified');
    memberVerified.dataset.tooltip = business ? 'Business verified' : 'Verified';
  }
  const memberStaffBadge = document.querySelector('[data-member-page-staff-badge]');
  if (memberStaffBadge) memberStaffBadge.hidden = !Array.isArray(user.badges) || !user.badges.includes('staff');
  const memberBusiness = document.querySelector('[data-member-page-business-badge]');
  if (memberBusiness) memberBusiness.hidden = true;
  const memberWarning = document.querySelector('[data-member-page-warning-badge]');
  if (memberWarning) {
    const on = Array.isArray(user.badges) && user.badges.includes('warning');
    memberWarning.hidden = !on;
    if (on) {
      const label = String(user.warningBadgeText || 'Account warning').trim() || 'Account warning';
      memberWarning.setAttribute('aria-label', label);
      memberWarning.dataset.tooltip = label;
    }
  }
  document.querySelector('[data-member-page-post-count]').textContent = profileTabPosts(user.id, 'posts').length.toLocaleString();
  const memberFollowing = Array.isArray(user.following) ? user.following : [];
  const memberFollowers = Array.isArray(user.followers) ? user.followers : [];
  const followingButton = document.querySelector('[data-member-page-following]');
  const followersButton = document.querySelector('[data-member-page-followers]');
  const memberHidesStats = user.hideStats === true;
  if (followingButton) {
    followingButton.hidden = memberHidesStats;
    followingButton.innerHTML = `<b>${Number(user.followingCount ?? memberFollowing.length).toLocaleString()}</b> Following`;
  }
  if (followersButton) {
    followersButton.hidden = memberHidesStats;
    followersButton.innerHTML = `<b>${Number(user.followerCount ?? memberFollowers.length).toLocaleString()}</b> Followers`;
  }
  if (memberHidesStats && connectionModalScope === 'member') closeConnectionsModal();
  else if (connectionModalScope === 'member' && connectionModalKind) openConnectionsModal('member', connectionModalKind);
  else setConnectionButtonsState('member', connectionModalScope === 'member' ? connectionModalKind : null);
  const mutuals = document.querySelector('[data-member-page-mutuals]');
  if (mutuals) {
    const mutualIds = mutualFriendIds(user);
    mutuals.hidden = mutualIds.length === 0 || memberHidesStats;
    mutuals.innerHTML = mutualFriendsMarkup(mutualIds);
  }
  const memberEmpty = {
    posts: 'No posts yet.',
    replies: 'No replies yet.',
    mentions: 'No mentions yet.',
    media: 'No photos or Reels yet.',
    likes: canSeeMemberLikes ? 'No likes yet.' : 'This member’s likes are private.',
  }[memberTab] || 'Nothing here yet.';
  const memberPostsHost = document.querySelector('[data-member-page-posts]');
  if (!canSeeMemberLikes && memberTab === 'likes') {
    memberPostsHost.innerHTML = `<p>${escapeHtml(memberEmpty)}</p>`;
  } else {
    memberPostsHost.innerHTML = profileListMarkup(posts, memberTab, user.pinnedPostId, memberEmpty);
  }
  syncAllReelOpenChips(memberPostsHost);
  const following = socialState.following.includes(user.id);
  const followsYou = socialState.followers.includes(user.id);
  document.querySelector('[data-member-page-follow]').textContent = following && followsYou ? 'Friends' : following ? 'Following' : followsYou ? 'Follow back' : 'Follow';
  document.querySelector('[data-member-page-menu-list]').hidden = true;
  const editBusiness = document.querySelector('[data-member-page-edit-business]');
  if (editBusiness) {
    const canEdit = canManageBusinessProfile(user.id);
    editBusiness.hidden = !canEdit;
    editBusiness.dataset.businessId = canEdit ? user.id : '';
  }
  if (updateHash) setInternetRoute('member', user.id);
  showView('member');
}

function openConversation(member) {
  if (!member) return;
  viewedMember = member;
  messageGif = null;
  setConversationHold('');
  if (conversationGifPreview) { conversationGifPreview.hidden = true; conversationGifPreview.innerHTML = ''; }
  document.querySelector('[data-conversation-avatar]').src = member.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-conversation-name]').textContent = member.displayName;
  document.querySelector('[data-conversation-handle]').textContent = `@${member.username}`;
  document.querySelector('[data-conversation-card-avatar]').src = member.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-conversation-card-name]').textContent = member.displayName;
  document.querySelector('[data-conversation-card-handle]').textContent = `@${member.username}`;
  conversationMessages.innerHTML = '<p>Loading conversation...</p>';
  setInternetRoute('messages');
  showView('conversation');
  void loadConversation(member);
  conversationInput?.focus();
}

function transferStatusLabel(status) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  if (status === 'expired') return 'Expired after 24 hours';
  return 'Waiting for a response · 24 hours';
}

function conversationBubble(message) {
  const own = message.fromId === activeUserId();
  const gif = safeGifUrl(message.gifUrl) ? `<img src="${escapeHtml(message.gifUrl)}" alt="${escapeHtml(message.gifTitle || 'GIF')}" />` : '';
  const pendingTransfer = message.transferId && message.transferStatus === 'pending';
  const canAct = pendingTransfer && message.transferActionable === true;
  const transferCard = message.transferId
    ? `<div class="transfer-card ${message.transferStatus || 'pending'}">
        <b>${message.transferType === 'request' ? 'Credit request' : 'Credit transfer'} · ${escapeHtml(formatCredits(message.transferAmount))}</b>
        <span>${escapeHtml(transferStatusLabel(message.transferStatus))}</span>
        ${canAct ? `<div class="transfer-card-actions"><button type="button" data-wallet-transfer-respond="accept" data-transfer-id="${escapeHtml(message.transferId)}">Accept</button><button type="button" class="ghost" data-wallet-transfer-respond="decline" data-transfer-id="${escapeHtml(message.transferId)}">Decline</button></div>` : ''}
      </div>`
    : '';
  return `<div class="conversation-bubble ${own ? 'own' : 'theirs'}">${message.content ? `<p>${escapeHtml(message.content)}</p>` : ''}${gif}${transferCard}<small>${timeAgo(message.createdAt)}</small></div>`;
}

async function loadConversation(member) {
  if (!member || !conversationMessages) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'conversation', withUserId: member.id, username: member.username, ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not load this conversation.');
    if (!response.ok) throw new Error(result.error || 'Could not load this conversation.');
    const messages = result.messages || [];
    conversationMessages.innerHTML = messages.length ? messages.map((message) => conversationBubble(message)).join('') : '<p class="conversation-empty">Start a conversation with this member.</p>';
    conversationMessages.scrollTop = conversationMessages.scrollHeight;
    void loadMessages();
  } catch (error) {
    conversationMessages.innerHTML = '<p class="conversation-empty">No messages yet.</p>';
    if (!conversationError?.textContent || conversationError.hidden) {
      setConversationHold(error.message || 'Could not load this conversation.');
    }
  }
}

function renderMessageUserResults() {
  if (!messageUserResults) return;
  const query = String(messageUserSearch?.value || '').trim().toLowerCase();
  const users = [...internetUsers.values()].filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(query)).slice(0, 8);
  messageUserResults.innerHTML = users.length
    ? users.map((user) => `<button type="button" data-message-user="${escapeHtml(user.id)}"><img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(user.displayName)}</b><small>@${escapeHtml(user.username)}</small></span></button>`).join('')
    : '<p>No members found.</p>';
}

async function submitReportReview({ reportId, decision, moderationAction, reason = '', durationDays = 'forever' }) {
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'report-review', reportId, decision, moderationAction, reason, durationDays }) });
    const result = await readApiJson(response, 'Could not review this report.');
    if (!response.ok) throw new Error(result.error || 'Could not review this report.');
    await loadModeration();
    return true;
  } catch (error) {
    const message = error.message || 'Could not review this report.';
    if (moderationError && moderationModal && !moderationModal.hidden) moderationError.textContent = message;
    else void siteAlert(message, 'Moderation');
    return false;
  }
}

async function reviewReport(button) {
  const decision = button.dataset.reportReview;
  const reportId = button.dataset.reportId;
  const card = button.closest('[data-report-card]');
  const moderationAction = button.dataset.reportAction || card?.querySelector('[data-report-action]')?.value || 'warning';
  if (decision === 'deny') {
    button.disabled = true;
    const ok = await submitReportReview({ reportId, decision, moderationAction });
    button.disabled = false;
    if (ok) await loadPosts();
    return;
  }
  pendingReportReview = { reportId, decision, moderationAction };
  moderationReason.value = '';
  moderationError.textContent = '';
  moderationDurationWrap.hidden = moderationAction !== 'ban';
  moderationModal.hidden = false;
  moderationReason.focus();
}

async function runPostAction(action, postId) {
  const post = allPosts.find((item) => item.id === postId);
  if (!post) return;
  const kind = contentKindLabel(post);
  let content = '';
  let reason = '';
  if (action === 'edit') {
    content = await sitePrompt({
      title: `Edit ${kind}`,
      message: `Update your ${kind} text.`,
      label: kind === 'comment' ? 'Comment' : 'Post',
      value: post.content || '',
      placeholder: kind === 'comment' ? 'Write a comment…' : 'What is happening?',
      confirmLabel: 'Save',
      maxLength: 500,
    });
    if (content == null || !String(content).trim()) return;
  }
  if (action === 'report') {
    reason = await sitePrompt({
      title: `Report ${kind}`,
      message: `Tell staff why this ${kind} should be reviewed.`,
      label: 'Reason',
      value: '',
      placeholder: 'Describe the issue…',
      confirmLabel: 'Send report',
      maxLength: 300,
    });
    if (reason == null || !String(reason).trim()) return;
  }
  if (action === 'delete' && !(await siteConfirm(`Delete this ${kind}? This cannot be undone.`, `Delete ${kind}`, 'Delete'))) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, postId, content, reason }) });
    const result = await readApiJson(response, `Could not update this ${kind}.`);
    if (!response.ok) throw new Error(result.error || `Could not update this ${kind}.`);
    await loadPosts();
    if (action === 'report') void siteAlert('Report sent to the staff panel.', 'Report sent');
    if (action === 'delete' && activeReelId) {
      renderReelPanel(activeReelId);
      const sheet = document.querySelector('[data-reel-comments]');
      if (sheet && !sheet.hidden) openReelComments(activeReelId);
    }
  } catch (error) {
    void siteAlert(error.message || `Could not update this ${kind}.`);
  }
}

async function loadPosts() {
  if (loadingPosts) {
    loadPostsQueued = true;
    return;
  }
  loadingPosts = true;
  try {
    // A unique query value prevents an intermediary cache from returning an
    // older feed to one member while other members see newer posts.
    const response = await fetch('/api/internet', {
      cache: 'default',
      credentials: 'same-origin',
    });
    const result = await readApiJson(response, 'Clearwater Internet could not reach the website service.');
    if (!response.ok) throw new Error(result.error || 'Service unavailable');
    allPosts = uniquePostsById(result.posts || []);
    internetUsers = new Map((result.users || []).map((user) => [user.id, user]));
    const feedFingerprint = allPosts.map((post) => `${post.id}:${Array.isArray(post.likes) ? post.likes.length : 0}:${post.editedAt || post.createdAt || ''}`).join('|');
    const sameFeed = feedFingerprint === lastFeedFingerprint;
    lastFeedFingerprint = feedFingerprint;
    applySiteBanner(result.settings?.siteBanner || null);
    applyOfficialPostBanner(result.settings?.officialPostBanner || null);
    if (result.settings) {
      postBoostPricing = {
        cost: Number(result.settings.postBoostCost) || POST_BOOST_COST_FALLBACK,
        hours: Number(result.settings.postBoostHours) || 12,
        dailyCap: Number(result.settings.postBoostDailyCap) || 5,
        paused: result.settings.pausePostBoosts === true,
      };
    }
    if (Array.isArray(result.ads)) sidebarAds = result.ads;
    if (Array.isArray(result.feedAds)) feedAds = result.feedAds;
    if (Array.isArray(result.reelAds)) reelAds = result.reelAds;
    if (result.adPricing) adPricing = { ...adPricing, ...result.adPricing };
    syncAdBoostLabels();
    renderSidebarAds(sidebarAds);
    renderSideSuggestions();
    officialAccountId = result.officialUserId || [...internetUsers.values()].find((user) => user.official)?.id || officialAccountId;
    updateAccountSwitcher();
    const official = internetUsers.get(officialAccountId);
    if (sessionIsOwner && official) {
      const setValue = (selector, value) => { const field = document.querySelector(selector); if (field && document.activeElement !== field) field.value = value || ''; };
      const editableUrl = (value) => (/^assets\//i.test(value || '') || (/^https:\/\//i.test(value || '') && !value.includes('/api/media'))) ? value : '';
      setValue('[data-official-name]', official.displayName);
      setValue('[data-official-username]', official.username);
      setValue('[data-official-bio]', official.bio);
      setValue('[data-official-avatar-url]', editableUrl(official.avatarUrl));
      setValue('[data-official-banner-url]', editableUrl(official.bannerUrl));
    }
    refreshProfileVerified();
    if (!sameFeed) renderPosts();
    renderOwnProfileDetails();
    const route = readInternetRoute();
    if (route.view === 'post' && route.id) showPostDetail(route.id, false);
    if (route.view === 'member' && route.id) openMemberProfile(route.id, false);
    else if (pendingProfileUsername) {
      const pending = findMemberByUsername(pendingProfileUsername);
      if (pending) openMemberProfile(pending.id, false);
      else {
        const nameEl = document.querySelector('[data-member-page-name]');
        const copyEl = document.querySelector('[data-member-page-copy]');
        const postsEl = document.querySelector('[data-member-page-posts]');
        if (nameEl) nameEl.textContent = 'Profile not found';
        if (copyEl) copyEl.textContent = 'That profile could not be found.';
        if (postsEl) postsEl.innerHTML = '<p>Profile not found.</p>';
        pendingProfileUsername = '';
      }
    }
    if (!document.querySelector('[data-view="messages"]')?.hidden) void loadMessages();
    if (!document.querySelector('[data-view="conversation"]')?.hidden && viewedMember) void loadConversation(viewedMember);
  } catch (error) {
    note.hidden = false;
    const detail = String(error?.message || '').trim();
    note.textContent = detail && !/restart the clearwater discord bot host/i.test(detail)
      ? detail
      : 'Clearwater Internet is offline right now. Restart the Clearwater Discord bot host to restore posting.';
  } finally {
    loadingPosts = false;
    if (loadPostsQueued) {
      loadPostsQueued = false;
      void loadPosts();
    }
  }
}

async function loadSession() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const session = await readApiJson(response, 'Discord sign-in is temporarily unavailable.');
  if (session.vpnBlocked === true) {
    const next = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    location.replace(`/signin?error=vpn&next=${next}`);
    return false;
  }
  if (!session.authenticated || !session.user) {
    document.body.classList.remove('internet-signed-in');
    if (login) login.hidden = false;
    return false;
  }
  document.body.classList.add('internet-signed-in');
  if (login) {
    login.hidden = true;
    login.setAttribute('hidden', '');
    login.style.display = 'none';
  }
  if (userBox) userBox.hidden = true;
  if (composer) composer.hidden = !(feedTab === 'foryou' || feedTab === 'recent');
  if (signedOut) signedOut.hidden = true;
  name.textContent = session.user.displayName || session.user.username;
  if (session.user.avatarUrl) { avatar.src = session.user.avatarUrl; composerAvatar.src = session.user.avatarUrl; }
  rank.textContent = session.user.staffRank || '';
  currentUserId = session.user.id;
  sessionUser = session.user;
  sessionStaffPanel = session.user.staffPanel === 'full' || session.user.staffPanel === 'limited'
    ? session.user.staffPanel
    : (session.user.owner === true ? 'full' : null);
  sessionCanStaff = Boolean(sessionStaffPanel);
  sessionCanGovernment = session.user.governmentAccess === true || session.user.owner === true;
  sessionCanGovernmentReview = session.user.governmentReview === true || session.user.owner === true;
  sessionIsOwner = sessionStaffPanel === 'full';
  if (profileTitle) profileTitle.textContent = session.user.displayName || session.user.username;
  if (profileCopy) profileCopy.textContent = session.user.bio || (session.user.staffRank ? `${session.user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.');
  if (profileAvatar && session.user.avatarUrl) profileAvatar.src = session.user.avatarUrl;
  setBannerImage(profileBanner, session.user.bannerUrl, session.user.bannerColor);
  if (profileDiscord) profileDiscord.href = 'https://discord.gg/839teFCwB';
  if (profileHandle) profileHandle.textContent = `@${session.user.username}`;
  refreshProfileVerified();
  if (staffLink) {
    staffLink.hidden = !sessionCanStaff;
    staffLink.toggleAttribute('hidden', !sessionCanStaff);
    staffLink.setAttribute('aria-hidden', sessionCanStaff ? 'false' : 'true');
  }
  if (governmentLink) {
    governmentLink.hidden = !sessionCanGovernment;
    governmentLink.toggleAttribute('hidden', !sessionCanGovernment);
    governmentLink.setAttribute('aria-hidden', sessionCanGovernment ? 'false' : 'true');
  }
  if (admin) admin.hidden = !sessionIsOwner;
  if (officialAccountOption) officialAccountOption.hidden = !sessionIsOwner;
  if (officialProfileControls) officialProfileControls.hidden = !sessionIsOwner;
  accountSwitch.hidden = false;
  const savedAccount = localStorage.getItem(`clearwater-posting-account-${currentUserId}`) || 'personal';
  if (savedAccount === 'official' && sessionIsOwner) activeAccount = 'official';
  else if (String(savedAccount).startsWith('business:')) activeAccount = savedAccount;
  else activeAccount = 'personal';
  onboardingWalletVisited = localStorage.getItem(`clearwater-onboarding-wallet-${currentUserId}`) === '1';
  document.querySelector('[data-personal-account-avatar]').src = session.user.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-personal-account-name]').textContent = session.user.displayName || session.user.username;
  updateAccountSwitcher();
  restoreComposerDraft();
  renderProfilePosts();
  renderPosts();
  try {
    await loadBanStatus();
    void pulsePresence(currentInternetView());
    await loadWarnings();
    await loadMessages();
    if (!document.querySelector('[data-view="notifications"]')?.hidden) await loadNotifications();
    await loadSocial();
    await loadPreferences();
    await loadAccountExtras();
    if (String(activeAccount).startsWith('business:') && !activeBusinessAccount()) activeAccount = 'personal';
    updateAccountSwitcher();
    void loadWallet();
    renderOwnProfileDetails();
    renderOnboardingChecklist();
    // Landing straight on /internet/settings renders the view before the
    // session exists, so the editor has to be filled once sign-in resolves.
    if (!document.querySelector('[data-view="settings"]')?.hidden) await loadProfileEditor();
  } catch {
    // Session is valid even if a secondary inbox or settings call fails.
  }
  return true;
}

content?.addEventListener('input', () => {
  count.textContent = `${content.value.length} / 500`;
  postButton.disabled = !canComposePost();
  updateComposerHighlight();
  syncMentionSuggest();
  // Preview only — nothing is held until the server accepts the post and
  // writes an automod report for the staff queue.
  if (postMessage) postMessage.textContent = scanClientContent(content.value) ? AUTOMOD_HOLD_PREVIEW : '';
  window.clearTimeout(composerDraftTimer);
  composerDraftTimer = window.setTimeout(() => saveComposerDraft(), 400);
});
content?.addEventListener('keydown', (event) => {
  const box = document.querySelector('[data-mention-suggest]');
  if (!box || box.hidden) return;
  const options = [...box.querySelectorAll('[data-mention-pick]')];
  if (!options.length && event.key !== 'Escape') return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    mentionSuggestIndex = Math.min(mentionSuggestIndex + 1, Math.max(options.length - 1, 0));
    options.forEach((button, index) => button.classList.toggle('selected', index === mentionSuggestIndex));
    options[mentionSuggestIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    mentionSuggestIndex = Math.max(mentionSuggestIndex - 1, 0);
    options.forEach((button, index) => button.classList.toggle('selected', index === mentionSuggestIndex));
    options[mentionSuggestIndex]?.scrollIntoView({ block: 'nearest' });
  } else if ((event.key === 'Enter' || event.key === 'Tab') && options[mentionSuggestIndex]) {
    event.preventDefault();
    applyMentionPick(options[mentionSuggestIndex].dataset.mentionPick);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hideMentionSuggest();
  }
});
content?.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (!document.querySelector('[data-mention-suggest]:hover') && document.activeElement !== content) {
      hideMentionSuggest();
    }
  }, 120);
});
content?.addEventListener('click', syncMentionSuggest);
content?.addEventListener('keyup', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) syncMentionSuggest();
});
document.querySelector('[data-reel-caption]')?.addEventListener('input', () => {
  window.clearTimeout(composerDraftTimer);
  composerDraftTimer = window.setTimeout(() => saveReelDraft(), 400);
});
document.querySelector('[data-bookmark-collection-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('[data-bookmark-collection-name]');
  try {
    await socialAction('bookmark-collection-create', { collectionName: input?.value || '' });
    if (input) input.value = '';
    renderBookmarks();
  } catch (error) {
    void siteAlert(error.message || 'Could not create that collection.');
  }
});
document.querySelector('[data-drop-location]')?.addEventListener('click', async () => {
  if (!currentUserId) { window.location.href = signInUrl(); return; }
  await refreshDropLocation();
});
search?.addEventListener('input', () => { showView('home'); renderPosts(); });
document.querySelectorAll('[data-feed-tab]').forEach((button) => button.addEventListener('click', () => {
  feedTab = button.dataset.feedTab || 'foryou';
  localStorage.setItem('clearwater-feed-tab', feedTab);
  showView('home');
  renderPosts();
}));
document.querySelectorAll('[data-staff-tab]').forEach((button) => button.addEventListener('click', () => {
  staffTab = button.dataset.staffTab || 'overview';
  renderStaffDashboard();
}));
document.querySelector('[data-staff-user-search]')?.addEventListener('input', (event) => {
  staffUserQuery = event.target.value || '';
  staffTab = 'users';
  if (staffSearchTimer) window.clearTimeout(staffSearchTimer);
  const query = staffUserQuery.trim();
  if (!query) {
    staffSearchResults = null;
    staffSearchBusy = false;
    renderStaffDashboard();
    return;
  }
  staffSearchBusy = true;
  renderStaffDashboard();
  staffSearchTimer = window.setTimeout(() => {
    void runStaffUserSearch(query);
  }, /^\d{16,22}$/.test(query) ? 120 : 280);
});

async function runStaffUserSearch(query) {
  if (!sessionCanStaff) return;
  const needle = String(query || '').trim();
  if (!needle) {
    staffSearchResults = null;
    staffSearchBusy = false;
    renderStaffDashboard();
    return;
  }
  staffSearchBusy = true;
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'staff-user-search', query: needle, limit: 80 }),
    });
    const result = await readApiJson(response, 'Could not search users.');
    if (!response.ok) throw new Error(result.error || 'Could not search users.');
    if (staffUserQuery.trim() !== needle) return;
    staffSearchResults = Array.isArray(result.users) ? result.users : [];
    if (/^\d{16,22}$/.test(needle) && staffSearchResults[0]?.id === needle) {
      selectedStaffUserId = needle;
      void loadStaffUserDetail(needle);
    }
  } catch {
    if (staffUserQuery.trim() === needle) staffSearchResults = [];
  } finally {
    if (staffUserQuery.trim() === needle) staffSearchBusy = false;
    renderStaffDashboard();
  }
}
document.querySelector('[data-history-search]')?.addEventListener('input', (event) => {
  staffHistoryQuery = event.target.value || '';
  renderStaffDashboard();
});
const LOCAL_APPEARANCE_PREFS = new Set(['compactPosts', 'largeText', 'reduceMotion', 'autoplayReels']);

document.querySelectorAll('[data-preference]').forEach((input) => input.addEventListener('change', async () => {
  if (!currentUserId) {
    input.checked = false;
    void siteAlert('Sign in to change settings.');
    return;
  }
  const key = input.dataset.preference;
  const original = key === 'autoplayReels' ? isReelAutoplayEnabled() : preferenceState[key] === true;
  const nextValue = input.checked === true;
  const previous = { ...preferenceState };
  const localOnly = LOCAL_APPEARANCE_PREFS.has(key);
  applyPreferenceState({ [key]: nextValue });
  localStorage.setItem(`clearwater-preferences-${currentUserId}`, JSON.stringify(preferenceState));
  if (key === 'autoplayReels') {
    if (nextValue) {
      reelsSoundOn = true;
      if (reelsVolume <= 0) reelsVolume = 1;
      persistReelAudioPrefs();
      unlockReelAudio();
    }
    if (feedTab === 'reels') bindReelAutoplay();
  } else if (['compactPosts', 'largeText', 'reduceMotion', 'hideStats'].includes(key)) renderPosts();
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preference-save', key, enabled: nextValue }) });
    const result = await readApiJson(response, 'Could not save this setting.');
    if (!response.ok) {
      const detail = String(result.error || '');
      if (/unsupported action/i.test(detail)) {
        throw new Error('Settings need the latest bot host files and a restart.');
      }
      throw new Error(detail || 'Could not save this setting.');
    }
    // Keep the just-toggled value if the host omits keys from an older payload.
    applyPreferenceState({ ...(result.preferences || {}), [key]: nextValue });
    localStorage.setItem(`clearwater-preferences-${currentUserId}`, JSON.stringify(preferenceState));
    if (currentUserId && ['hideLikes', 'hideStats', 'hideFollowing', 'hideProfile', 'followersOnly'].includes(key)) {
      const me = internetUsers.get(currentUserId);
      if (me) me[key] = nextValue;
      if (viewedMember?.id === currentUserId) viewedMember[key] = nextValue;
    }
    renderOwnProfileDetails();
    if (['followersOnly', 'hideProfile', 'hideFollowing'].includes(key)) await loadPosts();
    if (key === 'hideLikes' && viewedMember) openMemberProfile(viewedMember.id, false);
  } catch (error) {
    if (localOnly) {
      // Appearance still applies on this device even if the bot host is stale.
      return;
    }
    applyPreferenceState(previous);
    localStorage.setItem(`clearwater-preferences-${currentUserId}`, JSON.stringify(previous));
    input.checked = original;
    void siteAlert(error.message || 'Could not save this setting.');
  }
}));
document.addEventListener('click', (event) => {
  const sponsored = event.target.closest('[data-open-sponsored]');
  if (sponsored) {
    event.preventDefault();
    trackAdClick(sponsored.dataset.openSponsored || '', 'learn');
    showSponsoredPage(sponsored.dataset.openSponsored || '');
    return;
  }
  const link = event.target.closest('[data-view-link]');
  if (!link) return;
  event.preventDefault();
  const view = link.dataset.viewLink || 'home';
  if (view === 'profile' && activeAccount === 'official') { openMemberProfile(officialAccountId); return; }
  if (view === 'profile' && activeBusinessAccount()) { openMemberProfile(activeBusinessAccount().id); return; }
  if (view === 'sponsored') {
    showSponsoredPage('');
    return;
  }
  // Home is always the regular post feed. Without this reset, the saved Reels
  // tab could leave the Reels surface open even after someone clicked Home.
  if (view === 'home') {
    feedTab = 'foryou';
    localStorage.setItem('clearwater-feed-tab', feedTab);
    pauseReelVideos();
  }
  if (currentInternetPath() === internetUrl(view) && !location.hash) showView(view);
  else {
    history.pushState({}, '', internetUrl(view));
    showView(view);
  }
});
document.querySelector('[data-compose-link]')?.addEventListener('click', () => {
  if (!currentUserId) { window.location.href = signInUrl(); return; }
  history.pushState({}, '', internetUrl('home'));
  showView('home');
  content?.focus();
});
document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => {
  profileTab = button.dataset.profileTab || 'posts';
  document.querySelectorAll('[data-profile-tab]').forEach((tab) => tab.classList.toggle('selected', tab === button));
  renderProfilePosts();
}));
document.querySelectorAll('[data-member-tab]').forEach((button) => button.addEventListener('click', () => {
  memberTab = button.dataset.memberTab || 'posts';
  document.querySelectorAll('[data-member-tab]').forEach((tab) => tab.classList.toggle('selected', tab === button));
  if (viewedMember) openMemberProfile(viewedMember.id, false);
}));
document.querySelector('[data-edit-profile]')?.addEventListener('click', () => {
  history.pushState({}, '', internetUrl('settings'));
  showView('settings');
  showSettingsTab('profile');
});
document.querySelector('[data-profile-following]')?.addEventListener('click', () => {
  toggleProfileConnections('following');
});
document.querySelector('[data-profile-followers]')?.addEventListener('click', () => {
  toggleProfileConnections('followers');
});
document.querySelector('[data-member-page-following]')?.addEventListener('click', () => {
  toggleMemberConnections('following');
});
document.querySelector('[data-member-page-followers]')?.addEventListener('click', () => {
  toggleMemberConnections('followers');
});
document.querySelector('[data-close-connections]')?.addEventListener('click', () => {
  closeConnectionsModal();
});
connectionsModal?.addEventListener('click', (event) => {
  if (event.target === connectionsModal) closeConnectionsModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && connectionsModal && !connectionsModal.hidden) closeConnectionsModal();
});
document.querySelectorAll('[data-settings-tab]').forEach((button) => button.addEventListener('click', () => {
  showSettingsTab(button.dataset.settingsTab || 'profile');
}));
document.querySelector('[data-settings-logout]')?.addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* Sign-out still clears the page. */ }
  window.location.href = '/internet';
});

document.querySelector('[data-verify-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-verify-status]');
  const submit = document.querySelector('[data-verify-submit]');
  if (submit) submit.disabled = true;
  if (status) { status.dataset.tone = 'wait'; status.textContent = 'Submitting verification request...'; }
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verify-apply',
        reason: document.querySelector('[data-verify-reason]')?.value || '',
      }),
    });
    const result = await readApiJson(response, 'Could not submit verification request.');
    if (!response.ok) throw new Error(result.error || 'Could not submit verification request.');
    myVerificationApp = result.verification || result.application || null;
    const reason = document.querySelector('[data-verify-reason]');
    if (reason) reason.value = '';
    renderVerificationPane();
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not submit verification request.';
    }
  } finally {
    if (submit) submit.disabled = false;
  }
});

document.querySelector('[data-business-avatar]')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  const preview = document.querySelector('[data-business-avatar-preview]');
  if (businessAvatarDraft?.previewUrl) URL.revokeObjectURL(businessAvatarDraft.previewUrl);
  businessAvatarDraft = null;
  if (!file) {
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    return;
  }
  businessAvatarDraft = { file, previewUrl: URL.createObjectURL(file) };
  if (preview) {
    preview.hidden = false;
    preview.innerHTML = `<img src="${escapeHtml(businessAvatarDraft.previewUrl)}" alt="Business logo preview" />`;
  }
});

document.addEventListener('change', (event) => {
  const input = event.target.closest('[data-biz-avatar]');
  if (!input) return;
  const form = input.closest('[data-biz-profile-form]');
  const businessId = form?.dataset.bizProfileForm;
  if (!businessId) return;
  const file = input.files?.[0];
  const preview = form.querySelector('[data-biz-avatar-preview]');
  const status = form.querySelector('[data-biz-profile-status]');
  revokeBusinessEditAvatarDraft(businessId);
  if (!file) {
    const biz = myBusinessAccounts.find((item) => item.id === businessId);
    if (preview) {
      if (biz?.avatarUrl) {
        preview.hidden = false;
        preview.innerHTML = `<img src="${escapeHtml(biz.avatarUrl)}" alt="Business logo preview" />`;
      } else {
        preview.hidden = true;
        preview.innerHTML = '';
      }
    }
    return;
  }
  if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type || '')) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = 'Choose a PNG, JPEG, WebP, or GIF image.';
    }
    input.value = '';
    return;
  }
  const previewUrl = URL.createObjectURL(file);
  businessEditAvatarDrafts.set(businessId, { file, previewUrl });
  if (preview) {
    preview.hidden = false;
    preview.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Business logo preview" />`;
  }
  if (status) {
    status.dataset.tone = '';
    status.textContent = 'New logo selected. Save to publish it.';
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-biz-profile-form]');
  if (!form) return;
  event.preventDefault();
  const businessId = form.dataset.bizProfileForm;
  const status = form.querySelector('[data-biz-profile-status]');
  const save = form.querySelector('[data-biz-profile-save]');
  if (save) save.disabled = true;
  if (status) { status.dataset.tone = 'wait'; status.textContent = 'Saving business profile...'; }
  try {
    const draft = businessEditAvatarDrafts.get(businessId);
    let avatarUrl;
    if (draft?.file) {
      if (status) status.textContent = 'Uploading logo...';
      const uploaded = await uploadAdMedia(draft.file, false);
      avatarUrl = uploaded.image?.url || '';
      if (!avatarUrl) throw new Error('Could not upload that logo.');
    }
    const payload = {
      action: 'business-update',
      businessId,
      displayName: form.querySelector('[data-biz-name]')?.value || '',
      bio: form.querySelector('[data-biz-bio]')?.value || '',
      category: form.querySelector('[data-biz-category]')?.value || 'business',
    };
    if (avatarUrl) payload.avatarUrl = avatarUrl;
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await readApiJson(response, 'Could not update that business profile.');
    if (!response.ok) throw new Error(result.error || 'Could not update that business profile.');
    myBusinessAccounts = Array.isArray(result.businesses) ? result.businesses : myBusinessAccounts;
    const updated = result.business || myBusinessAccounts.find((item) => item.id === businessId);
    if (updated) syncBusinessUserLocally(updated);
    revokeBusinessEditAvatarDraft(businessId);
    renderBusinessAccountsPane();
    updateAccountSwitcher();
    if (viewedMember?.id === businessId) openMemberProfile(businessId, false);
    const nextStatus = document.querySelector(`[data-biz-profile-form="${CSS.escape(businessId)}"] [data-biz-profile-status]`);
    if (nextStatus) {
      nextStatus.dataset.tone = 'ok';
      nextStatus.textContent = 'Business profile saved.';
    }
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not update that business profile.';
    }
  } finally {
    if (save) save.disabled = false;
  }
});

document.querySelector('[data-member-page-edit-business]')?.addEventListener('click', () => {
  const businessId = document.querySelector('[data-member-page-edit-business]')?.dataset.businessId;
  if (!businessId || !canManageBusinessProfile(businessId)) return;
  openBusinessProfileEditor(businessId);
});

document.querySelector('[data-business-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-business-status]');
  const submit = document.querySelector('[data-business-submit]');
  if (submit) submit.disabled = true;
  if (status) { status.dataset.tone = 'wait'; status.textContent = 'Submitting business account...'; }
  try {
    let avatarUrl = '';
    if (businessAvatarDraft?.file) {
      if (status) status.textContent = 'Uploading logo...';
      const uploaded = await uploadAdMedia(businessAvatarDraft.file, false);
      avatarUrl = uploaded.image?.url || '';
    }
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'business-apply',
        displayName: document.querySelector('[data-business-name]')?.value || '',
        username: document.querySelector('[data-business-username]')?.value || '',
        category: document.querySelector('[data-business-category]')?.value || 'business',
        bio: document.querySelector('[data-business-bio]')?.value || '',
        avatarUrl,
      }),
    });
    const result = await readApiJson(response, 'Could not submit business account.');
    if (!response.ok) throw new Error(result.error || 'Could not submit business account.');
    myBusinessAccounts = Array.isArray(result.businesses) ? result.businesses : (result.business ? [result.business, ...myBusinessAccounts] : myBusinessAccounts);
    document.querySelector('[data-business-name]').value = '';
    document.querySelector('[data-business-username]').value = '';
    document.querySelector('[data-business-bio]').value = '';
    document.querySelector('[data-business-category]').value = 'business';
    const avatarInput = document.querySelector('[data-business-avatar]');
    if (avatarInput) avatarInput.value = '';
    if (businessAvatarDraft?.previewUrl) URL.revokeObjectURL(businessAvatarDraft.previewUrl);
    businessAvatarDraft = null;
    const preview = document.querySelector('[data-business-avatar-preview]');
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    renderBusinessAccountsPane();
    if (status) {
      status.dataset.tone = 'ok';
      status.textContent = 'Business account submitted for staff approval.';
    }
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not submit business account.';
    }
  } finally {
    if (submit) submit.disabled = false;
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-biz-member-form]');
  if (!form) return;
  event.preventDefault();
  const businessId = form.dataset.bizMemberForm;
  const status = document.querySelector('[data-business-status]');
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'business-member-add',
        businessId,
        username: form.querySelector('[data-member-username]')?.value || '',
        role: form.querySelector('[data-member-role]')?.value || 'poster',
      }),
    });
    const result = await readApiJson(response, 'Could not add that member.');
    if (!response.ok) throw new Error(result.error || 'Could not add that member.');
    myBusinessAccounts = Array.isArray(result.businesses) ? result.businesses : myBusinessAccounts;
    renderBusinessAccountsPane();
    if (status) { status.dataset.tone = 'ok'; status.textContent = 'Member added.'; }
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not add that member.';
    } else {
      void siteAlert(error.message || 'Could not add that member.');
    }
  }
});

document.addEventListener('click', async (event) => {
  const remove = event.target.closest('[data-biz-remove]');
  const roleBtn = event.target.closest('[data-biz-role]');
  if (!remove && !roleBtn) return;
  const status = document.querySelector('[data-business-status]');
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remove ? {
        action: 'business-member-remove',
        businessId: remove.dataset.bizRemove,
        targetId: remove.dataset.memberId,
      } : {
        action: 'business-member-role',
        businessId: roleBtn.dataset.bizRole,
        targetId: roleBtn.dataset.memberId,
        role: roleBtn.dataset.role === 'manager' ? 'manager' : 'poster',
      }),
    });
    const result = await readApiJson(response, 'Could not update members.');
    if (!response.ok) throw new Error(result.error || 'Could not update members.');
    myBusinessAccounts = Array.isArray(result.businesses) ? result.businesses : myBusinessAccounts;
    renderBusinessAccountsPane();
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not update members.';
    } else {
      void siteAlert(error.message || 'Could not update members.');
    }
  }
});

document.querySelector('[data-ad-business-id]')?.addEventListener('change', () => {
  syncAdBusinessAutofill();
});

const profileDraftField = (key, selector, transform = (value) => value) => {
  document.querySelector(selector)?.addEventListener('input', (event) => {
    if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    profileDraft[key] = transform(event.target.value || '');
    renderProfilePreview();
  });
};
profileDraftField('bio', '[data-profile-bio]');
document.querySelector('[data-accent-clear]')?.addEventListener('click', () => {
  if (!profileDraft) return;
  profileDraft.accentColor = '';
  setAccentHsvFromHex('', { draft: false, preview: true });
});
document.querySelector('[data-banner-clear]')?.addEventListener('click', () => {
  if (!profileDraft) return;
  profileDraft.bannerUrl = '';
  renderProfilePreview();
});
document.querySelector('[data-banner-presets]')?.addEventListener('click', (event) => {
  const preset = event.target.closest('[data-banner-preset]');
  if (!preset || !profileDraft) return;
  profileDraft.bannerUrl = preset.dataset.bannerPreset || '';
  renderProfilePreview();
});
document.querySelector('[data-accent-swatches]')?.addEventListener('click', (event) => {
  const swatch = event.target.closest('[data-accent-swatch]');
  if (!swatch || !profileDraft) return;
  setAccentHsvFromHex(swatch.dataset.accentSwatch || '', { draft: true, preview: true });
});
document.querySelector('[data-profile-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!profileDraft) return;
  const save = document.querySelector('[data-profile-save]');
  if (save) save.disabled = true;
  setProfileStatus('Saving...');
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'profile-save',
        profile: {
          bio: profileDraft.bio || '',
          pronouns: '',
          location: '',
          website: '',
          bannerUrl: profileDraft.bannerUrl || '',
          accentColor: profileDraft.accentColor || '',
          pinnedPostId: '',
        },
      }),
    });
    const result = await readApiJson(response, 'Could not save your profile.');
    if (!response.ok) {
      const detail = String(result.error || '');
      if (/owner access required|unsupported action/i.test(detail)) {
        throw new Error('Profile saving is on the website, but the bot host still needs the latest GitHub files and a restart.');
      }
      throw new Error(detail || 'Could not save your profile.');
    }
    profileDraft = { ...DEFAULT_PROFILE_DRAFT, ...(result.profile || {}) };
    fillProfileEditor();
    const me = internetUsers.get(currentUserId);
    if (me) {
      me.bannerUrl = profileDraft.bannerUrl || '';
      me.bio = profileDraft.bio || '';
      me.pronouns = '';
      me.location = '';
      me.website = '';
      me.accentColor = profileDraft.accentColor || '';
      me.pinnedPostId = '';
      internetUsers.set(currentUserId, me);
      renderOwnProfileDetails();
    }
    setProfileStatus('Profile saved.', 'ok');
    await loadPosts();
    renderOwnProfileDetails();
    renderOnboardingChecklist();
  } catch (error) {
    setProfileStatus(error.message || 'Could not save your profile.', 'error');
  } finally {
    if (save) save.disabled = false;
  }
});
document.querySelector('[data-deactivate]')?.addEventListener('click', async () => {
  const status = document.querySelector('[data-account-status]');
  const deactivate = profileDraft?.deactivated !== true;
  if (deactivate && !(await siteConfirm('Deactivate your account? Your profile, posts, and Reels will be hidden until you reactivate.', 'Deactivate account'))) return;
  if (status) { status.textContent = deactivate ? 'Deactivating...' : 'Reactivating...'; status.dataset.tone = ''; }
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'account-active', deactivated: deactivate }) });
    const result = await readApiJson(response, 'Could not update your account.');
    if (!response.ok) throw new Error(result.error || 'Could not update your account.');
    if (profileDraft) profileDraft.deactivated = result.deactivated === true;
    fillAccountPane();
    if (status) { status.textContent = result.deactivated ? 'Your account is deactivated.' : 'Your account is active again.'; status.dataset.tone = 'ok'; }
    await loadPosts();
  } catch (error) {
    if (status) { status.textContent = error.message || 'Could not update your account.'; status.dataset.tone = 'error'; }
  }
});
document.querySelector('[data-delete-account]')?.addEventListener('click', async () => {
  const status = document.querySelector('[data-account-status]');
  const typed = await sitePrompt({
    title: 'Delete account',
    message: 'This permanently erases your account, posts, Reels, and messages.',
    label: 'Type DELETE to confirm',
    placeholder: 'DELETE',
    confirmLabel: 'Delete forever',
    maxLength: 20,
  });
  if (String(typed || '').trim().toLowerCase() !== 'delete') return;
  if (status) { status.textContent = 'Deleting your account...'; status.dataset.tone = ''; }
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'account-delete', confirm: 'delete' }) });
    const result = await readApiJson(response, 'Could not delete your account.');
    if (!response.ok) throw new Error(result.error || 'Could not delete your account.');
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* The account is already gone. */ }
    window.location.href = '/';
  } catch (error) {
    if (status) { status.textContent = error.message || 'Could not delete your account.'; status.dataset.tone = 'error'; }
  }
});
document.addEventListener('input', (event) => {
  const reelVolume = event.target.closest?.('[data-reel-volume]');
  if (!reelVolume) return;
  unlockReelAudio();
  setReelVolume(Number(reelVolume.value) / 100);
  const video = reelVolume.closest('.reel-card')?.querySelector('video');
  if (video && !video.paused) applyReelVolume(video);
});
document.addEventListener('click', (event) => {
  const notificationPost = event.target.closest('[data-notification-post]');
  if (notificationPost) {
    showPostDetail(notificationPost.dataset.notificationPost, true, {
      highlightReplyId: notificationPost.dataset.notificationReply || null,
    });
    return;
  }
  const notificationMessage = event.target.closest('[data-notification-message]');
  if (notificationMessage) {
    const id = notificationMessage.dataset.notificationMessage;
    const cached = internetUsers.get(id);
    const nameEl = notificationMessage.querySelector('b');
    const imgEl = notificationMessage.querySelector('img');
    openConversation(cached || {
      id,
      displayName: nameEl?.textContent?.trim() || 'Clearwater member',
      username: '',
      avatarUrl: imgEl?.getAttribute('src') || 'assets/clearwater-logo.png',
      staffRank: null
    });
    return;
  }
  const notificationMember = event.target.closest('[data-notification-member]');
  if (notificationMember) { openMemberProfile(notificationMember.dataset.notificationMember); return; }
  const quotedCard = event.target.closest('[data-open-post]');
  if (quotedCard) {
    if (postModal) postModal.hidden = true;
    showPostDetail(quotedCard.dataset.openPost);
    return;
  }
  const card = event.target.closest('[data-post-card]');
  if (card && !event.target.closest('button,a,details,input,textarea')) { showPostDetail(card.dataset.postCard); return; }
  const emojiChoice = event.target.closest('[data-emoji-choice]');
  if (emojiChoice) { if (pickerTarget === 'message' && conversationInput) { conversationInput.value += emojiChoice.dataset.emojiChoice; conversationInput.focus(); } else insertAtCursor(emojiChoice.dataset.emojiChoice); emojiModal.hidden = true; return; }
  const engage = event.target.closest('[data-engage]');
  if (engage) { void handlePostEngagement(engage.dataset.engage, engage.dataset.postId, engage); return; }
  const pollVote = event.target.closest('[data-poll-vote]');
  if (pollVote) { void voteOnPoll(pollVote.dataset.postId, Number(pollVote.dataset.pollVote)); return; }
  const removePollVote = event.target.closest('[data-poll-remove]');
  if (removePollVote) { void voteOnPoll(removePollVote.dataset.pollRemove, null, true); return; }
  const pollVoters = event.target.closest('[data-poll-voters]');
  if (pollVoters) { showPollVoters(pollVoters.dataset.pollVoters); return; }
  const conversation = event.target.closest('[data-open-conversation]');
  if (conversation) {
    const otherId = conversation.dataset.openConversation || '';
    const member = internetUsers.get(otherId) || {
      id: otherId,
      displayName: conversation.querySelector('b')?.textContent || 'Clearwater member',
      username: 'member',
      avatarUrl: conversation.querySelector('img')?.getAttribute('src') || null,
    };
    if (otherId) {
      internetUsers.set(otherId, { ...(internetUsers.get(otherId) || {}), ...member, id: otherId });
      openConversation(internetUsers.get(otherId));
    }
    return;
  }
  const staffOpenUser = event.target.closest('[data-staff-open-user]');
  if (staffOpenUser) { void openStaffUser(staffOpenUser.dataset.staffOpenUser); return; }
  const staffViewMessages = event.target.closest('[data-staff-view-messages]');
  if (staffViewMessages) {
    const targetId = staffViewMessages.dataset.staffViewMessages || selectedStaffUserId;
    if (targetId) void loadStaffUserMessages(targetId);
    return;
  }
  const staffOpenThread = event.target.closest('[data-staff-open-thread]');
  if (staffOpenThread) {
    void loadStaffUserConversation(
      staffOpenThread.dataset.staffOpenThread,
      staffOpenThread.dataset.staffOpenThreadUsername || '',
    );
    return;
  }
  if (event.target.closest('[data-staff-messages-back]')) {
    if (selectedStaffUserId) void loadStaffUserMessages(selectedStaffUserId);
    return;
  }
  const staffUserAction = event.target.closest('[data-staff-user-action]');
  if (staffUserAction) {
    void runStaffUserAction(
      staffUserAction.dataset.staffUserAction,
      staffUserAction.dataset.staffPostId || '',
      staffUserAction,
    );
    return;
  }
  const staffWalletAdjust = event.target.closest('[data-staff-wallet-adjust]');
  if (staffWalletAdjust) { void runStaffWalletAdjustment(staffWalletAdjust); return; }
  const walletTransferTab = event.target.closest('[data-wallet-transfer-tab]');
  if (walletTransferTab) { setWalletTransferTab(walletTransferTab.dataset.walletTransferTab); return; }
  const walletTransferPick = event.target.closest('[data-wallet-transfer-pick]');
  if (walletTransferPick) {
    const member = internetUsers.get(walletTransferPick.dataset.walletTransferPick);
    if (member) {
      selectWalletTransferTarget(member);
      const search = document.querySelector('[data-wallet-transfer-search]');
      if (search) search.value = '';
    }
    return;
  }
  if (event.target.closest('[data-wallet-transfer-clear]')) {
    selectWalletTransferTarget(null);
    document.querySelector('[data-wallet-transfer-search]')?.focus();
    return;
  }
  const walletTransferRespond = event.target.closest('[data-wallet-transfer-respond]');
  if (walletTransferRespond) {
    void respondWalletTransfer(walletTransferRespond.dataset.transferId, walletTransferRespond.dataset.walletTransferRespond)
      .catch((error) => void siteAlert(error.message || 'Could not update this transfer.'));
    return;
  }
  const staffUsersFilterButton = event.target.closest('[data-staff-users-filter]');
  if (staffUsersFilterButton) {
    staffUsersFilter = staffUsersFilterButton.dataset.staffUsersFilter || 'all';
    staffTab = 'users';
    renderStaffDashboard();
    return;
  }
  const staffBannerPreset = event.target.closest('[data-staff-banner-preset]');
  if (staffBannerPreset) {
    const tools = document.querySelector('[data-staff-site-tools]');
    const message = tools?.querySelector('[data-staff-banner-message]');
    const details = tools?.querySelector('[data-staff-banner-details]');
    const link = tools?.querySelector('[data-staff-banner-link]');
    const linkLabel = tools?.querySelector('[data-staff-banner-link-label]');
    if (staffBannerPreset.dataset.staffBannerPreset === 'maintenance') {
      if (message) message.value = 'Scheduled maintenance is coming up.';
      if (details) details.value = '';
      if (link) link.value = 'https://status.cwrpvc.lol/';
      if (linkLabel) linkLabel.value = 'View status';
    } else {
      if (message) message.value = 'We posted a Clearwater update.';
      if (details) details.value = '';
      if (link) link.value = '';
      if (linkLabel) linkLabel.value = '';
    }
    return;
  }
  const staffSiteAction = event.target.closest('[data-staff-site-action]');
  if (staffSiteAction) {
    const action = staffSiteAction.dataset.staffSiteAction;
    if (action === 'set-site-banner') {
      const tools = document.querySelector('[data-staff-site-tools]');
      void runStaffSiteAction(action, false, {
        message: tools?.querySelector('[data-staff-banner-message]')?.value || '',
        details: tools?.querySelector('[data-staff-banner-details]')?.value || '',
        linkUrl: tools?.querySelector('[data-staff-banner-link]')?.value || '',
        linkLabel: tools?.querySelector('[data-staff-banner-link-label]')?.value || '',
      });
      return;
    }
    void runStaffSiteAction(action, staffSiteAction.dataset.staffEnabled === 'true');
    return;
  }
  if (event.target.closest('[data-site-banner-dismiss]')) {
    const root = document.querySelector('[data-site-banner]');
    dismissSiteBanner(root?.dataset.bannerId || '');
    return;
  }
  if (event.target.closest('[data-official-post-banner-dismiss]')) {
    const root = document.querySelector('[data-official-post-banner]');
    dismissOfficialPostBanner(root?.dataset.bannerId || '');
    return;
  }
  const officialPostOpen = event.target.closest('[data-official-post-banner-open]');
  if (officialPostOpen) {
    const root = document.querySelector('[data-official-post-banner]');
    const postId = root?.dataset.postId || '';
    if (postId) showPostDetail(postId, true);
    return;
  }
  const copyStaffId = event.target.closest('[data-staff-copy-id]');
  if (copyStaffId) {
    void navigator.clipboard?.writeText(copyStaffId.dataset.staffCopyId || '').then(() => {
      copyStaffId.textContent = 'Copied ID';
      window.setTimeout(() => { copyStaffId.textContent = copyStaffId.dataset.staffCopyId; }, 1200);
    }).catch(() => {});
    return;
  }
  const whoFollow = event.target.closest('[data-who-follow]');
  if (whoFollow) {
    event.preventDefault();
    const targetId = whoFollow.dataset.whoFollow;
    if (!targetId) return;
    if (!currentUserId) { window.location.href = signInUrl(); return; }
    const enabled = !socialState.following.includes(targetId);
    void socialAction('follow', { targetId, enabled }).catch((error) => void siteAlert(error.message || 'Could not update follow.'));
    return;
  }
  const adAccount = event.target.closest('[data-open-ad-account]');
  if (adAccount) {
    event.preventDefault();
    trackAdClick(adAccount.dataset.adId || '', 'account');
    openAdAdvertiserAccount(adAccount);
    return;
  }
  const authorButton = event.target.closest('[data-open-member]');
  if (authorButton) {
    event.preventDefault();
    closeConnectionsModal();
    openMemberProfile(authorButton.dataset.openMember);
    return;
  }
  const messageUser = event.target.closest('[data-message-user]');
  if (messageUser) { messageModal.hidden = true; openConversation(internetUsers.get(messageUser.dataset.messageUser)); return; }
  const boostBtn = event.target.closest('[data-post-boost]');
  if (boostBtn) {
    void (async () => {
      try {
        const cost = Number(postBoostPricing.cost) || 250;
        const hours = Number(postBoostPricing.hours) || 12;
        const ok = window.confirm(`Tip this post into For You for ${hours} hours? Cost: C$${cost} (max ${Number(postBoostPricing.dailyCap) || 5}/day).`);
        if (!ok) return;
        const response = await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'post-boost', postId: boostBtn.dataset.postBoost }),
        });
        const result = await readApiJson(response, 'Could not tip this post.');
        if (!response.ok) throw new Error(result.error || 'Could not tip this post.');
        if (result.wallet) renderWallet(result.wallet);
        if (result.post) {
          const index = allPosts.findIndex((post) => post.id === result.post.id);
          if (index >= 0) allPosts[index] = { ...allPosts[index], ...result.post };
        }
        renderPosts();
        void siteAlert('Post tipped into For You.', 'Boosted');
      } catch (error) {
        void siteAlert(error.message || 'Could not tip this post.');
      }
    })();
    return;
  }
  const collectionBtn = event.target.closest('[data-bookmark-collection]');
  if (collectionBtn) {
    activeBookmarkCollectionId = collectionBtn.dataset.bookmarkCollection || '';
    renderBookmarks();
    return;
  }
  if (event.target.closest('[data-onboarding-dismiss]')) {
    void (async () => {
      try {
        await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preference-save', key: 'onboardingDismissed', enabled: true }),
        });
        preferenceState = { ...preferenceState, onboardingDismissed: true };
      } catch {
        preferenceState = { ...preferenceState, onboardingDismissed: true };
      }
      renderOnboardingChecklist();
    })();
    return;
  }
  const topic = event.target.closest('[data-topic]');
  if (topic) { event.preventDefault(); showView('home'); search.value = topic.dataset.topic; renderPosts(); return; }
  const staffViewVideo = event.target.closest('[data-staff-view-video]');
  if (staffViewVideo) {
    const postId = staffViewVideo.dataset.staffViewVideo;
    if (typeof showPostDetail === 'function') showPostDetail(postId, true);
    return;
  }
  const openReel = event.target.closest('[data-open-reel]');
  if (openReel) {
    showView('home');
    return;
  }
  if (event.target.closest('[data-open-reel-composer]')) {
    if (!currentUserId) { window.location.href = signInUrl(); return; }
    const modal = document.querySelector('[data-reel-composer]');
    if (modal) modal.hidden = false;
    restoreReelDraft();
    return;
  }
  if (event.target.closest('[data-close-reel-composer]')) {
    document.querySelector('[data-reel-composer]')?.setAttribute('hidden', '');
    return;
  }
  const reelLike = event.target.closest('[data-reel-like]');
  if (reelLike) { void handlePostEngagement('like', reelLike.dataset.reelLike, reelLike); return; }
  const reelComments = event.target.closest('[data-reel-comments]');
  if (reelComments) {
    const mobileSheet = window.matchMedia('(max-width: 900px)').matches;
    setActiveReel(reelComments.dataset.reelComments, { openSheet: mobileSheet, focusInput: true });
    return;
  }
  if (event.target.closest('[data-close-reel-comments]')) {
    document.querySelector('[data-reel-comments]')?.setAttribute('hidden', '');
    return;
  }
  const reelPanelLike = event.target.closest('[data-reel-panel-like]');
  if (reelPanelLike) {
    void handlePostEngagement('like', reelPanelLike.dataset.reelLike || activeReelId, reelPanelLike);
    return;
  }
  if (event.target.closest('[data-reel-panel-comment-focus]')) {
    document.querySelector('[data-reel-panel-comment-input]')?.focus();
    return;
  }
  const reelFollow = event.target.closest('[data-reel-panel-follow], [data-reel-follow]');
  if (reelFollow) {
    const targetId = reelFollow.dataset.reelPanelFollow || reelFollow.dataset.reelFollow;
    if (!currentUserId) { window.location.href = signInUrl(); return; }
    if (!targetId) return;
    void socialAction('follow', { targetId, enabled: !socialState.following.includes(targetId) })
      .then(() => {
        if (activeReelId) renderReelPanel(activeReelId);
        document.querySelectorAll(`[data-reel-follow="${targetId}"]`).forEach((button) => {
          const on = socialState.following.includes(targetId);
          button.textContent = on ? 'Following' : 'Follow';
          button.classList.toggle('following', on);
        });
      })
      .catch((error) => void siteAlert(error.message || 'Could not update follow.'));
    return;
  }
  const reportReel = event.target.closest('[data-reel-panel-report]');
  if (reportReel) {
    reportReel.closest('details')?.removeAttribute('open');
    void runPostAction('report', reportReel.dataset.reportPost || activeReelId);
    return;
  }
  const deleteReel = event.target.closest('[data-reel-panel-delete]');
  if (deleteReel) {
    deleteReel.closest('details')?.removeAttribute('open');
    void runPostAction('delete', deleteReel.dataset.deletePost || activeReelId);
    return;
  }
  if (event.target.closest('.reel-more-menu [data-report-post], .reel-more-menu [data-delete-post]')) {
    event.target.closest('details')?.removeAttribute('open');
  }
  const reelShare = event.target.closest('[data-reel-share]');
  if (reelShare) { void handlePostEngagement('share', reelShare.dataset.reelShare); return; }
  const reelSound = event.target.closest('[data-reel-sound]');
  if (reelSound) {
    toggleReelSound(reelSound.closest('.reel-card'));
    return;
  }
  const reelVolume = event.target.closest('[data-reel-volume]');
  if (reelVolume) {
    unlockReelAudio();
    setReelVolume(Number(reelVolume.value) / 100);
    const card = reelVolume.closest('.reel-card');
    const video = card?.querySelector('video');
    const audio = card?.querySelector('audio[data-reel-track]');
    const media = video || audio;
    if (media && media.paused && isReelAutoplayEnabled()) {
      if (video) playReelVideo(video);
      else playReelMediaElement(audio);
    }
    return;
  }
  const gifChoice = event.target.closest('[data-gif-url]');
  if (gifChoice) { const chosen = { url: gifChoice.dataset.gifUrl, title: gifChoice.dataset.gifTitle || 'GIF' }; if (pickerTarget === 'message') { messageGif = chosen; if (conversationGifPreview) { conversationGifPreview.hidden = false; conversationGifPreview.innerHTML = `<img src="${escapeHtml(chosen.url)}" alt="${escapeHtml(chosen.title)}" /><button type="button" data-remove-conversation-gif>Remove</button>`; } } else { selectedGif = chosen; selectedImage = null; gifPreview.hidden = false; gifPreview.innerHTML = `<img src="${escapeHtml(selectedGif.url)}" alt="${escapeHtml(selectedGif.title)}" /><button type="button" data-remove-media>Remove</button>`; composer?.classList.add('composer-expanded'); postButton.disabled = false; } gifModal.hidden = true; return; }
  if (event.target.closest('[data-remove-conversation-gif]')) { messageGif = null; if (conversationGifPreview) { conversationGifPreview.hidden = true; conversationGifPreview.innerHTML = ''; } return; }
  if (event.target.closest('[data-remove-media]')) { selectedGif = null; selectedImage = null; gifPreview.hidden = true; gifPreview.innerHTML = ''; if (pollBuilder?.hidden && !selectedLocation && !selectedQuoteId) composer?.classList.remove('composer-expanded'); postButton.disabled = !canComposePost(); return; }
  if (event.target.closest('[data-remove-location]')) {
    stopDropLocationRefresh();
    selectedLocation = null;
    renderDropPreview();
    if (pollBuilder?.hidden && !selectedGif && !selectedImage && !selectedQuoteId) composer?.classList.remove('composer-expanded');
    postButton.disabled = !canComposePost();
    return;
  }
  if (event.target.closest('[data-remove-quote]')) {
    selectedQuoteId = null;
    renderQuotePreview();
    if (pollBuilder?.hidden && !selectedGif && !selectedImage && !selectedLocation) composer?.classList.remove('composer-expanded');
    postButton.disabled = !canComposePost();
    return;
  }
  const mentionPick = event.target.closest('[data-mention-pick]');
  if (mentionPick) {
    applyMentionPick(mentionPick.dataset.mentionPick);
    return;
  }
  const mention = event.target.closest('[data-mention-user]');
  if (mention) {
    applyMentionPick(mention.dataset.mentionUser);
    mentionModal.hidden = true;
    return;
  }
  if (event.target.closest('[data-refresh-staff]')) { void loadModeration(); return; }
  if (event.target.closest('[data-refresh-government]')) { void loadGovernment(); return; }
  const governmentReview = event.target.closest('[data-government-review]');
  if (governmentReview) {
    void reviewGovernmentFineRequest(governmentReview.dataset.fineId, governmentReview.dataset.governmentReview);
    return;
  }
  const staffSelect = event.target.closest('[data-staff-select]');
  if (staffSelect) {
    selectedReportId = staffSelect.dataset.staffSelect;
    staffTab = 'reports';
    renderStaffDashboard();
    return;
  }
  const staffQueue = event.target.closest('[data-staff-queue]');
  if (staffQueue) {
    staffQueueFilter = staffQueue.dataset.staffQueue || 'pending';
    staffTab = 'reports';
    renderStaffDashboard();
    return;
  }
  const historyFilter = event.target.closest('[data-history-filter]');
  if (historyFilter) {
    staffHistoryFilter = historyFilter.dataset.historyFilter || 'all';
    renderStaffDashboard();
    return;
  }
  const historyRevert = event.target.closest('[data-history-revert]');
  if (historyRevert) {
    void (async () => {
      const button = historyRevert;
      if (button.disabled) return;
      button.disabled = true;
      try {
        const response = await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'history-revert',
            source: button.dataset.historySource === 'log' ? 'log' : 'report',
            id: button.dataset.historyRevert || '',
          }),
        });
        const result = await readApiJson(response, 'Could not revert that action.');
        if (!response.ok) throw new Error(result.error || 'Could not revert that action.');
        if (result.snapshot) moderationSnapshot = result.snapshot;
        else await loadModeration();
        renderStaffDashboard();
        void siteAlert('History action reverted.', 'Reverted');
      } catch (error) {
        button.disabled = false;
        void siteAlert(error.message || 'Could not revert that action.');
      }
    })();
    return;
  }
  const reviewButton = event.target.closest('[data-report-review]');
  if (reviewButton) { void reviewReport(reviewButton); return; }
  const verifyReview = event.target.closest('[data-verify-review]');
  if (verifyReview) {
    void (async () => {
      try {
        const response = await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verify-review',
            applicationId: verifyReview.dataset.applicationId,
            decision: verifyReview.dataset.verifyReview === 'deny' ? 'deny' : 'accept',
          }),
        });
        const result = await readApiJson(response, 'Could not review this verification request.');
        if (!response.ok) throw new Error(result.error || 'Could not review this verification request.');
        if (result.snapshot) moderationSnapshot = result.snapshot;
        renderStaffDashboard();
      } catch (error) {
        void siteAlert(error.message || 'Could not review this verification request.');
      }
    })();
    return;
  }
  const businessReview = event.target.closest('[data-business-review]');
  if (businessReview) {
    void (async () => {
      try {
        const response = await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'business-review',
            businessId: businessReview.dataset.businessId,
            decision: businessReview.dataset.businessReview === 'deny' ? 'deny' : 'accept',
          }),
        });
        const result = await readApiJson(response, 'Could not review this business account.');
        if (!response.ok) throw new Error(result.error || 'Could not review this business account.');
        if (result.snapshot) moderationSnapshot = result.snapshot;
        renderStaffDashboard();
      } catch (error) {
        void siteAlert(error.message || 'Could not review this business account.');
      }
    })();
    return;
  }
  const adReview = event.target.closest('[data-ad-review]');
  if (adReview) {
    void (async () => {
      try {
        const response = await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ad-review',
            adId: adReview.dataset.adId,
            decision: adReview.dataset.adReview === 'deny' ? 'deny' : 'accept',
          }),
        });
        const result = await readApiJson(response, 'Could not review this ad.');
        if (!response.ok) throw new Error(result.error || 'Could not review this ad.');
        if (result.snapshot) moderationSnapshot = result.snapshot;
        renderStaffDashboard();
        void loadAds();
      } catch (error) {
        void siteAlert(error.message || 'Could not review this ad.');
      }
    })();
    return;
  }
  const adManage = event.target.closest('[data-ad-manage]');
  if (adManage) {
    void (async () => {
      try {
        const manageAction = adManage.dataset.adManage === 'extend' ? 'extend' : 'remove';
        const response = await fetch('/api/internet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ad-manage',
            adId: adManage.dataset.adId,
            manageAction,
            hours: Number(adManage.dataset.adHours) || 24,
          }),
        });
        const result = await readApiJson(response, 'Could not update this ad.');
        if (!response.ok) throw new Error(result.error || 'Could not update this ad.');
        if (result.snapshot) moderationSnapshot = result.snapshot;
        renderStaffDashboard();
        void loadAds();
      } catch (error) {
        void siteAlert(error.message || 'Could not update this ad.');
      }
    })();
    return;
  }
  const staffTabJump = event.target.closest('[data-staff-tab-jump]');
  if (staffTabJump) {
    staffTab = staffTabJump.dataset.staffTabJump || 'ads';
    renderStaffDashboard();
    return;
  }
  const repostChoice = event.target.closest('[data-repost-choice]');
  if (repostChoice && pendingPostAction?.type === 'repost') {
    repostPopup.hidden = true;
    if (repostChoice.dataset.repostChoice === 'repost') { void postInteraction({ postId: pendingPostAction.postId, type: 'repost' }).catch((error) => void siteAlert(error.message || 'Could not repost.')); pendingPostAction = null; return; }
    attachQuote(pendingPostAction.postId);
    pendingPostAction = null;
    return;
  }
  if (repostPopup && !event.target.closest('[data-repost-popup]')) repostPopup.hidden = true;
  const reportPost = event.target.closest('[data-report-post]');
  if (reportPost) {
    reportPost.closest('details')?.removeAttribute('open');
    void runPostAction('report', reportPost.dataset.reportPost);
    return;
  }
  if (!event.target.closest('.reel-more')) {
    document.querySelectorAll('.reel-more[open]').forEach((menu) => { menu.open = false; });
  }
  const deletePost = event.target.closest('[data-delete-post]');
  if (deletePost) {
    void runPostAction('delete', deletePost.dataset.deletePost);
    return;
  }
  const button = event.target.closest('[data-post-action]');
  if (!button) return;
  const postId = button.parentElement?.dataset.postId;
  if (postId) void runPostAction(button.dataset.postAction, postId);
});
document.querySelector('[data-back-home]')?.addEventListener('click', () => { history.pushState({}, '', internetUrl('home')); openPostId = null; showView('home'); });
window.addEventListener('popstate', showViewFromAddress);
window.addEventListener('hashchange', showViewFromAddress);

function applyLocalLike(post) {
  if (!post) return;
  post.likes = Array.isArray(post.likes) ? post.likes : [];
  const id = activeUserId();
  post.likes = post.likes.includes(id) ? post.likes.filter((item) => item !== id) : [...post.likes, id];
}

function refreshVisiblePosts() {
  renderPosts();
  if (openPostId) showPostDetail(openPostId, false);
}

async function handlePostEngagement(type, postId, control = null) {
  if (!currentUserId) { window.location.href = signInUrl(); return; }
  const requested = allPosts.find((item) => item.id === postId);
  if (!requested) return;
  const post = sourcePost(requested);
  if (type === 'share') { pendingPostAction = { postId: post.id, type }; shareModal.hidden = false; return; }
  if (type === 'like') {
    if (!likeBaseline.has(post.id)) likeBaseline.set(post.id, Array.isArray(post.likes) && post.likes.includes(activeUserId()));
    applyLocalLike(post);
    refreshVisiblePosts();
    const existing = likeFlushTimers.get(post.id);
    if (existing) window.clearTimeout(existing);
    likeFlushTimers.set(post.id, window.setTimeout(() => {
      likeFlushTimers.delete(post.id);
      const original = likeBaseline.get(post.id);
      likeBaseline.delete(post.id);
      const liked = Array.isArray(post.likes) && post.likes.includes(activeUserId());
      if (liked === original) return;
      void postInteraction({ postId: post.id, type: 'like' }, { reload: false }).catch((error) => {
        applyLocalLike(post);
        refreshVisiblePosts();
        void siteAlert(error.message || 'Could not like this post.');
      });
    }, 450));
    return;
  }
  if (type === 'bookmark') {
    if (inFlightBookmarks.has(post.id)) return;
    inFlightBookmarks.add(post.id);
    const already = Array.isArray(socialState.bookmarks) && socialState.bookmarks.includes(post.id);
    const enabled = !already;
    socialState.bookmarks = enabled
      ? [...new Set([...(socialState.bookmarks || []), post.id])]
      : (socialState.bookmarks || []).filter((id) => id !== post.id);
    if (!enabled) {
      socialState.bookmarkCollections = (socialState.bookmarkCollections || []).map((collection) => ({
        ...collection,
        postIds: (collection.postIds || []).filter((id) => id !== post.id),
      }));
    }
    refreshVisiblePosts();
    try {
      const collectionId = enabled
        && feed?.dataset.activeView === 'bookmarks'
        && activeBookmarkCollectionId
        && (socialState.bookmarkCollections || []).some((item) => item.id === activeBookmarkCollectionId)
        ? activeBookmarkCollectionId
        : '';
      await socialAction('bookmark', { postId: post.id, enabled, collectionId });
    } catch (error) {
      socialState.bookmarks = already
        ? [...new Set([...(socialState.bookmarks || []), post.id])]
        : (socialState.bookmarks || []).filter((id) => id !== post.id);
      refreshVisiblePosts();
      void siteAlert(error.message || 'Could not save that post.');
    } finally {
      inFlightBookmarks.delete(post.id);
    }
    return;
  }
  if (type === 'repost-now') {
    try { await postInteraction({ postId: post.id, type: 'repost' }); } catch (error) { void siteAlert(error.message || 'Could not repost.'); }
    return;
  }
  if (type === 'quote') {
    attachQuote(post.id);
    return;
  }
  if (type === 'repost') {
    pendingPostAction = { postId: post.id, type, quote: false };
    const box = control?.getBoundingClientRect();
    if (box && repostPopup) {
      repostPopup.style.left = `${Math.max(12, box.left - 2)}px`;
      repostPopup.style.top = `${box.bottom + 8}px`;
      repostPopup.hidden = false;
    }
    return;
  }
  if (type === 'reply') {
    const onDetail = openPostId === post.id && !document.querySelector('[data-view="post"]')?.hidden;
    if (onDetail) focusDetailReplyComposer();
    else showPostDetail(post.id, true, { focusReply: true });
    return;
  }
  try { await postInteraction({ postId: post.id, type }); } catch (error) { void siteAlert(error.message); }
}

async function postInteraction({ postId, type, content = '', quote = false }, { reload = true } = {}) {
  const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post-interaction', postId, type, content, quote, ...activeAccountRequest() }) });
  const result = await readApiJson(response, 'Could not update this post.');
  if (!response.ok) {
    if (result.error === 'Owner access required') throw new Error('Your bot host needs the newest GitHub files and a restart before post actions can work.');
    throw new Error(automodHoldError(result, 'Could not update this post.'));
  }
  if (reload) await loadPosts();
}

async function voteOnPoll(postId, optionIndex, remove = false) {
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'poll-vote', postId, optionIndex, remove, ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not update this poll.');
    if (!response.ok) {
      if (/owner access required/i.test(result.error || '')) {
        throw new Error('Poll voting is ready, but the bot host is still using an older version. Pull the latest GitHub files on the bot host, then restart it.');
      }
      throw new Error(result.error || 'Could not update this poll.');
    }
    if (result.post) {
      const index = allPosts.findIndex((post) => post.id === result.post.id);
      if (index >= 0) allPosts[index] = { ...allPosts[index], ...result.post };
      else allPosts.unshift(result.post);
    }
    renderPosts();
    renderBookmarks();
    if (openPostId === postId) showPostDetail(postId, false);
  } catch (error) { void siteAlert(error.message || 'Could not update this poll.'); }
}

function showPollVoters(postId) {
  if (expandedPollVoters.has(postId)) expandedPollVoters.delete(postId);
  else expandedPollVoters.add(postId);
  renderPosts();
  renderBookmarks();
  if (openPostId === postId) showPostDetail(postId, false);
}
function insertAtCursor(value) {
  if (!content) return;
  const start = content.selectionStart || content.value.length;
  const end = content.selectionEnd || start;
  content.value = `${content.value.slice(0, start)}${value}${content.value.slice(end)}`.slice(0, 500);
  content.focus(); content.selectionStart = content.selectionEnd = Math.min(start + value.length, 500);
  count.textContent = `${content.value.length} / 500`;
  postButton.disabled = !canComposePost();
  updateComposerHighlight();
  syncMentionSuggest();
}

let mentionSuggestState = null;
let mentionSuggestIndex = 0;

function activeMentionToken(textarea) {
  if (!textarea) return null;
  const value = String(textarea.value || '');
  const caret = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : value.length;
  const before = value.slice(0, caret);
  const match = before.match(/(^|[\s([{])@([a-zA-Z0-9_]{0,80})$/);
  if (!match) return null;
  const query = match[2] || '';
  const start = caret - query.length - 1;
  return { start, end: caret, query };
}

function mentionCandidates(query) {
  const needle = String(query || '').toLowerCase();
  return [...internetUsers.values()]
    .filter((user) => {
      const username = String(user?.username || '').trim();
      if (!username) return false;
      if (!needle) return true;
      const hay = `${user.displayName || ''} ${username}`.toLowerCase();
      return hay.includes(needle);
    })
    .sort((a, b) => {
      const au = String(a.username || '').toLowerCase();
      const bu = String(b.username || '').toLowerCase();
      const aStarts = needle && au.startsWith(needle) ? 0 : 1;
      const bStarts = needle && bu.startsWith(needle) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return au.localeCompare(bu);
    })
    .slice(0, 6);
}

function hideMentionSuggest() {
  const box = document.querySelector('[data-mention-suggest]');
  if (box) {
    box.hidden = true;
    box.innerHTML = '';
  }
  mentionSuggestState = null;
  mentionSuggestIndex = 0;
}

function syncMentionSuggest() {
  const box = document.querySelector('[data-mention-suggest]');
  if (!box || !content || document.activeElement !== content) {
    hideMentionSuggest();
    return;
  }
  const token = activeMentionToken(content);
  if (!token) {
    hideMentionSuggest();
    return;
  }
  const users = mentionCandidates(token.query);
  mentionSuggestState = token;
  mentionSuggestIndex = Math.min(mentionSuggestIndex, Math.max(users.length - 1, 0));
  if (!users.length) {
    box.hidden = false;
    box.innerHTML = '<p>No members found.</p>';
    return;
  }
  box.hidden = false;
  box.innerHTML = users.map((user, index) => `
    <button type="button" role="option" class="${index === mentionSuggestIndex ? 'selected' : ''}" data-mention-pick="${escapeHtml(user.username)}">
      <img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" />
      <span><b>${escapeHtml(user.displayName || user.username)}</b><small>@${escapeHtml(user.username)}</small></span>
    </button>
  `).join('');
}

function applyMentionPick(username) {
  const handle = String(username || '').replace(/^@+/, '').trim();
  if (!handle || !content) return;
  const token = mentionSuggestState || activeMentionToken(content);
  if (token) {
    const next = `${content.value.slice(0, token.start)}@${handle} ${content.value.slice(token.end)}`.slice(0, 500);
    content.value = next;
    const caret = Math.min(token.start + handle.length + 2, next.length);
    content.focus();
    content.selectionStart = content.selectionEnd = caret;
  } else {
    insertAtCursor(`@${handle} `);
  }
  count.textContent = `${content.value.length} / 500`;
  postButton.disabled = !canComposePost();
  updateComposerHighlight();
  hideMentionSuggest();
  if (postMessage) postMessage.textContent = scanClientContent(content.value) ? AUTOMOD_HOLD_PREVIEW : '';
}

function updateComposerHighlight() {
  if (!composerHighlight || !content) return;
  composerHighlight.innerHTML = escapeHtml(content.value)
    .replace(/(^|\s)(#[a-z0-9_]{1,60})/gi, '$1<span class="composer-tag">$2</span>')
    .replace(/(^|\s)(@[a-z0-9_]{1,80})/gi, '$1<span class="composer-tag">$2</span>');
}

function renderMentionResults() {
  if (!mentionResults) return;
  const query = String(mentionQuery?.value || '').trim().toLowerCase();
  const users = [...internetUsers.values()].filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(query)).slice(0, 8);
  mentionResults.innerHTML = users.length ? users.map((user) => `<button type="button" data-mention-user="${escapeHtml(user.username)}"><img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(user.displayName)}</b><small>@${escapeHtml(user.username)}</small></span></button>`).join('') : '<p>No members found.</p>';
}

function renderEmojiGrid() {
  if (!emojiGrid) return;
  const query = String(emojiQuery?.value || '').trim().toLowerCase();
  const custom = clearwaterEmojiChoices.filter(([emoji, label]) => !query || emoji.includes(query) || label.toLowerCase().includes(query));
  const regular = emojiChoices.filter((emoji) => !query || emoji.includes(query));
  emojiGrid.innerHTML = `${custom.length ? `<p class="emoji-section-title">Clearwater favorites</p>${custom.map(([emoji, label]) => `<button type="button" class="clearwater-emoji" data-emoji-choice="${emoji}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${emoji}</button>`).join('')}` : ''}${regular.length ? `<p class="emoji-section-title">Emoji</p>${regular.map((emoji) => `<button type="button" data-emoji-choice="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')}` : '<p class="emoji-no-results">No emojis found.</p>'}`;
}

async function loadGifs(query = '') {
  if (!gifMessage || !gifResults) return;
  gifMessage.textContent = query ? 'Searching GIFs...' : 'Loading trending GIFs...';
  gifResults.innerHTML = '';
  try {
    const response = await fetch(`/api/giphy${query ? `?q=${encodeURIComponent(query)}` : ''}`, { cache: 'no-store' });
    const result = await readApiJson(response, 'GIF search is unavailable.');
    if (!response.ok) throw new Error(result.error || 'GIF search is unavailable.');
    gifMessage.textContent = result.gifs?.length ? (query ? 'Choose a GIF.' : 'Trending GIFs') : 'No GIFs found.';
    gifResults.innerHTML = (result.gifs || []).map((gif) => `<button type="button" data-gif-url="${escapeHtml(gif.url)}" data-gif-title="${escapeHtml(gif.title)}"><img src="${escapeHtml(gif.previewUrl)}" alt="${escapeHtml(gif.title)}" /></button>`).join('');
  } catch (error) { gifMessage.textContent = error.message || 'GIF search is unavailable. Add GIPHY_API_KEY in Vercel to enable it.'; }
}

function openGifPicker(target = 'post') {
  pickerTarget = target;
  if (!gifModal) return;
  gifModal.hidden = false;
  gifQuery?.focus();
  void loadGifs();
}

function openEmojiPicker(target = 'post') {
  pickerTarget = target;
  if (!emojiModal) return;
  emojiModal.hidden = false;
  renderEmojiGrid();
  emojiQuery?.focus();
}

gifButton?.addEventListener('click', () => openGifPicker('post'));
imageButton?.addEventListener('click', () => imageUpload?.click());
function addImageToPost(file) {
  if (!file) return;
  if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type) || file.size > 1_500_000) {
    postMessage.textContent = 'Choose a PNG, JPG, WebP, or GIF image smaller than 1.5 MB.';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    if (!safeImageUrl(dataUrl)) {
      postMessage.textContent = 'Choose a supported image before posting.';
      return;
    }
    selectedImage = { dataUrl };
    selectedGif = null;
    gifPreview.hidden = false;
    gifPreview.innerHTML = `<img src="${escapeHtml(selectedImage.dataUrl)}" alt="Selected image" /><button type="button" data-remove-media>Remove</button>`;
    composer?.classList.add('composer-expanded');
    postButton.disabled = false;
    postMessage.textContent = '';
  };
  reader.readAsDataURL(file);
}
imageUpload?.addEventListener('change', () => {
  addImageToPost(imageUpload.files?.[0]);
  imageUpload.value = '';
});
composer?.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); composer.classList.add('dragging-image'); } });
composer?.addEventListener('dragleave', (event) => { if (!composer.contains(event.relatedTarget)) composer.classList.remove('dragging-image'); });
composer?.addEventListener('drop', (event) => { event.preventDefault(); composer.classList.remove('dragging-image'); addImageToPost(event.dataTransfer?.files?.[0]); });
document.querySelector('[data-close-gif]')?.addEventListener('click', () => { gifModal.hidden = true; });
gifSearch?.addEventListener('submit', async (event) => {
  event.preventDefault();
  void loadGifs(gifQuery?.value.trim() || '');
});
mentionButton?.addEventListener('click', () => {
  if (!content) {
    mentionModal.hidden = false;
    renderMentionResults();
    mentionQuery?.focus();
    return;
  }
  const caret = content.selectionStart || content.value.length;
  const before = content.value.slice(0, caret);
  if (!/(^|[\s([{])@$/.test(before) && !activeMentionToken(content)) {
    insertAtCursor('@');
  }
  content.focus();
  syncMentionSuggest();
  if (![...internetUsers.values()].length) {
    mentionModal.hidden = false;
    renderMentionResults();
    mentionQuery?.focus();
  }
});
document.querySelector('[data-close-mention]')?.addEventListener('click', () => { mentionModal.hidden = true; });
mentionQuery?.addEventListener('input', renderMentionResults);
emojiButton?.addEventListener('click', () => openEmojiPicker('post'));
document.querySelector('[data-close-emoji]')?.addEventListener('click', () => { emojiModal.hidden = true; });
emojiQuery?.addEventListener('input', renderEmojiGrid);
[gifModal, emojiModal, mentionModal].forEach((modal) => modal?.addEventListener('click', (event) => {
  if (event.target === modal) modal.hidden = true;
}));
pollButton?.addEventListener('click', () => {
  pollBuilder.hidden = !pollBuilder.hidden;
  composer?.classList.toggle('composer-expanded', !pollBuilder.hidden || Boolean(selectedGif || selectedImage || selectedLocation || selectedQuoteId));
});
document.querySelector('[data-close-poll]')?.addEventListener('click', () => {
  if (!pollBuilder) return;
  pollBuilder.hidden = true;
  if (!selectedGif && !selectedImage && !selectedLocation && !selectedQuoteId) composer?.classList.remove('composer-expanded');
});
document.querySelector('[data-add-poll-option]')?.addEventListener('click', () => {
  const options = pollBuilder?.querySelectorAll('[data-poll-option]') || [];
  if (options.length >= 4) return;
  const input = document.createElement('input'); input.dataset.pollOption = ''; input.maxLength = 80; input.placeholder = `Option ${options.length + 1}`;
  document.querySelector('[data-add-poll-option]')?.before(input);
});
document.querySelector('[data-close-warning]')?.addEventListener('click', () => { warningNotice.hidden = true; });
document.querySelector('[data-close-profile]')?.addEventListener('click', () => { profileModal.hidden = true; });
document.querySelector('[data-member-page-follow]')?.addEventListener('click', async () => {
  if (!viewedMember) return;
  const button = document.querySelector('[data-member-page-follow]');
  if (button) button.disabled = true;
  try {
    await socialAction('follow', { targetId: viewedMember.id, enabled: !socialState.following.includes(viewedMember.id) });
    await loadSocial();
    await loadPosts();
    if (viewedMember) openMemberProfile(viewedMember.id, false);
  } catch (error) {
    void siteAlert(error.message);
  } finally {
    if (button) button.disabled = false;
  }
});
document.querySelector('[data-member-page-menu]')?.addEventListener('click', () => { const menu = document.querySelector('[data-member-page-menu-list]'); menu.hidden = !menu.hidden; });
document.querySelector('[data-mute-member]')?.addEventListener('click', async () => { if (!viewedMember) return; try { await socialAction('mute', { targetId: viewedMember.id, enabled: !socialState.muted.includes(viewedMember.id) }); showView('home'); } catch (error) { void siteAlert(error.message); } });
document.addEventListener('click', (event) => {
  const copyProfile = event.target.closest('[data-copy-profile-link]');
  if (!copyProfile) return;
  event.preventDefault();
  const memberPage = !document.querySelector('[data-view="member"]')?.hidden;
  const ownPage = !document.querySelector('[data-view="profile"]')?.hidden;
  if (memberPage && viewedMember) {
    void copyProfileShareLink(viewedMember);
    document.querySelector('[data-member-page-menu-list]')?.setAttribute('hidden', '');
    return;
  }
  if (ownPage) {
    const me = internetUsers.get(currentUserId) || sessionUser || activeAuthor();
    void copyProfileShareLink(me);
  }
});
document.querySelector('[data-block-member]')?.addEventListener('click', async () => { if (!viewedMember) return; try { await socialAction('block', { targetId: viewedMember.id, enabled: !socialState.blocked.includes(viewedMember.id) }); showView('home'); } catch (error) { void siteAlert(error.message); } });
document.querySelector('[data-report-member]')?.addEventListener('click', () => { void siteAlert('To report a member, open one of their posts and choose Report post.', 'Report member'); });
document.querySelector('[data-new-message]')?.addEventListener('click', () => { messageModal.hidden = false; renderMessageUserResults(); messageUserSearch?.focus(); });
document.querySelector('[data-member-page-message]')?.addEventListener('click', () => { openConversation(viewedMember); });
document.querySelector('[data-close-message]')?.addEventListener('click', () => { messageModal.hidden = true; });
messageUserSearch?.addEventListener('input', renderMessageUserResults);
document.querySelector('[data-conversation-gif]')?.addEventListener('click', () => openGifPicker('message'));
document.querySelector('[data-conversation-emoji]')?.addEventListener('click', () => openEmojiPicker('message'));
document.querySelector('[data-close-conversation]')?.addEventListener('click', () => { showView('messages'); });
document.querySelector('[data-open-conversation-profile]')?.addEventListener('click', () => { if (viewedMember) openMemberProfile(viewedMember.id); });
conversationInput?.addEventListener('input', () => {
  const hit = scanClientContent(conversationInput.value);
  setConversationHold(hit ? AUTOMOD_HOLD_PREVIEW : '');
});
conversationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = conversationInput?.value.trim();
  if (!viewedMember || (!text && !messageGif)) return;
  const submit = conversationForm.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message-send', to: viewedMember.id, username: viewedMember.username, content: text, gif: messageGif, ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not send your message.');
    if (!response.ok) throw new Error(automodHoldError(result, 'Could not send your message.'));
    conversationInput.value = '';
    messageGif = null;
    setConversationHold('');
    if (conversationGifPreview) { conversationGifPreview.hidden = true; conversationGifPreview.innerHTML = ''; }
    await loadConversation(viewedMember);
  } catch (error) {
    setConversationHold(automodHoldError({ error: error.message }, error.message || 'Could not send your message.'));
  } finally {
    if (submit) submit.disabled = false;
    conversationInput?.focus();
  }
});
document.querySelector('[data-close-post-modal]')?.addEventListener('click', () => {
  postModal.hidden = true;
  pendingPostAction = null;
});
postModalForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!pendingPostAction) return;
  const error = document.querySelector('[data-post-modal-error]'); error.textContent = '';
  const text = document.querySelector('[data-post-modal-content]').value;
  try { await postInteraction({ ...pendingPostAction, content: text }); postModal.hidden = true; postModalForm.reset(); pendingPostAction = null; } catch (exception) { error.textContent = exception.message || 'Could not post.'; }
});
document.addEventListener('input', (event) => {
  const replyInput = event.target.closest('[data-detail-reply-content]');
  if (!replyInput) return;
  const form = replyInput.closest('[data-detail-reply-form]');
  const submit = form?.querySelector('[data-detail-reply-submit]');
  if (submit) submit.disabled = !String(replyInput.value || '').trim();
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-detail-reply-form]');
  if (!form) return;
  event.preventDefault();
  const postId = form.dataset.postId;
  const input = form.querySelector('[data-detail-reply-content]');
  const error = form.querySelector('[data-detail-reply-error]');
  const submit = form.querySelector('[data-detail-reply-submit]');
  const text = String(input?.value || '').trim();
  if (!postId || !text) return;
  if (error) error.textContent = '';
  if (submit) submit.disabled = true;
  try {
    await postInteraction({ postId, type: 'reply', content: text });
    if (input) input.value = '';
    showPostDetail(postId, false);
  } catch (exception) {
    if (error) error.textContent = exception.message || 'Could not post your reply.';
    if (submit) submit.disabled = !text;
  }
});
document.querySelector('[data-close-share]')?.addEventListener('click', () => { shareModal.hidden = true; pendingPostAction = null; });
document.querySelector('[data-copy-post-link]')?.addEventListener('click', async () => {
  if (!pendingPostAction) return;
  try { await navigator.clipboard.writeText(`${location.origin}${internetUrl('post', pendingPostAction.postId)}`); shareModal.hidden = true; void siteAlert('Post link copied.'); } catch { void siteAlert('Could not copy the link.'); }
});
document.querySelector('[data-share-to-friend]')?.addEventListener('click', () => { shareModal.hidden = true; showView('messages'); void siteAlert('Choose a friend and paste the post link into your message.'); });
document.querySelector('[data-close-moderation]')?.addEventListener('click', () => { moderationModal.hidden = true; pendingReportReview = null; });
moderationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingReportReview) return;
  moderationError.textContent = '';
  const complete = await submitReportReview({
    ...pendingReportReview,
    reason: moderationReason.value,
    durationDays: pendingReportReview.moderationAction === 'ban' ? moderationDuration.value : 'forever',
  });
  if (complete) { moderationModal.hidden = true; pendingReportReview = null; }
});

function revokeReelPreviewUrls(media) {
  if (!media) return;
  if (media.previewUrl) URL.revokeObjectURL(media.previewUrl);
  if (Array.isArray(media.previewUrls)) media.previewUrls.forEach((url) => URL.revokeObjectURL(url));
}

function reelHasPhotos() {
  return Boolean(reelMedia && !reelMedia.isVideo && Array.isArray(reelMedia.files) && reelMedia.files.length);
}

function syncReelAudioComposerUi() {
  const wrap = document.querySelector('[data-reel-audio-wrap]');
  const preview = document.querySelector('[data-reel-audio-preview]');
  const label = document.querySelector('[data-reel-audio-label]');
  const showAudio = reelHasPhotos();
  if (wrap) wrap.hidden = !showAudio;
  if (!showAudio) {
    if (reelAudio?.previewUrl) URL.revokeObjectURL(reelAudio.previewUrl);
    reelAudio = null;
    if (preview) { preview.hidden = true; preview.innerHTML = ''; }
    if (label) label.textContent = 'Add audio for this slideshow (optional)';
    return;
  }
  if (reelAudio?.previewUrl && preview) {
    preview.hidden = false;
    preview.innerHTML = `<audio src="${escapeHtml(reelAudio.previewUrl)}" controls></audio><button type="button" data-remove-reel-audio>Remove audio</button>`;
    if (label) label.textContent = 'Replace audio';
  } else if (preview) {
    preview.hidden = true;
    preview.innerHTML = '';
    if (label) label.textContent = 'Add audio for this slideshow (optional)';
  }
}

function syncReelMediaPickLabels() {
  const photosLabel = document.querySelector('[data-reel-photos-label]');
  const videoLabel = document.querySelector('[data-reel-video-label]');
  const videoWrap = videoLabel?.closest('label');
  if (!reelMedia) {
    if (photosLabel) photosLabel.textContent = 'Add photos for a slideshow';
    if (videoLabel) videoLabel.textContent = 'Or add one video (up to 2 GB)';
    if (videoWrap) videoWrap.hidden = false;
    return;
  }
  if (reelMedia.isVideo) {
    if (photosLabel) photosLabel.textContent = 'Switch to a photo slideshow';
    if (videoLabel) videoLabel.textContent = 'Replace video';
    if (videoWrap) videoWrap.hidden = false;
    return;
  }
  const count = reelMedia.files?.length || 0;
  if (photosLabel) {
    photosLabel.textContent = count >= MAX_REEL_SLIDES
      ? `Slideshow full (${MAX_REEL_SLIDES} photos)`
      : `Add more photos (${count}/${MAX_REEL_SLIDES})`;
  }
  if (videoLabel) videoLabel.textContent = 'Switch to a video instead';
  if (videoWrap) videoWrap.hidden = false;
}

function renderReelComposerPreview() {
  const preview = document.querySelector('[data-reel-preview]');
  const submit = document.querySelector('[data-reel-submit]');
  if (!preview) return;
  if (!reelMedia) {
    preview.hidden = true;
    preview.innerHTML = '';
    if (submit) submit.disabled = true;
    syncReelMediaPickLabels();
    syncReelAudioComposerUi();
    return;
  }
  preview.hidden = false;
  if (reelMedia.isVideo) {
    preview.innerHTML = `<video src="${escapeHtml(reelMedia.previewUrl)}" muted loop playsinline controls></video>`;
  } else {
    const urls = Array.isArray(reelMedia.previewUrls) ? reelMedia.previewUrls : [];
    preview.innerHTML = `<div class="reel-preview-grid">${urls.map((url, index) => `
      <figure>
        <img src="${escapeHtml(url)}" alt="" />
        <button type="button" data-remove-reel-slide="${index}" aria-label="Remove photo ${index + 1}">×</button>
      </figure>`).join('')}</div>`;
  }
  if (submit) submit.disabled = false;
  syncReelMediaPickLabels();
  syncReelAudioComposerUi();
}

function resetReelComposer() {
  revokeReelPreviewUrls(reelMedia);
  if (reelAudio?.previewUrl) URL.revokeObjectURL(reelAudio.previewUrl);
  reelMedia = null;
  reelAudio = null;
  const caption = document.querySelector('[data-reel-caption]');
  const error = document.querySelector('[data-reel-error]');
  const photosInput = document.querySelector('[data-reel-photos]');
  const videoInput = document.querySelector('[data-reel-video]');
  const audioInput = document.querySelector('[data-reel-audio]');
  if (caption) caption.value = '';
  if (error) error.textContent = '';
  if (photosInput) photosInput.value = '';
  if (videoInput) videoInput.value = '';
  if (audioInput) audioInput.value = '';
  renderReelComposerPreview();
}

function classifyReelImageFile(file) {
  const type = file.type || (
    /\.(?:png)$/i.test(file.name) ? 'image/png'
      : (/\.(?:jpe?g)$/i.test(file.name) ? 'image/jpeg'
        : (/\.(?:webp)$/i.test(file.name) ? 'image/webp'
          : (/\.(?:gif)$/i.test(file.name) ? 'image/gif' : '')))
  );
  return /^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(type) ? (type === 'image/jpg' ? 'image/jpeg' : type) : '';
}

function classifyReelVideoFile(file) {
  const type = file.type || (
    /\.(?:mp4)$/i.test(file.name) ? 'video/mp4'
      : (/\.(?:webm)$/i.test(file.name) ? 'video/webm'
        : (/\.(?:mov)$/i.test(file.name) ? 'video/quicktime' : ''))
  );
  if (type === 'video/quicktime' || /\.mov$/i.test(file.name || '')) return 'mov';
  return /^video\/(?:mp4|webm)$/i.test(type) ? type : '';
}

function setReelPhotoFiles(nextFiles, { append = false } = {}) {
  const error = document.querySelector('[data-reel-error]');
  const incoming = nextFiles
    .map((file) => ({ file, type: classifyReelImageFile(file) }))
    .filter((item) => item.type);
  if (!incoming.length) {
    if (error) error.textContent = 'Choose PNG, JPG, WEBP, or GIF photos.';
    return false;
  }
  if (incoming.some((item) => item.file.size > MAX_REEL_BYTES)) {
    if (error) error.textContent = 'Keep each photo under 2 GB.';
    return false;
  }
  const existing = (append && reelHasPhotos())
    ? reelMedia.files.map((file, index) => ({
      file,
      type: reelMedia.types?.[index] || classifyReelImageFile(file) || 'image/jpeg',
      previewUrl: reelMedia.previewUrls?.[index] || '',
    }))
    : [];
  const room = Math.max(0, MAX_REEL_SLIDES - existing.length);
  if (!room) {
    if (error) error.textContent = `Slideshows can include up to ${MAX_REEL_SLIDES} photos.`;
    return false;
  }
  const added = incoming.slice(0, room).map((item) => ({
    ...item,
    previewUrl: URL.createObjectURL(item.file),
  }));
  if (!append) revokeReelPreviewUrls(reelMedia);
  const merged = [...existing, ...added];
  reelMedia = {
    isVideo: false,
    files: merged.map((item) => item.file),
    types: merged.map((item) => item.type),
    previewUrls: merged.map((item) => item.previewUrl),
    previewUrl: merged[0]?.previewUrl || '',
  };
  if (incoming.length > room) {
    if (error) error.textContent = `Added ${added.length} photo${added.length === 1 ? '' : 's'}. Slideshows max out at ${MAX_REEL_SLIDES}.`;
  } else if (error) {
    error.textContent = merged.length > 1
      ? `${merged.length} photos ready for this slideshow.`
      : '';
  }
  renderReelComposerPreview();
  return true;
}

function setReelVideoFile(file) {
  const error = document.querySelector('[data-reel-error]');
  const type = classifyReelVideoFile(file);
  if (type === 'mov') {
    if (error) error.textContent = 'MOV files often will not play for everyone. Export as MP4 (H.264) or WebM and try again.';
    return false;
  }
  if (!type) {
    if (error) error.textContent = 'Choose an MP4 or WebM video.';
    return false;
  }
  if (file.size > MAX_REEL_BYTES) {
    if (error) error.textContent = 'Keep Reels under 2 GB.';
    return false;
  }
  revokeReelPreviewUrls(reelMedia);
  if (reelAudio?.previewUrl) URL.revokeObjectURL(reelAudio.previewUrl);
  reelAudio = null;
  reelMedia = {
    isVideo: true,
    file,
    type,
    previewUrl: URL.createObjectURL(file),
  };
  if (error) error.textContent = '';
  renderReelComposerPreview();
  return true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadReelFile(file, kind, onProgress, options = {}) {
  const upload = globalThis.VercelBlob?.upload;
  const isVideo = kind === 'video';
  const isAudio = kind === 'audio';
  const allowDataUrl = options.allowDataUrl !== false;
  let blobError = '';
  const defaultName = isVideo ? 'reel.mp4' : (isAudio ? 'reel.mp3' : 'reel.jpg');
  const defaultType = isVideo ? 'video/mp4' : (isAudio ? 'audio/mpeg' : 'image/jpeg');
  if (typeof upload === 'function') {
    try {
      const safeName = String(file.name || defaultName).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || defaultName;
      const blob = await upload(`reels/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/internet',
        multipart: file.size > 80_000_000,
        contentType: file.type || defaultType,
        onUploadProgress: (progress) => onProgress?.(progress),
      });
      if (blob?.url) return { url: blob.url };
    } catch (error) {
      blobError = String(error?.message || error || '');
      if (!allowDataUrl || file.size > SMALL_REEL_BYTES) {
        throw new Error(blobUploadFailedMessage(blobError, { large: true }));
      }
    }
  } else if (!allowDataUrl || file.size > SMALL_REEL_BYTES) {
    throw new Error(allowDataUrl
      ? 'Reel uploads are unavailable for large files. Refresh, or use files under 3 MB.'
      : 'Slideshows and audio need cloud upload. Refresh the page and try again, or post one small photo.');
  }

  onProgress?.({ percentage: 100 });
  const dataUrl = await readFileAsDataUrl(file);
  if (isVideo && !safeVideoUrl(dataUrl)) throw new Error('Choose a supported MP4 or WebM video.');
  if (isAudio && !safeAudioUrl(dataUrl)) throw new Error('Choose a supported MP3, M4A, WAV, or OGG audio file.');
  if (!isVideo && !isAudio && !safeImageUrl(dataUrl)) throw new Error('Choose a supported image.');
  return { dataUrl };
}

document.querySelector('[data-reel-photos]')?.addEventListener('change', () => {
  const input = document.querySelector('[data-reel-photos]');
  const files = [...(input?.files || [])];
  if (input) input.value = '';
  if (!files.length) return;
  setReelPhotoFiles(files, { append: reelHasPhotos() });
});

document.querySelector('[data-reel-video]')?.addEventListener('change', () => {
  const input = document.querySelector('[data-reel-video]');
  const file = input?.files?.[0];
  if (input) input.value = '';
  if (!file) return;
  setReelVideoFile(file);
});

document.querySelector('[data-reel-audio]')?.addEventListener('change', () => {
  const input = document.querySelector('[data-reel-audio]');
  const file = input?.files?.[0];
  const error = document.querySelector('[data-reel-error]');
  if (input) input.value = '';
  if (!file) return;
  if (!reelHasPhotos()) {
    if (error) error.textContent = 'Add photos first, then attach slideshow audio.';
    syncReelAudioComposerUi();
    return;
  }
  const type = file.type || (/\.mp3$/i.test(file.name) ? 'audio/mpeg' : (/\.m4a$/i.test(file.name) ? 'audio/mp4' : (/\.wav$/i.test(file.name) ? 'audio/wav' : (/\.ogg$/i.test(file.name) ? 'audio/ogg' : ''))));
  if (!/^audio\/(?:mpeg|mp3|mp4|wav|ogg|webm|aac|x-m4a)$/i.test(type) && !/\.(?:mp3|m4a|wav|ogg|aac)$/i.test(file.name || '')) {
    if (error) error.textContent = 'Choose an MP3, M4A, WAV, or OGG audio file.';
    return;
  }
  if (file.size > MAX_REEL_AUDIO_BYTES) {
    if (error) error.textContent = 'Keep slideshow audio under 40 MB.';
    return;
  }
  if (reelAudio?.previewUrl) URL.revokeObjectURL(reelAudio.previewUrl);
  reelAudio = { file, type: type || 'audio/mpeg', previewUrl: URL.createObjectURL(file) };
  if (error) error.textContent = '';
  syncReelAudioComposerUi();
});

document.addEventListener('click', (event) => {
  const removeSlide = event.target.closest('[data-remove-reel-slide]');
  if (removeSlide) {
    event.preventDefault();
    if (!reelHasPhotos()) return;
    const index = Number(removeSlide.dataset.removeReelSlide);
    if (!Number.isInteger(index) || index < 0 || index >= reelMedia.files.length) return;
    const nextFiles = reelMedia.files.filter((_, i) => i !== index);
    const nextTypes = (reelMedia.types || []).filter((_, i) => i !== index);
    const nextUrls = (reelMedia.previewUrls || []).filter((_, i) => i !== index);
    URL.revokeObjectURL(reelMedia.previewUrls?.[index] || '');
    if (!nextFiles.length) {
      revokeReelPreviewUrls({ previewUrls: nextUrls });
      reelMedia = null;
    } else {
      reelMedia = {
        isVideo: false,
        files: nextFiles,
        types: nextTypes,
        previewUrls: nextUrls,
        previewUrl: nextUrls[0] || '',
      };
    }
    renderReelComposerPreview();
    return;
  }
  if (!event.target.closest('[data-remove-reel-audio]')) return;
  if (reelAudio?.previewUrl) URL.revokeObjectURL(reelAudio.previewUrl);
  reelAudio = null;
  syncReelAudioComposerUi();
});

document.querySelector('[data-reel-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.querySelector('[data-reel-error]');
  const submit = document.querySelector('[data-reel-submit]');
  const caption = String(document.querySelector('[data-reel-caption]')?.value || '').trim();
  if (!reelMedia || (reelMedia.isVideo ? !reelMedia.file : !reelMedia.files?.length)) {
    if (error) error.textContent = 'Add photos or a short video first.';
    return;
  }
  if (submit) submit.disabled = true;
  if (error) error.textContent = 'Uploading Reel...';
  try {
    let image = null;
    let images = null;
    let video = null;
    let audio = null;
    if (reelMedia.isVideo) {
      const uploaded = await uploadReelFile(reelMedia.file, 'video', (progress) => {
        if (error) error.textContent = `Uploading Reel... ${Math.round(progress.percentage || 0)}%`;
      });
      video = uploaded;
    } else {
      const files = reelMedia.files;
      const allowDataUrl = files.length === 1 && !reelAudio?.file;
      images = [];
      for (let index = 0; index < files.length; index += 1) {
        const uploaded = await uploadReelFile(files[index], 'image', (progress) => {
          const base = (index / files.length) * 100;
          const part = (Math.round(progress.percentage || 0) / files.length);
          if (error) error.textContent = `Uploading photos... ${Math.min(99, Math.round(base + part))}%`;
        }, { allowDataUrl });
        images.push(uploaded);
      }
      image = images[0] || null;
      if (reelAudio?.file) {
        if (error) error.textContent = 'Uploading audio...';
        audio = await uploadReelFile(reelAudio.file, 'audio', (progress) => {
          if (error) error.textContent = `Uploading audio... ${Math.round(progress.percentage || 0)}%`;
        }, { allowDataUrl: false });
      }
    }
    if (error) error.textContent = 'Posting Reel...';
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'post',
        content: caption,
        reel: true,
        image,
        images,
        audio,
        video,
        ...activeAccountRequest(),
      }),
    });
    const result = await readApiJson(response, 'Could not post this Reel.');
    if (!response.ok) throw new Error(result.error || 'Could not post this Reel.');
    clearReelDraft();
    resetReelComposer();
    document.querySelector('[data-reel-composer]')?.setAttribute('hidden', '');
    showView('home');
    await loadPosts();
  } catch (exception) {
    if (error) error.textContent = exception.message || 'Could not post this Reel.';
  } finally {
    if (submit) submit.disabled = !reelMedia;
  }
});

document.querySelector('[data-sponsored-report-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-sponsored-report-status]');
  const adId = String(document.querySelector('[data-sponsored-ad-id]')?.value || '').trim();
  const reason = String(document.querySelector('[data-sponsored-report-reason]')?.value || '').trim();
  if (!currentUserId) { window.location.href = signInUrl(); return; }
  if (!adId) {
    if (status) status.textContent = 'Open Learn on a sponsored card first, or paste the ad ID.';
    return;
  }
  if (reason.length < 8) {
    if (status) status.textContent = 'Add a bit more detail so staff can review the ad.';
    return;
  }
  if (status) {
    status.dataset.keep = '1';
    status.textContent = 'Sending report…';
  }
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ad-report', adId, reason }),
    });
    const result = await readApiJson(response, 'Could not report this sponsored ad.');
    if (!response.ok) throw new Error(result.error || 'Could not report this sponsored ad.');
    const reasonField = document.querySelector('[data-sponsored-report-reason]');
    if (reasonField) reasonField.value = '';
    if (status) status.textContent = 'Report sent to the staff panel.';
    void siteAlert('Sponsored ad report sent to staff.', 'Report sent');
  } catch (error) {
    if (status) status.textContent = error.message || 'Could not report this sponsored ad.';
  } finally {
    if (status) delete status.dataset.keep;
  }
});

window.addEventListener('resize', () => {
  if (isVisibleReelsTab()) syncReelCardHeights();
  syncAllReelOpenChips();
});

document.querySelector('[data-reel-comment-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await submitReelComment(document.querySelector('[data-reel-comment-input]'));
  } catch (exception) {
    void siteAlert(exception.message || 'Could not post this comment.');
  }
});
document.querySelector('[data-reel-panel-comment-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await submitReelComment(document.querySelector('[data-reel-panel-comment-input]'));
  } catch (exception) {
    void siteAlert(exception.message || 'Could not post this comment.');
  }
});

postButton?.addEventListener('click', async () => {
  const pollOptions = [...document.querySelectorAll('[data-poll-option]')].map((input) => input.value.trim()).filter(Boolean);
  const pollQuestion = document.querySelector('[data-poll-question]')?.value.trim() || '';
  const pollDuration = document.querySelector('[data-poll-duration]')?.value || '1';
  const poll = pollQuestion || pollOptions.length ? { question: pollQuestion, options: pollOptions, durationDays: pollDuration } : null;
  postButton.disabled = true;
  postMessage.textContent = 'Posting...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post', content: content.value, gif: selectedGif, image: selectedImage, poll, location: selectedLocation, quoteId: selectedQuoteId, ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Posting is unavailable because the website service is not connected.');
    if (!response.ok) throw new Error(automodHoldError(result, result.error || 'Could not post.'));
    content.value = ''; count.textContent = '0 / 500'; postButton.disabled = true; updateComposerHighlight(); selectedGif = null; selectedImage = null; stopDropLocationRefresh(); selectedLocation = null; selectedQuoteId = null; gifPreview.hidden = true; gifPreview.innerHTML = ''; renderDropPreview(); renderQuotePreview(); if (pollBuilder) { pollBuilder.hidden = true; composer?.classList.remove('composer-expanded'); pollBuilder.querySelectorAll('input').forEach((input) => { input.value = ''; }); } clearComposerDraft(); postMessage.textContent = 'Posted.'; await loadPosts();
    renderOnboardingChecklist();
  } catch (error) {
    const message = automodHoldError({ error: error.message }, error.message || 'Could not post.');
    postMessage.textContent = message;
    if (/member of the Clearwater Roleplay Discord server/i.test(message)) showJoinRequired();
    else if (/banned/i.test(message)) showBan({ reason: 'This account is banned from Clearwater Internet.', until: null });
  } finally { postButton.disabled = !canComposePost(); }
});

admin?.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => {
  const action = button.dataset.verifyButton !== undefined || button.dataset.unverifyButton !== undefined ? 'verify' : 'ban';
  const enabled = button.dataset.unverifyButton === undefined && button.dataset.unbanButton === undefined;
  adminMessage.textContent = 'Saving...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, enabled, targetId: targetId.value, reason: action === 'ban' && enabled ? banReason?.value : '', durationDays: action === 'ban' && enabled ? banDuration?.value : 'forever', ipBan: action === 'ban' && enabled && ipBanOption?.checked === true }) });
    const result = await readApiJson(response, 'Owner controls are unavailable because the website service is not connected.'); if (!response.ok) throw new Error(result.error); adminMessage.textContent = 'Saved.';
  } catch (error) { adminMessage.textContent = error.message || 'Could not save.'; }
}));

accountSwitchButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  const opening = accountSwitchMenu.hidden;
  accountSwitchMenu.hidden = !opening;
  accountSwitchButton.setAttribute('aria-expanded', String(opening));
});
document.querySelector('[data-internet-logout]')?.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.href = INTERNET_PATH;
  }
});
document.querySelectorAll('[data-select-account]').forEach((button) => button.addEventListener('click', () => selectPostingAccount(button.dataset.selectAccount)));
document.addEventListener('click', (event) => {
  if (accountSwitch && !accountSwitch.contains(event.target)) {
    accountSwitchMenu.hidden = true;
    accountSwitchButton?.setAttribute('aria-expanded', 'false');
  }
});
accountSwitchMenu?.addEventListener('click', (event) => {
  const option = event.target.closest('[data-select-account]');
  if (!option || !accountSwitchMenu.contains(option)) return;
  selectPostingAccount(option.dataset.selectAccount);
});
document.querySelector('[data-save-official-profile]')?.addEventListener('click', async () => {
  const message = document.querySelector('[data-official-profile-message]');
  message.textContent = 'Saving...';
  try {
    const profile = {
      displayName: document.querySelector('[data-official-name]').value,
      username: document.querySelector('[data-official-username]').value,
      bio: document.querySelector('[data-official-bio]').value,
      avatarUrl: document.querySelector('[data-official-avatar-url]').value,
      bannerUrl: document.querySelector('[data-official-banner-url]').value,
    };
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'official-profile-save', profile }) });
    const result = await readApiJson(response, 'Could not save the official account.');
    if (!response.ok) throw new Error(result.error || 'Could not save the official account.');
    message.textContent = 'Official account saved.';
    await loadPosts();
  } catch (error) { message.textContent = error.message || 'Could not save the official account.'; }
});

document.querySelectorAll('[data-wallet-transfer-tab]').forEach((button) => {
  button.addEventListener('click', () => setWalletTransferTab(button.dataset.walletTransferTab));
});
document.querySelector('[data-wallet-transfer-search]')?.addEventListener('input', (event) => {
  if (walletTransferTarget) selectWalletTransferTarget(null);
  renderWalletTransferResults(event.target.value);
});
document.querySelector('[data-government-fine-form]')?.addEventListener('submit', (event) => {
  void submitGovernmentFineRequest(event);
});
document.querySelector('[data-wallet-transfer-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-wallet-transfer-status]');
  const submit = document.querySelector('[data-wallet-transfer-submit]');
  const amount = Number(document.querySelector('[data-wallet-transfer-amount]')?.value);
  const note = document.querySelector('[data-wallet-transfer-note]')?.value || '';
  const searchValue = String(document.querySelector('[data-wallet-transfer-search]')?.value || '').trim();
  if (!walletTransferTarget && !searchValue) {
    if (status) { status.dataset.tone = 'error'; status.textContent = 'Choose a member first.'; }
    return;
  }
  if (submit) submit.disabled = true;
  if (status) { status.dataset.tone = 'wait'; status.textContent = walletTransferType === 'request' ? 'Sending request...' : 'Sending transfer...'; }
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'wallet-transfer',
        type: walletTransferType,
        targetId: walletTransferTarget?.id || '',
        username: walletTransferTarget?.username || searchValue.replace(/^@/, ''),
        amount,
        note,
      }),
    });
    const result = await readApiJson(response, 'Could not create this transfer.');
    if (!response.ok) throw new Error(result.error || 'Could not create this transfer.');
    if (result.wallet) renderWallet(result.wallet);
    else await loadWallet();
    selectWalletTransferTarget(null);
    const amountInput = document.querySelector('[data-wallet-transfer-amount]');
    const noteInput = document.querySelector('[data-wallet-transfer-note]');
    const searchInput = document.querySelector('[data-wallet-transfer-search]');
    if (amountInput) amountInput.value = '';
    if (noteInput) noteInput.value = '';
    if (searchInput) searchInput.value = '';
    if (status) {
      status.dataset.tone = 'ok';
      status.textContent = walletTransferType === 'request'
        ? 'Request sent. They will get an official Clearwater message to accept.'
        : 'Transfer sent. They will get an official Clearwater message to accept.';
    }
    void loadMessages();
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not create this transfer.';
    }
  } finally {
    if (submit) submit.disabled = false;
  }
});

document.querySelectorAll('[data-wallet-tab]').forEach((button) => {
  button.addEventListener('click', () => setWalletTab(button.dataset.walletTab || 'home'));
});

document.querySelectorAll('[data-ad-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    setAdWalletTab(button.dataset.adTab || 'create');
  });
});

document.querySelectorAll('[data-ad-placement-option]').forEach((button) => {
  button.addEventListener('click', () => {
    const next = button.dataset.adPlacementOption || 'sidebar';
    adPlacement = ['sidebar', 'feed'].includes(next) ? next : 'sidebar';
    if (adPlacement !== 'reel') adVideoSeconds = 0;
    if (adPlacement === 'reel' && adMedia && !adMedia.isVideo) {
      if (adMedia.previewUrl) URL.revokeObjectURL(adMedia.previewUrl);
      adMedia = null;
      const input = document.querySelector('[data-ad-media]');
      if (input) input.value = '';
      renderAdMediaPreview();
    }
    syncAdPlacementUi();
    syncAdBoostLabels();
  });
});

document.querySelector('[data-ad-logo]')?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0] || null;
  if (adLogo?.previewUrl) URL.revokeObjectURL(adLogo.previewUrl);
  adLogo = null;
  if (!file) {
    renderAdLogoPreview();
    return;
  }
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type || '')) {
    event.target.value = '';
    await siteAlert('Choose a PNG, JPEG, WebP, or GIF logo.');
    renderAdLogoPreview();
    return;
  }
  if (file.size > MAX_AD_MEDIA_BYTES) {
    event.target.value = '';
    await siteAlert('Logo images must be under 40 MB.');
    renderAdLogoPreview();
    return;
  }
  adLogo = { file, previewUrl: URL.createObjectURL(file) };
  renderAdLogoPreview();
});

document.querySelector('[data-ad-logo-preview]')?.addEventListener('click', (event) => {
  if (!event.target.closest('[data-remove-ad-logo]')) return;
  if (adLogo?.previewUrl) URL.revokeObjectURL(adLogo.previewUrl);
  adLogo = null;
  const input = document.querySelector('[data-ad-logo]');
  if (input) input.value = '';
  renderAdLogoPreview();
});

document.querySelector('[data-ad-media]')?.addEventListener('change', async (event) => {
  const input = event.target;
  const file = input?.files?.[0];
  const status = document.querySelector('[data-ad-status]');
  if (!file) return;
  if (file.size > MAX_AD_MEDIA_BYTES) {
    if (status) { status.dataset.tone = 'error'; status.textContent = 'Keep ad media under 40 MB.'; }
    input.value = '';
    return;
  }
  const isVideo = /^video\//i.test(file.type);
  const isImage = /^image\//i.test(file.type);
  if (adPlacement === 'reel' && !isVideo) {
    if (status) { status.dataset.tone = 'error'; status.textContent = 'Reel placements need a short video.'; }
    input.value = '';
    return;
  }
  if (!isVideo && !isImage) {
    if (status) { status.dataset.tone = 'error'; status.textContent = 'Choose an image or a short MP4/WebM video.'; }
    input.value = '';
    return;
  }
  if (adMedia?.previewUrl) URL.revokeObjectURL(adMedia.previewUrl);
  adMedia = { file, isVideo, previewUrl: URL.createObjectURL(file) };
  adVideoSeconds = isVideo ? await readVideoDurationSeconds(file) : 0;
  renderAdMediaPreview();
  syncAdBoostLabels();
  if (status) {
    status.dataset.tone = 'wait';
    status.textContent = isVideo
      ? `Video ready${adVideoSeconds ? ` · ${Math.ceil(adVideoSeconds)}s` : ''}.`
      : 'Image ready to upload with your ad.';
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-remove-ad-media]')) return;
  if (adMedia?.previewUrl) URL.revokeObjectURL(adMedia.previewUrl);
  adMedia = null;
  adVideoSeconds = 0;
  const input = document.querySelector('[data-ad-media]');
  if (input) input.value = '';
  renderAdMediaPreview();
  syncAdBoostLabels();
});

document.querySelector('[data-ad-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.querySelector('[data-ad-status]');
  const submit = document.querySelector('[data-ad-submit]');
  if (submit) submit.disabled = true;
  if (status) { status.dataset.tone = 'wait'; status.textContent = 'Submitting your ad for staff review...'; }
  try {
    if (adPlacement === 'reel' && !adMedia?.isVideo) {
      throw new Error('Reel placements need a short video.');
    }
    const businessId = document.querySelector('[data-ad-business-id]')?.value || '';
    if (!businessId) throw new Error('Select an approved business account you handle.');
    let image = null;
    let video = null;
    let logo = null;
    if (adLogo?.file) {
      if (status) status.textContent = 'Uploading ad logo...';
      const uploadedLogo = await uploadAdMedia(adLogo.file, false);
      logo = uploadedLogo.image || null;
    }
    if (adMedia?.file) {
      if (status) status.textContent = 'Uploading ad media...';
      const media = await uploadAdMedia(adMedia.file, adMedia.isVideo);
      image = media.image || null;
      video = media.video || null;
    }
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ad-purchase',
        businessId,
        category: document.querySelector('[data-ad-category]')?.value || 'business',
        businessName: document.querySelector('[data-ad-business]')?.value || '',
        title: document.querySelector('[data-ad-title]')?.value || '',
        body: document.querySelector('[data-ad-body]')?.value || '',
        boost: Number(document.querySelector('[data-ad-boost]')?.value || 0),
        placement: adPlacement,
        videoSeconds: adPlacement === 'reel' ? adVideoSeconds : 0,
        image,
        video,
        logo,
      }),
    });
    const result = await readApiJson(response, 'Could not submit this ad.');
    if (!response.ok) throw new Error(result.error || 'Could not submit this ad.');
    if (result.wallet) renderWallet(result.wallet);
    else await loadWallet();
    if (result.pricing) adPricing = { ...adPricing, ...result.pricing };
    syncAdBoostLabels();
    document.querySelector('[data-ad-title]').value = '';
    document.querySelector('[data-ad-body]').value = '';
    document.querySelector('[data-ad-boost]').value = '0';
    if (adMedia?.previewUrl) URL.revokeObjectURL(adMedia.previewUrl);
    adMedia = null;
    if (adLogo?.previewUrl) URL.revokeObjectURL(adLogo.previewUrl);
    adLogo = null;
    adVideoSeconds = 0;
    const mediaInput = document.querySelector('[data-ad-media]');
    if (mediaInput) mediaInput.value = '';
    const logoInput = document.querySelector('[data-ad-logo]');
    if (logoInput) logoInput.value = '';
    renderAdMediaPreview();
    renderAdLogoPreview();
    syncAdBusinessAutofill();
    syncAdBoostLabels();
    if (status) {
      status.dataset.tone = 'ok';
      status.textContent = `Submitted ${adPlacementLabel(adPlacement).toLowerCase()} placement. Staff will review it before it can run for ${Number(adPricing.durationHours) || 48} hours.`;
    }
    await loadAds();
  } catch (error) {
    if (status) {
      status.dataset.tone = 'error';
      status.textContent = error.message || 'Could not submit this ad.';
    }
  } finally {
    if (submit) submit.disabled = false;
  }
});

showViewFromAddress();

const NEWSLETTER_PROMO_KEY = 'clearwater-newsletter-v2-promo';

function dismissNewsletterPromo() {
  const card = document.querySelector('[data-newsletter-promo]');
  if (card) card.hidden = true;
  try { localStorage.setItem(NEWSLETTER_PROMO_KEY, '1'); } catch { /* ignore */ }
}

function maybeShowNewsletterPromo() {
  const card = document.querySelector('[data-newsletter-promo]');
  if (!card || !currentUserId) return;
  try {
    if (localStorage.getItem(NEWSLETTER_PROMO_KEY) === '1') return;
  } catch { /* show anyway */ }
  const homeOpen = !document.querySelector('[data-view="home"]')?.hidden;
  if (!homeOpen) return;
  card.hidden = false;
}

document.querySelector('[data-newsletter-promo-dismiss]')?.addEventListener('click', dismissNewsletterPromo);
document.querySelector('[data-newsletter-promo] a')?.addEventListener('click', dismissNewsletterPromo);

async function bootInternet() {
  try {
    const signedIn = await loadSession().catch(() => Boolean(currentUserId));
    if (!signedIn) {
      window.location.replace(signInUrl());
      return;
    }
    await loadPosts();
    void loadAds();
    startAdRotation();
  } finally {
    if (currentUserId) {
      document.body.classList.remove('internet-booting');
      document.body.classList.add('internet-ready');
      document.querySelector('[data-internet-boot]')?.setAttribute('hidden', '');
      window.setTimeout(maybeShowNewsletterPromo, 900);
    }
  }
}

bindCustomSelectChrome();
initAccentPicker();
bootInternet();

let mobileRailScrollY = window.scrollY || 0;
let mobileRailScrollFrame = 0;
function syncMobileRailScroll() {
  const rail = document.querySelector('.internet-rail');
  const postButton = document.querySelector('[data-compose-link]');
  const mobile = window.matchMedia('(max-width: 660px)').matches;
  const staffMode = document.querySelector('.internet-shell')?.classList.contains('staff-mode');
  const reelsOn = document.body.classList.contains('reels-watching');
  const menuOpen = document.querySelector('[data-account-switch-menu]:not([hidden])');
  if (!rail || !mobile || staffMode || reelsOn || menuOpen) {
    rail?.classList.remove('rail-scroll-away');
    document.body.classList.remove('rail-chrome-hidden');
    postButton?.classList.remove('rail-scroll-away');
    mobileRailScrollY = window.scrollY || 0;
    return;
  }
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const delta = y - mobileRailScrollY;
  if (y < 24) {
    rail.classList.remove('rail-scroll-away');
    document.body.classList.remove('rail-chrome-hidden');
    postButton?.classList.remove('rail-scroll-away');
  } else if (delta > 10) {
    rail.classList.add('rail-scroll-away');
    document.body.classList.add('rail-chrome-hidden');
    postButton?.classList.add('rail-scroll-away');
  } else if (delta < -10) {
    rail.classList.remove('rail-scroll-away');
    document.body.classList.remove('rail-chrome-hidden');
    postButton?.classList.remove('rail-scroll-away');
  }
  mobileRailScrollY = y;
}
window.addEventListener('scroll', () => {
  if (mobileRailScrollFrame) return;
  mobileRailScrollFrame = requestAnimationFrame(() => {
    mobileRailScrollFrame = 0;
    syncMobileRailScroll();
  });
}, { passive: true });
window.addEventListener('resize', syncMobileRailScroll, { passive: true });

window.setInterval(() => {
  if (document.hidden) return;
  const view = currentInternetView();
  // Only refresh the feed when it is actually on screen.
  if (['home', 'bookmarks', 'post', 'member', 'profile', 'reels'].includes(view)) void loadPosts();
  if (view === 'messages') void loadMessages();
  if (view === 'conversation' && viewedMember) void loadConversation(viewedMember);
}, 180_000);
window.setInterval(() => {
  if (document.hidden) return;
  // One status call covers ban + presence + unread warning peek.
  void loadBanStatus();
  if (!document.querySelector('[data-view="staff"]')?.hidden && sessionCanStaff) void loadModeration();
}, 120_000);
window.setInterval(() => {
  if (document.hidden || !sessionCanStaff) return;
  if (document.querySelector('[data-view="staff"]')?.hidden) return;
  if (staffTab !== 'active') return;
  void loadModeration();
}, 90_000);
window.addEventListener('scroll', queuePresenceFromScroll, { passive: true });
window.setInterval(updateBanCountdown, 60 * 1000);
