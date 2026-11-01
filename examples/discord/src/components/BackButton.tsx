// The way back to the servers and channels in the one-column layout of a narrow window (constants.ts narrow()); nothing in a wide one.
import { Icon } from 'zinc:icons';
import { Tooltip } from 'zinc:ui/kit';
import { tr } from '../i18n';
import { store } from '../state';
import { narrow, BG_HOVER } from '../constants';

export function BackButton() {
  if (!narrow()) return null;
  return <Tooltip label={tr('discord.common.back')} placement="bottom-start"><View className={`p-1 rounded ${BG_HOVER}`} aria-label={tr('discord.common.back')} onPress={() => { if (store.settingsOpen) store.showSettings(false); else store.showNav(true); }}>
    <Icon name="arrow-left" size={20} color={() => 0x949ba4} />
  </View></Tooltip>;
}
