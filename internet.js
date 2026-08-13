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
const profileRank = document.querySelector('[data-profile-rank]');
const profileVerified = document.querySelector('[data-profile-verified]');
const profilePostCount = document.querySelector('[data-profile-post-count]');
const profileList = document.querySelector('[data-profile-list]');
const staffLink = document.querySelector('[data-staff-link]');
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
const INTERNET_VERSION = '20260813-home-reels';
let walletTransferType = 'send';
let walletTransferTarget = null;
const AUTOMOD_HOLD_MESSAGE = 'That was held for staff review and was not delivered.';
const MAX_REEL_BYTES = 2 * 1024 * 1024 * 1024;
const SMALL_REEL_BYTES = 3_200_000;
const INTERNET_PATH = '/internet';
const SIGNIN_INTERNET = '/signin?next=/internet';
const INTERNET_VIEWS = new Set(['home', 'notifications', 'messages', 'profile', 'member', 'conversation', 'settings', 'staff', 'wallet', 'post']);

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

function internetUrl(view = 'home', id = '') {
  if (view === 'home') return INTERNET_PATH;
  if (view === 'post' && id) return `${INTERNET_PATH}/post/${encodeURIComponent(id)}`;
  if (view === 'member' && id) return `${INTERNET_PATH}/member/${encodeURIComponent(id)}`;
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
  const parts = path.startsWith(`${INTERNET_PATH}/`) ? path.slice(INTERNET_PATH.length + 1).split('/').filter(Boolean) : [];
  if (!parts.length) return { view: 'home', id: '' };
  if (parts[0] === 'post' && parts[1]) return { view: 'post', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'member' && parts[1]) return { view: 'member', id: decodeURIComponent(parts[1]) };
  if (INTERNET_VIEWS.has(parts[0]) && parts[0] !== 'post' && parts[0] !== 'member') {
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
const inFlightLikes = new Set();
let accountBanned = false;
let activeBan = null;
let sessionIsOwner = false;
let sessionStaffPanel = null;
let sessionCanStaff = false;
let activeAccount = 'personal';
let sessionUser = null;
let pendingReportReview = null;
let selectedGif = null;
let selectedImage = null;
let messageGif = null;
let reelsSoundOn = false;
let pickerTarget = 'post';
let socialState = { following: [], followers: [], blocked: [], muted: [], bookmarks: [], unreadNotifications: 0, unreadMessages: 0 };
let viewedMember = null;
let profileTab = 'posts';
let memberTab = 'posts';
let preferenceState = {};
let profileDraft = null;
let profileBannerBusy = false;
let pendingPostAction = null;
let openPostId = null;
let moderationSnapshot = null;
let selectedReportId = null;
let feedTab = ['foryou', 'recent', 'following', 'official', 'reels'].includes(localStorage.getItem('clearwater-feed-tab')) ? localStorage.getItem('clearwater-feed-tab') : 'foryou';
let selectedLocation = null;
let dropLocationTimer = 0;
let dropLocationBusy = false;
let selectedQuoteId = null;
let activeReelId = null;
let reelMedia = null;
let reelObserver = null;
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
let selectedStaffUserId = null;
let staffUserDetail = null;
let staffUserBusy = false;
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
  if (user.pronouns) items.push(`<span><span aria-hidden="true">◈</span> ${escapeHtml(user.pronouns)}</span>`);
  if (user.location) items.push(`<span><span aria-hidden="true">⌖</span> ${escapeHtml(user.location)}</span>`);
  const link = safeLinkUrl(user.website);
  if (link) {
    const label = link.replace(/^https:\/\//i, '').replace(/\/$/, '');
    items.push(`<a href="${escapeHtml(link)}" target="_blank" rel="noopener nofollow ugc"><span aria-hidden="true">⧉</span> ${escapeHtml(label)}</a>`);
  }
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
const verifiedBadge = () => '<span class="verified" role="img" aria-label="Verified" data-tooltip="Verified"><img src="assets/verified-badge.png" alt="" /></span>';
const businessBadge = () => '<span class="role-badge business-badge" role="img" aria-label="Business" data-tooltip="Business account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l1.7-1.7 2.7 2.7 8.3-8.3 1.7 1.7z"/></svg></span>';
const warningBadge = (tooltip) => {
  const label = String(tooltip || 'Account warning').trim() || 'Account warning';
  return `<span class="role-badge warning-badge" role="img" aria-label="${escapeHtml(label)}" data-tooltip="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 22 20.6H2L12 3.4Zm0 5.2c-.7 0-1.2.5-1.1 1.2l.4 5.2h1.4l.4-5.2c.1-.7-.4-1.2-1.1-1.2Zm0 9.3a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z"/></svg></span>`;
};
const roleBadges = (user) => {
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
  const business = badges.includes('business') ? businessBadge() : '';
  const warning = badges.includes('warning') ? warningBadge(user?.warningBadgeText) : '';
  return `${premium}${staff}${developer}${business}${warning}`;
};
const identityBadges = (user) => `${user?.verified === true ? verifiedBadge() : ''}${roleBadges(user)}`;
const currentAuthor = (post) => internetUsers.get(post.authorId) || null;
const isVerified = (post) => currentAuthor(post)?.verified === true;

function refreshProfileVerified() {
  const me = internetUsers.get(currentUserId);
  if (profileVerified) profileVerified.hidden = me?.verified !== true;
  const staffBadge = document.querySelector('[data-profile-staff-badge]');
  if (staffBadge) staffBadge.hidden = !Array.isArray(me?.badges) || !me.badges.includes('staff');
  const business = document.querySelector('[data-profile-business-badge]');
  if (business) business.hidden = !Array.isArray(me?.badges) || !me.badges.includes('business');
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

function activeAuthor() {
  return activeAccount === 'official' ? (internetUsers.get(officialAccountId) || OFFICIAL_ACCOUNT_FALLBACK) : null;
}

function activeUserId() {
  return activeAccount === 'official' ? officialAccountId : currentUserId;
}

function activeAccountRequest() {
  return activeAccount === 'official' ? { asOfficial: true } : {};
}

function updateAccountSwitcher() {
  if (!sessionUser || !accountSwitch) return;
  const official = activeAuthor();
  const selected = official || sessionUser;
  accountSwitchAvatar.src = selected.avatarUrl || 'assets/clearwater-logo.png';
  accountSwitchName.textContent = selected.displayName || selected.username || 'Clearwater account';
  accountSwitchHandle.textContent = `@${selected.username || 'clearwater'}`;
  document.querySelector('[data-personal-account-selected]')?.toggleAttribute('hidden', activeAccount !== 'personal');
  document.querySelector('[data-official-account-selected]')?.toggleAttribute('hidden', activeAccount !== 'official');
  if (composerAvatar) composerAvatar.src = selected.avatarUrl || 'assets/clearwater-logo.png';
  if (avatar) avatar.src = selected.avatarUrl || 'assets/clearwater-logo.png';
  if (name) name.textContent = selected.displayName || selected.username || 'Clearwater account';
  if (rank) rank.textContent = activeAccount === 'official' ? 'Official' : (sessionUser.staffRank || '');
}

function selectPostingAccount(account) {
  if (account === 'official' && !sessionIsOwner) return;
  activeAccount = account === 'official' ? 'official' : 'personal';
  if (activeAccount === 'official' && officialAccountId && !internetUsers.has(officialAccountId)) {
    internetUsers.set(officialAccountId, { ...OFFICIAL_ACCOUNT_FALLBACK, id: officialAccountId });
  }
  localStorage.setItem(`clearwater-posting-account-${currentUserId}`, activeAccount);
  updateAccountSwitcher();
  accountSwitchMenu.hidden = true;
  accountSwitchButton?.setAttribute('aria-expanded', 'false');
  void loadSocial();
  void loadMessages();
  void loadNotifications();
  if (activeAccount === 'official') openMemberProfile(officialAccountId);
}

async function readApiJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(fallbackMessage);
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

function postMenu(post) {
  if (!currentUserId) return '';
  const ownPost = post.authorId === activeUserId();
  const buttons = ownPost
    ? '<button type="button" data-post-action="edit">Edit post</button><button type="button" data-post-action="delete">Delete post</button>'
    : `<button type="button" data-post-action="report">Report post</button>${sessionIsOwner ? '<button type="button" class="danger" data-post-action="delete">Delete post</button>' : ''}`;
  return `<details class="post-menu"><summary aria-label="Post actions">•••</summary><div data-post-id="${escapeHtml(post.id)}">${buttons}</div></details>`;
}

function postActionIcon(type, filled = false) {
  const icons = {
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8.2 7.5 8.8 8.8 0 0 1-3.4-.7L4 20l1.2-3.4A7.2 7.2 0 0 1 4 12a8 8 0 0 1 16 0Z" /></svg>',
    repost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>',
    like: `<svg viewBox="0 0 24 24" aria-hidden="true"${filled ? ' class="filled"' : ''}><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.8 1.8Z" /></svg>`,
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.6L6 21V4.5Z" /></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5M5 13.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.5" /></svg>',
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
  return escapeHtml(post.content)
    .replace(/(^|\s)(#[a-z0-9_]{1,60})/gi, '$1<a href="/internet" class="post-hashtag" data-topic="$2">$2</a>')
    .replace(/(^|\s)(@[a-z0-9_]{1,80})/gi, (full, leading, handle) => {
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

// Official PRC/Sonoran maps are 3120² studs with (0,0) at the northwest
// corner of the framed landmass. +X is east, +Z is south (down on the image).
const LIBERTY_MAP = Object.freeze({
  world: 3120,
  frameLeft: 0.0469,
  frameTop: 0.0918,
  frameWidth: 0.9023,
  frameHeight: 0.8262,
});

function libertyMapPoint(x, z) {
  const nx = Number(x) / LIBERTY_MAP.world;
  const ny = Number(z) / LIBERTY_MAP.world;
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return {
    left: LIBERTY_MAP.frameLeft + Math.min(1, Math.max(0, nx)) * LIBERTY_MAP.frameWidth,
    top: LIBERTY_MAP.frameTop + Math.min(1, Math.max(0, ny)) * LIBERTY_MAP.frameHeight,
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
  const zoom = 2.7;
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
  return `<figure class="drop-map"><div class="drop-map-view"><div class="drop-map-scene" style="transform:translate(${tx.toFixed(2)}%,${ty.toFixed(2)}%) scale(${zoom})"><img src="assets/liberty-county-map.png" alt="Liberty County map" draggable="false" /></div><i class="drop-map-pin" style="left:${screenX.toFixed(2)}%;top:${screenY.toFixed(2)}%" aria-hidden="true"><span></span></i></div>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}

function postMediaMarkup(post, displayName) {
  const gif = safeGifUrl(post.gifUrl) ? `<img class="post-gif" src="${escapeHtml(post.gifUrl)}" alt="${escapeHtml(post.gifTitle || 'GIF')}" />` : '';
  const image = safeImageUrl(post.imageUrl) ? `<img class="post-image" src="${escapeHtml(post.imageUrl)}" alt="Image shared by ${escapeHtml(displayName || 'a Clearwater member')}" />` : '';
  const videoSrc = safeVideoUrl(post.videoUrl) ? post.videoUrl : (post.videoUrl && post.kind === 'reel' ? reelMediaProxyUrl(post.id, 'video') : '');
  const video = videoSrc
    ? `<video class="post-reel-video" src="${escapeHtml(videoSrc)}" muted loop playsinline preload="metadata" controls></video>`
    : '';
  return `${gif}${image}${video}${dropMapMarkup(post.location)}`;
}

function quoteCardMarkup(quoted, { interactive = true } = {}) {
  if (!quoted) return '<div class="quote-card quote-card-missing">This post is unavailable.</div>';
  const author = currentAuthor(quoted) || quoted;
  const displayName = author?.displayName || quoted.displayName || 'Clearwater member';
  const open = interactive ? ` data-open-post="${escapeHtml(quoted.id)}"` : '';
  const start = interactive ? `<button type="button" class="quote-card"${open}>` : '<div class="quote-card">';
  const end = interactive ? '</button>' : '</div>';
  return `${start}<span class="quote-card-head"><img src="${escapeHtml(author?.avatarUrl || quoted.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><b>${escapeHtml(displayName)}</b>${identityBadges(author || quoted)}<small>@${escapeHtml(author?.username || quoted.username || 'member')} · ${timeAgo(quoted.createdAt)}</small></span>${quoted.content ? `<p>${escapeHtml(quoted.content)}</p>` : ''}${postMediaMarkup(quoted, displayName)}${end}`;
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
  if (!currentUserId) { window.location.href = SIGNIN_INTERNET; return; }
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
  const quoted = display.quoteId ? allPosts.find((item) => item.id === display.quoteId) : null;
  const quoteMarkup = display.quoteId ? quoteCardMarkup(quoted) : '';
  const repostLabel = wrapper
    ? `<small class="reposted-label">↻ ${escapeHtml(wrapper.displayName || 'A member')} reposted</small>`
    : '';
  const media = postMediaMarkup(display, displayName);
  const reelChip = display.kind === 'reel'
    ? `<button type="button" class="search-reel-chip" data-open-reel="${escapeHtml(display.id)}">Open Reel</button>`
    : '';
  return `<article class="post" data-post-card="${escapeHtml(display.id)}">${repostLabel}<div class="post-top"><img class="post-avatar" src="${escapeHtml(avatarUrl)}" alt="" /><div><button class="post-author" type="button" data-open-member="${escapeHtml(display.authorId)}"><span class="post-name">${escapeHtml(displayName)}</span>${identityBadges(author || display)}${display.kind === 'reel' ? '<span class="post-reel-tag">Reel</span>' : ''}<span class="post-meta">@${escapeHtml(username)} &middot; ${timeAgo(display.createdAt)}${display.editedAt ? ' &middot; edited' : ''}${staffRank && !profile ? `<span class="post-rank"> &middot; ${escapeHtml(staffRank)}</span>` : ''}</span></button></div>${postMenu(display)}</div>${display.content ? `<p class="post-content">${body}</p>` : ''}${quoteMarkup}${media}${poll}${reelChip}<div class="post-action-row"><button type="button" data-engage="reply" data-post-id="${escapeHtml(display.id)}">${postActionIcon('reply')}<span>${replies || ''}</span></button><details class="repost-inline"><summary aria-label="Repost options" class="${alreadyReposted ? 'reposted' : ''}">${postActionIcon('repost')}</summary><div><button type="button" data-engage="repost-now" data-post-id="${escapeHtml(display.id)}">${alreadyReposted ? 'Undo repost' : 'Repost'}</button><button type="button" data-engage="quote" data-post-id="${escapeHtml(display.id)}">Quote</button></div></details><button type="button" data-engage="like" data-post-id="${escapeHtml(display.id)}" class="${liked ? 'liked' : ''}">${postActionIcon('like', liked)}<span>${likes.length || ''}</span></button><button type="button" data-engage="share" data-post-id="${escapeHtml(display.id)}">${postActionIcon('share')}</button></div></article>`;
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

function isReelsTab() {
  return feedTab === 'reels' && !String(search?.value || '').trim();
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
  document.querySelectorAll('[data-reels-viewport] video').forEach((video) => {
    video.pause();
    video.muted = true;
  });
}

function soundIcon(on = false) {
  return on
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5.2a4 4 0 0 1 0 5.6m2.7-8.3a8 8 0 0 1 0 11" /></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12 1.6 5 4.8m0-4.8-5 4.8" /></svg>';
}

function syncReelSoundControls() {
  document.querySelectorAll('[data-reels-viewport] [data-reel-sound]').forEach((button) => {
    button.classList.toggle('is-on', reelsSoundOn);
    button.setAttribute('aria-pressed', reelsSoundOn ? 'true' : 'false');
    button.setAttribute('aria-label', reelsSoundOn ? 'Turn off sound' : 'Turn on sound');
    button.innerHTML = `${soundIcon(reelsSoundOn)}<span class="sr-only">${reelsSoundOn ? 'Sound on' : 'Muted'}</span>`;
  });
}

function setReelSound(on) {
  reelsSoundOn = Boolean(on);
  document.querySelectorAll('[data-reels-viewport] video').forEach((video) => {
    video.muted = !reelsSoundOn || video.paused;
  });
  syncReelSoundControls();
}

function toggleReelSound(card) {
  setReelSound(!reelsSoundOn);
  const video = card?.querySelector('video');
  if (!video || !reelsSoundOn) return;
  video.muted = false;
  void video.play().catch(() => {
    setReelSound(false);
    void video.play().catch(() => {});
  });
}

function bindReelAutoplay() {
  reelObserver?.disconnect();
  const viewport = document.querySelector('[data-reels-viewport]');
  if (!viewport) return;
  const autoplay = preferenceState.autoplayReels !== false;
  reelObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector('video');
      if (entry.isIntersecting && entry.intersectionRatio > 0.65) {
        const reelId = entry.target.dataset.reelId;
        if (reelId && reelId !== activeReelId) renderReelPanel(reelId);
        if (video && autoplay) {
          video.muted = !reelsSoundOn;
          void video.play().catch(() => {
            // Autoplay with sound can be refused; fall back to a muted play so the reel never stalls.
            setReelSound(false);
            void video.play().catch(() => {});
          });
        }
      } else if (video) {
        video.pause();
        video.muted = true;
      }
    });
  }, { root: viewport, threshold: [0.65] });
  viewport.querySelectorAll('.reel-card').forEach((card) => reelObserver.observe(card));
  bindReelGestures(viewport);
  const firstCard = viewport.querySelector('.reel-card');
  const stillVisible = activeReelId
    && [...viewport.querySelectorAll('.reel-card')].some((card) => card.dataset.reelId === activeReelId);
  if (firstCard?.dataset.reelId && !stillVisible) renderReelPanel(firstCard.dataset.reelId);
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
  const video = card?.querySelector('video');
  if (!video) return;
  if (video.paused) {
    flashReelGlyph(card, false);
    video.muted = !reelsSoundOn;
    void video.play().catch(() => {
      setReelSound(false);
      void video.play().catch(() => {});
    });
    return;
  }
  video.pause();
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
    if (!card || event.target.closest('button, a, input, textarea, summary, details, .reel-actions, .reel-card-more, .reel-more')) return;
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
  const commentCount = document.querySelector('[data-reel-panel-comment-count]');
  const tabCount = document.querySelector('[data-reel-panel-tab-count]');
  if (likeButton) {
    likeButton.classList.toggle('liked', liked);
    likeButton.dataset.reelLike = reel.id;
  }
  if (likeIcon) likeIcon.innerHTML = postActionIcon('like', liked);
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

function reelMediaProxyUrl(reelId, kind = 'video') {
  return `/api/media?reel=${encodeURIComponent(reelId)}&kind=${encodeURIComponent(kind)}`;
}

function bindReelMediaFallback(viewport) {
  viewport.querySelectorAll('.reel-card > video').forEach((video) => {
    if (video.dataset.fallbackBound === '1') return;
    video.dataset.fallbackBound = '1';
    video.addEventListener('error', () => {
      const card = video.closest('.reel-card');
      const reelId = card?.dataset.reelId;
      if (!reelId || video.dataset.fallbackTried === '1') return;
      video.dataset.fallbackTried = '1';
      video.src = reelMediaProxyUrl(reelId, 'video');
      video.load();
    });
  });
  viewport.querySelectorAll('.reel-card > img').forEach((image) => {
    if (image.dataset.fallbackBound === '1') return;
    image.dataset.fallbackBound = '1';
    image.addEventListener('error', () => {
      const card = image.closest('.reel-card');
      const reelId = card?.dataset.reelId;
      if (!reelId || image.dataset.fallbackTried === '1') return;
      image.dataset.fallbackTried = '1';
      image.src = reelMediaProxyUrl(reelId, 'image');
    });
  });
}

function renderReels() {
  const viewport = document.querySelector('[data-reels-viewport]');
  if (!viewport) return;
  const reels = allPosts.filter((post) => post.kind === 'reel' && !post.parentId && !socialState.muted.includes(post.authorId) && !socialState.blocked.includes(post.authorId));
  if (!reels.length) {
    viewport.dataset.reelSignature = '';
    viewport.innerHTML = '<div class="reels-empty"><p>No Reels yet.</p><p>Post a photo or short video to start the feed.</p></div>';
    activeReelId = null;
    renderReelPanel('');
    return;
  }
  // Patch counts in place when the line-up is unchanged so liking never restarts playback or loses scroll position.
  const signature = reels.map((reel) => reel.id).join('|');
  const cards = viewport.querySelectorAll('.reel-card');
  if (viewport.dataset.reelSignature === signature && cards.length === reels.length) {
    cards.forEach((card, index) => updateReelStats(card, reels[index]));
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
    return;
  }
  viewport.dataset.reelSignature = signature;
  clearReelTap();
  const anchorId = [...cards].find((card) => card.offsetTop + card.offsetHeight > viewport.scrollTop + 8)?.dataset.reelId || activeReelId || '';
  viewport.innerHTML = reels.map((reel) => {
    const likes = Array.isArray(reel.likes) ? reel.likes : [];
    const liked = likes.includes(activeUserId());
    const comments = reelCommentsFor(reel.id).length;
    const author = internetUsers.get(reel.authorId) || {};
    const displayName = author.displayName || reel.displayName || reel.username || 'member';
    const username = author.username || reel.username || 'member';
    const avatarUrl = author.avatarUrl || reel.avatarUrl || 'assets/clearwater-logo.png';
    const videoSrc = safeVideoUrl(reel.videoUrl) ? reel.videoUrl : (reel.videoUrl ? reelMediaProxyUrl(reel.id, 'video') : '');
    const imageSrc = safeImageUrl(reel.imageUrl) ? reel.imageUrl : (reel.imageUrl ? reelMediaProxyUrl(reel.id, 'image') : '');
    const media = videoSrc
      ? `<video src="${escapeHtml(videoSrc)}" loop muted playsinline preload="auto"></video>`
      : (imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="" />` : '<p class="reel-missing">This Reel could not be loaded.</p>');
    const sound = videoSrc
      ? `<button type="button" class="reel-mute${reelsSoundOn ? ' is-on' : ''}" data-reel-sound="${escapeHtml(reel.id)}" aria-pressed="${reelsSoundOn ? 'true' : 'false'}" aria-label="${reelsSoundOn ? 'Turn off sound' : 'Turn on sound'}">${soundIcon(reelsSoundOn)}<span class="sr-only">${reelsSoundOn ? 'Sound on' : 'Muted'}</span></button>`
      : '';
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
    return `<article class="reel-card" data-reel-id="${escapeHtml(reel.id)}">${media}<div class="reel-gradient" aria-hidden="true"></div>${sound}<div class="reel-meta"><div class="reel-meta-user"><button type="button" data-open-member="${escapeHtml(reel.authorId)}"><img src="${escapeHtml(avatarUrl)}" alt="" /><span class="reel-author"><b>${escapeHtml(displayName)}</b><small>@${escapeHtml(username)}</small></span></button>${follow}</div>${reel.content ? `<p>${escapeHtml(reel.content)}</p>` : ''}</div><div class="reel-actions"><button type="button" data-reel-like="${escapeHtml(reel.id)}" class="${liked ? 'liked' : ''}" aria-label="Like">${postActionIcon('like', liked)}<span>${likes.length || ''}</span></button><button type="button" data-reel-comments="${escapeHtml(reel.id)}" aria-label="Comments">${postActionIcon('reply')}<span>${comments || ''}</span></button><button type="button" data-reel-share="${escapeHtml(reel.id)}" aria-label="Share">${postActionIcon('share')}</button>${more}</div></article>`;
  }).join('');
  if (anchorId) {
    const stayOn = [...viewport.querySelectorAll('.reel-card')].find((card) => card.dataset.reelId === anchorId);
    if (stayOn) viewport.scrollTo({ top: stayOn.offsetTop, behavior: 'instant' });
  }
  bindReelMediaFallback(viewport);
  bindReelAutoplay();
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
    window.location.href = SIGNIN_INTERNET;
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
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
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
  list.innerHTML = `${heading}${visible.map((post) => postMarkup(post)).join('')}`;
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
  score += (stableJitter(post.id) - 0.5) * 5;
  return score;
}

function rankedForYouPosts(posts) {
  const trending = trendingTagKeys();
  const scored = [...posts].map((post) => ({
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

// The pinned post is lifted to the top of the Posts tab only. Other tabs keep
// plain reverse-chronological order so the pin does not show up twice.
function profileListMarkup(posts, tab, pinnedPostId, emptyMessage) {
  if (!posts.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  const pinned = tab === 'posts' && pinnedPostId ? posts.find((post) => post.id === pinnedPostId) : null;
  const ordered = pinned ? [pinned, ...posts.filter((post) => post.id !== pinned.id)] : posts;
  return ordered.map((post) => (pinned && post.id === pinned.id
    ? `<div class="pinned-post"><span class="pinned-flag"><span aria-hidden="true">📌</span> Pinned post</span>${postMarkup(post, true)}</div>`
    : postMarkup(post, true))).join('');
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
  const connections = document.querySelector('[data-profile-connections]');
  if (connections && hideStats) {
    connections.hidden = true;
    connections.innerHTML = '';
  } else if (connections) {
    const memberIds = [...new Set([...following, ...followers])].filter((id) => internetUsers.has(id));
    connections.hidden = memberIds.length === 0;
    connections.innerHTML = memberIds.slice(0, 24).map((id) => {
      const member = internetUsers.get(id);
      const label = followers.includes(id) ? 'Follows you' : 'Following';
      return `<button type="button" data-open-member="${escapeHtml(id)}"><img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(member.displayName || 'Clearwater member')}</b><small>${label}</small></span></button>`;
    }).join('');
  }
  const mutuals = document.querySelector('[data-profile-mutuals]');
  if (mutuals) {
    mutuals.hidden = true;
    mutuals.innerHTML = '';
  }
}

function renderBookmarks() {
  if (!bookmarkList) return;
  const posts = allPosts.filter((post) => socialState.bookmarks.includes(post.id));
  bookmarkList.innerHTML = posts.length ? posts.map((post) => postMarkup(post)).join('') : '<p class="feed-note">Your saved posts will appear here.</p>';
}

function showView(view) {
  const availableViews = new Set(['home', 'notifications', 'messages', 'profile', 'member', 'conversation', 'settings', 'staff', 'wallet', 'post']);
  let activeView = availableViews.has(view) ? view : 'home';
  if (activeView === 'staff' && !sessionCanStaff) activeView = 'home';
  const shell = document.querySelector('.internet-shell');
  const feed = document.querySelector('.internet-feed');
  shell?.classList.toggle('staff-mode', activeView === 'staff');
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
  if (activeView === 'home') renderPosts();
  if (activeView === 'messages') void loadMessages();
  if (activeView === 'notifications') void loadNotifications();
  if (activeView === 'staff') void loadModeration();
  if (activeView === 'wallet') void loadWallet();
  if (activeView === 'profile') renderOwnProfileDetails();
  if (activeView === 'settings' && currentUserId) void loadProfileEditor();
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
  showView(route.view || 'home');
}

function detailReplyComposerMarkup(postId) {
  if (!currentUserId) {
    return `<section class="detail-reply-composer signed-out"><p>Sign in to reply.</p><a href="${SIGNIN_INTERNET}">Continue with Discord</a></section>`;
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

function showPostDetail(postId, updateHash = true, { focusReply = false } = {}) {
  const post = allPosts.find((item) => item.id === postId);
  if (!post || !postDetail) return showView('home');
  openPostId = postId;
  if (updateHash) setInternetRoute('post', postId);
  showView('post');
  const replies = allPosts.filter((item) => item.parentId === postId);
  postDetail.innerHTML = `${postMarkup(post)}${detailReplyComposerMarkup(post.id)}<section class="detail-replies">${replies.length ? replies.map((reply) => postMarkup(reply)).join('') : '<p>There are no replies yet.</p>'}</section>`;
  if (focusReply) queueMicrotask(focusDetailReplyComposer);
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
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
    const result = await readApiJson(response, 'Could not check account access.');
    if (!response.ok) {
      if (/network is banned/i.test(result.error || '')) showBan(result.ban || { reason: result.error, until: null });
      else if (/member of the Clearwater Roleplay Discord server/i.test(result.error || '')) showJoinRequired();
      return;
    }
    showBan(result.banned ? result.ban : null);
  } catch {
    // Do not hide the normal site if the bot connection is briefly unavailable.
  }
}

function reportSourceLabel(report) {
  if (report?.source === 'automod') return 'Automod';
  return report?.reporterName || 'Member report';
}

function reportKindLabel(report) {
  if (report?.kind === 'message') return 'Direct message';
  if (report?.kind === 'comment') return 'Comment';
  if (report?.kind === 'reel') return 'Reel';
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
  return `<button type="button" class="staff-toggle${active ? ' on' : ''}${tone ? ` ${tone}` : ''}" role="switch" aria-checked="${active ? 'true' : 'false'}" data-staff-user-action="${escapeHtml(action)}">
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

function staffUserPanelMarkup(detail) {
  if (!detail?.user) return '<div class="staff-empty staff-empty-lg">Select a user to open their staff panel.</div>';
  const fullStaff = sessionStaffPanel === 'full';
  const user = { ...detail.user, banUntil: detail.user.ban?.until || null };
  const posts = Array.isArray(detail.posts) ? detail.posts : [];
  const warnings = Array.isArray(detail.warnings) ? detail.warnings : [];
  const reports = Array.isArray(detail.reports) ? detail.reports : [];
  const restrictions = staffActiveRestrictions(user, true);
  const button = (action, label, extra = '') => `<button type="button" class="staff-action-btn${extra ? ` ${extra}` : ''}" data-staff-user-action="${action}">${label}</button>`;
  const accountStatusToggles = [
    fullStaff ? staffToggleMarkup({ active: user.verified === true, onAction: 'verify', offAction: 'unverify', label: 'Verified' }) : '',
    fullStaff ? staffToggleMarkup({ active: user.business === true, onAction: 'badge-business', offAction: 'unbadge-business', label: 'Business check' }) : '',
    staffToggleMarkup({ active: user.banned === true, onAction: 'ban', offAction: 'unban', label: 'Banned', expires: user.banUntil ? staffUntil(user.banUntil) : '', tone: 'danger' }),
  ].filter(Boolean).join('');
  return `<article class="staff-user-dossier">
    <header class="staff-user-hero">
      <img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" />
      <div>
        <b>${escapeHtml(user.displayName || 'Discord user')}</b>
        <small>@${escapeHtml(user.username || 'member')}</small>
        <p class="staff-user-id"><button type="button" data-staff-copy-id="${escapeHtml(user.id)}">${escapeHtml(user.id)}</button></p>
        <div class="staff-chip-row">${staffUserChips(user)}</div>
      </div>
      <div class="staff-user-hero-actions">
        <button type="button" data-open-member="${escapeHtml(user.id)}">Public profile</button>
        <a href="https://discord.com/users/${encodeURIComponent(user.id)}" target="_blank" rel="noopener">Discord</a>
      </div>
    </header>
    <dl class="staff-user-stats">
      <div><dt>Posts</dt><dd>${Number(user.postCount || 0)}</dd></div>
      <div><dt>Reels</dt><dd>${Number(user.reelCount || 0)}</dd></div>
      <div><dt>Warnings</dt><dd>${Number(user.warningCount || 0)}</dd></div>
      <div><dt>Reports</dt><dd>${Number(user.reportCount || 0)}</dd></div>
      <div><dt>Followers</dt><dd>${Number(user.followerCount || 0)}</dd></div>
      <div><dt>Following</dt><dd>${Number(user.followingCount || 0)}</dd></div>
      <div><dt>DMs</dt><dd>${Number(user.messageCount || 0)}</dd></div>
      ${fullStaff ? `<div><dt>Networks</dt><dd>${Number(user.ipHashCount || 0)}</dd></div>` : ''}
    </dl>
    <p class="staff-user-timeline"><span>Joined ${escapeHtml(staffDateLabel(user.createdAt))}</span><span>Last seen ${escapeHtml(staffDateLabel(user.lastSeenAt))}</span></p>
    ${fullStaff ? `<section class="staff-user-block staff-wallet-controls" data-staff-wallet-user="${escapeHtml(user.id)}">
      <h3>Clearwater credits</h3>
      <p class="staff-wallet-balance">Current balance <b>C$${Number(user.credits || 0).toLocaleString()}</b></p>
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
          ${fullStaff ? `${button('ip-ban', `Block ${Number(user.ipHashCount || 0)} network hash${Number(user.ipHashCount || 0) === 1 ? '' : 'es'}`, 'danger')}${button('clear-ip-ban', 'Lift network block')}` : ''}
        </div>
      </details>
      <p class="staff-user-status" data-staff-user-status role="status"></p>
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
      ${warnings.length ? warnings.map((warning) => `<article class="staff-compact"><b>${escapeHtml(warning.reason)}</b><small>${escapeHtml(timeAgo(warning.createdAt))}${warning.readAt ? ' · seen' : ' · unread'}</small></article>`).join('') : '<p class="staff-empty">No warnings.</p>'}
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
  const historyCards = history.filter((report) => {
    const haystack = `${report.authorName || ''} ${report.action || ''} ${report.content || ''} ${report.reviewerName || ''} ${report.reason || ''}`.toLowerCase();
    if (historyQuery && !haystack.includes(historyQuery)) return false;
    if (staffHistoryFilter === 'users') return /ban|warn|user|account|mute|verify|watch|shadow/i.test(`${report.action || ''} ${report.reason || ''}`);
    if (staffHistoryFilter === 'posts') return report.kind !== 'message' || /post|automod|delete|hold|reel/i.test(`${report.action || ''} ${report.reason || ''}`);
    return true;
  }).map((report) => ({
    kind: 'report',
    at: report.reviewedAt || report.createdAt || '',
    markup: `<article class="staff-history-item ${report.status === 'accepted' ? 'actioned' : 'dismissed'}"><b>${escapeHtml(staffHistoryLabel(report))}</b><span>@${escapeHtml((report.authorName || 'member').replace(/\s+/g, '').toLowerCase())}</span><small>${timeAgo(report.reviewedAt || report.createdAt)}</small></article>`,
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
    markup: `<article class="staff-history-item"><b>${escapeHtml(log.message)}</b><small>${timeAgo(log.createdAt)}</small></article>`,
  }));
  const historyItems = [...historyCards, ...logCards].sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0));
  if (historyList) {
    historyList.innerHTML = historyItems.length
      ? historyItems.map((item) => item.markup).join('')
      : '<p class="staff-empty">No staff actions yet.</p>';
  }
  const query = staffUserQuery.trim().toLowerCase();
  const staffMembers = (Array.isArray(moderationSnapshot.users) && moderationSnapshot.users.length
    ? moderationSnapshot.users
    : [...internetUsers.values()].map((member) => ({
      ...member,
      flagged: Boolean(member.banned),
      warningCount: 0,
      postCount: 0,
    }))).filter((member) => {
    if (query && !`${member.displayName || ''} ${member.username || ''} ${member.id || ''}`.toLowerCase().includes(query)) return false;
    if (staffUsersFilter === 'flagged') return member.flagged === true;
    if (staffUsersFilter === 'banned') return member.banned === true;
    if (staffUsersFilter === 'watched') return member.watched === true;
    return true;
  });
  document.querySelectorAll('[data-staff-users-filter]').forEach((button) => button.classList.toggle('selected', button.dataset.staffUsersFilter === staffUsersFilter));
  if (usersPane) {
    usersPane.innerHTML = staffMembers.length
      ? staffMembers.slice(0, 80).map((member) => `<button type="button" class="staff-user-row ${member.id === selectedStaffUserId ? 'selected' : ''}" data-staff-open-user="${escapeHtml(member.id)}"><img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" draggable="false" /><span><b>${escapeHtml(member.displayName || 'Discord user')}</b><small>@${escapeHtml(member.username || 'member')}</small><span class="staff-chip-row">${staffUserChips(member)}</span></span></button>`).join('')
      : '<p class="staff-empty">No members match that search.</p>';
  }
  const userPanel = document.querySelector('[data-staff-user-panel]');
  const keepUserPanel = Boolean(userPanel && userPanel.contains(document.activeElement));
  if (userPanel && !keepUserPanel) {
    if (!selectedStaffUserId) userPanel.innerHTML = '<div class="staff-empty staff-empty-lg">Select a user to open their staff panel.</div>';
    else if (staffUserDetail?.user?.id === selectedStaffUserId) userPanel.innerHTML = staffUserPanelMarkup(staffUserDetail);
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
          ${siteToggle('pause-reels', settings.pauseReels === true, 'Reels', 'Paused for members', 'Open to members')}
          ${siteToggle('pause-messages', settings.pauseMessages === true, 'Direct messages', 'Paused for members', 'Open to members')}
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
  const metrics = `<div class="staff-metrics"><article><b>${Number(stats.pending || reports.length)}</b><span>Pending</span></article><article><b>${Number(stats.automod || 0)}</b><span>Automod</span></article><article><b>${Number(stats.banned || bans.length)}</b><span>Bans</span></article><article><b>${Number(stats.watched || 0)}</b><span>Watched</span></article><article><b>${Number(stats.muted || 0)}</b><span>Muted</span></article><article><b>${Number(stats.users || internetUsers.size)}</b><span>Users</span></article></div>`;
  if (overview) {
    overview.innerHTML = `${metrics}<div class="staff-overview-grid"><section class="staff-column"><header><h2>Oldest pending reports</h2><span>${reports.length}</span></header>${reports.length ? reports.slice(0, 8).map((report) => {
      const author = staffMemberLookup(report.authorId, report);
      return `<button type="button" class="staff-report-card ${report.id === selectedReportId ? 'selected' : ''}" data-staff-select="${escapeHtml(report.id)}">${staffAvatarMarkup(author.avatarUrl)}<div><b>${escapeHtml(author.displayName)}</b><small>${escapeHtml(reportSourceLabel(report))} · ${escapeHtml(reportKindLabel(report))}</small><p>${escapeHtml(report.content || 'No text captured')}</p></div></button>`;
    }).join('') : '<div class="staff-empty">Nothing in this queue.</div>'}</section><section class="staff-column"><header><h2>Active bans</h2></header>${bans.length ? bans.map((ban) => `<button type="button" class="staff-compact" data-staff-open-user="${escapeHtml(ban.id)}"><b>${escapeHtml(ban.displayName)}</b><span>${escapeHtml(ban.reason)}</span><small>${ban.until ? `Ends ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(ban.until))}` : 'Permanent ban'}</small></button>`).join('') : '<div class="staff-empty">No active bans.</div>'}</section></div>`;
  }
}

async function loadModeration() {
  if (!sessionCanStaff || !staffContent) return;
  const overview = document.querySelector('[data-staff-overview]');
  if (overview && !moderationSnapshot) overview.innerHTML = '<p class="staff-loading">Loading the moderation desk...</p>';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'moderation' }) });
    const result = await readApiJson(response, 'Could not load the staff panel.');
    if (!response.ok) throw new Error(result.error || 'Could not load the staff panel.');
    moderationSnapshot = result;
    renderStaffDashboard();
    if (selectedStaffUserId && staffTab === 'users') void loadStaffUserDetail(selectedStaffUserId, true);
  } catch (error) {
    if (overview && !moderationSnapshot) overview.innerHTML = `<p class="staff-loading">${escapeHtml(error.message || 'Could not load the staff panel.')}</p>`;
  }
}

async function loadStaffUserDetail(userId, silent = false) {
  if (!sessionCanStaff || !userId) return;
  const panel = document.querySelector('[data-staff-user-panel]');
  if (!silent && panel && !panel.contains(document.activeElement)) panel.innerHTML = '<p class="staff-loading">Loading this account...</p>';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'staff-user-detail', targetId: userId }) });
    const result = await readApiJson(response, 'Could not load this user.');
    if (!response.ok) throw new Error(result.error || 'Could not load this user.');
    if (selectedStaffUserId !== userId) return;
    staffUserDetail = result;
    if (panel && !panel.contains(document.activeElement)) panel.innerHTML = staffUserPanelMarkup(result);
  } catch (error) {
    if (panel && selectedStaffUserId === userId) panel.innerHTML = `<p class="staff-loading">${escapeHtml(error.message || 'Could not load this user.')}</p>`;
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
  selectedStaffUserId = String(userId || '');
  staffTab = 'users';
  staffUserDetail = staffUserDetail?.user?.id === selectedStaffUserId ? staffUserDetail : null;
  renderStaffDashboard();
  await loadStaffUserDetail(selectedStaffUserId);
}

async function runStaffUserAction(staffAction, postId = '') {
  if (!selectedStaffUserId || staffUserBusy) return;
  const panelState = staffPanelUiState();
  const fields = panelState.fields;
  const destructive = new Set(['ban', 'ip-ban', 'wipe-posts', 'wipe-reels', 'wipe-comments', 'wipe-messages', 'delete-post', 'reset-profile', 'shadowban']);
  if (destructive.has(staffAction) && !(await siteConfirm(`Run "${staffAction.replace(/-/g, ' ')}" on this account? This cannot be undone.`, 'Staff action'))) return;
  staffUserBusy = true;
  const status = document.querySelector('[data-staff-user-status]');
  if (status) status.textContent = 'Saving...';
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'staff-user',
        staffAction,
        targetId: selectedStaffUserId,
        reason: fields.reason,
        note: staffAction === 'note' ? fields.note : fields.reason,
        durationDays: fields.durationDays,
        ipBan: fields.ipBan,
        postId,
      }),
    });
    const result = await readApiJson(response, 'Could not update this user.');
    if (!response.ok) throw new Error(result.error || 'Could not update this user.');
    staffUserDetail = result;
    if (result.snapshot) moderationSnapshot = result.snapshot;
    renderStaffDashboard();
    redrawStaffUserPanel(result, panelState);
    const nextStatus = document.querySelector('[data-staff-user-status]');
    if (nextStatus) nextStatus.textContent = 'Saved.';
  } catch (error) {
    const nextStatus = document.querySelector('[data-staff-user-status]');
    if (nextStatus) nextStatus.textContent = error.message || 'Could not update this user.';
    else void siteAlert(error.message || 'Could not update this user.');
  } finally {
    staffUserBusy = false;
  }
}

