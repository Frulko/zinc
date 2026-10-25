// The help lines of the table format in French. The format gives every field and every kind of thing one English line
// (examples/pinball-kit/format/table-schema.ts); the form shows it under the field. This table pairs each of those lines with its
// French one, by the English text itself: a line the format changes or gains has no pair any more, and `helpFaults` (run by
// selftest.ts) names it, so the French form never shows an English line without a test saying so. The words of the format itself
// (`glow`, "self", drop, blink) stay as the file writes them.
import { Schema } from '../../pinball-kit/format/schema';
import { uiLang } from './strings';

const EN: string[] = [], FR: string[] = [];
function H(en: string, fr: string): void { EN.push(en); FR.push(fr); }

/** The help line `doc` of the format in the interface language. */
export function help(doc: string): string {
  if (uiLang() !== 'fr') return doc;
  const i = EN.indexOf(doc);
  return i < 0 ? doc : FR[i];
}
/** What is wrong with the table: each line of the format `root` that has no French, and each pair whose English line the format no longer has. */
export function helpFaults(root: Schema): string[] {
  const seen: Schema[] = [], lines: string[] = [], out: string[] = [];
  const walk = (s: Schema): void => {
    if (seen.indexOf(s) >= 0) return;
    seen.push(s);
    lines.push(s.doc);
    for (const f of s.fields) { lines.push(f.doc); if (f.of !== null) walk(f.of as Schema); }
  };
  walk(root);
  for (const l of lines) { const i = EN.indexOf(l); if ((i < 0 || FR[i].length === 0) && out.indexOf(`no French for: ${l}`) < 0) out.push(`no French for: ${l}`); }
  for (const e of EN) if (lines.indexOf(e) < 0) out.push(`not a line of the format any more: ${e}`);
  return out;
}

// what the lines of every element share
function named(en: string, fr: string): void {
  H(`The name of the ${en}: rules, the editor and the event log use it. Unique among all the elements of the table.`,
    `Le nom ${fr} : les règles, l’éditeur et le journal des évènements s’en servent. Unique parmi tous les éléments de la table.`);
}
function sounded(en: string, fr: string): void {
  H(`The sound of each event of a ${en} (names of \`sounds\`); an event without a name is silent.`,
    `Le son de chaque évènement ${fr} (des noms de \`sounds\`) ; un évènement sans nom est muet.`);
}

// ---- the table, its credits
H('A table file.', 'Un fichier de table.');
H('What this file is.', 'Ce qu’est ce fichier.');
H('The version of the format the file is written in.', 'La version du format dans laquelle le fichier est écrit.');
H('The name of the table.', 'Le nom de la table.');
H('Who made it.', 'Qui l’a faite.');
H('A line about it.', 'Une ligne à son sujet.');
H('The authors and licences of the files the table uses (sounds, images, models).', 'Les auteurs et les licences des fichiers que la table utilise (sons, images, modèles).');
H('Who made some files of the table and under what licence. The game does not read it: it travels with the table, for whoever shares it or builds on it.',
  'Qui a fait certains fichiers de la table, et sous quelle licence. Le jeu ne le lit pas : cela voyage avec la table, pour qui la partage ou la reprend.');
H('The files of the table folder it speaks of.', 'Les fichiers du dossier de la table dont il parle.');
H('Who made them.', 'Qui les a faits.');
H('Where they come from: an address, or the script that made them.', 'D’où ils viennent : une adresse, ou le script qui les a produits.');
H('Their licence, by its name.', 'Leur licence, par son nom.');

// ---- the playfield, the physics, the ball
H('The board.', 'Le plateau.');
H('The board the ball rolls on: a rectangle from (0, 0) at the top left to (width, length) at the bottom right, where the drain is. A ball that passes the bottom edge is lost.',
  'Le plateau sur lequel roule la bille : un rectangle de (0, 0) en haut à gauche à (largeur, longueur) en bas à droite, où se trouve la sortie. Une bille qui passe le bord du bas est perdue.');
H('Left to right.', 'De gauche à droite.');
H('Top to bottom.', 'De haut en bas.');
H('The tilt of the table in degrees: how hard the ball is pulled towards the player.', 'L’inclinaison de la table en degrés : la force qui tire la bille vers le joueur.');
H('The height of the glass above the playfield: a ball that jumps cannot go higher.', 'La hauteur de la vitre au-dessus du plateau : une bille qui saute ne peut pas monter plus haut.');
H('What the ball feels: friction and bounce. Usually smooth wood.', 'Ce que sent la bille : adhérence et rebond. En général du bois lisse.');
H('What it looks like. The colour or the image of the board.', 'Son aspect. La couleur ou l’image du plateau.');
H('How it plays.', 'Sa façon de jouer.');
H('How the table plays. The numbers are real ones at first; a table tuned for arcade play raises gravity and kicks.',
  'La façon dont la table joue. Les nombres sont d’abord ceux d’une vraie table ; une table réglée pour un jeu d’arcade augmente la gravité et les forces.');
H('Steps of the simulation per second. Fast flippers and a small ball need many: under 480 a slow ball can end behind a flipper.',
  'Pas de la simulation par seconde. Des batteurs rapides et une petite bille en demandent beaucoup : sous 480, une bille lente peut finir derrière un batteur.');
