// ============================================================================
// pages/home/player-slide.ts — Slide 0 : Lecteur "À l'écoute"
// ============================================================================
// Affiche la pochette du titre en cours, les métadonnées (titre, artiste, album),
// la barre de progression (ou le badge EN DIRECT pour une radio), les contrôles
// de transport (précédent, lecture/pause, suivant, aléatoire, répétition, like),
// le curseur de volume du groupe et les raccourcis vers les autres enceintes.

import { rrect, drawText, textWidth } from 'zinc:gfx';
import { System, Group } from 'zinc:sonos';
import {
  COLOR_ACCENT,
  COLOR_CARD_ELEVATED,
  COLOR_FILL,
  COLOR_GREEN,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_TEXT_TERTIARY,
  PAGE_PADDING,
} from '../../constants';
import { Fonts } from '../../fonts';
import { DisplayObject } from '../../core/display';
import { registerTapZone, isZonePressed } from '../../core/input';
import {
  drawCardShadow,
  drawCenteredText,
  drawGlyph,
  drawLabel,
  drawTransportIcon,
  drawWrappedText,
  formatDurationClock,
} from '../../components/primitives';
import { drawIconButton, drawPillButton } from '../../components/buttons';
import { drawSlider } from '../../components/slider';
import { drawCoverArt } from '../../components/cover';
import { drawSidebarContent } from '../../components/sidebar';
import { saveAppConfig } from '../../services/config';
import {
  appState,
  getGroupArtworkUrl,
  getTrackSourceLabel,
  getInterpolatedTrackPositionSeconds,
  executeGroupCommand,
  togglePlayPause,
  runSafeNetworkAction,
  showToast,
  pollActiveGroupMemberVolumes,
  setActiveGroupVolume,
  selectActiveSonosGroup,
  discoverSonosSystem,
} from '../../state';

/**
 * Dessine l'état vide lorsqu'aucune enceinte Sonos n'a encore été trouvée.
 */
export function drawNoSpeakerEmptyState(viewWidth: number, viewHeight: number): void {
  const centerX = appState.sidebarWidth + (viewWidth - appState.sidebarWidth) / 2;
  drawGlyph('speaker', centerX - 40, viewHeight / 2 - 120, 80, COLOR_TEXT_TERTIARY);
  drawCenteredText(
    Fonts.heading,
    centerX,
    viewHeight / 2 - 20,
    appState.sonosStatusMessage !== '' ? appState.sonosStatusMessage : 'Aucune enceinte',
    COLOR_TEXT_PRIMARY
  );
  if (!appState.isFindingSpeakers) {
    const buttonWidth = textWidth(Fonts.smallBold, 'Réessayer', 0) + 36 + 22;
    drawPillButton(
      'empty/retry',
      centerX - buttonWidth / 2,
      viewHeight / 2 + 30,
      'Réessayer',
      COLOR_TEXT_PRIMARY,
      COLOR_FILL,
      () => {
        discoverSonosSystem();
      },
      'refresh-cw'
    );
  }
}

function drawGroupVolumeBar(x: number, y: number, width: number, group: Group): void {
  appState.volumeBarScreenX = x;
  appState.volumeBarScreenY = y;
  drawGlyph('volume-1', x, y - 11, 22, COLOR_TEXT_SECONDARY);
  drawSlider(
    'vol/group',
    x + 36,
    y,
    width - 72,
    group.volume >= 0 ? group.volume / 100 : 0,
    0xffffff,
    (newValue: number, isReleased: boolean) => {
      if (group.members.length > 1) {
        if (!appState.isVolumePopoverOpen) {
          pollActiveGroupMemberVolumes();
        }
        appState.isVolumePopoverOpen = true;
        appState.volumePopoverRemainingSeconds = 4;
      }
      setActiveGroupVolume(newValue);
    },
    6
  );
  drawGlyph('volume-2', x + width - 24, y - 11, 22, COLOR_TEXT_SECONDARY);
}

/**
 * Nœud de l'arbre d'affichage pour le premier slide de la page d'accueil (Lecteur + Barre latérale).
 */
export class PlayerSlideNode extends DisplayObject {
  constructor() {
    super('PlayerSlide');
  }

  override onDraw(viewWidth: number, viewHeight: number): void {
    this.drawNowPlayingContent(viewWidth, viewHeight);
    drawSidebarContent(viewWidth, viewHeight);
  }

