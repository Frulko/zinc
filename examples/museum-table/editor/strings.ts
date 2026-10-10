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
export const KIND_NAMES: i32[] = [S('Photograph', 'Photographie'), S('3D model', 'Modèle 3D'), S('Panorama', 'Panorama'), S('Text', 'Texte'), S('Sound', 'Son'), S('Film', 'Film')];
export const LANGUAGE_NAMES: string[] = ['fr', 'français', 'en', 'English', 'de', 'Deutsch', 'es', 'español', 'it', 'italiano'];

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
  'Delete point of interest', 'Supprimer le point d’intérêt', 'Set the opening view', 'Changer la vue de départ', 'Change the lighting', 'Changer la lumière'];
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