async function runStaffWalletAdjustment(button) {
  const panel = document.querySelector('[data-staff-user-panel]');
  const userId = panel?.querySelector('[data-staff-wallet-user]')?.dataset.staffWalletUser || selectedStaffUserId;
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
  });
}

function formatCredits(value) {
  return `C$${Math.max(0, Math.floor(Number(value) || 0)).toLocaleString()}`;
}

function walletClaimCopy(wallet) {
  if (wallet?.claimedNow) return `Collected ${formatCredits(wallet.dailyAmount || 75)} for this drop.`;
  const next = wallet?.nextClaimAt || wallet?.nextDailyAt;
  const nextAt = next ? new Date(next).getTime() : 0;
  if (!nextAt) return 'Your next daily credit will be added automatically.';
  const remaining = Math.max(0, nextAt - Date.now());
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000));
  return hours >= 1
    ? `Next drop in ${hours}h ${minutes}m.`
    : `Next drop in ${minutes}m.`;
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

function renderWallet(wallet) {
  if (!wallet) return;
  const balance = document.querySelector('[data-wallet-balance]');
  const status = document.querySelector('[data-wallet-claim-status]');
  const lede = document.querySelector('[data-wallet-lede]');
  const count = document.querySelector('[data-wallet-transaction-count]');
  const list = document.querySelector('[data-wallet-transactions]');
  if (balance) balance.textContent = formatCredits(wallet.balance);
  document.querySelectorAll('[data-internet-cash-amount]').forEach((element) => { element.textContent = formatCredits(wallet.balance); });
  if (lede) {
    lede.textContent = wallet.claimedNow
      ? `${formatCredits(wallet.dailyAmount || 75)} just landed. Come back tomorrow for another drop.`
      : 'Track your balance, daily drops, and recent credit activity.';
  }
  if (status) {
    status.dataset.tone = wallet.claimedNow ? 'ok' : 'wait';
    status.textContent = walletClaimCopy(wallet);
  }
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

async function loadWarnings() {
  if (!currentUserId || !warningNotice || !warningReasons) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'warnings' }) });
    const result = await readApiJson(response, 'Could not check warnings.');
    if (!response.ok || !result.warnings?.length) return;
    warningReasons.innerHTML = result.warnings.map((warning) => `<p>${escapeHtml(warning.reason)}</p>`).join('');
    warningNotice.hidden = false;
  } catch {
    // The normal site remains available if warning status cannot be read.
  }
}