H('cm/s² straight down. The slope of the playfield sends its share down the table.', 'cm/s² à la verticale. La pente du plateau en envoie sa part vers le bas de la table.');
H('The fastest a ball may go; kicks that would exceed it are capped.', 'La vitesse la plus grande d’une bille ; les impulsions qui la dépasseraient sont limitées.');
H('The speed a bump of the table gives every ball.', 'La vitesse qu’une secousse de la table donne à chaque bille.');
H('The ball.', 'La bille.');
H('A real pinball is 27 mm across.', 'Une vraie bille de flipper fait 27 mm de diamètre.');
H('In grams. Only its ratio to the strength of kicks and flippers matters.', 'En grammes. Seul compte son rapport à la force des impulsions et des batteurs.');
H('Its grip on what it touches: more grip turns sliding into spin sooner.', 'Son adhérence à ce qu’elle touche : plus elle adhère, plus vite le glissement devient rotation.');
H('Its bounce when two balls meet.', 'Son rebond quand deux billes se rencontrent.');
H('How fast it loses speed by itself, per second.', 'La vitesse qu’elle perd d’elle-même, par seconde.');
H('How fast it loses spin by itself, per second.', 'La rotation qu’elle perd d’elle-même, par seconde.');
H('Usually chrome.', 'En général du chrome.');
H('Its sounds.', 'Ses sons.');
sounded('ball', 'd’une bille');
H('While it rolls: played in a loop (give it `loop`), louder and higher as the ball goes faster.', 'Pendant qu’elle roule : joué en boucle (donnez-lui `loop`), plus fort et plus aigu quand la bille va plus vite.');
H('When two balls meet.', 'Quand deux billes se rencontrent.');
H('When it falls on the playfield or on a floor.', 'Quand elle tombe sur le plateau ou sur un plateau supérieur.');
H('When it hits something that names no sound of its own: a flipper, the side of a ramp, a model, the glass.',
  'Quand elle heurte une chose qui ne nomme aucun son : un batteur, le bord d’une rampe, un décor, la vitre.');

// ---- surfaces, looks, sounds, music
H('The surfaces elements are made of.', 'Les surfaces dont les éléments sont faits.');
H('A surface as the ball feels it. Elements name one in their `surface`.', 'Une surface telle que la bille la sent. Les éléments en nomment une dans leur `surface`.');
H('Its name.', 'Son nom.');
H('Grip, 0 (ice) to 1 (rubber). Of two things in contact the friction is the geometric mean.', 'Adhérence, de 0 (glace) à 1 (caoutchouc). Entre deux choses en contact, c’est la moyenne géométrique des deux.');
H('Bounce, 0 (dead) to 1 (loses nothing). Of two things in contact the larger counts.', 'Rebond, de 0 (aucun) à 1 (ne perd rien). Entre deux choses en contact, le plus grand compte.');
H('The looks elements are given.', 'Les aspects donnés aux éléments.');
H('A material as the eye sees it. Elements name one in their `look`.', 'Une matière telle que l’œil la voit. Les éléments en nomment une dans leur `look`.');
H('The base colour.', 'La couleur de base.');
H('smooth: lit, rounded; flat: lit, faceted; unlit: the colour as it is (signs, glowing parts).', 'smooth : éclairé, arrondi ; flat : éclairé, à facettes ; unlit : la couleur telle quelle (enseignes, parties lumineuses).');
H('The colour of the highlights (metal, glass); black for none.', 'La couleur des reflets (métal, verre) ; noir pour aucun.');
H('How tight the highlights are: 5 is satin, 200 is chrome.', 'La finesse des reflets : 5 est satiné, 200 est chromé.');
H('The colour the element takes when it is lit (a bumper that fires, a target that is the next step of a mission); black: it does not light.',
  'La couleur que prend l’élément quand il est allumé (un bumper qui frappe, une cible qui est la prochaine étape d’une mission) ; noir : il ne s’allume pas.');
H('An image of the table folder (PNG or JPEG) laid flat over the element as the top view shows it: its corners at the corners of the box around the element (the painting of a playfield, of a floor, of a bumper\'s cap). A model keeps the mapping of its mesh.',
  'Une image du dossier de la table (PNG ou JPEG) posée à plat sur l’élément tel que la vue de dessus le montre : ses coins aux coins du cadre qui entoure l’élément (la peinture d’un plateau, d’un plateau supérieur, du chapeau d’un bumper). Un décor garde le placage de son maillage.');
H('The same image painted with the lights of the table lit. For the look of the playfield, when the painting itself must change under a light: the pool of light of each light of the playfield that is on (a light\'s `glow`) then shows this image instead of adding the light\'s colour, and two such pools should not overlap. Usually left out.',
  'La même image, peinte avec les lampes de la table allumées. Pour l’aspect du plateau, quand la peinture elle-même doit changer sous une lampe : la tache de lumière de chaque lampe allumée du plateau (le `glow` d’une lampe) montre alors cette image au lieu d’ajouter la couleur de la lampe, et deux taches ne devraient pas se recouvrir. En général absent.');
H('The sounds.', 'Les sons.');
H('A sound: a recorded file of the table folder, or a tone generated when the table loads. Elements name one per event in their `sounds`.',
  'Un son : un fichier enregistré du dossier de la table, ou une note produite au chargement de la table. Les éléments en nomment un par évènement dans leurs `sounds`.');
H('A WAV, FLAC, MP3 or Ogg Vorbis file of the table folder. Empty: the sound is the generated tone below.', 'Un fichier WAV, FLAC, MP3 ou Ogg Vorbis du dossier de la table. Vide : le son est la note produite ci-dessous.');
H('The shape of the generated tone.', 'La forme de la note produite.');
H('The pitch of the generated tone.', 'La hauteur de la note produite.');
H('The length of the generated tone.', 'La durée de la note produite.');
H('How loud it plays, 1 as recorded.', 'Son volume, 1 tel qu’enregistré.');
H('Each play is louder or softer by up to this share (0.2: 80 % to 120 %), so that repeated hits do not sound stamped.',
  'Chaque lecture est plus forte ou plus douce, jusqu’à cette part (0.2 : de 80 % à 120 %), pour que des chocs répétés ne sonnent pas tous pareil.');
