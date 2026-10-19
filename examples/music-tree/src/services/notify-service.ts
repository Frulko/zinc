// ============================================================================
// services/notify-service.ts — Relais de notifications macOS (zinc:link)
// ============================================================================
// Gère la réception des notifications depuis l'application Zinc Relay sur Mac,
// le stockage local des 50 dernières notifications (`notifications.json`),
// le cache disque des icônes d'applications et d'avatars (`notif-icons/`),
// ainsi que les files d'animation (superposition StandBy et bannières grises).

import { drawImage, imageFromBytes, rrect, fontAscent } from 'zinc:gfx';
import { exists, readText, writeText, readBytes, writeBytes, mkdir } from 'zinc:fs';
import { env } from 'zinc:sys';
import { base64Decode } from 'zinc:web';
import * as link from 'zinc:link';
import gsap, { Timeline } from 'gsap';
import {
  COLOR_FILL,
  COLOR_TEXT_PRIMARY,
  MONTHS_SHORT,
} from '../constants';
import {
  FONT_STANDBY_SENDER,
  FONT_STANDBY_NAME,
  Fonts,
} from '../fonts';
import { uiState, ScrollBox } from '../core/input';
import { drawCenteredText, drawGlyph } from '../components/primitives';
import { countEmojiPlaceholders, stripEmojiPlaceholders } from '../components/emoji-text';

/**
 * Représente une notification reçue depuis le Mac.
 */
export class MacNotification {
  id: string = '';
  appId: string = '';
  appName: string = '';
  iconHash: string = '';
  title: string = '';
  subtitle: string = '';
  body: string = '';
  timestampSeconds: number = 0;
  domain: string = '';
  thread: string = '';
  /** 'message' (message direct avec expéditeur et avatar) ou 'other'. */
  kind: string = 'other';
  senderName: string = '';
  avatarHash: string = '';
  /** The emoji of the title, subtitle, body and sender, in that order, as base64 PNGs; each stands for one U+FFFC of the texts. */
  emoji: string[] = [];
  /** The hash of a photo the message carries (a JPEG fitted in 640 px, fetched like an icon), '' when none. */
  attachmentHash: string = '';
}

/**
 * État d'animation d'une notification affichée en grand format StandBy.
 */
export class StandByOverlayAnimation {
  notification: MacNotification = new MacNotification();
  phase1Grow: number = 0;
  phase2SlideLeft: number = 0;
  line1Progress: number = 0;
  line2Progress: number = 0;
  line3Progress: number = 0;
  fadeOutProgress: number = 0;
  timeline: Timeline | null = null;
}

/**
 * État d'animation d'une bannière grise empilée en haut de l'écran.
 */
export class NotificationBannerItem {
  notification: MacNotification = new MacNotification();
  remainingSeconds: number = 0;
  slideOffsetFactor: number = -1;
  isDismissed: boolean = false;
}

const MAX_STORED_NOTIFICATIONS: i32 = 50;
const NOTIFICATIONS_FILE_PATH = 'notifications.json';
const ICONS_DIRECTORY_PATH = 'notif-icons';
const BANNER_DISPLAY_SECONDS = 6;

export let relayListeningPort: i32 = link.DEFAULT_PORT;
export let storedNotifications: MacNotification[] = loadStoredNotifications();
export let pairedMacHostname: string = '';
export let openChannelsCount: i32 = 0;

const activeLinkChannels: link.Channel[] = [];
const requestedIconHashes = new Map<string, boolean>();
const cachedIconImagesByHash = new Map<string, i32>();

// État de l'assistant d'appairage
export let isMacPaired: boolean = false;
export let pairingWizardStep: i32 = 1; // 1 = installer, 2 = code à 6 chiffres, 3 = terminé
export let pairingPinCode: string = '';
export let isPairingCodeExpired: boolean = false;
export let failedPairingAttempts: i32 = 0;
export let showManualIpInstructions: boolean = false;
export let isAddingAnotherMac: boolean = false;
export const notificationsScrollBox = new ScrollBox();

// État du glisser-supprimer sur une ligne de notification
export let draggedNotificationRowId: string = '';
export let draggedNotificationDeltaX: number = 0;
export let draggedNotificationAxis: string = '';
export let dragStartX: number = 0;
export let dragStartY: number = 0;
export let dragStartScrollY: number = 0;