async function loadMessages() {
  if (!messagesList || !currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'messages', ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not load messages.');
    if (!response.ok) throw new Error(result.error || 'Could not load messages.');
    const conversations = new Map();
    (result.messages || []).forEach((message) => {
      if (message.kind !== 'direct') return;
      const otherId = message.fromId === activeUserId() ? message.toId : message.fromId;
      if (!otherId) return;
      const previous = conversations.get(otherId);
      const unread = message.toId === activeUserId() && !message.readAt ? 1 : 0;
      if (!previous || new Date(message.createdAt).getTime() > new Date(previous.createdAt).getTime()) {
        conversations.set(otherId, { ...message, unread: (previous?.unread || 0) + unread });
      } else {
        previous.unread = (previous.unread || 0) + unread;
      }
    });
    const items = [...conversations.entries()].sort(([, left], [, right]) => new Date(right.createdAt) - new Date(left.createdAt));
    const unreadTotal = items.reduce((total, [, message]) => total + Number(message.unread || 0), 0);
    socialState.unreadMessages = unreadTotal;
    updateNotificationIndicators();
    messagesList.innerHTML = items.length
      ? items.map(([otherId, message]) => {
        const member = internetUsers.get(otherId) || {};
        const name = member.displayName || 'Clearwater member';
        const preview = message.content || (message.gifUrl ? 'GIF' : 'New message');
        const unread = Number(message.unread || 0) > 0;
        return `<button type="button" class="internet-message ${unread ? 'unread' : ''}" data-open-conversation="${escapeHtml(otherId)}"><img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(name)}</b><p>${escapeHtml(preview)}</p><small>${timeAgo(message.createdAt)}</small></span>${unread ? `<em>${message.unread > 9 ? '9+' : message.unread}</em>` : ''}</button>`;
      }).join('')
      : '<p class="message-empty">No messages yet.<span>Start a conversation with another Clearwater member.</span></p>';
  } catch (error) {
    messagesList.innerHTML = `<p class="message-empty">${escapeHtml(error.message || 'Could not load messages.')}</p>`;
  }
}