H('How fast it plays: 2 is an octave up.', 'Sa vitesse de lecture : 2 est une octave plus haut.');
H('Each play is higher or lower by up to this share.', 'Chaque lecture est plus aiguë ou plus grave, jusqu’à cette part.');
H('Played again when it ends (music, the ball rolling).', 'Rejoué quand il se termine (la musique, la bille qui roule).');
H('The music.', 'La musique.');
H('The music of each state of the game (names of `sounds`, usually with `loop`).', 'La musique de chaque état du jeu (des noms de `sounds`, en général avec `loop`).');
H('While the table waits for a player.', 'Pendant que la table attend un joueur.');
H('During a ball.', 'Pendant une bille.');
H('During multiball.', 'Pendant la multibille.');
H('After the last ball.', 'Après la dernière bille.');

// ---- walls, gates
H('Walls, guides, posts.', 'Murs, guides, plots.');
H('A wall, a guide or a lane divider: a path seen from above, raised to a height. Posts and rubbers are short walls with another surface.',
  'Un mur, un guide ou une séparation de couloir : un tracé vu de dessus, élevé à une hauteur. Les plots et les caoutchoucs sont de courts murs d’une autre surface.');
named('wall', 'du mur');
H('A name shared by several elements, so that one rule speaks of all of them ("pops", "lanes").', 'Un nom que plusieurs éléments partagent, pour qu’une seule règle parle d’eux tous ("pops", "lanes").');
H('The path: [x, y] for each point, or [x, y, bulge] when the stretch to the next point is an arc (bulge = sagitta / half chord: 0.4142 is a quarter circle, 1 a half circle; positive curves to the left of the direction of travel as seen in the top view).',
  'Le tracé : [x, y] pour chaque point, ou [x, y, bombement] quand le tronçon jusqu’au point suivant est un arc (bombement = flèche / demi-corde : 0.4142 est un quart de cercle, 1 un demi-cercle ; positif, il courbe vers la gauche du sens de parcours dans la vue de dessus).');
H('The last point joins the first.', 'Le dernier point rejoint le premier.');
H('The height of its foot above the playfield (an upper level stands on its own floor).', 'La hauteur de son pied au-dessus du plateau (un niveau supérieur repose sur son propre plateau).');
H('How tall it is. A ball that jumps higher passes over.', 'Sa hauteur. Une bille qui saute plus haut passe par-dessus.');
H('How thick it is.', 'Son épaisseur.');
H('What the ball feels: friction and bounce. Metal by default.', 'Ce que sent la bille : adhérence et rebond. Du métal par défaut.');
H('What it looks like. Metal by default.', 'Son aspect. Du métal par défaut.');
sounded('wall', 'd’un mur');
H('When the ball hits it.', 'Quand la bille le heurte.');
H('One-way gates.', 'Portillons à sens unique.');
H('A one-way gate across a lane: the ball passes when it comes from the left of the direction a to b (as seen in the top view), and is stopped from the other side.',
  'Un portillon à sens unique en travers d’un couloir : la bille passe quand elle vient de la gauche du sens a vers b (dans la vue de dessus), et elle est arrêtée de l’autre côté.');
named('gate', 'du portillon');
H('One end.', 'Un bout.');
H('The other end.', 'L’autre bout.');
H('The height of its foot.', 'La hauteur de son pied.');
H('How tall it is.', 'Sa hauteur.');
H('What the ball feels: friction and bounce. ', 'Ce que sent la bille : adhérence et rebond. ');
H('What it looks like. A wire by default.', 'Son aspect. Un fil de métal par défaut.');
sounded('gate', 'd’un portillon');
H('When a ball goes through.', 'Quand une bille le traverse.');

// ---- flippers, the plunger
H('Flippers.', 'Batteurs.');
H('A flipper: a tapered bat that turns around its pivot while its button is held.', 'Un batteur : une batte effilée qui tourne autour de son pivot tant que son bouton est tenu.');
named('flipper', 'du batteur');
H('Where it turns.', 'Là où il tourne.');
H('The height of its foot (a flipper of an upper level stands on that level).', 'La hauteur de son pied (un batteur d’un niveau supérieur repose sur ce niveau).');
H('From the pivot to the tip.', 'Du pivot au bout.');
H('Its radius at the pivot.', 'Son rayon au pivot.');
H('Its radius at the tip.', 'Son rayon au bout.');
H('The angle of the bat at rest: 0 points right, 90 down the table. A left flipper rests near 25, a right one near 155.',
  'L’angle de la batte au repos : 0 pointe à droite, 90 vers le bas de la table. Un batteur gauche repose vers 25, un droit vers 155.');
H('How far it swings when the button is pressed, in degrees: negative turns up for a left flipper, positive for a right one.',
  'Sa course quand le bouton est pressé, en degrés : négative, elle monte pour un batteur gauche ; positive, pour un droit.');
H('How fast it swings, degrees per second. This is the strength of the flipper: the ball leaves with the speed of the spot that hits it.',
  'Sa vitesse de frappe, en degrés par seconde. C’est la force du batteur : la bille repart à la vitesse du point qui la frappe.');
H('How fast it falls back when the button is released.', 'Sa vitesse de retour quand le bouton est relâché.');
H('The flipper button that drives it.', 'Le bouton de batteur qui le commande.');
H('What the ball feels: friction and bounce. Rubber by default.', 'Ce que sent la bille : adhérence et rebond. Du caoutchouc par défaut.');
H('What it looks like. ', 'Son aspect. ');
sounded('flipper', 'd’un batteur');
H('When it swings.', 'Quand il frappe.');
H('When it falls back.', 'Quand il retombe.');
H('The plunger.', 'Le lance-bille.');
H('The plunger: it is pulled back while its button is held, and released it strikes the ball that waits in front of it.',
  'Le lance-bille : il recule tant que son bouton est tenu ; relâché, il frappe la bille qui attend devant lui.');