export function setNotificationDragState(
  rowId: string,
  deltaX: number,
  axis: string,
  startX: number,
  startY: number,
  startScrollY: number
): void {
  draggedNotificationRowId = rowId;
  draggedNotificationDeltaX = deltaX;
  draggedNotificationAxis = axis;
  dragStartX = startX;
  dragStartY = startY;
  dragStartScrollY = startScrollY;
}

export function setPairingUiState(
  adding: boolean,
  step: i32,
  manualIp: boolean,
  pinCode: string
): void {
  isAddingAnotherMac = adding;
  pairingWizardStep = step;
  showManualIpInstructions = manualIp;
  pairingPinCode = pinCode;
}

export function requestNewPairingCode(): void {
  isPairingCodeExpired = false;
  failedPairingAttempts = 0;
  try {
    pairingPinCode = link.openPairing();
  } catch (error) {
    pairingPinCode = '';
    console.error(`music: ${error.message}`);
  }
}

export function cancelPairingWizard(): void {
  isAddingAnotherMac = false;
  link.closePairing();
  pairingPinCode = '';
  pairingWizardStep = 1;
}

// ----------------------------------------------------------------------------
// Sérialisation JSON des notifications
// ----------------------------------------------------------------------------

function asSafeString(value: any): string {
  return value === undefined || value === null ? '' : '' + value;
}

function loadStoredNotifications(): MacNotification[] {
  const loaded: MacNotification[] = [];
  if (!exists(NOTIFICATIONS_FILE_PATH)) return loaded;
  try {
    const rawArray = JSON.parse(readText(NOTIFICATIONS_FILE_PATH));
    const count = rawArray.length as i32;
    for (let index = 0; index < count && loaded.length < MAX_STORED_NOTIFICATIONS; index++) {
      loaded.push(parseNotificationFromJson(rawArray[index]));
    }
  } catch (error) {
    console.error('music: notifications.json unreadable');
  }
  return loaded;
}

function parseNotificationFromJson(raw: any): MacNotification {
  const notification = new MacNotification();
  notification.id = asSafeString(raw.id);
  notification.title = asSafeString(raw.title);
  notification.subtitle = asSafeString(raw.subtitle);
  notification.body = asSafeString(raw.body);
  notification.domain = asSafeString(raw.domain);
  notification.thread = asSafeString(raw.thread);
  notification.kind = asSafeString(raw.kind) === 'message' ? 'message' : 'other';
  notification.senderName = asSafeString(raw.sender);
  notification.avatarHash = asSafeString(raw.avatar);
  notification.attachmentHash = asSafeString(raw.attachment);
  notification.emoji = Array.isArray(raw.emoji) ? (raw.emoji as string[]) : [];
  notification.timestampSeconds =
    raw.date !== undefined && raw.date !== null ? (raw.date as number) : Date.now() / 1000;
  if (raw.app !== undefined && raw.app !== null) {
    notification.appId = asSafeString(raw.app.id);
    notification.appName = asSafeString(raw.app.name);
    notification.iconHash = asSafeString(raw.app.icon);
  }
  return notification;
}

function saveStoredNotifications(): void {
  const serializedItems: any[] = [];
  for (let index = 0; index < storedNotifications.length; index++) {
    const item = storedNotifications[index];
    serializedItems.push({
      id: item.id,
      app: { id: item.appId, name: item.appName, icon: item.iconHash },
      title: item.title,
      subtitle: item.subtitle,
      body: item.body,
      date: item.timestampSeconds,
      domain: item.domain,
      thread: item.thread,
      kind: item.kind,
      sender: item.senderName,
      avatar: item.avatarHash,
      attachment: item.attachmentHash,
      emoji: item.emoji,
    });
  }
  try {
    writeText(NOTIFICATIONS_FILE_PATH, JSON.stringify(serializedItems) + '\n');
  } catch (error) {
    console.error(`music: ${NOTIFICATIONS_FILE_PATH}: ${error.message}`);
  }
}

export function removeNotificationById(notificationId: string): void {
  emojiImagesByNotificationId.delete(notificationId);
  storedNotifications = storedNotifications.filter(
    (item: MacNotification) => item.id !== notificationId
  );
  saveStoredNotifications();
  uiState.dirty = true;
}

export function clearAllNotifications(): void {
  emojiImagesByNotificationId.clear();
  storedNotifications = [];
  saveStoredNotifications();
  uiState.dirty = true;
}

