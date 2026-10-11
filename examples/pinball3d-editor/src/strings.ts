// Every text of the editor's own interface, in English and in French: the one table the views read (`t(L.SAVE)`), so that no view
// holds a sentence. The interface language is the system's, with a switch in the status bar.
// The names of the format (lists, fields) are not sentences of the editor: the format gives each a key and an English line of help.
// `listName` and `fieldName` give them a label in both languages from the tables at the end; a list or a field the tables do not know
// yet is shown by its key made readable ("baseRadius" gives "Base radius"), so a field added to the format shows at once.
import { createSignal } from 'zinc:ui/solid';
import { env } from 'zinc:sys';

const EN: string[] = [], FR: string[] = [];
function S(en: string, fr: string): i32 { EN.push(en); FR.push(fr); return EN.length - 1; }

// ponytail: the system language is read from the environment (LC_ALL, LANG), which an app started from the Finder may not have: it
// then starts in English. A locale function in zinc:sys (ZN-687) replaces this. PINBALL_EDITOR_LANG=en|fr forces it (tests).
function systemLanguage(): string {
  const said = env('PINBALL_EDITOR_LANG').length > 0 ? env('PINBALL_EDITOR_LANG') : env('LC_ALL').length > 0 ? env('LC_ALL') : env('LANG');
  return said.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
export const [uiLang, setUiLang] = createSignal<string>(systemLanguage());
/** The text `k` in the interface language. */
export function t(k: i32): string { return uiLang() === 'fr' ? FR[k] : EN[k]; }
/** The same with `{0}` and `{1}` filled in. */
export function f(k: i32, a: string, b: string = ''): string { return t(k).replaceAll('{0}', a).replaceAll('{1}', b); }
/** Checked by selftest.ts: every text exists in both languages. */
export function complete(): boolean {
  for (let k = 0; k < EN.length; k++) if (EN[k].length === 0 || FR[k].length === 0) return false;
  return EN.length === FR.length && EN.length > 0;
}

// ---- top bar
export const APP = S('Pinball table editor', 'Éditeur de tables de flipper');
export const NEW = S('New', 'Nouveau');
export const OPEN = S('Open', 'Ouvrir');
export const SAVE = S('Save', 'Enregistrer');
export const EXPORT = S('Export', 'Exporter');
export const EXPORT_TITLE = S('Export the table as one file', 'Exporter la table en un seul fichier');
export const PACKAGE_KIND = S('Pinball table', 'Table de flipper');
export const DONE_EXPORTED = S('Exported {0}: the table and {1} file(s) it names.', '{0} est exporté : la table et {1} fichier(s) qu’elle nomme.');
export const UNDO = S('Undo', 'Annuler');
export const REDO = S('Redo', 'Rétablir');
export const FIT = S('Fit', 'Tout voir');
export const ADVANCED = S('Advanced', 'Avancé');
export const NO_FOLDER_YET = S('Not saved yet', 'Pas encore enregistrée');
export const UNSAVED = S('Unsaved changes', 'Modifications non enregistrées');
export const INTERFACE = S('Interface', 'Interface');

// ---- the list at the left
export const CONTENTS = S('Table', 'Table');
export const THE_TABLE = S('Name and author', 'Nom et auteur');
export const ON_THE_TABLE = S('On the table', 'Sur la table');
export const MATERIALS = S('Materials and sounds', 'Matières et sons');
export const EMPTY_LIST = S('none', 'aucun');

// ---- the top view
export const TOP_VIEW = S('Top view', 'Vue de dessus');
export const PROFILE = S('Heights', 'Hauteurs');
export const PROFILE_HINT = S('The table seen from its right side: what stands how high.', 'La table vue de son côté droit : ce qui s’élève, et jusqu’où.');
export const VIEW_HINT = S('Click an element to select it, drag it to move it, drag its round handle to turn it. Drag the background to pan, the wheel zooms.',
  'Cliquez un élément pour le sélectionner, glissez-le pour le déplacer, glissez sa poignée ronde pour le tourner. Glissez le fond pour déplacer la vue, la molette zoome.');
export const CM = S('cm', 'cm');
export const SNAP = S('Snap', 'Aimant');
export const LEVEL = S('Level', 'Niveau');
export const ALL_LEVELS = S('all', 'tous');
export const SNAP_OFF = S('off', 'aucun');
export const AXIS = S('axis', 'axe');
// ---- the palette and what is being placed
export const ADD = S('Add', 'Ajouter');
export const PLACE_ONE = S('{0}: click on the table where it goes. Esc gives up.', '{0} : cliquez sur la table là où le poser. Échap abandonne.');
export const PLACE_TWO = S('{0}: click one end, then the other. Esc gives up.', '{0} : cliquez un bout, puis l’autre. Échap abandonne.');
export const PLACE_PATH = S('{0}: click each point; double-click or Enter ends, Backspace takes the last point back, Esc gives up.',
  '{0} : cliquez chaque point ; double-clic ou Entrée termine, Retour arrière reprend le dernier point, Échap abandonne.');
export const PATH_HINT = S('On the table: drag a square to move a point, a round dot to bend a stretch into an arc. Double-click a stretch to add a point; click a point, then Delete, to take it away.',
  'Sur la table : glissez un carré pour déplacer un point, un rond pour courber un tronçon en arc. Double-cliquez un tronçon pour ajouter un point ; cliquez un point, puis Suppr, pour l’enlever.');
export const PROFILE_HOW = S('The height along the path, from its start to its end. Drag a point; double-click adds one; click a point, then Delete, to take it away.',
  'La hauteur le long du tracé, du début à la fin. Glissez un point ; double-clic en ajoute un ; cliquez un point, puis Suppr, pour l’enlever.');
export const START = S('start', 'début');
export const END = S('end', 'fin');

// ---- the table in 3D and the game played in it
export const DROP = S('Drop a ball', 'Lâcher une bille');
export const DROP_HOW = S('Click the top view where the ball is to be dropped: it rolls from there, with the table\'s physics and rules.',
  'Cliquez la vue de dessus là où lâcher la bille : elle roule de là, avec la physique et les règles de la table.');
export const PLAY_HOW = S('The table as the game shows it. Drop a ball on the top view, or press Play to start a game as a player does; the flippers and the plunger answer the game\'s keys. Drag here to look from elsewhere.',
  'La table telle que le jeu la montre. Lâchez une bille sur la vue de dessus, ou appuyez sur Jouer pour commencer une partie comme un joueur ; les batteurs et le lance-bille répondent aux touches du jeu. Glissez ici pour regarder d’ailleurs.');
export const BALL_N = S('ball {0}', 'bille {0}');
export const KEYS_OF_GAME = S('Z and /: flippers   SPACE: plunger   X . UP: bump   ENTER: start', 'Z et / : batteurs   ESPACE : lance-bille   X . HAUT : secousse   ENTRÉE : jouer');
export const DONE_DROPPED = S('A ball dropped at {0}, {1} cm.', 'Une bille lâchée à {0}, {1} cm.');
export const DONE_STOPPED = S('The game is over: the table is at rest.', 'La partie est finie : la table est au repos.');
export const SCREEN_VIEW = S('Screen', 'Écran');
export const SCREEN_HOW = S('The game\'s window in this layout. Click a thing of the panel, drag it to move it, drag the square at its corner to size it.',
  'La fenêtre du jeu dans cette mise en page. Cliquez un élément du panneau, glissez-le pour le déplacer, glissez le carré de son coin pour le dimensionner.');
export const USE_VIEW = S('Use this view', 'Garder cette vue');
export const EYE_HOW = S('Drag turns the view, Shift and drag slides it over the table, the wheel comes closer. "Use this view" makes it the view of the game\'s screen layout; the arrow goes back to the layout\'s.',
  'Glisser tourne la vue, Maj et glisser la déplace au-dessus de la table, la molette rapproche. « Garder cette vue » en fait la vue de la mise en page du jeu ; la flèche revient à celle de la mise en page.');
export const DONE_VIEW_USED = S('The {0} layout now looks at the table from here.', 'La mise en page {0} regarde maintenant la table d’ici.');
export const LANDSCAPE_LAYOUT = S('landscape', 'paysage');
export const PORTRAIT_LAYOUT = S('portrait', 'portrait');
export const NO_3D = S('The table cannot be shown in 3D: {0}', 'La table ne peut pas être montrée en 3D : {0}');

// ---- the panel at the right
export const PROPERTIES = S('Properties', 'Propriétés');
export const NOTHING_SELECTED = S('Nothing is selected: this is the table itself. Click an element on the table, or a line of the list at the left.',
  'Rien n’est sélectionné : voici la table elle-même. Cliquez un élément sur la table, ou une ligne de la liste à gauche.');
export const DELETE = S('Delete', 'Supprimer');
export const DUPLICATE = S('Duplicate', 'Dupliquer');
export const LISTEN = S('Listen', 'Écouter');
export const MIRROR = S('Mirror', 'Miroir');
export const TURN_LEFT = S('Turn left', 'Tourner à gauche');
export const TURN_RIGHT = S('Turn right', 'Tourner à droite');
export const NONE = S('none', 'aucun');
export const DEFAULT = S('Default: {0}', 'Par défaut : {0}');
export const BACK_TO_DEFAULT = S('Back to the default', 'Revenir à la valeur par défaut');
export const LIMITS = S('From {0} to {1}', 'De {0} à {1}');
export const AT_LEAST = S('{0} or more', '{0} ou plus');
export const AT_MOST = S('{0} or less', '{0} ou moins');
export const REQUIRED = S('Required', 'Obligatoire');
export const KEY_IN_FILE = S('In the file: {0}', 'Dans le fichier : {0}');
export const FIND_FIELD = S('Find a field ({0})', 'Trouver un champ ({0})');
export const NO_FIELD = S('No field here is called "{0}".', 'Aucun champ ici ne s’appelle « {0} ».');
export const GO_TO = S('Go to… ({0})', 'Aller à… ({0})');
export const NOT_FOUND = S('Nothing in this table is called "{0}".', 'Rien dans cette table ne s’appelle « {0} ».');
export const HELP = S('Help', 'Aide');
export const HELP_HINT = S('Point at a field to read what it does.', 'Pointez un champ pour lire à quoi il sert.');
export const ROWS = S('{0} rows', '{0} lignes');
export const POINTS = S('{0} points', '{0} points');
export const ITEMS = S('{0} items', '{0} éléments');
export const ONE_PER_LINE = S('One per line', 'Un par ligne');
export const IN_FILE = S('In the file', 'Dans le fichier');
export const IN_FILE_HINT = S('The selection as the file has it. Edit it and leave the field: it is checked like a file.',
  'La sélection telle que le fichier l’écrit. Modifiez-la puis quittez le champ : elle est vérifiée comme un fichier.');
export const YES = S('Yes', 'Oui');
export const NO = S('No', 'Non');

export const COLOURS_IN_USE = S('In this table', 'Dans cette table');

// ---- the files of the table's folder
export const FILES = S('Files', 'Fichiers');
export const FILES_NEED_FOLDER = S('Save the table once: its folder then holds its images, sounds and models.', 'Enregistrez la table une fois : son dossier contient alors ses images, ses sons et ses modèles.');
export const UNUSED = S('unused', 'inutilisé');
export const IMPORT = S('Import…', 'Importer…');
export const REFRESH = S('Refresh', 'Actualiser');
export const IMPORT_TITLE = S('A file to copy into the folder of the table', 'Un fichier à copier dans le dossier de la table');
export const FILE_MISSING = S('not in the folder', 'absent du dossier');
export const SECONDS_LONG = S('{0} s', '{0} s');
export const TRIANGLES = S('{0} triangles', '{0} triangles');
export const ASK_REPLACE = S('The folder of the table already has {0}. Replace it?', 'Le dossier de la table contient déjà {0}. Le remplacer ?');
export const NOT_REPLACED = S('{0} was kept as it is.', '{0} est resté tel quel.');
export const CANNOT_IMPORT = S('Cannot import {0}: {1}', 'Impossible d’importer {0} : {1}');
export const DONE_IMPORTED = S('Imported {0} into the folder of the table.', '{0} est importé dans le dossier de la table.');
export const NOTHING_IMPORTED = S('Nothing was imported.', 'Rien n’a été importé.');
export const FILES_READ = S('files: {0} in the folder.', 'fichiers : {0} dans le dossier.');
export const FILES_UNUSED = S('{0} unused: {1}.', '{0} inutilisé(s) : {1}.');
export const FILES_MISSING = S('{0} missing: {1}.', '{0} absent(s) : {1}.');
export const FILE_UNUSED = S('{0}: nothing in the table names this file.', '{0} : rien dans la table ne nomme ce fichier.');
export const FILE_USED = S('{0}: named by {1}.', '{0} : nommé par {1}.');

// ---- status
export const READY = S('Ready.', 'Prêt.');
export const DONE_OPENED = S('Opened {0}.', '{0} est ouvert.');
export const DONE_NOT_CANONICAL = S('Opened {0}. The file is not written as the editor writes it: Save rewrites it, without changing the table.',
  '{0} est ouvert. Le fichier n’est pas écrit comme l’éditeur l’écrit : Enregistrer le réécrit, sans changer la table.');
export const DONE_NEW = S('A new table: a board, a ball and a plunger.', 'Une nouvelle table : un plateau, une bille et un lance-bille.');
export const DONE_SAVED = S('Saved {0}.', '{0} est enregistré.');
export const CANNOT_OPEN = S('Cannot open {0}: {1}', 'Impossible d’ouvrir {0} : {1}');
export const CANNOT_SAVE = S('Cannot save {0}: {1}', 'Impossible d’enregistrer {0} : {1}');
export const NOT_SAVED = S('Not saved.', 'Rien n’a été enregistré.');
export const NOTHING_OPENED = S('Nothing was opened.', 'Rien n’a été ouvert.');
export const REFUSED = S('Not done: {0}', 'Refusé : {0}');
export const DONE = S('{0}.', '{0}.');
export const DONE_DELETED_WITH = S('{0}, with {1} that needed it.', '{0}, avec {1} qui en dépendaient.');
export const ONE_OTHER = S('1 thing', '1 chose');
export const N_OTHERS = S('{0} things', '{0} choses');
export const DONE_UNDONE = S('Undone: {0}.', 'Annulé : {0}.');
export const DONE_REDONE = S('Redone: {0}.', 'Rétabli : {0}.');
export const UNDO_NEXT = S('Undo: {0}', 'Annuler : {0}');
export const SELECTED = S('{0} selected.', '{0} est sélectionné.');
export const OPEN_TITLE = S('Open a table folder', 'Ouvrir le dossier d’une table');
export const SAVE_TITLE = S('The folder of the table', 'Le dossier de la table');

// ---- questions
export const ASK_SAVE = S('Save the changes?', 'Enregistrer les modifications ?');
export const ASK_SAVE_WHY = S('The table has changes that are not in its file yet.', 'La table a des modifications qui ne sont pas encore dans son fichier.');
export const CANCEL = S('Cancel', 'Annuler');
export const DO_NOT_SAVE = S('Do not save', 'Ne pas enregistrer');

// ---- the rules as a person says them
export const KIND_NEEDS = S('"{0}" needs one of the {1}, and the table has none yet: add one first.', '« {0} » a besoin d’un nom parmi : {1}, et la table n’en a pas encore : ajoutez-en d’abord.');
export const RULE_SAID = S('{0}: {1}', '{0} : {1}');
export const RULE_IF = S('{0}, if {1}', '{0}, si {1}');
export const AND = S(' and ', ' et ');
export const THEN = S('; ', ' ; ');
export const NOT_READ = S('not used here', 'sans effet ici');
export const SCORES = S('Scores', 'Scores');
export const SCORES_HOW = S('The points a thing always gives at an event; 0 for none. What depends on a condition is a rule, at the right.',
  'Les points qu’une chose donne toujours à un évènement ; 0 pour aucun. Ce qui dépend d’une condition est une règle, à droite.');
export const FIND_SCORE = S('Find a thing ({0})', 'Trouver une chose ({0})');
export const NO_SCORES = S('Nothing here sends an event to the rules.', 'Rien ici n’envoie d’évènement aux règles.');

// A sentence per kind of condition and of action, in each language ("say.<object>.<kind>", and "say.<object>.<kind>.<way>" when
// the sentence changes with the way): `{target}`, `{way}` and the numbers (`{value}`, `{seconds}`) are the parts that are chosen or
// typed, at the place the language puts them. The words of a way and of a target are said by "word.<object>.<kind>.<word>", else by
// "word.<word>"; the menus that offer the kinds by "kind.<object>.<kind>"; what happens, by "when.<event>" (a rule), with `{on}`
// where the event comes from. A kind added to the format that has no sentence here yet is said by its word and what it reads
// (sentences.ts).
const PHRASES: string[] = [
  'empty.if', 'No condition: the rule always acts.', 'Aucune condition : la règle agit toujours.', 'empty.do', 'Nothing yet.', 'Rien pour l’instant.',
  'say.condition.counter', 'the counter {target} is {way} {value}', 'le compteur {target} vaut {way} {value}',
  'say.condition.lights', 'the lights of {target} are all {way}', 'les lampes de {target} sont toutes {way}',
  'say.condition.targets', 'the targets of {target} are all {way}', 'les cibles de {target} sont toutes {way}',
  'say.condition.mode', 'the game is in {target}', 'la partie est en {target}',
  'say.condition.rank', 'the rank is {way} {value}', 'le grade vaut {way} {value}',
  'say.condition.mission', 'the current mission is {target}', 'la mission en cours est {target}',
  'say.condition.balls', 'there are {way} {value} balls in play', 'il y a {way} {value} billes en jeu',
  'say.action.score', 'add {value} points', 'ajouter {value} points',
  'say.action.bonus', 'add {value} to the bonus', 'ajouter {value} au bonus',
  'say.action.multiplier', 'raise the bonus multiplier by {value}', 'augmenter le multiplicateur de bonus de {value}',
  'say.action.light', '{way} the lights of {target}', '{way} les lampes de {target}',
  'say.action.light.flash', '{way} the lights of {target} for {seconds} s', '{way} les lampes de {target} pendant {seconds} s',
  'say.action.count', 'counter {target}: {way} {value}', 'compteur {target} : {way} {value}',
  'say.action.reset', 'raise the targets of {target}', 'relever les cibles de {target}',
  'say.action.say', 'show {target} on the panel', 'afficher {target} sur le panneau',
  'say.action.sound', 'play the sound {target}', 'jouer le son {target}',
  'say.action.award', 'award {way}', 'accorder {way}',
  'say.action.award.ballSave', 'award {way} for {seconds} s', 'accorder {way} pendant {seconds} s',
  'say.action.rotate', 'shift the lit lights of {target} by {value}', 'décaler les lampes allumées de {target} de {value}',
  'word.atLeast', 'at least', 'au moins', 'word.below', 'less than', 'moins de', 'word.equal', 'exactly', 'exactement',
  'word.self', 'the element itself', 'l’élément lui-même',
  'word.condition.lights.on', 'on', 'allumées', 'word.condition.lights.off', 'off', 'éteintes',
  'word.condition.targets.down', 'down', 'tombées', 'word.condition.targets.up', 'up', 'relevées',
  'word.condition.mode.normal', 'normal play', 'jeu normal', 'word.condition.mode.multiball', 'multiball', 'multibille',
  'word.action.light.on', 'turn on', 'allumer', 'word.action.light.off', 'turn off', 'éteindre', 'word.action.light.blink', 'blink', 'faire clignoter',
  'word.action.light.flash', 'flash', 'faire flasher', 'word.action.light.toggle', 'toggle', 'inverser',
  'word.action.count.', 'add', 'ajouter', 'word.action.count.set', 'set to', 'mettre à',
  'word.action.award.extraBall', 'an extra ball', 'une bille supplémentaire', 'word.action.award.ballSave', 'a ball save', 'une bille sauvée',
  'word.action.award.lock', 'a ball lock', 'un verrouillage de bille', 'word.action.award.multiball', 'multiball', 'le multibille',
  'word.action.award.mission', 'a step of the mission', 'une étape de la mission',
  'kind.condition.counter', 'A counter', 'Un compteur', 'kind.condition.lights', 'Lights on or off', 'Des lampes allumées ou éteintes',
  'kind.condition.targets', 'Targets down or up', 'Des cibles tombées ou relevées', 'kind.condition.mode', 'Normal play or multiball', 'Jeu normal ou multibille',
  'kind.condition.rank', 'The rank of the player', 'Le grade du joueur', 'kind.condition.mission', 'The current mission', 'La mission en cours',
  'kind.condition.balls', 'The balls in play', 'Les billes en jeu',
  'kind.action.score', 'Add points', 'Ajouter des points', 'kind.action.bonus', 'Add to the bonus', 'Ajouter au bonus',
  'kind.action.multiplier', 'Raise the bonus multiplier', 'Augmenter le multiplicateur de bonus', 'kind.action.light', 'Change lights', 'Changer des lampes',
  'kind.action.count', 'Change a counter', 'Changer un compteur', 'kind.action.reset', 'Raise drop targets', 'Relever des cibles tombantes',
  'kind.action.say', 'Show a text', 'Afficher un texte', 'kind.action.sound', 'Play a sound', 'Jouer un son',
  'kind.action.award', 'Award something', 'Accorder quelque chose', 'kind.action.rotate', 'Shift the lit lights', 'Décaler les lampes allumées',
  // a step of a mission, as the panel asks a player for it ("say.step.<event>"): the part in square brackets is said only when
  // the event is wanted more than once. A new step shows this text on the panel until someone types another.
  'empty.steps', 'No step yet.', 'Aucune étape pour l’instant.',
  'say.step.hit', 'Hit {target}[ {count} times]', 'Toucher {target}[ {count} fois]',
  'say.step.down', 'Knock down {target}[ {count} times]', 'Faire tomber {target}[ {count} fois]',
  'say.step.roll', 'Roll over {target}[ {count} times]', 'Rouler sur {target}[ {count} fois]',
  'say.step.spin', 'Spin {target}[ {count} times]', 'Faire tourner {target}[ {count} fois]',
  'say.step.capture', 'Shoot into {target}[ {count} times]', 'Entrer dans {target}[ {count} fois]',
  'say.step.eject', 'Come out of {target}[ {count} times]', 'Ressortir de {target}[ {count} fois]',
  'say.step.enter', 'Enter {target}[ {count} times]', 'Entrer sur {target}[ {count} fois]',
  'say.step.exit', 'Ride {target} to its end[ {count} times]', 'Parcourir {target} jusqu’au bout[ {count} fois]',
  'say.step.pass', 'Pass {target}[ {count} times]', 'Franchir {target}[ {count} fois]',
  'say.step.flip', 'Flip {target}[ {count} times]', 'Actionner {target}[ {count} fois]',
  'say.step.start', 'Start a game[ {count} times]', 'Commencer une partie[ {count} fois]',
  'say.step.ballStart', 'Bring a ball into play[ {count} times]', 'Mettre une bille en jeu[ {count} fois]',
  'say.step.drain', 'Lose a ball[ {count} times]', 'Perdre une bille[ {count} fois]',
  'say.step.ballSaved', 'Get a ball saved[ {count} times]', 'Faire sauver une bille[ {count} fois]',
  'say.step.bump', 'Bump the table[ {count} times]', 'Secouer la table[ {count} fois]',
  'say.step.tilt', 'Tilt the table[ {count} times]', 'Faire tilter la table[ {count} fois]',
  'say.step.missionDone', 'Finish a mission[ {count} times]', 'Accomplir une mission[ {count} fois]',
  'say.step.rankUp', 'Be promoted[ {count} times]', 'Monter en grade[ {count} fois]',
  'say.step.multiballStart', 'Start multiball[ {count} times]', 'Lancer le multibille[ {count} fois]',
  'say.step.multiballEnd', 'End multiball[ {count} times]', 'Terminer le multibille[ {count} fois]',
  'say.step.jackpot', 'Score a jackpot[ {count} times]', 'Marquer un jackpot[ {count} fois]',
  'say.step.extraBall', 'Win an extra ball[ {count} times]', 'Gagner une bille supplémentaire[ {count} fois]',
  'say.step.gameOver', 'End the game[ {count} times]', 'Finir la partie[ {count} fois]',
  'say.step.letter', 'Sign a letter of a high score[ {count} times]', 'Valider une lettre de ses initiales[ {count} fois]',
  // an event in a word, for the head of a column ("event.<event>")
  'event.hit', 'Hit', 'Choc', 'event.down', 'Down', 'Chute', 'event.roll', 'Roll', 'Passage', 'event.spin', 'Spin', 'Tour', 'event.capture', 'Capture', 'Capture',
  'event.eject', 'Eject', 'Éjecté', 'event.enter', 'Enter', 'Entrée', 'event.exit', 'Exit', 'Sortie', 'event.pass', 'Pass', 'Franchi', 'event.flip', 'Flip', 'Batteur',
  'when.hit', 'When the ball hits {on}', 'Quand la bille touche {on}',
  'when.down', 'When the ball knocks {on} down', 'Quand la bille fait tomber {on}',
  'when.roll', 'When the ball rolls over {on}', 'Quand la bille roule sur {on}',
  'when.spin', 'When the ball spins {on}', 'Quand la bille fait tourner {on}',
  'when.capture', 'When {on} catches the ball', 'Quand {on} capture la bille',
  'when.eject', 'When {on} throws the ball out', 'Quand {on} éjecte la bille',
  'when.enter', 'When the ball enters {on}', 'Quand la bille entre sur {on}',
  'when.exit', 'When the ball leaves {on}', 'Quand la bille sort de {on}',
  'when.pass', 'When the ball passes {on}', 'Quand la bille franchit {on}',
  'when.flip', 'When the player flips {on}', 'Quand le joueur actionne {on}',
  'when.launch', 'When {on} launches the ball', 'Quand {on} lance la bille',
  'when.start', 'When a game starts', 'Quand une partie commence',
  'when.ballStart', 'When a ball comes into play', 'Quand une bille entre en jeu',
  'when.drain', 'When a ball is lost', 'Quand une bille est perdue',
  'when.ballSaved', 'When a ball is saved', 'Quand une bille est sauvée',
  'when.bump', 'When the player bumps the table', 'Quand le joueur secoue la table',
  'when.tilt', 'When the table tilts', 'Quand la table tilte',
  'when.missionDone', 'When a mission is done', 'Quand une mission est accomplie',
  'when.rankUp', 'When the player is promoted', 'Quand le joueur monte en grade',
  'when.multiballStart', 'When multiball starts', 'Quand le multibille commence',
  'when.multiballEnd', 'When multiball ends', 'Quand le multibille se termine',
  'when.jackpot', 'When a jackpot is scored', 'Quand un jackpot est marqué',
  'when.extraBall', 'When an extra ball is won', 'Quand une bille supplémentaire est gagnée',
  'when.gameOver', 'When the game is over', 'Quand la partie est finie',
  'when.letter', 'When the player signs a letter of a high score', 'Quand le joueur valide une lettre de ses initiales',
];
/** The sentence or the word of a key, in the interface language; '' when the table above has none. */
export function phrase(key: string): string {
  for (let i = 0; i < PHRASES.length; i += 3) if (PHRASES[i] === key) return PHRASES[i + (uiLang() === 'fr' ? 2 : 1)];
  return '';
}
/** The parts a sentence names, in alphabetical order: "target value way". */
function slotsOf(text: string): string { return text.split('{').slice(1).map((part: string) => part.slice(0, part.indexOf('}'))).sort((a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0).join(' '); }
/** Checked by selftest.ts: every sentence exists in both languages, with the same parts in each, and no key is there twice. */
export function phrasesComplete(): boolean {
  for (let i = 0; i < PHRASES.length; i += 3) {
    if (PHRASES[i + 1].length === 0 || PHRASES[i + 2].length === 0 || slotsOf(PHRASES[i + 1]) !== slotsOf(PHRASES[i + 2])) return false;
    for (let k = 0; k < i; k += 3) if (PHRASES[k] === PHRASES[i]) return false;
  }
  return PHRASES.length % 3 === 0;
}
/** A number as a sentence writes it: 25,000 in English, 25 000 in French. */
export function amount(n: number): string {
  const whole = Math.floor(Math.abs(n)), rest = `${Math.abs(n)}`.slice(`${whole}`.length);
  let digits = `${whole}`, out = '';
  while (digits.length > 3) { out = `${uiLang() === 'fr' ? ' ' : ','}${digits.slice(digits.length - 3)}${out}`; digits = digits.slice(0, digits.length - 3); }
  return `${n < 0 ? '-' : ''}${digits}${out}${uiLang() === 'fr' ? rest.replaceAll('.', ',') : rest}`;
}

// ---- the steps Undo names: the document's labels (doc.ts) are "<verb> <what>", the verb in English
const VERBS: string[] = ['Move', 'Déplacer', 'Turn', 'Tourner', 'Delete', 'Supprimer', 'Change', 'Modifier', 'Edit', 'Modifier', 'Add', 'Ajouter', 'Duplicate', 'Dupliquer',
  'Mirror', 'Miroir de'];
/** The name of an undo step in the interface language. */
export function step(label: string): string {
  const cut = label.indexOf(' '), verb = cut < 0 ? label : label.slice(0, cut), at = VERBS.indexOf(verb);
  return uiLang() === 'fr' && at >= 0 && at % 2 === 0 ? VERBS[at + 1] + label.slice(verb.length) : label;
}

// ---------------------------------------------------------------- the names of the format

/** "baseRadius" gives "Base radius". */
export function readable(key: string): string {
  let out = '';
  for (let i = 0; i < key.length; i++) {
    const ch = key.charAt(i), c = ch.charCodeAt(0);
    if (i === 0) out += ch.toUpperCase();
    else if (c >= 65 && c <= 90) out += ` ${ch.toLowerCase()}`;
    else out += ch;
  }
  return out;
}
// key, several in English, several in French, one in English, one in French
const LISTS: string[] = [
  'surfaces', 'Surfaces', 'Surfaces', 'Surface', 'Surface',
  'looks', 'Looks', 'Aspects', 'Look', 'Aspect',
  'sounds', 'Sounds', 'Sons', 'Sound', 'Son',
  'walls', 'Walls and guides', 'Murs et guides', 'Wall', 'Mur',
  'gates', 'Gates', 'Portillons', 'Gate', 'Portillon',
  'flippers', 'Flippers', 'Batteurs', 'Flipper', 'Batteur',
  'bumpers', 'Bumpers', 'Bumpers', 'Bumper', 'Bumper',
  'slingshots', 'Slingshots', 'Slingshots', 'Slingshot', 'Slingshot',
  'kickers', 'Kickers', 'Trous éjecteurs', 'Kicker', 'Trou éjecteur',
  'targets', 'Targets', 'Cibles', 'Target', 'Cible',
  'rollovers', 'Rollovers', 'Contacts de passage', 'Rollover', 'Contact de passage',
  'spinners', 'Spinners', 'Tourniquets', 'Spinner', 'Tourniquet',
  'ramps', 'Ramps and rails', 'Rampes et rails', 'Ramp', 'Rampe',
  'floors', 'Upper playfields', 'Plateaux supérieurs', 'Upper playfield', 'Plateau supérieur',
  'lights', 'Lights', 'Lampes', 'Light', 'Lampe',
  'models', 'Models', 'Décors', 'Model', 'Décor',
  'credits', 'Credits', 'Crédits', 'Credit', 'Crédit',
  'playfield', 'Playfield', 'Plateau', 'Playfield', 'Plateau',
  'physics', 'Physics', 'Physique', 'Physics', 'Physique',
  'music', 'Music', 'Musique', 'Music', 'Musique',
  'plunger', 'Plunger', 'Lance-bille', 'Plunger', 'Lance-bille',
  'rules', 'Rules', 'Règles', 'Rules', 'Règles',
  'lighting', 'Lighting', 'Éclairage', 'Lighting', 'Éclairage',
  'layouts', 'Screen layouts', 'Mises en page', 'Screen layouts', 'Mises en page',
  '', 'Table', 'Table', 'Table', 'Table'];
/** The name of a list or an object of the table, for several of its items or for one. */
export function listName(key: string, one: boolean): string {
  for (let i = 0; i < LISTS.length; i += 5) if (LISTS[i] === key) return LISTS[i + (one ? 3 : 1) + (uiLang() === 'fr' ? 1 : 0)];
  return readable(key);
}
// what the format calls the items of the lists that are inside other things, in English and in French
const KINDS: string[] = ['rule', 'Rule', 'Règle', 'condition', 'Condition', 'Condition', 'action', 'Action', 'Action', 'mission', 'Mission', 'Mission', 'step', 'Step', 'Étape',
  'high score', 'High score', 'Meilleur score', 'lamp', 'Lamp', 'Projecteur', 'panel item', 'Thing on the panel', 'Élément du panneau', 'layout', 'Screen layout', 'Mise en page',
  'camera', 'Camera', 'Caméra', 'panel', 'Panel', 'Panneau', 'ball', 'Ball', 'Bille', 'tilt', 'Tilt', 'Tilt', 'multiball', 'Multiball', 'Multibille'];
/** The name of a kind of object of the format ("rule", "step"), for one of them. */
export function kindName(kind: string): string {
  for (let i = 0; i < KINDS.length; i += 3) if (KINDS[i] === kind) return KINDS[i + (uiLang() === 'fr' ? 2 : 1)];
  return readable(kind);
}
// key, in English ('' for the key made readable), in French
const FIELDS: string[] = [
  'id', 'Name', 'Nom', 'group', 'Group', 'Groupe', 'name', 'Name', 'Nom', 'author', 'Author', 'Auteur', 'description', 'Description', 'Description',
  'format', 'Format', 'Format', 'version', 'Version', 'Version',
  'friction', 'Friction', 'Adhérence', 'restitution', 'Bounce', 'Rebond', 'color', 'Colour', 'Couleur', 'shading', 'Shading', 'Rendu', 'specular', 'Highlights', 'Reflets',
  'shininess', 'Shininess', 'Brillance', 'glow', 'Glow', 'Lueur', 'texture', 'Image', 'Image',
  'file', 'File', 'Fichier', 'wave', 'Wave', 'Onde', 'hz', 'Pitch (Hz)', 'Hauteur (Hz)', 'seconds', 'Seconds', 'Secondes', 'volume', 'Volume', 'Volume',
  'volumeVariation', 'Volume variation', 'Variation du volume', 'pitch', 'Speed', 'Vitesse de lecture', 'pitchVariation', 'Pitch variation', 'Variation de hauteur', 'loop', 'Loop', 'En boucle',
  'attract', 'Waiting for a player', 'En attente d’un joueur', 'play', 'During a ball', 'Pendant une bille', 'multiball', 'Multiball', 'Multibille', 'gameOver', 'Game over', 'Fin de partie',
  'width', 'Width', 'Largeur', 'length', 'Length', 'Longueur', 'slope', 'Slope', 'Pente', 'glass', 'Glass height', 'Hauteur de la vitre', 'surface', 'Surface', 'Surface', 'look', 'Look', 'Aspect',
  'radius', 'Radius', 'Rayon', 'mass', 'Mass', 'Masse', 'drag', 'Drag', 'Freinage', 'spin', 'Spin loss', 'Perte de rotation', 'rate', 'Steps per second', 'Pas par seconde',
  'gravity', 'Gravity', 'Gravité', 'maxSpeed', 'Top speed', 'Vitesse maximale', 'nudge', 'Nudge', 'Secousse', 'ball', 'Ball', 'Bille',
  'points', 'Path', 'Tracé', 'closed', 'Closed', 'Fermé', 'z', 'Stands at height', 'Posé à la hauteur', 'height', 'Height', 'Hauteur', 'thickness', 'Thickness', 'Épaisseur',
  'sounds', 'Sounds', 'Sons', 'hit', 'Hit', 'Choc', 'a', 'End A', 'Bout A', 'b', 'End B', 'Bout B', 'pass', 'Passage', 'Passage', 'pivot', 'Pivot', 'Pivot',
  'baseRadius', 'Radius at the pivot', 'Rayon au pivot', 'tipRadius', 'Radius at the tip', 'Rayon au bout', 'rest', 'Angle at rest', 'Angle au repos', 'stroke', 'Swing', 'Course',
  'speed', 'Speed', 'Vitesse', 'returnSpeed', 'Return speed', 'Vitesse de retour', 'button', 'Button', 'Bouton', 'up', 'Up', 'Montée', 'down', 'Down', 'Descente',
  'at', 'Place', 'Position', 'angle', 'Angle', 'Angle', 'travel', 'Travel', 'Course', 'pullTime', 'Time to pull', 'Durée du tirage', 'pull', 'Pull', 'Tirage', 'release', 'Release', 'Lâcher',
  'kick', 'Kick', 'Force', 'threshold', 'Threshold', 'Seuil', 'cap', 'Cap', 'Chapeau', 'captureSpeed', 'Capture speed', 'Vitesse de capture', 'hold', 'Hold', 'Retenue',
  'exit', 'Exit', 'Sortie', 'elevation', 'Elevation', 'Élévation', 'light', 'Light', 'Lampe', 'capture', 'Capture', 'Capture', 'eject', 'Eject', 'Éjection',
  'kind', 'Kind', 'Type', 'reset', 'Reset', 'Remontée', 'roll', 'Roll', 'Passage', 'turns', 'Turns', 'Tours', 'damping', 'Damping', 'Amortissement',
  'profile', 'Height profile', 'Profil de hauteur', 'wall', 'Side walls', 'Bords', 'style', 'Style', 'Style', 'skirt', 'Closed underneath', 'Fermée dessous', 'enter', 'Entry', 'Entrée',
  'shape', 'Shape', 'Forme', 'size', 'Size', 'Taille', 'mesh', 'Model file', 'Fichier du modèle', 'rotation', 'Rotation', 'Rotation', 'scale', 'Size', 'Taille', 'collide', 'Collision', 'Collision',
  'test', 'Test', 'Test', 'target', 'Target', 'Cible', 'is', 'Is', 'Est', 'value', 'Value', 'Valeur', 'do', 'Do', 'Faire', 'mode', 'Mode', 'Mode', 'on', 'From', 'Venant de',
  'event', 'Event', 'Évènement', 'if', 'If', 'Si', 'text', 'Text', 'Texte', 'count', 'Times', 'Fois', 'award', 'Award', 'Prime', 'steps', 'Steps', 'Étapes',
  'balls', 'Balls', 'Billes', 'locks', 'Locks', 'Verrouillages', 'lockLights', 'Lock lights', 'Lampes de verrouillage', 'ballSave', 'Ball save', 'Bille sauvée',
  'scoreMultiplier', 'Score multiplier', 'Multiplicateur de score', 'jackpotOn', 'Jackpot shot', 'Tir du jackpot', 'jackpotEvent', 'Jackpot event', 'Évènement du jackpot',
  'jackpot', 'Jackpot', 'Jackpot', 'jackpotStep', 'Jackpot growth', 'Croissance du jackpot', 'warnings', 'Warnings', 'Avertissements', 'recovery', 'Recovery', 'Récupération',
  'penalty', 'Penalty', 'Pénalité', 'score', 'Score', 'Score', 'extraBalls', 'Extra balls', 'Billes supplémentaires', 'multiplierMax', 'Highest multiplier', 'Multiplicateur maximal',
  'tilt', 'Tilt', 'Tilt', 'ranks', 'Ranks', 'Grades', 'rankLights', 'Rank lights', 'Lampes des grades', 'ballSaveLight', 'Ball save light', 'Lampe de bille sauvée',
  'counters', 'Counters', 'Compteurs', 'missions', 'Missions', 'Missions', 'when', 'Rules', 'Règles', 'highScores', 'High scores', 'Meilleurs scores',
  'position', 'Position', 'Position', 'fov', 'Field of view', 'Champ de vision', 'show', 'Shows', 'Affiche', 'box', 'Box', 'Cadre', 'align', 'Alignment', 'Alignement',
  'label', 'Caption', 'Légende', 'items', 'Items', 'Éléments', 'window', 'Window', 'Fenêtre', 'view', 'Table view', 'Vue de la table', 'camera', 'Camera', 'Caméra', 'panel', 'Panel', 'Panneau',
  'landscape', 'Landscape', 'Paysage', 'portrait', 'Portrait', 'Portrait', 'direction', 'Direction', 'Direction', 'lamps', 'Lamps', 'Projecteurs', 'background', 'Background', 'Fond',
  'ambient', 'Ambient light', 'Lumière ambiante', 'files', 'Files', 'Fichiers', 'source', 'Source', 'Source', 'licence', 'Licence', 'Licence',
  'land', 'Landing', 'Chute', 'knock', 'Knock', 'Coup sourd', 'textureLit', 'Image when lit', 'Image éclairée', 'general', 'General lighting', 'Éclairage général',
  'dimmed', 'Light left when it is off', 'Lumière qui reste éteint', 'image', 'Image', 'Image', 'light groups', 'Light groups', 'Groupes de lampes'];
/** The label of a field of the format. */
export function fieldName(key: string): string {
  for (let i = 0; i < FIELDS.length; i += 3) if (FIELDS[i] === key) return FIELDS[i + (uiLang() === 'fr' ? 2 : 1)];
  return listNamed(key) ? listName(key, false) : readable(key);
}
function listNamed(key: string): boolean {
  for (let i = 0; i < LISTS.length; i += 5) if (LISTS[i] === key && key.length > 0) return true;
  return false;
}
/** Whether the tables above know a field of the format (selftest.ts lists the ones they do not). */
export function fieldKnown(key: string): boolean {
  for (let i = 0; i < FIELDS.length; i += 3) if (FIELDS[i] === key) return true;
  return listNamed(key);
}
