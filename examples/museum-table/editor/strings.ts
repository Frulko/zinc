// Every text of the editor's own interface, in English and in French: the one table the views read (`t(L.SAVE)`), so that no view holds a
// sentence. The interface language is the system's, with a switch in the status bar; it is not the language of the content (the project's
// languages, switched in the top bar). `{0}`, `{1}` stand for what `f` is given.
import { createSignal } from 'zinc:ui/solid';
import { env, locale } from 'zinc:sys';

const EN: string[] = [], FR: string[] = [];
function S(en: string, fr: string): i32 { EN.push(en); FR.push(fr); return EN.length - 1; }

/** French when the system's preferred language is, English otherwise. MUSEUM_EDITOR_LANG=en|fr forces it (tests). */
function systemLanguage(): string {
  const said = env('MUSEUM_EDITOR_LANG').length > 0 ? env('MUSEUM_EDITOR_LANG') : locale();
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
export const NEW = S('New', 'Nouveau');
export const OPEN = S('Open', 'Ouvrir');
export const SAVE = S('Save', 'Enregistrer');
export const SAVE_AS = S('Save as', 'Enregistrer sous');
export const UNDO = S('Undo', 'Annuler');
export const REDO = S('Redo', 'Rétablir');
export const NEW_SEQUENCE = S('New sequence', 'Nouvelle séquence');
export const FIT = S('Fit', 'Tout voir');
export const ADVANCED = S('Advanced', 'Avancé');
export const NOT_SAVED_YET = S('Not saved yet', 'Pas encore enregistré');
export const UNSAVED = S('Unsaved changes', 'Modifications non enregistrées');
export const CONTENT = S('Content', 'Contenu');
export const INTERFACE = S('Interface', 'Interface');
export const STORYBOARD = S('Storyboard', 'Storyboard');
export const BACK = S('Back to the storyboard', 'Retour au storyboard');
export const PLAY_FROM_HERE = S('Play from here', 'Lire d’ici');
export const IN_WINDOW = S('In a window', 'Dans une fenêtre');

// ---- the preview
export const BACK_TO_EDITING = S('Back to editing', 'Retour à l’édition');
export const PREVIEW = S('Preview', 'Aperçu');
export const PREVIEW_HINT = S('The table as visitors will see it, with the changes not saved yet. The mouse is one finger; Escape comes back.',
  'La table telle que les visiteurs la verront, avec les modifications non enregistrées. La souris est un doigt ; Échap revient.');
export const PREVIEW_TITLE = S('Museum table: preview', 'Table de musée : aperçu');
export const NOTHING_TO_PLAY = S('Nothing to play yet: create a sequence first.', 'Rien à lire pour l’instant : créez d’abord une séquence.');
export const PLAYING_FROM = S('Playing from "{0}".', 'Lecture à partir de « {0} ».');
export const BACK_IN_EDITOR = S('Back to editing: nothing done in the preview changed the project.', 'Retour à l’édition : rien de ce qui a été fait dans l’aperçu n’a changé le projet.');
export const WINDOW_OPENED = S('The preview window follows your work: it shows the sequence being edited.', 'La fenêtre d’aperçu suit votre travail : elle montre la séquence en cours d’édition.');
export const WINDOW_CLOSED = S('Preview window closed.', 'Fenêtre d’aperçu fermée.');
export const NO_WINDOW = S('This computer cannot open a second window: use "Play from here".', 'Cet ordinateur ne peut pas ouvrir de seconde fenêtre : utilisez « Lire d’ici ».');
export const PREVIEW_FAULT = S('The table could not show this: {0}', 'La table n’a pas pu montrer ceci : {0}');

// ---- storyboard
export const EMPTY_TITLE = S('Start the storyboard', 'Commencer le storyboard');
export const EMPTY_WHAT = S('A project is a set of sequences, each showing media on the table, joined by links that visitors follow.',
  'Un projet est un ensemble de séquences, qui montrent chacune des médias sur la table, reliées par des liens que suivent les visiteurs.');
export const EMPTY_HOW = S('Double-click anywhere here to create the first sequence.', 'Double-cliquez ici, n’importe où, pour créer la première séquence.');
export const BOARD_HINT = S('Drag a sequence to move it, its handle to link it to another. Double-click a sequence to open it, the background for a new one. The wheel zooms.',
  'Glissez une séquence pour la déplacer, sa poignée pour la relier à une autre. Double-clic sur une séquence pour l’ouvrir, sur le fond pour en créer une. La molette zoome.');
export const NO_MEDIA_YET = S('No media yet', 'Pas encore de média');

// ---- panels of the storyboard
export const SEQUENCE = S('Sequence', 'Séquence');
export const TITLE = S('Title', 'Titre');
export const REQUIRED = S('Required', 'Obligatoire');
export const NOT_TRANSLATED = S('Not translated yet', 'Pas encore traduit');
export const VISIT = S('Visit', 'Visite');
export const STARTS_HERE = S('The visit starts with this sequence', 'La visite commence par cette séquence');
export const START_HERE = S('Start the visit here', 'Commencer la visite ici');
export const NO_LINK_HERE = S('No link leads here: visitors cannot reach it.', 'Aucun lien ne mène ici : les visiteurs ne peuvent pas y arriver.');
export const ONE_LEADS_HERE = S('One link leads here.', 'Un lien mène ici.');
export const N_LEAD_HERE = S('{0} links lead here.', '{0} liens mènent ici.');
export const LINKS_OUT = S('Links to other sequences', 'Liens vers d’autres séquences');
export const NO_LINK_YET = S('None yet. Drag the round handle under the sequence and drop it on another one.',
  'Aucun pour l’instant. Glissez la poignée ronde sous la séquence et déposez-la sur une autre.');
export const OPEN_SEQUENCE = S('Open the sequence', 'Ouvrir la séquence');
export const DUPLICATE = S('Duplicate', 'Dupliquer');
export const DELETE = S('Delete', 'Supprimer');
export const PLACE = S('Place on the storyboard', 'Position sur le storyboard');
export const IN_FILE = S('In the project file', 'Dans le fichier du projet');
export const LINK = S('Link', 'Lien');
export const LINK_WHAT = S('A button of the first sequence that leads to the second.', 'Un bouton de la première séquence qui mène à la seconde.');
export const HOTSPOT_WHAT = S('A hotspot on a medium of the first sequence that leads to the second.', 'Une zone sensible sur un média de la première séquence, qui mène à la seconde.');
export const BUTTON_LABEL = S('Label of the button', 'Texte du bouton');
export const TARGET_OPENS = S('The target opens', 'La cible s’ouvre');
export const IN_PLACE = S('In its place', 'À sa place');
export const OVER_IT = S('Over it', 'Par-dessus');
export const OVER_WHAT = S('Over it: the sequence waits underneath and comes back when the target is closed. Its arrow is dashed.',
  'Par-dessus : la séquence attend dessous et revient quand la cible est fermée. Sa flèche est en pointillés.');
export const TRANSITION = S('Transition', 'Transition');
export const FADE = S('Fade', 'Fondu');
export const SLIDE = S('Slide', 'Glissement');
export const NONE = S('None', 'Aucune');
export const DELETE_LINK = S('Delete the link', 'Supprimer le lien');
export const PROJECT = S('Project', 'Projet');
export const COUNTS = S('{0}, {1}', '{0}, {1}');
export const ONE_SEQUENCE = S('1 sequence', '1 séquence');
export const N_SEQUENCES = S('{0} sequences', '{0} séquences');
export const ONE_LINK = S('1 link', '1 lien');
export const N_LINKS = S('{0} links', '{0} liens');
export const ONE_MEDIUM = S('1 medium', '1 média');
export const N_MEDIA = S('{0} media', '{0} médias');
export const HOW = S('How the storyboard works', 'Comment marche le storyboard');
export const TIP_CREATE = S('Double-click the background to create a sequence, then type its title.', 'Double-cliquez sur le fond pour créer une séquence, puis tapez son titre.');
export const TIP_LINK = S('Drag the round handle under a sequence onto another one to link them: a button is added to the first.',
  'Glissez la poignée ronde sous une séquence jusqu’à une autre pour les relier : un bouton est ajouté à la première.');
export const TIP_DASHED = S('A dashed arrow is a link whose target opens over its sequence instead of replacing it.',
  'Une flèche en pointillés est un lien dont la cible s’ouvre par-dessus sa séquence au lieu de la remplacer.');
export const TIP_START = S('The flag marks where the visit starts. Select a sequence to move it there.', 'Le drapeau marque le début de la visite. Sélectionnez une séquence pour l’y placer.');
export const TIP_LOST = S('A dashed orange sequence is one no link leads to: visitors cannot reach it.',
  'Une séquence orange en pointillés est une séquence où aucun lien ne mène : les visiteurs ne peuvent pas y arriver.');
export const TIP_EDIT = S('Select a sequence or the handle of a link to edit it here. Double-click a sequence to lay out its media.',
  'Sélectionnez une séquence ou la poignée d’un lien pour les modifier ici. Double-cliquez sur une séquence pour disposer ses médias.');
export const KEYS = S('Keys (Cmd for Ctrl on a Mac)', 'Touches (Cmd pour Ctrl sur un Mac)');
export const KEY_NEW_SEQUENCE = S('New sequence', 'Nouvelle séquence');
export const KEY_NAME = S('Name the selected sequence', 'Nommer la séquence sélectionnée');
export const KEY_OPEN_SEQUENCE = S('Open the selected sequence', 'Ouvrir la séquence sélectionnée');
export const KEY_START = S('Start the visit at the selection', 'Commencer la visite à la sélection');
export const KEY_DELETE = S('Delete the selection', 'Supprimer la sélection');
export const KEY_OPEN = S('Open a project', 'Ouvrir un projet');
export const KEY_NEW = S('New project', 'Nouveau projet');
export const KEY_FIT = S('Show everything', 'Tout voir');
export const KEY_ZOOM = S('Zoom in, zoom out', 'Zoom avant, arrière');
export const KEY_LANGUAGE = S('The other language of the content', 'L’autre langue du contenu');
export const KEY_ADVANCED = S('Advanced mode', 'Mode avancé');
export const KEY_ESCAPE = S('Deselect, or back to the storyboard', 'Désélectionner, ou revenir au storyboard');
export const KEY_PLAY = S('Play from the selection', 'Lire à partir de la sélection');
export const KEY_WINDOW = S('Preview in a window', 'Aperçu dans une fenêtre');

// ---- problems
export const PROBLEMS = S('Problems', 'Problèmes');
export const NOTHING_TO_CHECK = S('Nothing to check yet', 'Rien à vérifier pour l’instant');
export const NO_PROBLEM = S('None: the project is ready for the table', 'Aucun : le projet est prêt pour la table');
export const HIDE = S('Hide', 'Masquer');
export const SHOW = S('Show', 'Afficher');
export const P_REFUSED = S('The table would refuse this project: {0}', 'La table refuserait ce projet : {0}');
export const P_UNREACHABLE = S('No link leads to "{0}": visitors cannot reach it.', 'Aucun lien ne mène à « {0} » : les visiteurs ne peuvent pas y arriver.');
export const P_NO_TITLE = S('"{0}" has no title in {1}.', '« {0} » n’a pas de titre en {1}.');
export const P_NO_LABEL = S('A link of "{0}" has no label in {1}.', 'Un lien de « {0} » n’a pas de texte en {1}.');

// ---- questions
export const CANCEL = S('Cancel', 'Annuler');
export const ASK_SAVE = S('Save the changes to this project?', 'Enregistrer les modifications de ce projet ?');
export const ASK_SAVE_WHY = S('The changes made since the last save are lost if they are not saved.', 'Les modifications faites depuis le dernier enregistrement sont perdues si elles ne sont pas enregistrées.');
export const DO_NOT_SAVE = S('Do not save', 'Ne pas enregistrer');
export const ASK_DELETE = S('Delete "{0}"?', 'Supprimer « {0} » ?');
export const ONE_LEADS = S('One link leads to this sequence. It can be deleted with it, or lead to another sequence instead.',
  'Un lien mène à cette séquence. Il peut être supprimé avec elle, ou mener à une autre séquence.');
export const N_LEAD = S('{0} links lead to this sequence. They can be deleted with it, or lead to another sequence instead.',
  '{0} liens mènent à cette séquence. Ils peuvent être supprimés avec elle, ou mener à une autre séquence.');
export const LEAD_ONE_TO = S('Lead the link to', 'Faire mener le lien à');
export const LEAD_N_TO = S('Lead the links to', 'Faire mener les liens à');
export const DELETE_WITH_ONE = S('Delete it with its link', 'La supprimer avec son lien');
export const DELETE_WITH_N = S('Delete it with its {0} links', 'La supprimer avec ses {0} liens');
export const ASK_REMOVE_MEDIA = S('Remove "{0}" from the project?', 'Retirer « {0} » du projet ?');
export const ONE_USE = S('It is on the table of a sequence, and leaves it. The file stays in the project folder.',
  'Il est sur la table d’une séquence, et la quitte. Le fichier reste dans le dossier du projet.');
export const N_USES = S('It is on the table of sequences {0} times, and leaves them. The file stays in the project folder.',
  'Il est {0} fois sur la table de séquences, et les quitte. Le fichier reste dans le dossier du projet.');
export const REMOVE = S('Remove', 'Retirer');
export const WHERE_TO = S('Where does it lead?', 'Où mène-t-il ?');
export const WHICH_STEP = S('Which sequence comes next?', 'Quelle séquence vient ensuite ?');
export const WHERE_TO_HOW = S('Click a sequence in the list or on the map.', 'Cliquez sur une séquence dans la liste ou sur le plan.');

// ---- what the commands say in the status bar
export const DONE_FIRST = S('Created the first sequence: the visit starts here. Type its title.', 'Première séquence créée : la visite commence ici. Tapez son titre.');
export const DONE_CREATED = S('Created a sequence. Type its title.', 'Séquence créée. Tapez son titre.');
export const DONE_DUPLICATED = S('Duplicated "{0}".', '« {0} » dupliquée.');
export const DONE_LINK_DELETED = S('Deleted the link.', 'Lien supprimé.');
export const DONE_DELETED = S('Deleted "{0}".', '« {0} » supprimée.');
export const DONE_DELETED_ONE = S('Deleted "{0}" and the link that led to it. Undo brings them back.', '« {0} » supprimée, avec le lien qui y menait. Annuler les rétablit.');
export const DONE_DELETED_N = S('Deleted "{0}" and the {1} links that led to it. Undo brings them back.', '« {0} » supprimée, avec les {1} liens qui y menaient. Annuler les rétablit.');
export const DONE_RETARGETED = S('Deleted "{0}"; what led to it now leads to "{1}".', '« {0} » supprimée ; ce qui y menait mène maintenant à « {1} ».');
export const DONE_START = S('The visit now starts with "{0}".', 'La visite commence maintenant par « {0} ».');
export const DONE_LINKED = S('Linked "{0}" to "{1}": a button was added to the sequence.', '« {0} » reliée à « {1} » : un bouton a été ajouté à la séquence.');
export const HOW_TO_LINK = S('To link two sequences, drag the handle of one and drop it on the other.', 'Pour relier deux séquences, glissez la poignée de l’une et déposez-la sur l’autre.');
export const DONE_UNDONE = S('Undone: {0}.', 'Annulé : {0}.');
export const DONE_REDONE = S('Redone: {0}.', 'Rétabli : {0}.');
export const NOTHING_TO_UNDO = S('Nothing to undo.', 'Rien à annuler.');
export const NOTHING_TO_REDO = S('Nothing to redo.', 'Rien à rétablir.');
export const UNDO_NEXT = S('Undo: {0}', 'Annuler : {0}');
export const DONE_OPENED = S('Opened {0}.', '{0} ouvert.');
export const CANNOT_OPEN = S('Cannot open {0}: {1}', 'Impossible d’ouvrir {0} : {1}');
export const DONE_NEW = S('New project.', 'Nouveau projet.');
export const NOTHING_TO_SAVE = S('Nothing to save yet: create a sequence first.', 'Rien à enregistrer pour l’instant : créez d’abord une séquence.');
export const CANNOT_SAVE = S('Could not save {0}: {1}', 'Impossible d’enregistrer {0} : {1}');
export const DONE_SAVED = S('Saved {0}.', '{0} enregistré.');
export const NOT_SAVED = S('Not saved.', 'Non enregistré.');
export const NOTHING_OPENED = S('Nothing opened.', 'Rien d’ouvert.');
export const SAVE_TITLE = S('Save the project', 'Enregistrer le projet');
export const OPEN_TITLE = S('Open a project', 'Ouvrir un projet');
export const FILE_KIND = S('Museum table project', 'Projet de table de musée');
export const DONE_PLACED = S('"{0}" is on the table. Drag it, or its corner to size it.', '« {0} » est sur la table. Glissez-le, ou son coin pour le dimensionner.');
export const DONE_OFF_TABLE = S('Taken off the table. It stays in the library.', 'Retiré de la table. Il reste dans la bibliothèque.');
export const DONE_MEDIA_ADDED = S('"{0}" is in the library. Drag it onto the table.', '« {0} » est dans la bibliothèque. Glissez-le sur la table.');
export const DONE_MEDIA_REMOVED = S('Removed "{0}" from the project. Undo brings it back.', '« {0} » retiré du projet. Annuler le rétablit.');
export const DONE_HOTSPOT = S('A hotspot to "{0}" is on the medium. Drag it where it belongs.', 'Une zone sensible vers « {0} » est sur le média. Glissez-la à sa place.');
export const DONE_BUTTON = S('A button to "{0}" is on the table. Drag it where it belongs.', 'Un bouton vers « {0} » est sur la table. Glissez-le à sa place.');
export const BUTTON_KEPT_IN_REACH = S('A button stays within reach of an edge of the table, so that a seated visitor can touch it.',
  'Un bouton reste à portée d’un bord de la table, pour qu’un visiteur assis puisse le toucher.');
export const SAVE_FIRST = S('Save the project first: its media are the files of its folder.', 'Enregistrez d’abord le projet : ses médias sont les fichiers de son dossier.');

// ---- the sequence editor
export const LIBRARY = S('Media of the project', 'Médias du projet');
export const ADD_FILE = S('Add a file', 'Ajouter un fichier');
export const ADD_TEXT = S('Add a text', 'Ajouter un texte');
export const LIBRARY_EMPTY = S('No media yet. Put the photographs, films, sounds and 3D models in the folder of the project, then add them here with their source and licence.',
  'Pas encore de média. Mettez les photographies, films, sons et modèles 3D dans le dossier du projet, puis ajoutez-les ici avec leur source et leur licence.');
export const LIBRARY_HINT = S('Drag a medium onto the table, or double-click it.', 'Glissez un média sur la table, ou double-cliquez dessus.');
export const USED_ONCE = S('on 1 table', 'sur 1 table');
export const USED_N = S('on {0} tables', 'sur {0} tables');
export const UNUSED = S('not used', 'non utilisé');
export const STAGE_EMPTY = S('The table of this sequence is empty. Drag media here from the library on the left.', 'La table de cette séquence est vide. Glissez-y des médias depuis la bibliothèque, à gauche.');
export const TIMELINE = S('When each appears', 'Quand chacun apparaît');
export const TIMELINE_HINT = S('Drag a bar to shift it, its ends to say when it appears and leaves. A bar that reaches the right edge stays to the end.',
  'Glissez une barre pour la décaler, ses bouts pour dire quand il apparaît et quand il part. Une barre qui touche le bord droit reste jusqu’à la fin.');
export const SECONDS = S('{0} s', '{0} s');
export const ON_TABLE = S('On the table', 'Sur la table');
export const POSITION = S('Position and size', 'Position et taille');
export const WIDTH = S('Width', 'Largeur');
export const HEIGHT = S('Height', 'Hauteur');
export const ROTATION = S('Turn', 'Rotation');
export const HEIGHT_AUTO = S('Height 0: the height follows the medium. The table is {0} by {1}.', 'Hauteur 0 : la hauteur suit le média. La table mesure {0} sur {1}.');
export const TIMES = S('Appears at, leaves at (seconds)', 'Apparaît à, part à (secondes)');
export const FROM = S('From', 'De');
export const UNTIL = S('To', 'À');
export const UNTIL_END = S('To 0: it stays to the end.', 'À 0 : il reste jusqu’à la fin.');
export const FORWARD = S('Forward', 'Avancer');
export const BACKWARD = S('Backward', 'Reculer');
export const OFF_TABLE = S('Take off the table', 'Retirer de la table');
export const HOTSPOTS = S('Links from this medium', 'Liens depuis ce média');
export const ADD_HOTSPOT = S('Add a hotspot', 'Ajouter une zone sensible');
export const ADD_BUTTON = S('Add a button', 'Ajouter un bouton');
export const BUTTONS = S('Buttons and hotspots', 'Boutons et zones sensibles');
export const NO_BUTTON_YET = S('None yet. A button sits on the table, a hotspot on a medium; both lead to another sequence.',
  'Aucun pour l’instant. Un bouton est posé sur la table, une zone sensible sur un média ; les deux mènent à une autre séquence.');
export const MEDIUM = S('Medium', 'Média');
export const CAPTION = S('Caption', 'Légende');
export const DESCRIPTION = S('Description', 'Description');
export const AUDIO_DESCRIPTION = S('For visitors who cannot see it', 'Pour les visiteurs qui ne le voient pas');
export const BODY = S('Text', 'Texte');
export const CREDIT = S('Author and credit', 'Auteur et crédit');
export const CREATOR = S('Author', 'Auteur');
export const SOURCE = S('Source (the page of the work)', 'Source (la page de l’œuvre)');
export const LICENCE = S('Licence', 'Licence');
export const INSTITUTION = S('Institution', 'Institution');
export const CREDIT_LINE = S('Credit line', 'Mention de crédit');
export const FILE = S('File', 'Fichier');
export const REMOVE_FROM_PROJECT = S('Remove from the project', 'Retirer du projet');
export const PUT_ON_TABLE = S('Put on the table', 'Poser sur la table');
export const INTRODUCTION = S('Introduction', 'Introduction');
export const DURATION = S('Duration in a guided visit (seconds, 0: as long as it takes)', 'Durée en visite guidée (secondes, 0 : le temps qu’il faut)');
export const SEQUENCE_HINT = S('Select a medium on the table or in the library to write its caption; a button to edit its link.',
  'Sélectionnez un média sur la table ou dans la bibliothèque pour écrire sa légende ; un bouton pour modifier son lien.');
export const LEADS_TO = S('Leads to', 'Mène à');
export const CHANGE = S('Change', 'Changer');
export const BUTTON_ON_TABLE = S('A button on the table', 'Un bouton sur la table');
export const HOTSPOT_ON = S('A hotspot on "{0}"', 'Une zone sensible sur « {0} »');
export const CHOOSE_FILE = S('A file of the project folder', 'Un fichier du dossier du projet');
export const NO_NEW_FILE = S('Every photograph, film, sound and 3D model of the folder is already in the library. Copy new files into {0}.',
  'Chaque photographie, film, son et modèle 3D du dossier est déjà dans la bibliothèque. Copiez de nouveaux fichiers dans {0}.');
export const NEW_MEDIA = S('Add "{0}" to the library', 'Ajouter « {0} » à la bibliothèque');
export const NEW_MEDIA_WHY = S('Everything shown to visitors says where it comes from and under which licence.', 'Tout ce qui est montré aux visiteurs dit d’où il vient et sous quelle licence.');
export const AS_PANORAMA = S('It is a 360° panorama', 'C’est un panorama à 360°');
export const AS_PHOTO = S('It is a photograph', 'C’est une photographie');
export const ADD = S('Add', 'Ajouter');
export const NEW_TEXT = S('A text written here', 'Un texte écrit ici');
export const NEW_TEXT_WHY = S('A label, a quotation, a paragraph: it is placed on the table like a photograph.', 'Un cartel, une citation, un paragraphe : il se pose sur la table comme une photographie.');
export const MISSING = S('Fill in what is required.', 'Remplissez ce qui est obligatoire.');

// ---- points of interest on a model and in a panorama
export const POINTS = S('Points of interest', 'Points d’intérêt');
export const POINTS_OPEN = S('Place points of interest', 'Placer des points d’intérêt');
export const ONE_POINT = S('1 point of interest', '1 point d’intérêt');
export const N_POINTS = S('{0} points of interest', '{0} points d’intérêt');
export const NO_POINT_YET = S('None yet. A point of interest is a place that visitors touch to read about it.',
  'Aucun pour l’instant. Un point d’intérêt est un endroit que les visiteurs touchent pour en savoir plus.');
export const BACK_TO_TABLE = S('Back to the table', 'Retour à la table');
export const POINTS_HINT_MODEL = S('Drag to turn the object, the wheel comes closer. Click the object to place a point; drag a point to move it.',
  'Glissez pour tourner l’objet, la molette le rapproche. Cliquez sur l’objet pour placer un point ; glissez un point pour le déplacer.');
export const POINTS_HINT_PANORAMA = S('Drag to look around, the wheel zooms. Click the picture to place a point; drag a point to move it.',
  'Glissez pour regarder autour, la molette zoome. Cliquez sur l’image pour placer un point ; glissez un point pour le déplacer.');
export const POINTS_HOW_MODEL = S('Turn the object, then click the place a visitor should look at.', 'Tournez l’objet, puis cliquez sur l’endroit qu’un visiteur doit regarder.');
export const POINTS_HOW_PANORAMA = S('Look around, then click what a visitor should look at.', 'Regardez autour, puis cliquez sur ce qu’un visiteur doit regarder.');
export const RESET_VIEW = S('Opening view', 'Vue de départ');
export const CANNOT_SHOW = S('This file cannot be shown: {0}', 'Ce fichier ne peut pas être montré : {0}');
export const POINT = S('Point of interest', 'Point d’intérêt');
export const POINT_TITLE = S('Name', 'Nom');
export const POINT_TEXT = S('What visitors read', 'Ce que lisent les visiteurs');
export const POINT_VIEW = S('View when it opens', 'Vue à son ouverture');
export const POINT_VIEW_WHAT = S('Touching the point brings the visitor to this view. Turn until the place shows best, then use that view.',
  'Toucher le point amène le visiteur à cette vue. Tournez jusqu’à ce que l’endroit se voie au mieux, puis utilisez cette vue.');
export const USE_VIEW = S('Use this view', 'Utiliser cette vue');
export const SHOW_VIEW = S('Show it', 'La montrer');
export const VIEW_MODEL = S('Turned {0}°, tilted {1}°', 'Tourné de {0}°, incliné de {1}°');
export const VIEW_DISTANCE = S('distance {0}', 'distance {0}');
export const VIEW_FOV = S('field of view {0}°', 'champ {0}°');
export const POINT_LEADS = S('Its card leads to', 'Sa carte mène à');
export const POINT_NOWHERE = S('Nowhere: the point shows its description only.', 'Nulle part : le point ne montre que sa description.');
export const CHOOSE_SEQUENCE = S('Choose a sequence', 'Choisir une séquence');
export const NO_LINK = S('No link', 'Aucun lien');
export const DELETE_POINT = S('Delete the point', 'Supprimer le point');
export const ALL_POINTS = S('All the points', 'Tous les points');
export const OPENING_VIEW = S('How it is first seen', 'Comment il est vu d’abord');
export const OPENING_WHAT = S('The view a sequence shows it with, before a visitor turns it.', 'La vue avec laquelle une séquence le montre, avant qu’un visiteur le tourne.');
export const LIGHT = S('Lighting', 'Lumière');
export const LIGHT_NAMES: i32[] = [S('Studio', 'Atelier'), S('Raking', 'Rasante'), S('Flat', 'Diffuse')];
export const PLACE_ON_OBJECT = S('Place on the object (its own coordinates)', 'Position sur l’objet (ses propres coordonnées)');
export const DIRECTION = S('Direction from the centre', 'Direction depuis le centre');
export const DONE_POINT = S('A point is placed. Type its name.', 'Un point est placé. Tapez son nom.');
export const DONE_POINT_VIEW = S('The point now opens with this view.', 'Le point s’ouvre maintenant avec cette vue.');
export const DONE_OPENING_VIEW = S('It is now first seen like this.', 'Il est maintenant vu d’abord ainsi.');
export const DONE_POINT_DELETED = S('Deleted the point. Undo brings it back.', 'Point supprimé. Annuler le rétablit.');
export const MISSED = S('Click the object itself to place a point.', 'Cliquez sur l’objet lui-même pour placer un point.');
export const TURN_HANDLE = S('Turned {0}°', 'Tourné de {0}°');

// ---- the settings of the project
export const SETTINGS = S('Project settings', 'Réglages du projet');
export const BACK_FROM_SETTINGS = S('Back', 'Retour');
export const SECTION_NAMES: i32[] = [S('Project and languages', 'Projet et langues'), S('Theme', 'Thème'), S('Table and kiosk', 'Table et borne'), S('Accessibility', 'Accessibilité'),
  S('Guided visits', 'Visites guidées')];
export const SAMPLE = S('Live sample', 'Aperçu en direct');
export const SAMPLE_WHAT = S('The selected sequence, else the one the visit starts with, as the table shows it with these settings. It answers to the mouse.',
  'La séquence sélectionnée, sinon celle où commence la visite, telle que la table la montre avec ces réglages. Elle répond à la souris.');
export const SAMPLE_CONTRAST = S('Shown in high contrast, as a visitor who asks for it sees it.', 'Montrée en contraste élevé, telle que la voit un visiteur qui le demande.');
export const SAMPLE_EMPTY = S('The sample shows a sequence once the project has one.', 'L’aperçu montre une séquence dès que le projet en a une.');
export const PROJECT_NAME = S('Name of the installation', 'Nom de l’installation');
export const PROJECT_ID = S('Identifier (statistics and updates are filed under it)', 'Identifiant (les statistiques et les mises à jour y sont rattachées)');
export const LANGUAGES = S('Languages of the content', 'Langues du contenu');
export const LANGUAGES_WHAT = S('Every text is written once per language; a visitor chooses on the table. A text not translated yet is shown in the first language.',
  'Chaque texte s’écrit une fois par langue ; le visiteur choisit sur la table. Un texte pas encore traduit est montré dans la première langue.');
export const DEFAULT_LANGUAGE = S('default language', 'langue par défaut');
export const MAKE_DEFAULT = S('Make it the default', 'Mettre par défaut');
export const DONE_DEFAULT = S('{0} is the default language: what a visitor reads first, and what an untranslated text falls back on.', '{0} est la langue par défaut : ce que le visiteur lit d’abord, et ce que montre un texte non traduit.');
export const NOT_DEFAULT = S('{0} cannot be the default language yet: a required text is not written in it ({1}).', '{0} ne peut pas encore être la langue par défaut : un texte obligatoire n’y est pas écrit ({1}).');
export const ADD_LANGUAGE = S('Add a language', 'Ajouter une langue');
export const LANGUAGE_CODE = S('Another one, by its code (pt, nl, ja)', 'Une autre, par son code (pt, nl, ja)');
export const NOT_A_LANGUAGE = S('"{0}" is not a language code, or the project has it already.', '« {0} » n’est pas un code de langue, ou le projet l’a déjà.');
export const DONE_LANGUAGE = S('Added {0}: every panel has a column for it.', '{0} ajouté : chaque panneau a une colonne pour lui.');
export const DONE_LANGUAGE_REMOVED = S('Removed {0}. Undo brings it back with its texts.', '{0} retiré. Annuler le rétablit avec ses textes.');
export const ASK_REMOVE_LANGUAGE = S('Remove {0} from the project?', 'Retirer {0} du projet ?');
export const ONE_TEXT_LOST = S('One text is written in it, and goes with it.', 'Un texte est écrit dans cette langue, et part avec elle.');
export const N_TEXTS_LOST = S('{0} texts are written in it, and go with it.', '{0} textes sont écrits dans cette langue, et partent avec elle.');
export const COLOURS = S('Colours', 'Couleurs');
export const COLOURS_WHAT = S('Six colours dress the whole table. Type a colour as #rrggbb; the sample follows.', 'Six couleurs habillent toute la table. Tapez une couleur sous la forme #rrggbb ; l’aperçu suit.');
export const COLOUR_NAMES: i32[] = [S('Table', 'Table'), S('Card', 'Carte'), S('Writing on a card', 'Écriture sur une carte'), S('Texts on the table', 'Textes sur la table'),
  S('Secondary texts', 'Textes secondaires'), S('What answers to a touch', 'Ce qui répond au toucher')];
export const COLOUR_HINTS: i32[] = [S('the background', 'le fond'), S('the border of a photograph, a text panel', 'le bord d’une photographie, un panneau de texte'), S('captions, notices', 'légendes, cartels'),
  S('titles, introductions, subtitles', 'titres, introductions, sous-titres'), S('credits, hints', 'crédits, indications'), S('buttons, points of interest, hotspots', 'boutons, points d’intérêt, zones sensibles')];
export const FONTS = S('Fonts and logo', 'Polices et logo');
export const FONTS_WHAT = S('The table has three font families; a TrueType file (.ttf) put in the project folder is offered beside them, and the pictures of the folder for the logo, shown in a corner of the table.',
  'La table a trois familles de polices ; un fichier TrueType (.ttf) déposé dans le dossier du projet est proposé à côté d’elles, et les images du dossier pour le logo, affiché dans un coin de la table.');
export const NO_LOGO = S('None', 'Aucun');
export const FONT_TEXT = S('Font of the texts', 'Police des textes');
export const FONT_TITLE = S('Font of the titles', 'Police des titres');
export const LOGO = S('Logo', 'Logo');
export const TABLE = S('Around the table', 'Autour de la table');
export const VISITORS = S('Visitors at the same time', 'Visiteurs en même temps');
export const VISITORS_WHAT = S('They share one story; texts and buttons turn to the side of the last touch near an edge.', 'Ils partagent une même histoire ; textes et boutons se tournent vers le côté du dernier toucher près d’un bord.');
export const REACH = S('Reach', 'Portée');
export const REACH_WHAT = S('Every button lies within this distance of an edge, in units of a table {0} wide, so that a seated visitor or a child touches it. 520 is 26 cm on a 43-inch table.',
  'Chaque bouton est à cette distance au plus d’un bord, en unités d’une table large de {0}, pour qu’un visiteur assis ou un enfant le touche. 520 vaut 26 cm sur une table de 43 pouces.');
export const IDLE = S('When nobody touches the table', 'Quand personne ne touche la table');
export const ATTRACT_AFTER = S('The attract loop starts after (seconds, 0: never)', 'La boucle d’appel commence après (secondes, 0 : jamais)');
export const RESET_AFTER = S('The visit is forgotten after (seconds, 0: never)', 'La visite est oubliée après (secondes, 0 : jamais)');
export const ATTRACT_WHAT = S('The attract loop is a guided visit played silently, again and again; choose it in "Guided visits".',
  'La boucle d’appel est une visite guidée jouée en silence, encore et encore ; choisissez-la dans « Visites guidées ».');
export const ATTRACT_IS = S('The attract loop plays "{0}".', 'La boucle d’appel joue « {0} ».');
export const ATTRACT_NONE = S('No guided visit is the attract loop: the table stays as it is until the visit is forgotten.',
  'Aucune visite guidée n’est la boucle d’appel : la table reste telle quelle jusqu’à l’oubli de la visite.');
export const KIOSK = S('As a kiosk', 'En borne');
export const FULLSCREEN = S('No way out of the app', 'Aucune sortie de l’application');
export const FULLSCREEN_WHAT = S('Escape does nothing, no gesture leads out, and no fault is ever shown to a visitor.', 'Échap ne fait rien, aucun geste ne mène dehors, et aucune erreur n’est jamais montrée à un visiteur.');
export const STATISTICS = S('Count the visits', 'Compter les visites');
export const STATISTICS_WHAT = S('Sequences seen, durations and languages, in a local file, with nothing that identifies a visitor.',
  'Séquences vues, durées et langues, dans un fichier local, sans rien qui identifie un visiteur.');
export const UPDATE_URL = S('Where a newer project is published (empty: the table needs no network)', 'Où une version plus récente du projet est publiée (vide : la table n’a pas besoin de réseau)');
export const YES = S('Yes', 'Oui');
export const NO = S('No', 'Non');
export const TEXT_SIZES = S('Text sizes', 'Tailles de texte');
export const TEXT_SIZES_WHAT = S('The sizes a visitor steps through, as factors of the designed size; the first is the one at rest.',
  'Les tailles que parcourt un visiteur, en facteurs de la taille conçue ; la première est celle au repos.');
export const ADD_SIZE = S('Add a size', 'Ajouter une taille');
export const REMOVE_SIZE = S('Remove the last', 'Retirer la dernière');
export const HIGH_CONTRAST = S('High contrast', 'Contraste élevé');
export const HIGH_CONTRAST_WHAT = S('The six colours of the table for a visitor who asks for more contrast.', 'Les six couleurs de la table pour un visiteur qui demande plus de contraste.');
export const TOURS = S('Guided visits', 'Visites guidées');
export const TOURS_WHAT = S('A guided visit plays sequences in order, each with its narration; visitors start it with a button at their edge.',
  'Une visite guidée joue des séquences dans l’ordre, chacune avec sa narration ; les visiteurs la lancent d’un bouton à leur bord.');
export const NO_TOUR_YET = S('None yet.', 'Aucune pour l’instant.');
export const NEW_TOUR = S('New guided visit', 'Nouvelle visite guidée');
export const ONE_STEP = S('1 step', '1 étape');
export const N_STEPS = S('{0} steps', '{0} étapes');
export const PATH = S('Its path', 'Son parcours');
export const PATH_WHAT = S('Drag a step by its grip to change the order.', 'Glissez une étape par sa poignée pour changer l’ordre.');
export const ADD_STEP = S('Add a step', 'Ajouter une étape');
export const IS_ATTRACT = S('Play it when nobody is at the table', 'La jouer quand personne n’est à la table');
export const IS_ATTRACT_WHAT = S('As the attract loop it plays silently, again and again, with an invitation to touch the table.', 'En boucle d’appel elle joue en silence, encore et encore, avec une invitation à toucher la table.');
export const DELETE_TOUR = S('Delete the guided visit', 'Supprimer la visite guidée');
export const DONE_PRESENTATION = S('A guided visit is made. Type its title, then add its steps.', 'Une visite guidée est créée. Tapez son titre, puis ajoutez ses étapes.');
export const DONE_PRESENTATION_DELETED = S('Deleted the guided visit. Undo brings it back.', 'Visite guidée supprimée. Annuler la rétablit.');
export const KEY_SETTINGS = S('Project settings', 'Réglages du projet');
export const KIND_NAMES: i32[] = [S('Photograph', 'Photographie'), S('3D model', 'Modèle 3D'), S('Panorama', 'Panorama'), S('Text', 'Texte'), S('Sound', 'Son'), S('Film', 'Film')];
export const LANGUAGE_NAMES: string[] = ['fr', 'français', 'en', 'English', 'de', 'Deutsch', 'es', 'español', 'it', 'italiano', 'nl', 'Nederlands', 'pt', 'português'];

// ---- the steps Undo names: the document's labels (doc.ts), which are the English text
const STEPS: string[] = ['New sequence', 'Nouvelle séquence', 'Rename sequence', 'Renommer la séquence', 'Move sequence', 'Déplacer la séquence', 'Duplicate sequence', 'Dupliquer la séquence',
  'Delete sequence', 'Supprimer la séquence', 'Set start sequence', 'Changer le début de la visite', 'New link', 'Nouveau lien', 'Edit link label', 'Modifier le texte du lien',
  'Change link transition', 'Changer la transition du lien', 'Change link kind', 'Changer l’ouverture du lien', 'Delete link', 'Supprimer le lien', 'Change link times', 'Changer les temps du lien',
  'Change link target', 'Changer la cible du lien', 'Move button', 'Déplacer le bouton', 'New hotspot', 'Nouvelle zone sensible', 'Add media', 'Ajouter un média', 'Add text', 'Ajouter un texte',
  'Edit media text', 'Modifier le texte du média', 'Edit media credit', 'Modifier le crédit du média', 'Remove media', 'Retirer le média', 'Place media', 'Poser le média',
  'Move media', 'Déplacer le média', 'Resize media', 'Dimensionner le média', 'Rotate media', 'Tourner le média', 'Change media times', 'Changer les temps du média',
  'Bring media forward', 'Avancer le média', 'Send media backward', 'Reculer le média', 'Take media off the table', 'Retirer le média de la table', 'Edit sequence text', 'Modifier l’introduction',
  'Change sequence duration', 'Changer la durée de la séquence', 'New point of interest', 'Nouveau point d’intérêt', 'Move point of interest', 'Déplacer le point d’intérêt',
  'Edit point of interest', 'Modifier le point d’intérêt', 'Set the view of a point', 'Changer la vue du point', 'Change point link', 'Changer le lien du point',
  'Delete point of interest', 'Supprimer le point d’intérêt', 'Set the opening view', 'Changer la vue de départ', 'Change the lighting', 'Changer la lumière',
  'Rename the project', 'Renommer le projet', 'Add a language', 'Ajouter une langue', 'Remove a language', 'Retirer une langue', 'Change a colour', 'Changer une couleur',
  'Change the theme', 'Changer le thème', 'Change a setting', 'Changer un réglage', 'Change the attract loop', 'Changer la boucle d’appel', 'Change the text sizes', 'Changer les tailles de texte',
  'New presentation', 'Nouvelle visite guidée', 'Rename presentation', 'Renommer la visite guidée', 'Delete presentation', 'Supprimer la visite guidée', 'Add a step', 'Ajouter une étape',
  'Remove a step', 'Retirer une étape', 'Move a step', 'Déplacer une étape', 'Change the default language', 'Changer la langue par défaut'];
/** The name of an undo step in the interface language. */
export function step(label: string): string {
  const at = STEPS.indexOf(label);
  return uiLang() === 'fr' && at >= 0 && at % 2 === 0 ? STEPS[at + 1] : label;
}
/** The name of a language of the content, for messages ("no title in English"). */
export function languageName(code: string): string {
  const at = LANGUAGE_NAMES.indexOf(code);
  return at >= 0 && at % 2 === 0 ? LANGUAGE_NAMES[at + 1] : code;
}
