// ============================================================================
// pages/settings/remote-section.ts — Remote access: the Zinc agent, its pairing, SSH, the name
// ============================================================================

import { BUTTON_HEIGHT, ROW_HEIGHT } from '../../constants';
import { DisplayObject } from '../../core/display';
import { appState, deviceName, editHostname, openPairing, setAgentEnabled, setSshEnabled } from '../../state';
import { BUTTON_SECONDARY, SWITCH_HEIGHT, SWITCH_WIDTH, drawButton, drawSwitch, measureButton } from '../../components/buttons';
import { drawMessage, drawSectionHeading, drawSettingRow } from '../../components/rows';

const SECTION_PADDING = 24;
const ROW_GAP = 10;

export class RemoteSectionNode extends DisplayObject {
  constructor() {
    super('RemoteSection');
  }

  override onDraw(sectionWidth: number, sectionHeight: number): void {
    const x = SECTION_PADDING;
    const width = sectionWidth - SECTION_PADDING * 2;
    const status = appState.status;
    const busy = appState.busyAction;
    let cursorY = 20;
    drawSectionHeading(x, cursorY, 'Remote access');
    cursorY += 52;

    drawSettingRow('remote/agent-row', x, cursorY, width, 'Zinc agent', 'A paired computer sends and runs apps on this Pi', SWITCH_WIDTH);
    drawSwitch('remote/agent', x + width - 16 - SWITCH_WIDTH, cursorY + (ROW_HEIGHT - SWITCH_HEIGHT) / 2, status.agentOn,
      () => setAgentEnabled(!appState.status.agentOn), busy === '');
    cursorY += ROW_HEIGHT + ROW_GAP;

    if (status.agentOn) {
      const pairing = appState.pairing;
      const subtitle = pairing.code !== ''
        ? 'On your computer: zinc device pair ' + deviceName() + ' ' + pairing.code
        : pairing.pairedComputers === 1 ? 'One computer is paired' : pairing.pairedComputers + ' computers are paired';
      const label = busy === 'pair' ? 'Opening…' : pairing.code !== '' ? 'New code' : 'Show a code';
      const buttonWidth = measureButton('Show a code', '');
      drawSettingRow('remote/pairing-row', x, cursorY, width, pairing.code !== '' ? 'Pairing code ' + pairing.code : 'Pairing', subtitle,
        buttonWidth);
      drawButton('remote/pair', x + width - 12 - buttonWidth, cursorY + (ROW_HEIGHT - BUTTON_HEIGHT) / 2, buttonWidth, label, '',
        BUTTON_SECONDARY, openPairing, busy === '');
      cursorY += ROW_HEIGHT + ROW_GAP;
    }

    drawSettingRow('remote/ssh-row', x, cursorY, width, 'SSH',
      status.sshOn ? 'ssh <user>@' + status.hostname + '.local' : 'Log in from a terminal (a user is set in the image)', SWITCH_WIDTH);
    drawSwitch('remote/ssh', x + width - 16 - SWITCH_WIDTH, cursorY + (ROW_HEIGHT - SWITCH_HEIGHT) / 2, status.sshOn,
      () => setSshEnabled(!appState.status.sshOn), busy === '');
    cursorY += ROW_HEIGHT + ROW_GAP;

    const changeWidth = measureButton('Change', '');
    drawSettingRow('remote/name-row', x, cursorY, width, 'Name on the network', status.hostname + '.local', changeWidth);
    drawButton('remote/name', x + width - 12 - changeWidth, cursorY + (ROW_HEIGHT - BUTTON_HEIGHT) / 2, changeWidth, 'Change', '',
      BUTTON_SECONDARY, editHostname, busy === '');
    cursorY += ROW_HEIGHT + ROW_GAP + 4;

    drawMessage(x, cursorY, width, appState.message, appState.isMessageError);
  }
}