// ----------------------------------------------------------------------------
// Cache disque des icônes d'application et d'avatars (nommées par hachage hex)
// ----------------------------------------------------------------------------

function isValidHexHash(hash: string): boolean {
  if (hash.length < 8 || hash.length > 128) return false;
  for (let index = 0; index < hash.length; index++) {
    const char = hash.charAt(index);
    const isHexDigit =
      (char >= '0' && char <= '9') ||
      (char >= 'a' && char <= 'f') ||
      (char >= 'A' && char <= 'F');
    if (!isHexDigit) return false;
  }
  return true;
}

export function getCachedNotificationIcon(hash: string): i32 {
  if (!isValidHexHash(hash)) return -1;
  if (cachedIconImagesByHash.has(hash)) {
    return cachedIconImagesByHash.get(hash) as i32;
  }
  const iconFilePath = `${ICONS_DIRECTORY_PATH}/${hash}.png`;
  const loadedImage = exists(iconFilePath) ? imageFromBytes(readBytes(iconFilePath)) : -1;
  cachedIconImagesByHash.set(hash, loadedImage);
  return loadedImage;
}

function hasCachedNotificationIcon(hash: string): boolean {
  return getCachedNotificationIcon(hash) >= 0;
}

function storeNotificationIconOnDisk(hash: string, base64Png: string): void {
  if (!isValidHexHash(hash) || base64Png.length > 400000) return;
  try {
    const decodedBytes = base64Decode(base64Png);
    mkdir(ICONS_DIRECTORY_PATH, true);
    writeBytes(`${ICONS_DIRECTORY_PATH}/${hash}.png`, decodedBytes);
    cachedIconImagesByHash.delete(hash);
    uiState.dirty = true;
  } catch (error) {
    console.error(`music: icon ${hash}: ${error.message}`);
  }
}

// ponytail: one decode per notification id, kept until it is removed (at most the 50 kept plus the session's banners)
const emojiImagesByNotificationId = new Map<string, i32[]>();

/** The emoji pictures of a notification, decoded once; -1 for one that does not decode. */
export function getNotificationEmojiImages(notification: MacNotification): i32[] {
  if (emojiImagesByNotificationId.has(notification.id)) {
    return emojiImagesByNotificationId.get(notification.id) as i32[];
  }
  const images: i32[] = [];
  for (let index = 0; index < notification.emoji.length; index++) {
    try {
      images.push(imageFromBytes(base64Decode(notification.emoji[index])));
    } catch (error) {
      images.push(-1);
    }
  }
  emojiImagesByNotificationId.set(notification.id, images);
  return images;
}

/** The photo the message carries, -1 when none or not received yet. */
export function getNotificationAttachmentImage(notification: MacNotification): i32 {
  return notification.attachmentHash !== '' ? getCachedNotificationIcon(notification.attachmentHash) : -1;
}

/** Dessine l'icône de l'application (ou une cloche par défaut) avec opacité. */
export function drawNotificationAppIcon(
  notification: MacNotification,
  x: number,
  y: number,
  size: number,
  alpha: i32 = 255
): void {
  const iconImageId = getCachedNotificationIcon(notification.iconHash);
  if (iconImageId >= 0) {
    drawImage(iconImageId, x, y, size, size, alpha, size * 0.22);
    return;
  }
  rrect(x, y, size, size, size * 0.22, COLOR_FILL, alpha);
  drawGlyph('bell', x + size * 0.22, y + size * 0.22, size * 0.56, COLOR_TEXT_PRIMARY, alpha);
}