  private drawNowPlayingContent(viewWidth: number, viewHeight: number): void {
    const isFullScreen = appState.sidebarWidth === 0;
    const contentStartX = isFullScreen ? 64 : appState.sidebarWidth + PAGE_PADDING;

    drawIconButton(
      'now/side',
      isFullScreen ? 'panel-left-open' : 'panel-left-close',
      contentStartX + 14,
      34,
      22,
      COLOR_TEXT_PRIMARY,
      () => {
        appState.config.fullScreenPlayer = !isFullScreen;
        saveAppConfig(appState.config);
      },
      0xffffff,
      30
    );

    if (appState.activeGroup === null) {
      drawNoSpeakerEmptyState(viewWidth, viewHeight);
      return;
    }

    const group = appState.activeGroup as Group;
    const track = group.track;
    const artworkUrl = getGroupArtworkUrl(group);

    // En-tête : pièce contrôlée et source audio
    const roomPillWidth = drawPillButton(
      'now/room',
      contentStartX + 50,
      14,
      group.name(),
      COLOR_TEXT_PRIMARY,
      COLOR_FILL,
      () => {
        appState.isContextSheetOpen = true;
      },
      'speaker'
    );
    const sourceBadgeText = getTrackSourceLabel(group);
    if (sourceBadgeText !== '') {
      drawText(
        Fonts.tinyBold,
        contentStartX + 50 + roomPillWidth + 16,
        28,
        sourceBadgeText,
        track.source === 'spotify' ? COLOR_GREEN : COLOR_ACCENT,
        255,
        0
      );
    }

    // Pochette d'album à gauche
    const coverSize = isFullScreen ? 430 : 340;
    const coverTopY = isFullScreen ? 86 : 96;
    drawCardShadow(contentStartX, coverTopY, coverSize, coverSize, 14);

    const isNothingPlaying = track.title === '' && track.station === '';
    if (isNothingPlaying) {
      rrect(contentStartX, coverTopY, coverSize, coverSize, 14, COLOR_CARD_ELEVATED, 255);
      drawGlyph(
        'music',
        contentStartX + coverSize / 2 - 48,
        coverTopY + coverSize / 2 - 48,
        96,
        COLOR_TEXT_TERTIARY
      );
    } else {
      drawCoverArt(
        artworkUrl,
        track.title !== '' ? track.title : track.station,
        contentStartX,
        coverTopY,
        coverSize,
        14,
        track.source === 'radio' && track.art === ''
      );
    }

    // Titre, artiste, album et contrôles à droite
    const rightColumnX = contentStartX + coverSize + (isFullScreen ? 64 : 44);
    const rightColumnWidth = viewWidth - rightColumnX - (isFullScreen ? 64 : PAGE_PADDING);
    let currentTextY = coverTopY + 6;

    const mainTitle = isNothingPlaying
      ? 'Rien en lecture'
      : track.title !== ''
      ? track.title
      : track.station;
    currentTextY +=
      drawWrappedText(
        isFullScreen ? Fonts.hero : Fonts.title,
        rightColumnX,
        currentTextY,
        mainTitle,
        COLOR_TEXT_PRIMARY,
        rightColumnWidth,
        3,
        isFullScreen ? 42 : 36
      ) + 6;

    const artistSubtitle =
      track.artist !== ''
        ? track.artist
        : track.source === 'spotify' && track.title === ''
        ? group.playing()
          ? 'Spotify Connect'
          : 'En pause dans Spotify'
        : '';
    if (artistSubtitle !== '') {
      drawLabel(Fonts.body, rightColumnX, currentTextY, artistSubtitle, COLOR_ACCENT, rightColumnWidth);
      currentTextY += 30;
    }

    const albumOrStationSubtitle =
      track.album !== ''
        ? track.album
        : track.source === 'radio' && track.station !== mainTitle
        ? track.station
        : '';
    if (albumOrStationSubtitle !== '') {
      drawLabel(
        Fonts.label,
        rightColumnX,
        currentTextY,
        albumOrStationSubtitle,
        COLOR_TEXT_SECONDARY,
        rightColumnWidth
      );
    }

    // Barre de progression ou badge EN DIRECT
    const progressY = coverTopY + coverSize * 0.58;
    if (track.duration > 0) {
      const currentPosition = getInterpolatedTrackPositionSeconds();
      drawSlider(
        'now/seek',
        rightColumnX,
        progressY,
        rightColumnWidth,
        currentPosition / track.duration,
        0xffffff,
        (newRatio: number, isReleased: boolean) => {
          appState.trackPositionBaseSeconds = newRatio * track.duration;
          appState.trackPositionTimestampSeconds = appState.elapsedAppClockSeconds;
          if (isReleased) {
            executeGroupCommand('Avance', (system, targetGroup) =>
              system.seek(targetGroup, newRatio * track.duration)
            );
          }
        },
        5,
        false
      );
      drawText(
        Fonts.tiny,
        rightColumnX,
        progressY + 14,
        formatDurationClock(currentPosition),
        COLOR_TEXT_SECONDARY,
        255,
        0
      );
      const remainingText = '-' + formatDurationClock(track.duration - currentPosition);
      drawText(
        Fonts.tiny,
        rightColumnX + rightColumnWidth - textWidth(Fonts.tiny, remainingText, 0),
        progressY + 14,
        remainingText,
        COLOR_TEXT_SECONDARY,
        255,
        0
      );
    } else if (track.source === 'radio' && !isNothingPlaying) {
      rrect(rightColumnX, progressY - 12, 92, 26, 13, COLOR_ACCENT, 255);
      rrect(rightColumnX + 12, progressY - 3, 8, 8, 4, 0xffffff, 255);
      drawText(Fonts.tinyBold, rightColumnX + 28, progressY - 6, 'EN DIRECT', COLOR_TEXT_PRIMARY, 255, 0);
    }

    // Boutons de transport (Précédent, Lecture/Pause, Suivant)
    const transportCenterY = coverTopY + coverSize * 0.79;
    const transportCenterX = rightColumnX + rightColumnWidth / 2;

    drawTransportIcon(
      'prev',
      transportCenterX - 96,
      transportCenterY,
      34,
      group.can('Previous') ? COLOR_TEXT_PRIMARY : COLOR_TEXT_TERTIARY
    );
    registerTapZone(
      'now/prev',
      transportCenterX - 130,
      transportCenterY - 34,
      68,
      68,
      () => executeGroupCommand('Précédent', (system, targetGroup) => system.previous(targetGroup))
    );

    rrect(
      transportCenterX - 40,
      transportCenterY - 40,
      80,
      80,
      40,
      isZonePressed('now/play') ? 0xd1d1d6 : 0xffffff,
      255
    );
    drawTransportIcon(
      group.playing() ? 'pause' : 'play',
      group.playing() ? transportCenterX : transportCenterX + 3,
      transportCenterY,
      32,
      0x000000
    );
    registerTapZone('now/play', transportCenterX - 44, transportCenterY - 44, 88, 88, togglePlayPause);

    drawTransportIcon(
      'next',
      transportCenterX + 96,
      transportCenterY,
      34,
      group.can('Next') ? COLOR_TEXT_PRIMARY : COLOR_TEXT_TERTIARY
    );
    registerTapZone(
      'now/next',
      transportCenterX + 62,
      transportCenterY - 34,
      68,
      68,
      () => executeGroupCommand('Suivant', (system, targetGroup) => system.next(targetGroup))
    );

    // Aléatoire, Répétition et J'aime (Spotify ou file d'attente Sonos)
    const modeRowY = coverTopY + coverSize - 4;
    if (
      track.source === 'spotify' &&
      appState.spotifyClient.ready() &&
      appState.spotifyPlayback.active
    ) {
      const isShuffleOn = appState.spotifyPlayback.shuffle;
      const repeatState = appState.spotifyPlayback.repeat;

      drawIconButton(
        'now/shuffle',
        'shuffle',
        transportCenterX - 96,
        modeRowY,
        24,
        isShuffleOn ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
        () =>
          runSafeNetworkAction('Aléatoire', async (): Promise<void> => {
            await appState.spotifyClient.setShuffle(!isShuffleOn);
            appState.spotifyPlayback.shuffle = !isShuffleOn;
          })
      );

      drawIconButton(
        'now/repeat',
        repeatState === 'track' ? 'repeat-1' : 'repeat',
        transportCenterX,
        modeRowY,
        24,
        repeatState !== 'off' ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
        () => {
          const nextRepeat =
            repeatState === 'off' ? 'context' : repeatState === 'context' ? 'track' : 'off';
          runSafeNetworkAction('Répétition', async (): Promise<void> => {
            await appState.spotifyClient.setRepeat(nextRepeat);
            appState.spotifyPlayback.repeat = nextRepeat;
          });
        }
      );

      const currentUri = appState.spotifyPlayback.item.uri;
      drawIconButton(
        'now/like',
        'heart',
        transportCenterX + 96,
        modeRowY,
        24,
        appState.isCurrentTrackLiked ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
        () =>
          runSafeNetworkAction("J'aime", async (): Promise<void> => {
            await appState.spotifyClient.setLiked(currentUri, !appState.isCurrentTrackLiked);
            appState.isCurrentTrackLiked = !appState.isCurrentTrackLiked;
            showToast(
              appState.isCurrentTrackLiked
                ? 'Ajouté aux titres likés'
                : 'Retiré des titres likés'
            );
          })
      );
    } else if (track.source === 'queue') {
      const playMode = group.playMode;
      const isShuffleOn = playMode.startsWith('SHUFFLE');
      const repeatState =
        playMode === 'REPEAT_ALL' || playMode === 'SHUFFLE'
          ? 'all'
          : playMode.endsWith('REPEAT_ONE')
          ? 'one'
          : 'off';
      const buildSonosPlayMode = (shuffle: boolean, repeat: string): string =>
        shuffle
          ? repeat === 'all'
            ? 'SHUFFLE'
            : repeat === 'one'
            ? 'SHUFFLE_REPEAT_ONE'
            : 'SHUFFLE_NOREPEAT'
          : repeat === 'all'
          ? 'REPEAT_ALL'
          : repeat === 'one'
          ? 'REPEAT_ONE'
          : 'NORMAL';

      drawIconButton(
        'now/shuffle',
        'shuffle',
        transportCenterX - 48,
        modeRowY,
        24,
        isShuffleOn ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
        () =>
          executeGroupCommand('Aléatoire', (system, targetGroup) =>
            system.setPlayMode(targetGroup, buildSonosPlayMode(!isShuffleOn, repeatState))
          )
      );

      const nextRepeatState =
        repeatState === 'off' ? 'all' : repeatState === 'all' ? 'one' : 'off';
      drawIconButton(
        'now/repeat',
        repeatState === 'one' ? 'repeat-1' : 'repeat',
        transportCenterX + 48,
        modeRowY,
        24,
        repeatState !== 'off' ? COLOR_ACCENT : COLOR_TEXT_SECONDARY,
        () =>
          executeGroupCommand('Répétition', (system, targetGroup) =>
            system.setPlayMode(targetGroup, buildSonosPlayMode(isShuffleOn, nextRepeatState))
          )
      );
    }

    // Curseur de volume du groupe
    const volumeBarY = coverTopY + coverSize + 50;
    drawGroupVolumeBar(contentStartX, volumeBarY, viewWidth - contentStartX - PAGE_PADDING, group);

    // Raccourcis vers les autres groupes d'enceintes en bas de l'écran
    if (appState.sonosSystem !== null && (appState.sonosSystem as System).groups.length > 1) {
      const system = appState.sonosSystem as System;
      drawText(Fonts.tinyBold, contentStartX, viewHeight - 108, 'ENCEINTES', COLOR_TEXT_SECONDARY, 255, 0);
      let pillCursorX = contentStartX;
      for (let groupIndex = 0; groupIndex < system.groups.length; groupIndex++) {
        const candidateGroup = system.groups[groupIndex];
        const isSelected = candidateGroup === appState.activeGroup;
        const capturedGroup = candidateGroup;
        pillCursorX +=
          drawPillButton(
            'now/g/' + candidateGroup.id,
            pillCursorX,
            viewHeight - 84,
            candidateGroup.name(),
            isSelected ? 0x000000 : COLOR_TEXT_PRIMARY,
            isSelected ? 0xffffff : COLOR_FILL,
            () => selectActiveSonosGroup(capturedGroup),
            candidateGroup.playing() ? 'audio-lines' : 'speaker'
          ) + 10;
        if (pillCursorX > viewWidth - 120) break;
      }
    }
  }
}