H('The centre of its tip at rest. A new ball is put just in front of it.', 'Le centre de son bout au repos. Une nouvelle bille est posée juste devant.');
H('The direction it shoots: -90 is up the table.', 'La direction de son tir : -90 est vers le haut de la table.');
H('How far it can be pulled back.', 'La distance dont il peut reculer.');
H('Seconds to pull it all the way.', 'Secondes pour le tirer à fond.');
H('The speed of the tip when released from a full pull; a shorter pull gives less.', 'La vitesse de son bout quand il est lâché tiré à fond ; un tirage plus court donne moins.');
H('The width of its tip.', 'La largeur de son bout.');
H('The height of its tip.', 'La hauteur de son bout.');
sounded('plunger', 'd’un lance-bille');
H('While it is pulled.', 'Pendant qu’il est tiré.');
H('When it is released.', 'Quand il est lâché.');

// ---- bumpers, slingshots, kickers
H('Pop bumpers.', 'Bumpers.');
H('A pop bumper: a round post that kicks the ball away when it is touched.', 'Un bumper : un plot rond qui repousse la bille quand elle le touche.');
named('bumper', 'du bumper');
H('Its centre.', 'Son centre.');
H('The radius of its body.', 'Le rayon de son corps.');
H('The speed it adds to the ball, away from its centre.', 'La vitesse qu’il ajoute à la bille, en l’éloignant de son centre.');
H('The ball must arrive at least this fast to set it off.', 'La bille doit arriver au moins à cette vitesse pour le déclencher.');
H('What it looks like. The body; its `glow` shows when it fires.', 'Son aspect. Le corps ; son `glow` se voit quand il frappe.');
H('The look of its cap.', 'L’aspect de son chapeau.');
H('A light that lights its body: its look\'s `glow` also shows while that light is lit.', 'Une lampe qui éclaire son corps : le `glow` de son aspect se voit aussi tant que cette lampe est allumée.');
sounded('bumper', 'd’un bumper');
H('When it fires.', 'Quand il frappe.');
H('Slingshots.', 'Slingshots.');
H('A slingshot: a rubber band stretched from a to b that kicks the ball away, to the left of the direction a to b (as seen in the top view).',
  'Un slingshot : un élastique tendu de a à b qui repousse la bille, vers la gauche du sens a vers b (dans la vue de dessus).');
named('slingshot', 'du slingshot');
H('One end of the band.', 'Un bout de l’élastique.');
H('How tall the band is.', 'La hauteur de l’élastique.');
H('How thick the band is.', 'L’épaisseur de l’élastique.');
H('The speed it adds to the ball.', 'La vitesse qu’il ajoute à la bille.');
H('What it looks like. Its `glow` shows when it fires.', 'Son aspect. Son `glow` se voit quand il frappe.');
H('A light that lights it: its look\'s `glow` also shows while that light is lit.', 'Une lampe qui l’éclaire : le `glow` de son aspect se voit aussi tant que cette lampe est allumée.');
sounded('slingshot', 'd’un slingshot');
H('Kickers, saucers, holes.', 'Trous éjecteurs, soucoupes, trous.');
H('A hole that catches the ball, holds it, then throws it out: a saucer (same place), a subway (it comes out elsewhere), or a launcher that throws it in the air.',
  'Un trou qui attrape la bille, la retient, puis la rejette : une soucoupe (au même endroit), un passage souterrain (elle ressort ailleurs), ou un lanceur qui l’envoie en l’air.');
named('kicker', 'du trou éjecteur');
H('The height of the level it is in.', 'La hauteur du niveau où il se trouve.');
H('The radius of the hole.', 'Le rayon du trou.');
H('A ball faster than this rolls over the hole.', 'Une bille plus rapide que cela passe par-dessus le trou.');
H('Seconds it keeps the ball (rules may keep it longer: a lock).', 'Secondes pendant lesquelles il garde la bille (les règles peuvent la garder plus longtemps : un verrouillage).');
H('Where the ball comes out, counted from the hole: [0, 0, 0] is the hole itself, [0, 0, 6] the same place on a level 6 cm higher.',
  'Là où la bille ressort, compté depuis le trou : [0, 0, 0] est le trou lui-même, [0, 0, 6] le même endroit sur un niveau 6 cm plus haut.');
H('The speed it throws the ball at.', 'La vitesse à laquelle il rejette la bille.');
H('The direction it throws the ball in, in the top view.', 'La direction dans laquelle il rejette la bille, dans la vue de dessus.');
H('How steeply upwards it throws the ball, in degrees: 0 rolls it out, 45 throws it in an arc.', 'L’angle vers le haut auquel il rejette la bille, en degrés : 0 la fait rouler dehors, 45 la lance en cloche.');
H('The look of its rim.', 'L’aspect de son bord.');
H('A light that the kicker turns on while it holds a ball.', 'Une lampe que le trou éjecteur allume tant qu’il retient une bille.');
sounded('kicker', 'd’un trou éjecteur');
H('When it catches a ball.', 'Quand il attrape une bille.');
H('When it throws it out.', 'Quand il la rejette.');

// ---- targets, rollovers, spinners
H('Standup and drop targets.', 'Cibles fixes et cibles tombantes.');
H('A target: a small plate the ball hits. A standup stays; a drop target goes down when hit and stays down until a rule raises it.',
  'Une cible : une petite plaque que la bille frappe. Une cible fixe (standup) reste ; une cible tombante (drop) s’abaisse quand elle est frappée et le reste jusqu’à ce qu’une règle la relève.');