/** Dessine l'image ronde d'une notification (avatar + badge d'application pour un message, ou icône seule). */
export function drawNotificationAvatarOrIcon(
  notification: MacNotification,
  centerX: number,
  centerY: number,
  diameter: number,
  alpha: i32,
  badgeRingColor: u32
): void {
  if (notification.kind !== 'message') {
    drawNotificationAppIcon(notification, centerX - diameter / 2, centerY - diameter / 2, diameter, alpha);
    return;
  }

  const avatarImageId = getCachedNotificationIcon(notification.avatarHash);
  if (avatarImageId >= 0) {
    drawImage(avatarImageId, centerX - diameter / 2, centerY - diameter / 2, diameter, diameter, alpha, diameter / 2);
  } else {
    const contactTints: u32[] = [0x8e8e93, 0x5e5ce6, 0x30b0c7, 0xff9f0a, 0x34c759, 0xff375f];
    const senderLabel = getNotificationSenderLabel(notification);
    let hashValue: i32 = 0;
    for (let index = 0; index < senderLabel.length; index++) {
      hashValue = (hashValue * 31 + senderLabel.charCodeAt(index)) & 0xffff;
    }
    rrect(
      centerX - diameter / 2,
      centerY - diameter / 2,
      diameter,
      diameter,
      diameter / 2,
      contactTints[hashValue % contactTints.length],
      alpha
    );
    const initialFont =
      diameter >= 120 ? FONT_STANDBY_SENDER : diameter >= 70 ? FONT_STANDBY_NAME : Fonts.bodyBold;
    drawCenteredText(
      initialFont,
      centerX,
      centerY - fontAscent(initialFont) / 2 - 2,
      senderLabel.charAt(0).toUpperCase(),
      0xffffff,
      alpha
    );
  }

  const badgeSize = diameter * 0.36;
  const badgeX = centerX + diameter * 0.5 - badgeSize * 0.75;
  const badgeY = centerY + diameter * 0.5 - badgeSize * 0.75;
  rrect(badgeX - 3, badgeY - 3, badgeSize + 6, badgeSize + 6, (badgeSize + 6) * 0.26, badgeRingColor, alpha);
  drawNotificationAppIcon(notification, badgeX, badgeY, badgeSize, alpha);
}

// ----------------------------------------------------------------------------
// Formatage des textes et dates de notifications
// ----------------------------------------------------------------------------

/** Who it is from, emoji placeholders kept (draw it with components/emoji-text.ts). */
export function getNotificationSenderText(notification: MacNotification): string {
  if (notification.kind === 'message' && notification.senderName !== '') {
    return notification.senderName;
  }
  return notification.title !== '' ? notification.title : notification.appName;
}

/** Who it is from as plain text (no emoji): for the initials of a face. */
export function getNotificationSenderLabel(notification: MacNotification): string {
  return stripEmojiPlaceholders(getNotificationSenderText(notification));
}

/** The first emoji of the sender's text: a sender's come after the title's, subtitle's and body's (the relay's order). */
export function getNotificationSenderFirstEmoji(notification: MacNotification): i32 {
  if (notification.kind !== 'message' || notification.senderName === '') return 0;
  return (
    countEmojiPlaceholders(notification.title) +
    countEmojiPlaceholders(notification.subtitle) +
    countEmojiPlaceholders(notification.body)
  );
}

/** What it says, emoji placeholders kept: a message's body, else the subtitle and the body. */
export function getNotificationExcerpt(notification: MacNotification): string {
  if (notification.kind === 'message') return notification.body;
  return (notification.subtitle !== '' ? notification.subtitle + ' · ' : '') + notification.body;
}

/** The first emoji of the excerpt: after the title's (and the subtitle's, which a message's excerpt leaves out). */
export function getNotificationExcerptFirstEmoji(notification: MacNotification): i32 {
  return (
    countEmojiPlaceholders(notification.title) +
    (notification.kind === 'message' ? countEmojiPlaceholders(notification.subtitle) : 0)
  );
}

/** The title of a banner or a row (else the app's name) and its excerpt, the subtitle and the body, whose emoji follow the title's. */
export function getNotificationTitleText(notification: MacNotification): string {
  return notification.title !== '' ? notification.title : notification.appName;
}

export function getNotificationBodyText(notification: MacNotification): string {
  return (notification.subtitle !== '' ? notification.subtitle + ' · ' : '') + notification.body;
}

export function formatNotificationAppHeader(notification: MacNotification): string {
  return notification.domain !== ''
    ? `${notification.appName} · ${notification.domain}`
    : notification.appName;
}

export function formatRelativeTimeAgo(timestampSeconds: number): string {
  const elapsedSeconds = Date.now() / 1000 - timestampSeconds;
  if (elapsedSeconds < 60) return 'maintenant';
  if (elapsedSeconds < 3600) return `il y a ${Math.floor(elapsedSeconds / 60)} min`;
  if (elapsedSeconds < 86400) return `il y a ${Math.floor(elapsedSeconds / 3600)} h`;
  if (elapsedSeconds < 172800) return 'hier';
  const dateObj = new Date(timestampSeconds * 1000);
  return `${dateObj.getDate()} ${MONTHS_SHORT[dateObj.getMonth()]}`;
}

