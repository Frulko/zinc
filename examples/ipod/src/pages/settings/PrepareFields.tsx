// The Settings card "Recommendations": Prepare recommendations brings up to date, in one go and each as its Transfers job, what Genius
// and For you are made from (the Last.fm history import, resumed when it was left; the similar artists from Last.fm; AudioMuse's
// results), and one line per source says where it stands (services/prepare.ts).
import { loadConfig } from '../../services/config';
import { historyVersion, history, historyStarted, importLastfmNow } from '../../services/historyJobs';
import { History } from '../../services/history';
import { jobs } from '../../services/transfers';
import { historyLine, similarLine, museLine } from '../../services/prepare';
import { backupPlace } from '../../services/log';
import { fetchArtistsNow } from '../../drafts';
import { currentDeep, deepVersion, museSetUp, syncMuse } from '../../deep';
import { library } from '../../state';
import { PodLibrary } from '../../services/ipod';
import { Button } from '../../components/Button';
import { fg, MUTED } from '../../constants';

export const PREPARE_NOTE = 'Genius and For you learn from your Last.fm history, the artists Last.fm finds similar and AudioMuse\'s analysis. Prepare brings all three up to date at once (an import left unfinished goes on); each is a job in Transfers.';

/** Starts what the recommendations need: each source set up, as its Transfers job (one already running is left to run). */
export function prepareAll(): void {
  const c = loadConfig();
  const user = c.historyLastfmUser !== '' ? c.historyLastfmUser : c.lastfmUser;
  if (c.lastfmKey !== '' && user !== '') importLastfmNow(c.lastfmKey, user);
  fetchArtistsNow();
  if (museSetUp()) syncMuse();
}

export function PrepareFields(): i32 {
  const lines = (): string => {
    historyVersion(); deepVersion(); jobs();   // again when an import, a fetch or a sync ends
    const now = Date.now() / 1000;
    let h: History | null = null;
    try { if (historyStarted()) h = history(); } catch (e) { /* no history */ }
    const lib = library();
    return [historyLine(h, now), similarLine(`${backupPlace()}/history`, now),
      museLine(currentDeep(), lib !== null ? (lib as PodLibrary).tracks : [], museSetUp(), now)].join('\n');
  };
  return <View className="flex-col gap-3">
    <View className="flex-row items-center gap-2">
      <Button icon="sparkles" label="Prepare recommendations" accent={true} onPress={() => prepareAll()} />
    </View>
    <Text className={`text-[12px] ${fg(MUTED)}`}>{lines()}</Text>
  </View>;
}
