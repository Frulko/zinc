// Strings: English is the key (gettext style), French is a table. `tr('Home')` returns the string of the current language; `{n}` in a string is
// replaced by `trn`. SHOWCASE_LANG=fr (or the switch on the Platform screen) picks French. A missing translation falls back to English.
import { env } from 'zinc:sys';

const FR_PAIRS: string[] = [
  'Home', 'Accueil', 'Components', 'Composants', 'Forms', 'Formulaires', 'Network', 'Réseau', 'More', 'Plus',
  'Media', 'Médias', 'Motion', 'Animation', 'Data', 'Données', 'Platform', 'Plateforme', 'About', 'À propos', 'Camera', 'Caméra', 'Back', 'Retour',
  'Good to see you', 'Content de vous revoir', 'A React Native app on Zinc', 'Une app React Native sur Zinc',
  'Everything here is written like an Expo app and runs without a browser.', 'Tout ici est écrit comme une app Expo et tourne sans navigateur.',
  'Quick actions', 'Actions rapides', 'Status', 'État', 'Online', 'En ligne', 'Offline (mock data)', 'Hors ligne (données simulées)', 'Mock network', 'Réseau simulé',
  'Notes', 'Notes', 'Theme', 'Thème', 'Light', 'Clair', 'Dark', 'Sombre', 'System', 'Système', 'Language', 'Langue',
  'Buttons', 'Boutons', 'Primary', 'Principal', 'Secondary', 'Secondaire', 'Danger', 'Danger', 'Disabled', 'Désactivé',
  'Switches and sliders', 'Interrupteurs et curseurs', 'Notifications', 'Notifications', 'Volume', 'Volume',
  'Picker', 'Sélecteur', 'Badges and avatars', 'Badges et avatars', 'Progress', 'Progression', 'Loading', 'Chargement',
  'Dialogs', 'Dialogues', 'Open modal', 'Ouvrir la modale', 'Show alert', 'Afficher une alerte', 'Show toast', 'Afficher un toast',
  'Saved', 'Enregistré', 'Close', 'Fermer', 'Cancel', 'Annuler', 'Delete', 'Supprimer', 'Delete this item?', 'Supprimer cet élément ?',
  'Skeletons', 'Squelettes', 'List', 'Liste', 'Cards', 'Cartes',
  'Create your account', 'Créez votre compte', 'Name', 'Nom', 'Email', 'E-mail', 'Password', 'Mot de passe', 'Phone', 'Téléphone',
  'Birthday', 'Anniversaire', 'Country', 'Pays', 'Interests', 'Centres d’intérêt', 'Plan', 'Formule', 'About you', 'À propos de vous',
  'Seats', 'Places', 'I accept the terms', 'J’accepte les conditions', 'Sign up', 'S’inscrire', 'Sending…', 'Envoi…',
  'Required', 'Obligatoire', 'Not a valid email', 'E-mail invalide', 'At least 8 characters', 'Au moins 8 caractères',
  'Please accept the terms', 'Veuillez accepter les conditions', 'Check the fields in red', 'Vérifiez les champs en rouge', 'Welcome aboard!', 'Bienvenue à bord !',
  'Settings', 'Réglages', 'Weekly digest', 'Résumé hebdomadaire', 'Save settings', 'Enregistrer',
  'Posts', 'Articles', 'Live feed', 'Flux en direct', 'Connect', 'Connecter', 'Disconnect', 'Déconnecter', 'Send', 'Envoyer',
  'Say something', 'Écrivez quelque chose', 'Retry', 'Réessayer', 'Nothing here yet', 'Rien pour l’instant', 'Something went wrong', 'Une erreur est survenue',
  'Connected', 'Connecté', 'Disconnected', 'Déconnecté', 'Gallery', 'Galerie', 'Audio', 'Audio', 'Video', 'Vidéo', 'Share', 'Partager',
  'Play', 'Lecture', 'Pause', 'Pause', 'Simulated camera', 'Caméra simulée', 'Take photo', 'Prendre une photo', 'Photos', 'Photos',
  'Springs', 'Ressorts', 'Swipe cards', 'Cartes à balayer', 'Drag to reorder', 'Glisser pour réordonner', 'Canvas', 'Canevas',
  'Search', 'Rechercher', 'Add', 'Ajouter', 'Undo', 'Annuler', 'New note', 'Nouvelle note', 'Device', 'Appareil', 'Battery', 'Batterie',
  'Clipboard', 'Presse-papiers', 'Copy', 'Copier', 'Open link', 'Ouvrir le lien', 'Vibrate', 'Vibrer', 'Lifecycle', 'Cycle de vie',
  'Sensors', 'Capteurs', 'Versions', 'Versions', 'Credits', 'Crédits', 'Licence', 'Licence', 'Unavailable here', 'Indisponible ici',
];
const FR = new Map<string, string>();
for (let i = 0; i + 1 < FR_PAIRS.length; i += 2) FR.set(FR_PAIRS[i], FR_PAIRS[i + 1]);

let lang: string = env('SHOWCASE_LANG') === 'fr' ? 'fr' : 'en';
export function language(): string { return lang; }
export function setLanguage(l: string): void { lang = l === 'fr' ? 'fr' : 'en'; }
export function tr(s: string): string { if (lang !== 'fr') return s; const f = FR.get(s); return f !== undefined ? f : s; }
export function trn(s: string, n: number): string { return tr(s).replace('{n}', `${n}`); }