named('target', 'de la cible');
H('standup or drop.', 'standup (fixe) ou drop (tombante).');
H('The centre of its face.', 'Le centre de sa face.');
H('The direction its face looks at: 90 faces down the table.', 'La direction que regarde sa face : 90 regarde vers le bas de la table.');
H('How wide it is.', 'Sa largeur.');
H('What the ball feels: friction and bounce. Plastic by default.', 'Ce que sent la bille : adhérence et rebond. Du plastique par défaut.');
H('What it looks like. Its `glow` shows when it is lit.', 'Son aspect. Son `glow` se voit quand elle est allumée.');
H('A light on the playfield that goes with it (rules light it by this name or by the target\'s); the target\'s `glow` also shows while it is lit.',
  'Une lampe du plateau qui va avec elle (les règles l’allument par ce nom ou par celui de la cible) ; le `glow` de la cible se voit aussi tant qu’elle est allumée.');
sounded('target', 'd’une cible');
H('When it is raised again.', 'Quand elle est relevée.');
H('Rollover switches.', 'Contacts de passage.');
H('A switch in the playfield that a ball rolling over it closes: the line from a to b across a lane.',
  'Un contact dans le plateau, que ferme une bille qui roule dessus : la ligne de a à b en travers d’un couloir.');
named('rollover', 'du contact de passage');
H('One end of the line.', 'Un bout de la ligne.');
H('A light that goes with it.', 'Une lampe qui va avec.');
sounded('rollover', 'd’un contact de passage');
H('When a ball rolls over it.', 'Quand une bille roule dessus.');
H('Spinners.', 'Tourniquets.');
H('A spinner: a plate hung across a lane that a ball passing under sets spinning; every half turn is an event.',
  'Un tourniquet : une plaque suspendue en travers d’un couloir, qu’une bille qui passe dessous fait tourner ; chaque demi-tour est un évènement.');
named('spinner', 'du tourniquet');
H('One end of its axle.', 'Un bout de son axe.');
H('The height of the plate.', 'La hauteur de la plaque.');
H('Half turns per second it gains for each cm/s of the ball that passes.', 'Demi-tours par seconde qu’il gagne pour chaque cm/s de la bille qui passe.');
H('How fast it slows, per second.', 'La vitesse à laquelle il ralentit, par seconde.');
H('The look of its plate.', 'L’aspect de sa plaque.');
sounded('spinner', 'd’un tourniquet');
H('At every half turn.', 'À chaque demi-tour.');

// ---- ramps, floors, lights, models
H('Ramps, rails, habitrails.', 'Rampes, rails, rails en fil.');
H('A ramp, a rail or a habitrail: a track that follows a path seen from above while its height follows a profile. The ball climbs it, rides it above the playfield and leaves it where it ends, or flies off its lip.',
  'Une rampe, un rail ou un rail en fil : une piste qui suit un tracé vu de dessus pendant que sa hauteur suit un profil. La bille y monte, la parcourt au-dessus du plateau et la quitte où elle finit, ou s’envole de son bord.');
named('ramp', 'de la rampe');
H('The centre line seen from above, as for a wall (arcs by bulge).', 'La ligne du milieu vue de dessus, comme pour un mur (arcs par bombement).');
H('The height along the path: [fraction of the length, height] from [0, ...] to [1, ...], straight between the rows. [[0, 0], [0.3, 5], [1, 5]] climbs to 5 cm over the first third, then stays level.',
  'La hauteur le long du tracé : [part de la longueur, hauteur] de [0, ...] à [1, ...], en ligne droite entre les lignes. [[0, 0], [0.3, 5], [1, 5]] monte à 5 cm sur le premier tiers, puis reste à plat.');
H('The width of the track between its side walls.', 'La largeur de la piste entre ses bords.');
H('The height of the side walls above the track; 0 for none (a jump ramp).', 'La hauteur des bords au-dessus de la piste ; 0 pour aucun (un tremplin).');
H('How thick the track is.', 'L’épaisseur de la piste.');
H('solid: a plastic or metal ramp; wire: a habitrail, drawn as wires.', 'solid : une rampe de plastique ou de métal ; wire : un rail en fil, dessiné en fils.');
H('A solid ramp is closed underneath wherever it is too low for a ball to pass: its sides go down to the playfield and a lip closes the gap, so that no ball wedges under it. false leaves it open (a ramp that starts from an upper level).',
  'Une rampe pleine est fermée dessous partout où elle est trop basse pour qu’une bille passe : ses côtés descendent jusqu’au plateau et un rebord ferme l’ouverture, pour qu’aucune bille ne se coince dessous. false la laisse ouverte (une rampe qui part d’un niveau supérieur).');
sounded('ramp', 'd’une rampe');
H('When a ball enters at its first point.', 'Quand une bille entre par son premier point.');
H('When a ball leaves at its last point.', 'Quand une bille sort par son dernier point.');
H('Upper playfields.', 'Plateaux supérieurs.');
H('A level above the playfield: an upper playfield or a platform, whose outline is a closed path and whose top is at height z. Walls, flippers, targets and the rest stand on it by their own z.',
  'Un niveau au-dessus du plateau : un plateau supérieur ou une plateforme, dont le contour est un tracé fermé et dont le dessus est à la hauteur z. Les murs, les batteurs, les cibles et le reste s’y posent par leur propre z.');