function updateNotificationIndicators() {
  const unread = Number(socialState.unreadNotifications || 0);
  if (notificationDot) notificationDot.hidden = unread < 1;
  if (messageDot) messageDot.hidden = Number(socialState.unreadMessages || 0) < 1;
}

async function loadNotifications() {
  if (!notificationList || !currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notifications', ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not load notifications.');
    if (!response.ok) throw new Error(result.error || 'Could not load notifications.');
    const notifications = result.notifications || [];
    const names = { follow: 'started following you', like: 'liked your post', reply: 'replied to your post', mention: 'mentioned you in a post', repost: 'reposted your post', quote: 'quoted your post', message: 'sent you a message' };
    notificationList.innerHTML = notifications.length ? notifications.map((notification) => `<button type="button" class="notification-item" ${notification.type === 'message' ? `data-notification-message="${escapeHtml(notification.actorId)}"` : notification.postId ? `data-notification-post="${escapeHtml(notification.postId)}"` : `data-notification-member="${escapeHtml(notification.actorId)}"`}><img src="${escapeHtml(notification.actorAvatarUrl || internetUsers.get(notification.actorId)?.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(notification.actorName || internetUsers.get(notification.actorId)?.displayName || 'Clearwater member')}</b> ${escapeHtml(names[notification.type] || 'interacted with you')}<small>${escapeHtml(notification.type === 'message' ? 'Open conversation' : notification.postContent || (notification.postId ? 'View post' : 'View profile'))} &middot; ${timeAgo(notification.createdAt)}</small></span></button>`).join('') : '<p class="feed-note">Nothing new yet.</p>';
    const unread = Number(result.unreadCount || 0);
    if (notificationCount) { notificationCount.hidden = unread < 1; notificationCount.textContent = `${unread} unread`; }
    socialState.unreadNotifications = 0;
    updateNotificationIndicators();
  } catch (error) { notificationList.innerHTML = `<p>${escapeHtml(error.message || 'Could not load notifications.')}</p>`; }
}