export function formatBannerTimeLabel(timestampSeconds: number): string {
  const elapsedSeconds = Date.now() / 1000 - timestampSeconds;
  if (elapsedSeconds < 60) return 'maintenant';
  const dateObj = new Date(timestampSeconds * 1000);
  const minutes = dateObj.getMinutes();
  return `${dateObj.getHours()}:${minutes < 10 ? '0' : ''}${minutes}`;
}

// ----------------------------------------------------------------------------
// Superposition StandBy et bannières grises
// ----------------------------------------------------------------------------

export const overlayDimState = { dim: 0 };
export let currentStandByOverlay: StandByOverlayAnimation | null = null;
let isClosingStandByOverlay: boolean = false;
let pendingStandByQueue: MacNotification[] = [];

export let activeBanners: NotificationBannerItem[] = [];
export const bannerVeilState = { dim: 0 };

let onNotificationShownCallback: (notification: MacNotification) => void = (
  notification: MacNotification
) => {};
let shouldUseStandByOverlayCallback: () => boolean = () => true;
let previousOverlayAnimationChecksum: number = -1;
let isOverlayCurrentlyStill: boolean = false;

export const TEST_RELAY_FEED_FILE = env('ZINC_MUSIC_RELAY');
const pendingTestFeedLines: string[] = [];
let testFeedElapsedSeconds: number = 0;

/** Demande au Mac d'ouvrir l'application ou la conversation associée à `notificationId`. */
export function openNotificationOnMac(notificationId: string): void {
  if (TEST_RELAY_FEED_FILE !== '') {
    console.log(`music: open ${notificationId}`);
    return;
  }
  for (let index = 0; index < activeLinkChannels.length; index++) {
    activeLinkChannels[index].send({ t: 'open', id: notificationId });
  }
}

/** Démarre le service de relais de notifications `zinc:link` (ou le flux de test simulé). */
export function startNotificationRelay(
  onShown: (notification: MacNotification) => void,
  shouldUseStandBy: () => boolean
): void {
  onNotificationShownCallback = onShown;
  shouldUseStandByOverlayCallback = shouldUseStandBy;

  if (TEST_RELAY_FEED_FILE !== '') {
    const rawLines = readText(TEST_RELAY_FEED_FILE).split('\n');
    for (let index = 0; index < rawLines.length; index++) {
      if (rawLines[index].trim() !== '') {
        pendingTestFeedLines.push(rawLines[index]);
      }
    }
    pairedMacHostname = 'Mac de test';
    return;
  }

  try {
    link.init({ name: 'Musique' });
    relayListeningPort = link.advertise({ service: 'notify', name: 'Musique' });
  } catch (error) {
    console.error(`music: zinc:link: ${error.message}`);
    return;
  }

  link.onPairing((statusEvent: string) => {
    if (statusEvent.startsWith('try ')) {
      failedPairingAttempts = parseInt(statusEvent.slice(4)) as i32;
    } else if (statusEvent === 'closed') {
      pairingPinCode = '';
      isPairingCodeExpired = true;
    }
    uiState.dirty = true;
  });

  link.onPaired((peer: link.Peer) => {
    pairedMacHostname = peer.name;
    isMacPaired = true;
    pairingWizardStep = 3;
    pairingPinCode = '';
    uiState.dirty = true;
  });

  link.onConnection((channel: link.Channel) => {
    activeLinkChannels.push(channel);
    openChannelsCount++;
    if (pairedMacHostname === '') pairedMacHostname = channel.peer.name;
    channel.onMessage((message: any) => handleIncomingRelayMessage(message, channel));
    channel.onClose((reason: string) => {
      openChannelsCount = Math.max(0, openChannelsCount - 1);
      const index = activeLinkChannels.indexOf(channel);
      if (index >= 0) activeLinkChannels.splice(index, 1);
      uiState.dirty = true;
    });
    uiState.dirty = true;
  });

  isMacPaired = link.peers().length > 0;
  if (isMacPaired && pairedMacHostname === '') {
    pairedMacHostname = link.peers()[0].name;
  }
}

