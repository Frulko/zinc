import { evaluateSmart, ruleMatches, emptyRules } from '../../../plugins/ipod/smart';
import type { Track, SmartRule } from '../../../plugins/ipod/native/ipod.spec';
function track(id: string, checked: boolean): Track { return { id: id, title: '', artist: '', album: '', albumArtist: '', genre: '', composer: '', comment: '', trackNr: 0, tracks: 0,
  cdNr: 0, cds: 0, year: 0, rating: 0, playCount: 0, bitrate: 0, sampleRate: 0, durationMs: 0, size: 0, mediaType: 'podcast', mediaBits: 2147483653, checked: checked, path: '', artwork: false,
  added: 0, lastPlayed: 0, bpm: 0, skipCount: 0, lastSkipped: 0, grouping: 'Live', description: '', kind: 'MPEG audio file', compilation: true, sortTitle: '',
  sortArtist: '', sortAlbum: '', sortAlbumArtist: '', sortComposer: '', startMs: 0, stopMs: 0, volume: 0, skipWhenShuffling: false,
  rememberPosition: false, lyrics: false, modified: 1700000000 }; }
function rule(field: string, action: string, value: number = 0, text: string = ''): SmartRule {
  return { field: field, action: action, value: value, text: text, value2: 0, units: '' };
}
const a = track('checked', true), b = track('unchecked', false);
console.log('grouping', ruleMatches(rule('grouping', 'contains', 0, 'live'), a, [], 1700000010));
console.log('kind', ruleMatches(rule('kind', 'startsWith', 0, 'mpeg'), a, [], 1700000010));
console.log('compilation', ruleMatches(rule('compilation', 'is'), a, [], 1700000010), ruleMatches(rule('compilation', 'isNot'), a, [], 1700000010));
console.log('modified', ruleMatches(rule('modified', 'greaterThan', 1600000000), a, [], 1700000010));
for (const bit of [1, 4, 2147483648]) console.log('bit', bit, ruleMatches(rule('videoKind', 'is', bit), a, [], 1700000010));
const rules = emptyRules(); rules.checkedOnly = true;
console.log('checked', evaluateSmart(rules, [a, b], [], 1700000010).join(','));
rules.checkedOnly = false;
console.log('all', evaluateSmart(rules, [a, b], [], 1700000010).join(','));