named('floor', 'du plateau supérieur');
H('The outline seen from above (closed by itself), as for a wall.', 'Le contour vu de dessus (fermé de lui-même), comme pour un mur.');
H('The height of its top.', 'La hauteur de son dessus.');
H('Lights.', 'Lampes.');
H('A lamp under the playfield or on an element, that the rules turn on, off or blink.', 'Une lampe sous le plateau ou sur un élément, que les règles allument, éteignent ou font clignoter.');
H('A name shared by several lights ("lanes", "mission").', 'Un nom que plusieurs lampes partagent ("lanes", "mission").');
H('The shape of the insert.', 'La forme de l’insert.');
H('Its radius, or half its length.', 'Son rayon, ou la moitié de sa longueur.');
H('Where an arrow points, or how a bar lies.', 'Là où pointe une flèche, ou le sens d’une barre.');
H('Its colour when on; off, it shows a dark shade of it.', 'Sa couleur allumée ; éteinte, elle en montre une teinte sombre.');
H('How far around it its light falls when it is on: the radius of its pool of light on the level it is in (the playfield, or the upper playfield at its `z`), where its colour is added to what is under it, strongest at the light and nothing at this distance. Pools add up where they overlap. 0: only the insert lights up.',
  'Jusqu’où sa lumière tombe autour d’elle quand elle est allumée : le rayon de sa tache de lumière sur le niveau où elle se trouve (le plateau, ou le plateau supérieur à son `z`), où sa couleur s’ajoute à ce qui est dessous, au plus fort à la lampe et nulle à cette distance. Les taches s’additionnent où elles se recouvrent. 0 : seul l’insert s’allume.');
H('Modelled and decorative pieces.', 'Pièces modelées et décors.');
H('A modelled or decorative piece: a mesh file, or a simple solid.', 'Une pièce modelée ou un décor : un fichier de maillage, ou un solide simple.');
named('model', 'du décor');
H('An OBJ file of the table folder. Empty: the solid named by `shape`.', 'Un fichier OBJ du dossier de la table. Vide : le solide nommé par `shape`.');
H('The solid, 1 cm in size before `scale`.', 'Le solide, de 1 cm avant `scale`.');
H('Where its origin is: [x, y, z].', 'Là où est son origine : [x, y, z].');
H('Its turn in degrees around x, y (down the table) and z (up).', 'Sa rotation en degrés autour de x, de y (vers le bas de la table) et de z (vers le haut).');
H('Its size along x, y and z.', 'Sa taille selon x, y et z.');
H('none: the ball goes through (decoration); box: it meets its bounding box; hull: its convex hull.', 'none : la bille le traverse (décoration) ; box : elle rencontre sa boîte englobante ; hull : son enveloppe convexe.');
sounded('model', 'd’un décor');
H('When the ball hits it (a model that collides); without a name, the ball\'s `knock`.', 'Quand la bille le heurte (un décor avec collision) ; sans nom, le `knock` de la bille.');

// ---- the rules
H('The rules.', 'Les règles.');
H('How the table is played and scored. Everything here is data: the game has no rule of its own.', 'Comment la table se joue et compte les points. Tout ici est donnée : le jeu n’a aucune règle à lui.');
H('Balls per game.', 'Billes par partie.');
H('Seconds after a launch during which a drained ball comes back.', 'Secondes après un lancer pendant lesquelles une bille perdue revient.');
H('Extra balls one game can hold.', 'Billes supplémentaires qu’une partie peut avoir en réserve.');
H('The highest bonus multiplier.', 'Le plus grand multiplicateur de bonus.');
H('Bumps and tilt.', 'Secousses et tilt.');
H('Bumping the table: every bump fills a meter that empties with time; too full, the table tilts.', 'Secouer la table : chaque secousse remplit une jauge qui se vide avec le temps ; trop pleine, la table fait tilt.');
H('Bumps in a row that only warn; the next one tilts.', 'Secousses de suite qui ne font qu’avertir ; la suivante fait tilt.');
H('Seconds for one bump to be forgotten.', 'Secondes pour qu’une secousse soit oubliée.');
H('bonus: the flippers die until the ball drains and its bonus is lost; ball: the same, and no ball save; none: only a warning.',
  'bonus : les batteurs s’éteignent jusqu’à la perte de la bille, et son bonus est perdu ; ball : de même, et la bille n’est pas sauvée ; none : seulement un avertissement.');
H('The ranks, from the first: finishing a mission promotes to the next.', 'Les grades, à partir du premier : finir une mission fait passer au suivant.');
H('A group of lights that shows the rank: one more is lit at each promotion.', 'Un groupe de lampes qui montre le grade : une de plus s’allume à chaque promotion.');
H('A light that blinks while a drained ball would come back, and stays on while an extra ball is held ("shoot again").',
  'Une lampe qui clignote tant qu’une bille perdue reviendrait, et reste allumée tant qu’une bille supplémentaire est en réserve (« rejouez »).');
H('The names of the counters the rules use (a rule can only count what is declared here).', 'Les noms des compteurs dont les règles se servent (une règle ne peut compter que ce qui est déclaré ici).');
H('The missions.', 'Les missions.');
H('A mission: steps to do in order. One mission runs at a time, in the order of the list; finishing it pays its award times the rank and promotes the player.',
  'Une mission : des étapes à faire dans l’ordre. Une seule mission est en cours à la fois, dans l’ordre de la liste ; la finir paie sa prime multipliée par le grade et fait monter le joueur en grade.');
