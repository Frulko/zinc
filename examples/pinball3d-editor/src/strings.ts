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
export const PLAY_HOW = S('The table as the game shows it. Drop a ball on the top view, or press Play to start a game as a player does; the flippers and the plunger answer the game\'s keys.',
  'La table telle que le jeu la montre. Lâchez une bille sur la vue de dessus, ou appuyez sur Jouer pour commencer une partie comme un joueur ; les batteurs et le lance-bille répondent aux touches du jeu.');
export const BALL_N = S('ball {0}', 'bille {0}');
export const KEYS_OF_GAME = S('Z and /: flippers   SPACE: plunger   X . UP: bump   ENTER: start', 'Z et / : batteurs   ESPACE : lance-bille   X . HAUT : secousse   ENTRÉE : jouer');
export const DONE_DROPPED = S('A ball dropped at {0}, {1} cm.', 'Une bille lâchée à {0}, {1} cm.');
export const DONE_STOPPED = S('The game is over: the table is at rest.', 'La partie est finie : la table est au repos.');
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
  'dimmed', 'Light left when it is off', 'Lumière qui reste éteint', 'image', 'Image', 'Image'];
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