function handleIncomingRelayMessage(message: any, channel: link.Channel | null): void {
  const messageType = asSafeString(message.t);
  if (messageType === 'hello') {
    pairedMacHostname =
      asSafeString(message.host) !== ''
        ? asSafeString(message.host)
        : channel !== null
        ? channel.peer.name
        : 'Mac';
    uiState.dirty = true;
    return;
  }
  if (messageType === 'icon') {
    storeNotificationIconOnDisk(asSafeString(message.hash), asSafeString(message.png));
    return;
  }
  if (messageType === 'clear') {
    clearAllNotifications();
    return;
  }
  if (messageType !== 'notif') return;

  const notification = parseNotificationFromJson(message);
  if (notification.id === '') {
    notification.id = '' + Date.now() + '-' + storedNotifications.length;
  }

  storedNotifications = storedNotifications.filter(
    (existing: MacNotification) => existing.id !== notification.id
  );
  storedNotifications.unshift(notification);
  if (storedNotifications.length > MAX_STORED_NOTIFICATIONS) {
    storedNotifications = storedNotifications.slice(0, MAX_STORED_NOTIFICATIONS);
  }
  saveStoredNotifications();

  if (channel !== null) {
    channel.send({ t: 'ack', id: notification.id });
  }

  const hashesToCheck = [notification.iconHash, notification.avatarHash, notification.attachmentHash];
  for (let index = 0; index < hashesToCheck.length; index++) {
    const iconHash = hashesToCheck[index];
    if (
      iconHash !== '' &&
      channel !== null &&
      !hasCachedNotificationIcon(iconHash) &&
      !requestedIconHashes.has(iconHash)
    ) {
      requestedIconHashes.set(iconHash, true);
      channel.send({ t: 'need-icon', hash: iconHash });
    }
  }

  if (areNotificationsShown) {
    presentIncomingNotification(notification);
  }
  uiState.dirty = true;
}

let areNotificationsShown = true;

/** The settings' "Notifications du Mac": off, a notification arrives silently, kept in the list but never shown nor waking the screen. */
export function setNotificationsShown(isShown: boolean): void {
  areNotificationsShown = isShown;
}

function presentIncomingNotification(notification: MacNotification): void {
  if (currentStandByOverlay !== null || shouldUseStandByOverlayCallback()) {
    showStandByOverlayNotification(notification);
  } else {
    enqueueTopBannerNotification(notification);
  }
}

export function showStandByOverlayNotification(notification: MacNotification): void {
  if (currentStandByOverlay !== null && !isClosingStandByOverlay) {
    pendingStandByQueue.push(notification);
    return;
  }
  isClosingStandByOverlay = false;
  gsap.killTweensOf(overlayDimState);
  gsap.to(overlayDimState, { dim: 1, duration: 0.35, ease: 'power2.out' });
  startStandByOverlayTimeline(notification);
}

function startStandByOverlayTimeline(notification: MacNotification): void {
  if (currentStandByOverlay !== null && currentStandByOverlay.timeline !== null) {
    (currentStandByOverlay.timeline as Timeline).kill();
  }
  const anim = new StandByOverlayAnimation();
  anim.notification = notification;

  const timeline = gsap.timeline();
  timeline
    .to(anim, { phase1Grow: 1, duration: 0.55, ease: 'back.out(1.4)' }, 0)
    .to(anim, { phase2SlideLeft: 1, duration: 0.7, ease: 'power3.inOut' }, 2.2)
    .to(anim, { line1Progress: 1, duration: 0.4, ease: 'power2.out' }, 2.6)
    .to(anim, { line2Progress: 1, duration: 0.4, ease: 'power2.out' }, 2.72)
    .to(anim, { line3Progress: 1, duration: 0.4, ease: 'power2.out' }, 2.84)
    .to(anim, { fadeOutProgress: 1, duration: 0.45, ease: 'power2.in' }, 9.4)
    .call(advanceStandByOverlayQueue, 10);

  anim.timeline = timeline;
  currentStandByOverlay = anim;
  onNotificationShownCallback(notification);
  uiState.dirty = true;
}

function advanceStandByOverlayQueue(): void {
  if (pendingStandByQueue.length > 0) {
    startStandByOverlayTimeline(pendingStandByQueue.shift() as MacNotification);
    return;
  }
  if (currentStandByOverlay === null || isClosingStandByOverlay) return;
  isClosingStandByOverlay = true;
  if (currentStandByOverlay.timeline !== null) {
    (currentStandByOverlay.timeline as Timeline).kill();
  }
  currentStandByOverlay.fadeOutProgress = 1;
  gsap
    .to(overlayDimState, { dim: 0, duration: 0.4, ease: 'power2.in' })
    .onComplete(() => {
      if (isClosingStandByOverlay) {
        currentStandByOverlay = null;
        isClosingStandByOverlay = false;
      }
      uiState.dirty = true;
    });
}