async function loadSocial() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social-status', ...activeAccountRequest() }) });
    const result = await readApiJson(response, 'Could not load your social settings.');
    if (response.ok && result.social) { socialState = { ...socialState, ...result.social }; updateNotificationIndicators(); renderPosts(); }
  } catch { /* Feed stays usable during a temporary connection issue. */ }
}

function applyPreferenceState(preferences = {}) {
  preferenceState = { ...preferenceState, ...preferences };
  const root = document.documentElement;
  root.classList.toggle('pref-compact', preferenceState.compactPosts === true);
  root.classList.toggle('pref-large-text', preferenceState.largeText === true);
  root.classList.toggle('pref-reduce-motion', preferenceState.reduceMotion === true);
  document.querySelectorAll('[data-preference]').forEach((input) => {
    input.checked = preferenceState[input.dataset.preference] === true;
  });
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
    applyPreferenceState(result.preferences || {});
    localStorage.setItem(storageKey, JSON.stringify(result.preferences || {}));
  } catch { /* Settings remain usable if the bot host is briefly unavailable. */ }
}

const ACCENT_SWATCHES = ['#1257a3', '#0f8b8d', '#2f8f5b', '#c9a227', '#d4622e', '#c23b5a', '#7a4fd0', '#5a6b7d'];
const BANNER_PRESETS = [
  'assets/clearwater-police-night.png',
  'assets/clearwater-sunset-beach.png',
  'assets/clearwater-campfire.png',
  'assets/clearwater-home.png',
  'assets/state-trooper-night.png',
  'assets/sheriff-station.png',
  'assets/fire-rescue-scene.png',
  'assets/liberty-county-map.png',
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
  document.querySelectorAll('[data-accent-swatch]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.accentSwatch === profileDraft.accentColor);
  });
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