H('Its name for rules.', 'Son nom pour les règles.');
H('Its name on the panel.', 'Son nom sur le panneau.');
H('Points for finishing it, multiplied by the rank number.', 'Points pour l’avoir finie, multipliés par le numéro du grade.');
H('Its steps.', 'Ses étapes.');
H('One step of a mission: an event to get a number of times.', 'Une étape d’une mission : un évènement à obtenir un certain nombre de fois.');
H('What the panel asks for ("Light the three lanes").', 'Ce que le panneau demande (« Allumez les trois couloirs »).');
H('Where the event comes from.', 'D’où vient l’évènement.');
H('The event.', 'L’évènement.');
H('How many times.', 'Combien de fois.');
H('A light, or a group, that blinks while this step is the one to do.', 'Une lampe, ou un groupe, qui clignote tant que cette étape est celle à faire.');
H('Multiball.', 'Multibille.');
H('Multiball: balls locked in a kicker start it; while it lasts a shot scores the jackpot, which grows.',
  'Multibille : des billes verrouillées dans un trou éjecteur la déclenchent ; tant qu’elle dure, un tir marque le jackpot, qui grandit.');
H('Balls in play when it starts.', 'Billes en jeu quand elle commence.');
H('Locks (award "lock") needed to start it; 0: only a rule starts it.', 'Verrouillages (la prime "lock") nécessaires pour la déclencher ; 0 : seule une règle la déclenche.');
H('A group of lights that shows the locks: one more is lit at each lock.', 'Un groupe de lampes qui montre les verrouillages : une de plus s’allume à chaque verrouillage.');
H('Seconds a drained ball comes back after it starts.', 'Secondes pendant lesquelles une bille perdue revient après son début.');
H('Scores are multiplied by this while it lasts.', 'Les scores sont multipliés par cela tant qu’elle dure.');
H('Where the jackpot shot is.', 'Là où se fait le tir du jackpot.');
H('The event of the jackpot shot.', 'L’évènement du tir du jackpot.');
H('The first jackpot.', 'Le premier jackpot.');
H('What each jackpot adds to the next.', 'Ce que chaque jackpot ajoute au suivant.');
H('When something happens, and some things hold, do some things. Rules are read in order; all that match act.',
  'Quand une chose arrive, et que certaines choses sont vraies, faire certaines choses. Les règles sont lues dans l’ordre ; toutes celles qui correspondent agissent.');
H('The element, or the group of elements, that the event comes from; "game" for the events of the game itself.',
  'L’élément, ou le groupe d’éléments, d’où vient l’évènement ; "game" pour les évènements du jeu lui-même.');
H('hit: a bumper, slingshot, target, wall or model was hit; down: a drop target went down; roll: a rollover; spin: half a turn of a spinner; capture, eject: a kicker; enter, exit: a ramp; pass: a gate; flip: a flipper; launch: the plunger. From "game": start, ballStart, drain, ballSaved, bump (the player bumps the table), tilt, missionDone, rankUp, multiballStart, multiballEnd, jackpot, extraBall, gameOver, letter (the player takes a letter of the initials that sign a high score).',
  'hit : un bumper, un slingshot, une cible, un mur ou un décor a été heurté ; down : une cible tombante s’est abaissée ; roll : un contact de passage ; spin : un demi-tour de tourniquet ; capture, eject : un trou éjecteur ; enter, exit : une rampe ; pass : un portillon ; flip : un batteur ; launch : le lance-bille. De "game" : start, ballStart, drain, ballSaved, bump (le joueur secoue la table), tilt, missionDone, rankUp, multiballStart, multiballEnd, jackpot, extraBall, gameOver, letter (le joueur prend une lettre des initiales qui signent un meilleur score).');
H('Every one must hold.', 'Chacune doit être vraie.');
H('One thing that must hold for a rule to act.', 'Une chose qui doit être vraie pour qu’une règle agisse.');
H('counter: a counter against `value`; lights: every light of a name or group is on or off; targets: every drop target of a name or group is down or up; mode: the game is in normal or multiball; rank: the rank number against `value`; mission: the current mission is `target`; balls: the balls in play against `value`.',
  'counter : un compteur comparé à `value` ; lights : toutes les lampes d’un nom ou d’un groupe sont allumées ou éteintes ; targets : toutes les cibles tombantes d’un nom ou d’un groupe sont abaissées ou relevées ; mode : le jeu est en normal ou en multiball ; rank : le numéro du grade comparé à `value` ; mission : la mission en cours est `target` ; balls : les billes en jeu comparées à `value`.');
H('What is tested: a counter, a light or group ("self": the light of the element the event came from), a target or group, a mission, or a mode ("normal", "multiball").',
  'Ce qui est testé : un compteur, une lampe ou un groupe ("self" : la lampe de l’élément d’où vient l’évènement), une cible ou un groupe, une mission, ou un mode ("normal", "multiball").');
H('The comparison.', 'La comparaison.');
H('The number compared with.', 'Le nombre auquel on compare.');
H('What happens.', 'Ce qui se passe.');
H('One thing a rule does.', 'Une chose que fait une règle.');
H('score: add `value` points (times the playfield multiplier during multiball); bonus: add `value` to the end-of-ball bonus; multiplier: raise the bonus multiplier by `value`; light: set the lights of `target` to `mode`; count: add `value` to the counter `target`, or set it with mode "set"; reset: raise the drop targets of `target`; say: show the text `target` on the panel; sound: play the sound `target`; award: give what `mode` names; rotate: move the lit lights of the group `target` by `value` places (lane change).',
  'score : ajouter `value` points (fois le multiplicateur du plateau pendant la multibille) ; bonus : ajouter `value` au bonus de fin de bille ; multiplier : augmenter le multiplicateur de bonus de `value` ; light : mettre les lampes de `target` en `mode` ; count : ajouter `value` au compteur `target`, ou le fixer avec le mode "set" ; reset : relever les cibles tombantes de `target` ; say : afficher le texte `target` sur le panneau ; sound : jouer le son `target` ; award : donner ce que nomme `mode` ; rotate : décaler les lampes allumées du groupe `target` de `value` places (changement de couloir).');