export function onStandByOverlayTapped(): void {
  if (currentStandByOverlay === null || isClosingStandByOverlay) return;
  openNotificationOnMac((currentStandByOverlay as StandByOverlayAnimation).notification.id);
  advanceStandByOverlayQueue();
}

export function hasActiveStandByOverlay(): boolean {
  return currentStandByOverlay !== null;
}

/**
 * Indique si l'animation de superposition StandBy est actuellement dans sa phase de maintien fixe,
 * ce qui évite de redessiner inutilement l'écran à 60 FPS pendant les 6 secondes d'attente.
 */
export function isStandByOverlayHoldingStill(): boolean {
  if (currentStandByOverlay === null) return false;
  const anim = currentStandByOverlay as StandByOverlayAnimation;
  const checksum =
    anim.phase1Grow +
    anim.phase2SlideLeft * 3 +
    anim.line1Progress * 5 +
    anim.line2Progress * 7 +
    anim.line3Progress * 11 +
    anim.fadeOutProgress * 13 +
    overlayDimState.dim * 17;
  isOverlayCurrentlyStill = checksum === previousOverlayAnimationChecksum;
  previousOverlayAnimationChecksum = checksum;
  return isOverlayCurrentlyStill;
}

function enqueueTopBannerNotification(notification: MacNotification): void {
  const bannerItem = new NotificationBannerItem();
  bannerItem.notification = notification;
  bannerItem.remainingSeconds = BANNER_DISPLAY_SECONDS;
  gsap.to(bannerItem, { slideOffsetFactor: 0, duration: 0.45, ease: 'power3.out' });

  if (activeBanners.length === 0) {
    gsap.killTweensOf(bannerVeilState);
    gsap.to(bannerVeilState, { dim: 1, duration: 0.35, ease: 'power2.out' });
  }
  activeBanners.unshift(bannerItem);
  if (activeBanners.length > 3) {
    activeBanners = activeBanners.slice(0, 3);
  }
  onNotificationShownCallback(notification);
}

export function dismissBannerItem(bannerItem: NotificationBannerItem): void {
  if (bannerItem.isDismissed) return;
  bannerItem.isDismissed = true;
  if (activeBanners.filter((other: NotificationBannerItem) => !other.isDismissed).length === 0) {
    gsap.killTweensOf(bannerVeilState);
    gsap.to(bannerVeilState, { dim: 0, duration: 0.4, ease: 'power2.in' });
  }
  gsap
    .to(bannerItem, { slideOffsetFactor: -1, duration: 0.35, ease: 'power2.in' })
    .onComplete(() => {
      activeBanners = activeBanners.filter((other: NotificationBannerItem) => other !== bannerItem);
      uiState.dirty = true;
    });
}

export function tickNotificationRelay(deltaSeconds: number): void {
  testFeedElapsedSeconds += deltaSeconds;
  while (pendingTestFeedLines.length > 0) {
    const firstLine = pendingTestFeedLines[0];
    const spaceIndex = firstLine.indexOf(' ');
    if (parseFloat(firstLine.slice(0, spaceIndex)) > testFeedElapsedSeconds) break;
    pendingTestFeedLines.shift();
    try {
      handleIncomingRelayMessage(JSON.parse(firstLine.slice(spaceIndex + 1)), null);
    } catch (error) {
      console.error(`music: relay feed: ${error.message}`);
    }
  }

  for (let index = 0; index < activeBanners.length; index++) {
    const bannerItem = activeBanners[index];
    bannerItem.remainingSeconds -= deltaSeconds;
    if (bannerItem.remainingSeconds <= 0) {
      dismissBannerItem(bannerItem);
    }
  }
}

/**
 * Lorsqu'une ligne de notification est glissée vers la droite (`deltaX > 12`),
 * cède le geste au carrousel de la page d'accueil.
 */
export function doesNotificationRowYieldToCarousel(deltaX: number, deltaY: number): boolean {
  return (
    draggedNotificationAxis === '' &&
    deltaX > 12 &&
    Math.abs(deltaX) > Math.abs(deltaY)
  );
}