function renderPinnedPostOptions() {
  const select = document.querySelector('[data-profile-pinned]');
  if (!select || !currentUserId) return;
  const posts = allPosts.filter((post) => post.authorId === currentUserId && !post.parentId).slice(0, 50);
  const chosen = profileDraft?.pinnedPostId || '';
  select.innerHTML = [
    '<option value="">No pinned post</option>',
    ...posts.map((post) => {
      const label = (post.content || (post.kind === 'reel' ? 'Reel' : 'Media post')).slice(0, 60);
      return `<option value="${escapeHtml(post.id)}"${post.id === chosen ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    }),
  ].join('');
  select.value = chosen;
}

function fillProfileEditor() {
  if (!profileDraft) return;
  const set = (selector, value) => { const field = document.querySelector(selector); if (field) field.value = value; };
  set('[data-profile-bio]', profileDraft.bio);
  set('[data-profile-pronouns]', profileDraft.pronouns);
  set('[data-profile-location]', profileDraft.location);
  set('[data-profile-website]', profileDraft.website);
  const accent = document.querySelector('[data-accent-input]');
  if (accent) accent.value = profileDraft.accentColor || '#1257a3';
  renderProfileEditorChoices();
  renderPinnedPostOptions();
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
  } catch (error) {
    profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    fillProfileEditor();
    setProfileStatus(error.message || 'Could not load your profile.', 'error');
  }
}

function showSettingsTab(tab) {
  const available = new Set(['profile', 'privacy', 'appearance', 'account']);
  const active = available.has(tab) ? tab : 'profile';
  document.querySelectorAll('[data-settings-tab]').forEach((button) => button.classList.toggle('selected', button.dataset.settingsTab === active));
  document.querySelectorAll('[data-settings-pane]').forEach((pane) => { pane.hidden = pane.dataset.settingsPane !== active; });
  if (active === 'account') fillAccountPane();
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

async function socialAction(type, { targetId = '', postId = '', enabled = true } = {}) {
  const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social', type, targetId, postId, enabled, ...activeAccountRequest() }) });
  const result = await readApiJson(response, 'Could not save this change.');
  if (!response.ok) throw new Error(result.error || 'Could not save this change.');
  socialState = { ...socialState, ...result.social };
  if (type === 'follow' && targetId) patchFollowGraphs(targetId, enabled === true);
  renderPosts();
  renderOwnProfileDetails();
}

function openMemberProfile(memberId, updateHash = true) {
  const user = internetUsers.get(memberId); if (!user) return;
  if (viewedMember?.id !== user.id) memberTab = 'posts';
  viewedMember = user;
  document.querySelectorAll('[data-member-tab]').forEach((tab) => tab.classList.toggle('selected', tab.dataset.memberTab === memberTab));
  const posts = profileTabPosts(user.id, memberTab);
  const banner = document.querySelector('[data-member-page-banner]');
  setProfileAccent(document.querySelector('[data-member-root]'), user.accentColor);
  setBannerImage(banner, profileBannerFor(user) || 'assets/clearwater-police-night.png', '', user.accentColor);
  renderProfileMeta(document.querySelector('[data-member-page-meta]'), user);
  document.querySelector('[data-member-page-avatar]').src = user.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-member-page-name]').textContent = user.displayName;
  document.querySelector('[data-member-page-handle]').textContent = `@${user.username}`;
  document.querySelector('[data-member-page-rank]').textContent = user.staffRank || 'Clearwater community member';
  document.querySelector('[data-member-page-copy]').textContent = user.bio || (user.staffRank ? `${user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.');
  document.querySelector('[data-member-page-verified]').hidden = user.verified !== true;
  const memberStaffBadge = document.querySelector('[data-member-page-staff-badge]');
  if (memberStaffBadge) memberStaffBadge.hidden = !Array.isArray(user.badges) || !user.badges.includes('staff');
  const memberBusiness = document.querySelector('[data-member-page-business-badge]');
  if (memberBusiness) memberBusiness.hidden = !Array.isArray(user.badges) || !user.badges.includes('business');
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
  const connections = document.querySelector('[data-member-page-connections]');
  const memberHidesStats = user.hideStats === true;
  if (followingButton) {
    followingButton.hidden = memberHidesStats;
    followingButton.innerHTML = `<b>${Number(user.followingCount ?? memberFollowing.length).toLocaleString()}</b> Following`;
  }
  if (followersButton) {
    followersButton.hidden = memberHidesStats;
    followersButton.innerHTML = `<b>${Number(user.followerCount ?? memberFollowers.length).toLocaleString()}</b> Followers`;
  }
  if (connections && memberHidesStats) {
    connections.hidden = true;
    connections.innerHTML = '';
  } else if (connections) {
    const memberIds = [...new Set([...memberFollowing, ...memberFollowers])].filter((id) => internetUsers.has(id));
    connections.hidden = memberIds.length === 0;
    connections.innerHTML = memberIds.slice(0, 24).map((id) => {
      const member = internetUsers.get(id);
      const label = memberFollowers.includes(id) ? 'Follows them' : 'They follow';
      return `<button type="button" data-open-member="${escapeHtml(id)}"><img src="${escapeHtml(member.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(member.displayName || 'Clearwater member')}</b><small>${label}</small></span></button>`;
    }).join('');
  }
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
  }[memberTab] || 'Nothing here yet.';
  document.querySelector('[data-member-page-posts]').innerHTML = profileListMarkup(posts, memberTab, user.pinnedPostId, memberEmpty);
  const following = socialState.following.includes(user.id);
  const followsYou = socialState.followers.includes(user.id);
  document.querySelector('[data-member-page-follow]').textContent = following && followsYou ? 'Friends' : following ? 'Following' : followsYou ? 'Follow back' : 'Follow';
  document.querySelector('[data-member-page-menu-list]').hidden = true;
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
  document.querySelector('[data-conversation-card-rank]').textContent = member.staffRank || 'Clearwater community member';
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
    const response = await fetch(`/api/internet?feed=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' },
    });
    const result = await readApiJson(response, 'Clearwater Internet could not reach the website service.');
    if (!response.ok) throw new Error(result.error || 'Service unavailable');
    allPosts = uniquePostsById(result.posts || []);
    internetUsers = new Map((result.users || []).map((user) => [user.id, user]));
    applySiteBanner(result.settings?.siteBanner || null);
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
    renderPosts();
    renderOwnProfileDetails();
    renderPinnedPostOptions();
    const route = readInternetRoute();
    if (route.view === 'post' && route.id) showPostDetail(route.id, false);
    if (route.view === 'member' && route.id) openMemberProfile(route.id, false);
  } catch {
    note.hidden = false;
    note.textContent = 'Clearwater Internet is offline right now. Restart the Clearwater Discord bot host to restore posting.';
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
  if (!session.authenticated || !session.user) return false;
  if (login) login.hidden = true;
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
    : (session.user.owner === true && session.user.staffRank === 'Ownership' ? 'full' : null);
  sessionCanStaff = Boolean(sessionStaffPanel);
  sessionIsOwner = sessionStaffPanel === 'full';
  if (profileTitle) profileTitle.textContent = session.user.displayName || session.user.username;
  if (profileCopy) profileCopy.textContent = session.user.bio || (session.user.staffRank ? `${session.user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.');
  if (profileAvatar && session.user.avatarUrl) profileAvatar.src = session.user.avatarUrl;
  setBannerImage(profileBanner, session.user.bannerUrl, session.user.bannerColor);
  if (profileDiscord) profileDiscord.href = 'https://discord.gg/839teFCwB';
  if (profileHandle) profileHandle.textContent = `@${session.user.username}`;
  if (profileRank) profileRank.textContent = session.user.staffRank || 'Clearwater community member';
  refreshProfileVerified();
  if (staffLink) staffLink.hidden = !sessionCanStaff;
  if (admin) admin.hidden = !sessionIsOwner;
  if (officialAccountOption) officialAccountOption.hidden = !sessionIsOwner;
  if (officialProfileControls) officialProfileControls.hidden = !sessionIsOwner;
  accountSwitch.hidden = false;
  activeAccount = sessionIsOwner && localStorage.getItem(`clearwater-posting-account-${currentUserId}`) === 'official' ? 'official' : 'personal';
  document.querySelector('[data-personal-account-avatar]').src = session.user.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-personal-account-name]').textContent = session.user.displayName || session.user.username;
  updateAccountSwitcher();
  renderProfilePosts();
  renderPosts();
  try {
    await loadBanStatus();
    await loadWarnings();
    await loadMessages();
    await loadSocial();
    await loadPreferences();
    void loadWallet();
    renderOwnProfileDetails();
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
  if (postMessage) postMessage.textContent = scanClientContent(content.value) ? AUTOMOD_HOLD_MESSAGE : '';
});
document.querySelector('[data-drop-location]')?.addEventListener('click', async () => {
  if (!currentUserId) { window.location.href = SIGNIN_INTERNET; return; }
  await refreshDropLocation();
});
search?.addEventListener('input', () => { showView('home'); renderPosts(); });
document.querySelectorAll('[data-feed-tab]').forEach((button) => button.addEventListener('click', () => {
  feedTab = button.dataset.feedTab || 'foryou';
  localStorage.setItem('clearwater-feed-tab', feedTab);
  showView('home');
  renderPosts();
}));
document.querySelector('[data-reels-link]')?.addEventListener('click', (event) => {
  event.preventDefault();
  if (search) search.value = '';
  feedTab = 'reels';
  localStorage.setItem('clearwater-feed-tab', feedTab);
  history.pushState({}, '', internetUrl('home'));
  showView('home');
  renderPosts();
});
document.querySelectorAll('[data-staff-tab]').forEach((button) => button.addEventListener('click', () => {
  staffTab = button.dataset.staffTab || 'overview';
  renderStaffDashboard();
}));
document.querySelector('[data-staff-user-search]')?.addEventListener('input', (event) => {
  staffUserQuery = event.target.value || '';
  staffTab = 'users';
  renderStaffDashboard();
});
document.querySelector('[data-history-search]')?.addEventListener('input', (event) => {
  staffHistoryQuery = event.target.value || '';
  renderStaffDashboard();
});
document.querySelectorAll('[data-preference]').forEach((input) => input.addEventListener('change', async () => {
  if (!currentUserId) return;
  const key = input.dataset.preference;
  const original = preferenceState[key] === true;
  const nextValue = input.checked === true;
  const previous = { ...preferenceState };
  applyPreferenceState({ [key]: nextValue });
  localStorage.setItem(`clearwater-preferences-${currentUserId}`, JSON.stringify(preferenceState));
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preference-save', key, enabled: nextValue }) });
    const result = await readApiJson(response, 'Could not save this setting.');
    if (!response.ok) throw new Error(result.error || 'Could not save this setting.');
    applyPreferenceState(result.preferences || {});
    localStorage.setItem(`clearwater-preferences-${currentUserId}`, JSON.stringify(preferenceState));
    renderOwnProfileDetails();
    if (['followersOnly', 'hideProfile', 'hideFollowing'].includes(key)) await loadPosts();
    else if (key === 'autoplayReels' && feedTab === 'reels') bindReelAutoplay();
    else if (['compactPosts', 'largeText', 'reduceMotion', 'hideStats'].includes(key)) renderPosts();
  } catch (error) {
    applyPreferenceState(previous);
    localStorage.setItem(`clearwater-preferences-${currentUserId}`, JSON.stringify(previous));
    input.checked = original;
    void siteAlert(error.message || 'Could not save this setting.');
  }
}));
document.querySelectorAll('[data-view-link]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const view = link.dataset.viewLink || 'home';
  if (view === 'profile' && activeAccount === 'official') { openMemberProfile(officialAccountId); return; }
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
}));
document.querySelector('[data-compose-link]')?.addEventListener('click', () => {
  if (!currentUserId) { window.location.href = SIGNIN_INTERNET; return; }
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
  const connections = document.querySelector('[data-profile-connections]');
  if (connections) connections.hidden = !connections.hidden;
});
document.querySelector('[data-profile-followers]')?.addEventListener('click', () => {
  const connections = document.querySelector('[data-profile-connections]');
  if (connections) connections.hidden = !connections.hidden;
});
document.querySelectorAll('[data-settings-tab]').forEach((button) => button.addEventListener('click', () => {
  showSettingsTab(button.dataset.settingsTab || 'profile');
}));
document.querySelector('[data-settings-logout]')?.addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* Sign-out still clears the page. */ }
  window.location.href = '/internet';
});