H('What it acts on. For light, "self" is the light of the element the event came from.', 'Ce sur quoi elle agit. Pour light, "self" est la lampe de l’élément d’où vient l’évènement.');
H('How much.', 'De combien.');
H('For light: on, off, blink, flash (on for `seconds`) or toggle. For count: set. For award: extraBall, ballSave (for `seconds`), lock (keep the ball in the kicker that caught it), multiball (start it), mission (count one step of the current mission, whatever it listens to).',
  'Pour light : on, off, blink, flash (allumée pendant `seconds`) ou toggle. Pour count : set. Pour award : extraBall, ballSave (pendant `seconds`), lock (garder la bille dans le trou éjecteur qui l’a attrapée), multiball (la déclencher), mission (compter une étape de la mission en cours, quoi qu’elle attende).');
H('How long, for a flash or a ball save.', 'Combien de temps, pour un flash ou une bille sauvée.');
H('The high scores the table ships with.', 'Les meilleurs scores fournis avec la table.');
H('A line of the high score table as the table ships; the scores players make are kept apart, by the game.',
  'Une ligne du tableau des meilleurs scores tel que la table le fournit ; les scores des joueurs sont gardés à part, par le jeu.');
H('Three letters.', 'Trois lettres.');
H('The score.', 'Le score.');

// ---- the lighting, the screen layouts
H('The light of the scene.', 'La lumière de la scène.');
H('What is seen around the table.', 'Ce qui se voit autour de la table.');
H('The light that reaches everything.', 'La lumière qui atteint tout.');
H('Up to 4 lamps.', 'Jusqu’à 4 projecteurs.');
H('A light that shines on the whole table from far away.', 'Une lumière qui éclaire toute la table de très loin.');
H('The way the light travels: [x, y, z] (z negative: downwards).', 'Le sens dans lequel va la lumière : [x, y, z] (z négatif : vers le bas).');
H('Its colour.', 'Sa couleur.');
H('The lights that are the general illumination of the table: the lamps and the ambient light shine in full while they are lit, and fall to `dimmed` while they are off (a tilt, a game that is over). None: the scene is always fully lit.',
  'Les lampes qui sont l’éclairage général de la table : les projecteurs et la lumière ambiante brillent à plein tant qu’elles sont allumées, et tombent à `dimmed` tant qu’elles sont éteintes (un tilt, une partie finie). Aucune : la scène est toujours pleinement éclairée.');
H('How much of the light of the scene is left when the general illumination is off, 0 (dark) to 1.', 'La part de la lumière de la scène qui reste quand l’éclairage général est éteint, de 0 (noir) à 1.');
H('The screen layouts.', 'Les mises en page.');
H('The two layouts. The game takes portrait when its window is taller than wide, landscape otherwise, unless a launch option forces one.',
  'Les deux mises en page. Le jeu prend portrait quand sa fenêtre est plus haute que large, landscape sinon, sauf si une option de lancement en impose une.');
H('The table upright at the left, the panel at the right.', 'La table debout à gauche, le panneau à droite.');
H('One way to put the table and the panel in a window.', 'Une façon de placer la table et le panneau dans une fenêtre.');
H('The size the layout is drawn for; another window is letterboxed.', 'La taille pour laquelle la mise en page est dessinée ; une autre fenêtre reçoit des bandes.');
H('Where the table is drawn: [x, y, width, height] in the window.', 'Là où la table est dessinée : [x, y, largeur, hauteur] dans la fenêtre.');
H('The eye.', 'L’œil.');
H('The fixed eye that looks at the table, in table coordinates.', 'L’œil fixe qui regarde la table, dans les coordonnées de la table.');
H('Where it is: [x, y, z].', 'Là où il est : [x, y, z].');
H('What it looks at.', 'Ce qu’il regarde.');
H('The vertical field of view, in degrees.', 'Le champ de vision vertical, en degrés.');
H('The panel.', 'Le panneau.');
H('The score panel.', 'Le panneau des scores.');
H('Its background: [x, y, width, height] in the window; all zeros for none (items drawn over the table).', 'Son fond : [x, y, largeur, hauteur] dans la fenêtre ; tout à zéro pour aucun (éléments dessinés par-dessus la table).');
H('The colour of its background.', 'La couleur de son fond.');
H('An image of the table folder drawn over the background, filling the box (the backglass); the part that does not fit the box is cut.',
  'Une image du dossier de la table dessinée sur le fond, qui remplit le cadre (le fronton) ; la partie qui dépasse du cadre est coupée.');
H('What it shows.', 'Ce qu’il affiche.');
H('One thing the panel shows, in a box of the window.', 'Une chose que le panneau affiche, dans un cadre de la fenêtre.');
H('title: the name of the table; score; ball: the ball number and the extra balls; rank; mission: the name of the mission; step: what to do next; message: what the rules say; bonus: the bonus and its multiplier; highScores; hint: the keys.',
  'title : le nom de la table ; score ; ball : le numéro de la bille et les billes supplémentaires ; rank ; mission : le nom de la mission ; step : ce qu’il faut faire ensuite ; message : ce que disent les règles ; bonus : le bonus et son multiplicateur ; highScores ; hint : les touches.');
H('Where: [x, y, width, height] in the window.', 'Où : [x, y, largeur, hauteur] dans la fenêtre.');
H('The height of the text.', 'La hauteur du texte.');
H('The colour of the text.', 'La couleur du texte.');
H('How the text sits in its box.', 'La place du texte dans son cadre.');
H('A small caption above it.', 'Une petite légende au-dessus.');
H('The whole table on a vertical screen, the score in the backglass area above it.', 'La table entière sur un écran vertical, le score dans la zone du fronton au-dessus.');