const profileDraftField = (key, selector, transform = (value) => value) => {
  document.querySelector(selector)?.addEventListener('input', (event) => {
    if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    profileDraft[key] = transform(event.target.value || '');
    renderProfilePreview();
  });
};
profileDraftField('bio', '[data-profile-bio]');
profileDraftField('pronouns', '[data-profile-pronouns]');
profileDraftField('location', '[data-profile-location]');
profileDraftField('website', '[data-profile-website]');
document.querySelector('[data-profile-pinned]')?.addEventListener('change', (event) => {
  if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
  profileDraft.pinnedPostId = event.target.value || '';
});
document.querySelector('[data-accent-input]')?.addEventListener('input', (event) => {
  if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
  profileDraft.accentColor = String(event.target.value || '').toLowerCase();
  renderProfilePreview();
});
document.querySelector('[data-accent-clear]')?.addEventListener('click', () => {
  if (!profileDraft) return;
  profileDraft.accentColor = '';
  const accent = document.querySelector('[data-accent-input]');
  if (accent) accent.value = '#1257a3';
  renderProfilePreview();
});
document.querySelector('[data-banner-clear]')?.addEventListener('click', () => {
  if (!profileDraft) return;
  profileDraft.bannerUrl = '';
  renderProfilePreview();
});
document.querySelector('[data-banner-upload]')?.addEventListener('click', () => {
  document.querySelector('[data-banner-file]')?.click();
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
  profileDraft.accentColor = swatch.dataset.accentSwatch || '';
  const accent = document.querySelector('[data-accent-input]');
  if (accent && profileDraft.accentColor) accent.value = profileDraft.accentColor;
  renderProfilePreview();
});
document.querySelector('[data-banner-file]')?.addEventListener('change', async (event) => {
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file || profileBannerBusy) return;
  if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type || '')) {
    setProfileStatus('Choose a PNG, JPEG, WebP, or GIF image.', 'error');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    setProfileStatus('Keep banner images under 12 MB.', 'error');
    return;
  }
  profileBannerBusy = true;
  setProfileStatus('Uploading banner...');
  try {
    const upload = globalThis.VercelBlob?.upload;
    if (typeof upload !== 'function') throw new Error('Banner uploads are unavailable. Refresh and try again.');
    const safeName = String(file.name || 'banner.jpg').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'banner.jpg';
    const blob = await upload(`profile/${safeName}`, file, {
      access: 'public',
      handleUploadUrl: '/api/internet',
      contentType: file.type,
      onUploadProgress: (progress) => setProfileStatus(`Uploading banner... ${Math.round(progress.percentage || 0)}%`),
    });
    if (!profileDraft) profileDraft = { ...DEFAULT_PROFILE_DRAFT };
    profileDraft.bannerUrl = blob.url;
    renderProfilePreview();
    setProfileStatus('Banner ready. Save your profile to publish it.', 'ok');
  } catch (error) {
    setProfileStatus(error.message || 'Could not upload that banner.', 'error');
  } finally {
    profileBannerBusy = false;
  }
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
          pronouns: profileDraft.pronouns || '',
          location: profileDraft.location || '',
          website: profileDraft.website || '',
          bannerUrl: profileDraft.bannerUrl || '',
          accentColor: profileDraft.accentColor || '',
          pinnedPostId: profileDraft.pinnedPostId || '',
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
      me.pronouns = profileDraft.pronouns || '';
      me.location = profileDraft.location || '';
      me.website = profileDraft.website || '';
      me.accentColor = profileDraft.accentColor || '';
      me.pinnedPostId = profileDraft.pinnedPostId || '';
      internetUsers.set(currentUserId, me);
      renderOwnProfileDetails();
    }
    setProfileStatus('Profile saved.', 'ok');
    await loadPosts();
    renderOwnProfileDetails();
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
document.addEventListener('click', (event) => {
  const notificationPost = event.target.closest('[data-notification-post]');
  if (notificationPost) { showPostDetail(notificationPost.dataset.notificationPost); return; }
  const notificationMessage = event.target.closest('[data-notification-message]');
  if (notificationMessage) {
    const member = internetUsers.get(notificationMessage.dataset.notificationMessage);
    if (member) openConversation(member);
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
  if (conversation) { const member = internetUsers.get(conversation.dataset.openConversation); if (member) openConversation(member); return; }
  const staffOpenUser = event.target.closest('[data-staff-open-user]');
  if (staffOpenUser) { void openStaffUser(staffOpenUser.dataset.staffOpenUser); return; }
  const staffUserAction = event.target.closest('[data-staff-user-action]');
  if (staffUserAction) { void runStaffUserAction(staffUserAction.dataset.staffUserAction, staffUserAction.dataset.staffPostId || ''); return; }
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
  const copyStaffId = event.target.closest('[data-staff-copy-id]');
  if (copyStaffId) {
    void navigator.clipboard?.writeText(copyStaffId.dataset.staffCopyId || '').then(() => {
      copyStaffId.textContent = 'Copied ID';
      window.setTimeout(() => { copyStaffId.textContent = copyStaffId.dataset.staffCopyId; }, 1200);
    }).catch(() => {});
    return;
  }
  const authorButton = event.target.closest('[data-open-member]');
  if (authorButton) { openMemberProfile(authorButton.dataset.openMember); return; }
  const messageUser = event.target.closest('[data-message-user]');
  if (messageUser) { messageModal.hidden = true; openConversation(internetUsers.get(messageUser.dataset.messageUser)); return; }
  const bookmark = event.target.closest('[data-bookmark-post]');
  if (bookmark) { void socialAction('bookmark', { postId: bookmark.dataset.bookmarkPost, enabled: !socialState.bookmarks.includes(bookmark.dataset.bookmarkPost) }).catch((error) => void siteAlert(error.message)); return; }
  const topic = event.target.closest('[data-topic]');
  if (topic) { event.preventDefault(); showView('home'); search.value = topic.dataset.topic; renderPosts(); return; }
  const staffViewVideo = event.target.closest('[data-staff-view-video]');
  if (staffViewVideo) {
    const postId = staffViewVideo.dataset.staffViewVideo;
    const kind = staffViewVideo.dataset.staffViewKind || 'reel';
    if (kind === 'reel') {
      if (search) search.value = '';
      feedTab = 'reels';
      localStorage.setItem('clearwater-feed-tab', feedTab);
      history.pushState({}, '', internetUrl('home'));
      showView('home');
      renderPosts();
      const viewport = document.querySelector('[data-reels-viewport]');
      const card = viewport?.querySelector(`[data-reel-id="${postId}"]`);
      if (card) {
        card.scrollIntoView({ block: 'start' });
        renderReelPanel(postId);
      }
    } else if (typeof showPostDetail === 'function') {
      showPostDetail(postId, true);
    }
    return;
  }
  const openReel = event.target.closest('[data-open-reel]');
  if (openReel) {
    if (search) search.value = '';
    feedTab = 'reels';
    localStorage.setItem('clearwater-feed-tab', feedTab);
    history.pushState({}, '', internetUrl('home'));
    showView('home');
    renderPosts();
    const viewport = document.querySelector('[data-reels-viewport]');
    const card = viewport?.querySelector(`[data-reel-id="${openReel.dataset.openReel}"]`);
    if (card) {
      card.scrollIntoView({ block: 'start' });
      renderReelPanel(openReel.dataset.openReel);
    }
    return;
  }
  if (event.target.closest('[data-open-reel-composer]')) {
    if (!currentUserId) { window.location.href = SIGNIN_INTERNET; return; }
    const modal = document.querySelector('[data-reel-composer]');
    if (modal) modal.hidden = false;
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
    if (!currentUserId) { window.location.href = SIGNIN_INTERNET; return; }
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
  const mention = event.target.closest('[data-mention-user]');
  if (mention) { insertAtCursor(`@${mention.dataset.mentionUser} `); mentionModal.hidden = true; return; }
  if (event.target.closest('[data-refresh-staff]')) { void loadModeration(); return; }
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
  const reviewButton = event.target.closest('[data-report-review]');
  if (reviewButton) { void reviewReport(reviewButton); return; }
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
  if (!currentUserId) { window.location.href = SIGNIN_INTERNET; return; }
  const requested = allPosts.find((item) => item.id === postId);
  if (!requested) return;
  const post = sourcePost(requested);
  if (type === 'share') { pendingPostAction = { postId: post.id, type }; shareModal.hidden = false; return; }
  if (type === 'like') {
    if (inFlightLikes.has(post.id)) return;
    inFlightLikes.add(post.id);
    applyLocalLike(post);
    refreshVisiblePosts();
    try {
      await postInteraction({ postId: post.id, type: 'like' }, { reload: false });
    } catch (error) {
      applyLocalLike(post);
      refreshVisiblePosts();
      void siteAlert(error.message || 'Could not like this post.');
    } finally {
      inFlightLikes.delete(post.id);
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
    await loadPosts();
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
mentionButton?.addEventListener('click', () => { mentionModal.hidden = false; renderMentionResults(); mentionQuery?.focus(); });
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
  setConversationHold(hit ? AUTOMOD_HOLD_MESSAGE : '');
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

function resetReelComposer() {
  if (reelMedia?.previewUrl) URL.revokeObjectURL(reelMedia.previewUrl);
  reelMedia = null;
  const preview = document.querySelector('[data-reel-preview]');
  const label = document.querySelector('[data-reel-file-label]');
  const caption = document.querySelector('[data-reel-caption]');
  const submit = document.querySelector('[data-reel-submit]');
  const error = document.querySelector('[data-reel-error]');
  if (preview) { preview.hidden = true; preview.innerHTML = ''; }
  if (label) label.textContent = 'Tap to add a photo or video up to 2 GB';
  if (caption) caption.value = '';
  if (submit) submit.disabled = true;
  if (error) error.textContent = '';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadReelMedia(file, isVideo, onProgress) {
  const upload = globalThis.VercelBlob?.upload;
  let blobError = '';
  if (typeof upload === 'function') {
    try {
      const safeName = String(file.name || (isVideo ? 'reel.mp4' : 'reel.jpg')).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || (isVideo ? 'reel.mp4' : 'reel.jpg');
      const blob = await upload(`reels/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/internet',
        multipart: file.size > 80_000_000,
        contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        onUploadProgress: (progress) => onProgress?.(progress),
      });
      if (blob?.url) return isVideo ? { video: { url: blob.url } } : { image: { url: blob.url } };
    } catch (error) {
      blobError = String(error?.message || error || '');
      if (file.size > SMALL_REEL_BYTES) {
        throw new Error(/token|blob store|No token|Failed to retrieve/i.test(blobError)
          ? 'Large Reels need Vercel Blob storage configured. Photos/videos under 3 MB still upload without it.'
          : (blobError || 'Could not upload this Reel.'));
      }
    }
  } else if (file.size > SMALL_REEL_BYTES) {
    throw new Error('Reel uploads are unavailable for large files. Refresh, or use a photo/video under 3 MB.');
  }

  onProgress?.({ percentage: 100 });
  const dataUrl = await readFileAsDataUrl(file);
  if (isVideo && !safeVideoUrl(dataUrl)) throw new Error('Choose a supported MP4 or WebM video.');
  if (!isVideo && !safeImageUrl(dataUrl)) throw new Error('Choose a supported image.');
  return isVideo ? { video: { dataUrl } } : { image: { dataUrl } };
}

document.querySelector('[data-reel-file]')?.addEventListener('change', () => {
  const file = document.querySelector('[data-reel-file]')?.files?.[0];
  const error = document.querySelector('[data-reel-error]');
  const preview = document.querySelector('[data-reel-preview]');
  const submit = document.querySelector('[data-reel-submit]');
  const label = document.querySelector('[data-reel-file-label]');
  document.querySelector('[data-reel-file]').value = '';
  if (!file) return;
  const type = file.type || (/\.(?:png|jpe?g|webp|gif)$/i.test(file.name) ? 'image/jpeg' : (/\.(?:mp4|webm|mov)$/i.test(file.name) ? 'video/mp4' : ''));
  const isImage = /^image\/(?:png|jpeg|webp|gif)$/.test(type);
  const isVideo = /^video\/(?:mp4|webm|quicktime)$/.test(type);
  if (!isImage && !isVideo) {
    if (error) error.textContent = 'Choose a photo or an MP4/WebM video.';
    return;
  }
  if (file.size > MAX_REEL_BYTES) {
    if (error) error.textContent = 'Keep Reels under 2 GB.';
    return;
  }
  if (reelMedia?.previewUrl) URL.revokeObjectURL(reelMedia.previewUrl);
  const previewUrl = URL.createObjectURL(file);
  reelMedia = { file, type, isVideo, previewUrl };
  if (preview) {
    preview.hidden = false;
    preview.innerHTML = isVideo ? `<video src="${escapeHtml(previewUrl)}" muted loop playsinline controls></video>` : `<img src="${escapeHtml(previewUrl)}" alt="" />`;
  }
  if (label) label.textContent = 'Replace photo or video';
  if (submit) submit.disabled = false;
  if (error) error.textContent = '';
});
document.querySelector('[data-reel-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.querySelector('[data-reel-error]');
  const submit = document.querySelector('[data-reel-submit]');
  const caption = String(document.querySelector('[data-reel-caption]')?.value || '').trim();
  if (!reelMedia?.file) { if (error) error.textContent = 'Add a photo or short video first.'; return; }
  if (submit) submit.disabled = true;
  if (error) error.textContent = 'Uploading Reel...';
  try {
    const media = await uploadReelMedia(reelMedia.file, reelMedia.isVideo, (progress) => {
      if (error) error.textContent = `Uploading Reel... ${Math.round(progress.percentage || 0)}%`;
    });
    if (error) error.textContent = 'Posting Reel...';
    const response = await fetch('/api/internet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'post',
        content: caption,
        reel: true,
        image: media.image || null,
        video: media.video || null,
        ...activeAccountRequest(),
      }),
    });
    const result = await readApiJson(response, 'Could not post this Reel.');
    if (!response.ok) throw new Error(result.error || 'Could not post this Reel.');
    resetReelComposer();
    document.querySelector('[data-reel-composer]')?.setAttribute('hidden', '');
    feedTab = 'reels';
    localStorage.setItem('clearwater-feed-tab', 'reels');
    showView('home');
    await loadPosts();
  } catch (exception) {
    if (error) error.textContent = exception.message || 'Could not post this Reel.';
  } finally {
    if (submit) submit.disabled = !reelMedia;
  }
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
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post', content: content.value, gif: selectedGif, image: selectedImage, poll, location: selectedLocation, quoteId: selectedQuoteId, asOfficial: activeAccount === 'official' }) });
    const result = await readApiJson(response, 'Posting is unavailable because the website service is not connected.');
    if (!response.ok) throw new Error(automodHoldError(result, result.error || 'Could not post.'));
    content.value = ''; count.textContent = '0 / 500'; postButton.disabled = true; updateComposerHighlight(); selectedGif = null; selectedImage = null; stopDropLocationRefresh(); selectedLocation = null; selectedQuoteId = null; gifPreview.hidden = true; gifPreview.innerHTML = ''; renderDropPreview(); renderQuotePreview(); if (pollBuilder) { pollBuilder.hidden = true; composer?.classList.remove('composer-expanded'); pollBuilder.querySelectorAll('input').forEach((input) => { input.value = ''; }); } postMessage.textContent = 'Posted.'; await loadPosts();
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

showViewFromAddress();

async function bootInternet() {
  try {
    const signedIn = await loadSession().catch(() => Boolean(currentUserId));
    if (!signedIn) {
      window.location.replace(SIGNIN_INTERNET);
      return;
    }
    await loadPosts();
  } finally {
    if (currentUserId) {
      document.body.classList.remove('internet-booting');
      document.body.classList.add('internet-ready');
      document.querySelector('[data-internet-boot]')?.setAttribute('hidden', '');
    }
  }
}

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
  loadPosts();
  loadSocial();
  if (!document.querySelector('[data-view="messages"]')?.hidden) void loadMessages();
  if (!document.querySelector('[data-view="conversation"]')?.hidden && viewedMember) void loadConversation(viewedMember);
  if (!document.querySelector('[data-view="staff"]')?.hidden && sessionCanStaff) void loadModeration();
}, 15_000);
// A ban needs to take effect quickly for somebody who already has the page
// open, without reloading the entire feed every few seconds.
window.setInterval(() => {
  if (!document.hidden) void loadBanStatus();
}, 5_000);
window.setInterval(updateBanCountdown, 60 * 1000);
