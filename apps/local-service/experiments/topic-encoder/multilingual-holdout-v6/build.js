// Corpus authoring source. Run `node build.js` only when deliberately revising
// the frozen holdout, then update the digest in integrity.test.js and README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const languages = ['en', 'nl', 'de', 'fr', 'es'];
const viewpoints = ['supportive', 'critical', 'neutral', 'skeptical', 'consumer'];
const titleCues = {
  en: {
    supportive: 'A welcome step:',
    critical: 'Critics ask:',
    neutral: 'In brief:',
    skeptical: 'Will it work?',
    consumer: 'For users:',
  },
  nl: {
    supportive: 'Welkom plan:',
    critical: 'Kritische vragen:',
    neutral: 'In het kort:',
    skeptical: 'Werkt het?',
    consumer: 'Voor gebruikers:',
  },
  de: {
    supportive: 'Willkommener Schritt:',
    critical: 'Kritische Fragen:',
    neutral: 'Im Überblick:',
    skeptical: 'Wird es funktionieren?',
    consumer: 'Für Nutzer:',
  },
  fr: {
    supportive: 'Une avancée bienvenue :',
    critical: 'Des critiques :',
    neutral: 'En bref :',
    skeptical: 'Cela fonctionnera-t-il ?',
    consumer: 'Pour les usagers :',
  },
  es: {
    supportive: 'Un avance bienvenido:',
    critical: 'Preguntas críticas:',
    neutral: 'En breve:',
    skeptical: '¿Funcionará?',
    consumer: 'Para los usuarios:',
  },
};

// Each five-element prose/title tuple follows en, nl, de, fr, es.
// Facts are deliberately close within a family but differ in action, date,
// quantity, and the part of the service affected.
const topics = [
  { family: 'aven-fen-transit', key: 'evening-route', label: 'Aven Fen Transit Route 7 evening frequency', text: [
    ['Route 7 evening buses every twenty minutes', 'Aven Fen Transit says Route 7 evening buses will run every twenty minutes from 12 January instead of every thirty minutes. The three stops on the existing route stay in place. The agency says the extra departures will be listed in its timetable before the change begins.'],
    ['Lijn 7 rijdt in de avond om de twintig minuten', 'Aven Fen Transit meldt dat de avondbussen van lijn 7 vanaf 12 januari elke twintig minuten rijden in plaats van elke dertig minuten. De drie haltes op de bestaande route blijven staan. De vervoerder zet de extra ritten voor de ingangsdatum in de dienstregeling.'],
    ['Linie 7 fährt abends alle zwanzig Minuten', 'Aven Fen Transit kündigt an, dass die Abendbusse der Linie 7 ab dem 12. Januar alle zwanzig statt alle dreißig Minuten fahren. Die drei Haltestellen der bestehenden Strecke bleiben erhalten. Die zusätzlichen Abfahrten sollen vor Beginn der Änderung im Fahrplan stehen.'],
    ['Un bus toutes les vingt minutes le soir sur la ligne 7', 'Aven Fen Transit annonce que les bus du soir de la ligne 7 passeront toutes les vingt minutes dès le 12 janvier, au lieu de trente. Les trois arrêts du trajet actuel sont maintenus. Les départs supplémentaires figureront dans les horaires avant ce changement.'],
    ['La línea 7 pasará cada veinte minutos por la tarde', 'Aven Fen Transit anuncia que los autobuses vespertinos de la línea 7 pasarán cada veinte minutos desde el 12 de enero, en vez de cada treinta. Se mantienen las tres paradas del recorrido actual. Las salidas adicionales aparecerán en el horario antes del cambio.'],
  ]},
  { family: 'aven-fen-transit', key: 'bridge-platform', label: 'Aven Fen Transit bridge stop platform relocation', text: [
    ['Bridge stop platform moves eighty metres east', 'Aven Fen Transit will move the platform at Bridge stop eighty metres east on 3 March while crews repair the current shelter. The stop keeps the same name and both bus lines will still serve it. New signs are due at the old platform before the move.'],
    ['Perron bij halte Bridge verhuist tachtig meter oostwaarts', 'Aven Fen Transit verplaatst het perron bij halte Bridge op 3 maart tachtig meter naar het oosten terwijl de huidige abri wordt hersteld. De halte houdt dezelfde naam en beide buslijnen blijven er stoppen. Voor de verhuizing komen wegwijzers bij het oude perron.'],
    ['Bahnsteig der Haltestelle Bridge zieht achtzig Meter ostwärts', 'Aven Fen Transit verlegt den Bahnsteig der Haltestelle Bridge am 3. März achtzig Meter nach Osten, während der bisherige Unterstand repariert wird. Der Haltestellenname bleibt gleich und beide Buslinien halten weiter dort. Am alten Bahnsteig sollen vorher Hinweisschilder angebracht werden.'],
    ['Le quai de l’arrêt Bridge déplacé de quatre-vingts mètres', 'Aven Fen Transit déplacera le quai de l’arrêt Bridge de quatre-vingts mètres vers l’est le 3 mars, pendant la réparation de l’abri actuel. L’arrêt gardera son nom et les deux lignes de bus continueront à le desservir. Des panneaux seront posés à l’ancien quai avant le déplacement.'],
    ['El andén de la parada Bridge se mueve ochenta metros', 'Aven Fen Transit trasladará el andén de la parada Bridge ochenta metros al este el 3 de marzo mientras se repara el refugio actual. La parada conservará su nombre y seguirán llegando ambas líneas de autobús. Habrá señales en el andén antiguo antes del traslado.'],
  ]},
  { family: 'aven-fen-transit', key: 'fare-cap', label: 'Aven Fen Transit contactless daily fare cap', text: [
    ['Contactless daily fare capped at six credits', 'Aven Fen Transit will cap contactless daily fares at six credits from 1 May. Riders must tap the same card on each trip for the cap to apply; cash tickets are outside the change. The agency says journey receipts will show when the daily ceiling has been reached.'],
    ['Dagmaximum voor contactloos reizen wordt zes credits', 'Aven Fen Transit stelt vanaf 1 mei een dagmaximum van zes credits in voor contactloos reizen. Reizigers moeten bij elke rit dezelfde kaart gebruiken; contante kaartjes vallen buiten de wijziging. Volgens de vervoerder toont het ritbewijs wanneer het maximum is bereikt.'],
    ['Kontaktlose Tagesfahrten kosten höchstens sechs Credits', 'Aven Fen Transit führt ab dem 1. Mai eine Obergrenze von sechs Credits pro Tag für kontaktlose Fahrten ein. Fahrgäste müssen auf jeder Fahrt dieselbe Karte verwenden; Barfahrkarten sind ausgenommen. Laut Verkehrsbetrieb zeigen Fahrtbelege an, wann die Grenze erreicht ist.'],
    ['Un plafond de six crédits par jour sans contact', 'Aven Fen Transit plafonnera les tarifs sans contact à six crédits par jour dès le 1er mai. Les voyageurs devront utiliser la même carte pour chaque trajet; les billets en espèces sont exclus. Selon l’organisme, les reçus indiqueront quand le plafond quotidien est atteint.'],
    ['Tope diario de seis créditos para pagos sin contacto', 'Aven Fen Transit limitará a seis créditos el gasto diario con pago sin contacto desde el 1 de mayo. Los viajeros tendrán que usar la misma tarjeta en cada viaje; los billetes en efectivo quedan fuera. La entidad dice que los recibos indicarán cuándo se alcance el límite.'],
  ]},
  { family: 'aven-fen-transit', key: 'solar-depot', label: 'Aven Fen Transit depot solar roof activation', text: [
    ['Depot roof activates 180 solar panels', 'Aven Fen Transit plans to switch on 180 solar panels on the roof of its east depot on 15 July. The electricity will first serve depot lighting, with any surplus sent to the local grid. The agency has not linked the installation to a change in fares or routes.'],
    ['Dak van oostelijk depot krijgt 180 actieve zonnepanelen', 'Aven Fen Transit wil op 15 juli 180 zonnepanelen op het dak van zijn oostelijke depot inschakelen. De stroom gaat eerst naar de depotverlichting; een overschot gaat naar het lokale net. De vervoerder verbindt de installatie niet aan andere tarieven of routes.'],
    ['180 Solarmodule auf dem Ostdepot gehen in Betrieb', 'Aven Fen Transit will am 15. Juli 180 Solarmodule auf dem Dach seines Ostdepots einschalten. Der Strom soll zunächst die Depotbeleuchtung versorgen; Überschüsse gehen ins örtliche Netz. Eine Änderung von Fahrpreisen oder Linien verbindet der Betrieb damit nicht.'],
    ['Cent quatre-vingts panneaux solaires activés au dépôt est', 'Aven Fen Transit prévoit d’activer 180 panneaux solaires sur le toit de son dépôt est le 15 juillet. L’électricité alimentera d’abord l’éclairage du dépôt; le surplus ira au réseau local. L’organisme n’associe cette installation à aucune modification des tarifs ou des lignes.'],
    ['El depósito este activará 180 paneles solares', 'Aven Fen Transit prevé activar 180 paneles solares en el tejado de su depósito este el 15 de julio. La electricidad alimentará primero la iluminación del depósito y el excedente irá a la red local. La entidad no vincula la instalación con cambios de tarifas ni rutas.'],
  ]},
  { family: 'marova-food-cooperative', key: 'cold-room', label: 'Marova Food Cooperative North Quay cold room opening', text: [
    ['North Quay cold room opens with forty pallet spaces', 'Marova Food Cooperative will open a cold room at North Quay on 4 November with space for forty pallets of produce. Member growers can reserve storage in advance, but the cooperative has not changed delivery schedules. Staff will inspect the room before the first consignments arrive.'],
    ['Koelruimte aan North Quay opent met veertig palletplaatsen', 'Marova Food Cooperative opent op 4 november een koelruimte aan North Quay met plaats voor veertig pallets groente en fruit. Aangesloten telers kunnen opslag vooraf reserveren; bezorgschema’s veranderen niet. Medewerkers controleren de ruimte voordat de eerste ladingen aankomen.'],
    ['Kühlraum am North Quay öffnet mit vierzig Palettenplätzen', 'Marova Food Cooperative eröffnet am 4. November einen Kühlraum am North Quay mit Platz für vierzig Paletten Obst und Gemüse. Angeschlossene Erzeuger können Lagerplätze vorab reservieren; Lieferpläne bleiben unverändert. Mitarbeiter prüfen den Raum vor dem Eintreffen der ersten Sendungen.'],
    ['Une chambre froide de quarante palettes ouvre à North Quay', 'Marova Food Cooperative ouvrira le 4 novembre une chambre froide à North Quay pouvant accueillir quarante palettes de produits frais. Les producteurs membres pourront réserver une place à l’avance; les horaires de livraison ne changent pas. Le personnel inspectera la salle avant les premiers arrivages.'],
    ['Abre una cámara fría para cuarenta palés en North Quay', 'Marova Food Cooperative abrirá el 4 de noviembre una cámara fría en North Quay con capacidad para cuarenta palés de productos frescos. Los productores socios podrán reservar espacio con antelación; los horarios de entrega siguen iguales. El personal revisará la sala antes de las primeras remesas.'],
  ]},
  { family: 'marova-food-cooperative', key: 'unit-labels', label: 'Marova Food Cooperative per-kilo shelf label rollout', text: [
    ['Six stores add price-per-kilo shelf labels', 'Marova Food Cooperative will add price-per-kilo labels to produce shelves at six stores on 18 November. Package prices remain displayed alongside the new unit figures. The cooperative says shoppers will be able to compare differently sized packs without doing the conversion themselves.'],
    ['Zes winkels tonen voortaan de prijs per kilo', 'Marova Food Cooperative voegt op 18 november in zes winkels kiloprijzen toe aan schaplabels voor groente en fruit. De verpakkingsprijs blijft naast de nieuwe eenheidsprijs staan. Volgens de coöperatie kunnen klanten zo verpakkingen van verschillende grootte vergelijken zonder zelf om te rekenen.'],
    ['Sechs Läden ergänzen Kilopreise am Regal', 'Marova Food Cooperative ergänzt am 18. November in sechs Geschäften die Regalschilder für Obst und Gemüse um Kilopreise. Die Packungspreise bleiben neben den neuen Angaben sichtbar. Kunden können dadurch nach Angaben der Genossenschaft unterschiedlich große Packungen ohne eigene Umrechnung vergleichen.'],
    ['Six magasins affichent désormais les prix au kilo', 'Marova Food Cooperative ajoutera le 18 novembre des prix au kilo aux rayons de produits frais dans six magasins. Le prix du paquet restera affiché à côté du nouveau prix unitaire. La coopérative estime que les clients compareront ainsi des formats différents sans calcul supplémentaire.'],
    ['Seis tiendas añadirán precios por kilo en los estantes', 'Marova Food Cooperative añadirá el 18 de noviembre precios por kilo a los estantes de frutas y verduras de seis tiendas. El precio del paquete seguirá junto a la nueva cifra unitaria. La cooperativa dice que así se podrán comparar tamaños distintos sin hacer cálculos.'],
  ]},
  { family: 'marova-food-cooperative', key: 'crate-deposit', label: 'Marova Food Cooperative reusable crate deposit', text: [
    ['Reusable produce crates get two-token deposit', 'Marova Food Cooperative will charge a refundable deposit of two tokens for each reusable produce crate from 2 December. Customers can return empty crates at any of its six stores. The deposit applies to crates, not to the produce inside, and a receipt will show the separate charge.'],
    ['Herbruikbare kratten krijgen statiegeld van twee tokens', 'Marova Food Cooperative vraagt vanaf 2 december twee tokens statiegeld voor elke herbruikbare groentekrat. Klanten kunnen lege kratten bij elk van de zes winkels terugbrengen. Het statiegeld geldt voor de krat, niet voor de inhoud, en staat apart op de kassabon.'],
    ['Zwei Token Pfand auf wiederverwendbare Gemüsekisten', 'Marova Food Cooperative erhebt ab dem 2. Dezember ein rückzahlbares Pfand von zwei Token auf jede wiederverwendbare Gemüsekiste. Leere Kisten können Kunden in allen sechs Läden zurückgeben. Das Pfand gilt für die Kiste, nicht ihren Inhalt, und erscheint gesondert auf dem Beleg.'],
    ['Deux jetons de consigne pour les caisses réutilisables', 'Marova Food Cooperative demandera dès le 2 décembre une consigne remboursable de deux jetons pour chaque caisse réutilisable de produits frais. Les clients pourront rapporter les caisses vides dans chacun des six magasins. La consigne concerne la caisse, pas son contenu, et figurera séparément sur le reçu.'],
    ['Depósito de dos fichas para las cajas reutilizables', 'Marova Food Cooperative cobrará desde el 2 de diciembre un depósito reembolsable de dos fichas por cada caja reutilizable de productos frescos. Los clientes podrán devolver las cajas vacías en cualquiera de sus seis tiendas. El depósito corresponde a la caja, no a su contenido, y aparecerá por separado en el recibo.'],
  ]},
  { family: 'marova-food-cooperative', key: 'delivery-cutoff', label: 'Marova Food Cooperative evening delivery order cutoff', text: [
    ['Evening delivery orders accepted until six', 'Marova Food Cooperative will move the order cutoff for evening deliveries from five to six in the afternoon on 9 January. The delivery window itself stays the same, and the change covers all six stores. Orders placed after six will still be assigned to a later delivery day.'],
    ['Bestellen voor avondlevering kan tot zes uur', 'Marova Food Cooperative verschuift op 9 januari de besteldeadline voor avondleveringen van vijf naar zes uur in de middag. Het bezorgvenster zelf blijft gelijk en de wijziging geldt voor alle zes winkels. Bestellingen na zes uur komen nog steeds op een latere bezorgdag.'],
    ['Bestellschluss für Abendlieferungen künftig um sechs', 'Marova Food Cooperative verschiebt am 9. Januar den Bestellschluss für Abendlieferungen von fünf auf sechs Uhr nachmittags. Das Lieferzeitfenster bleibt unverändert; die Änderung gilt in allen sechs Geschäften. Bestellungen nach sechs Uhr werden weiterhin einem späteren Liefertag zugeordnet.'],
    ['Commandes du soir possibles jusqu’à dix-huit heures', 'Marova Food Cooperative repoussera le 9 janvier la limite de commande pour les livraisons du soir de dix-sept à dix-huit heures. Le créneau de livraison restera inchangé et les six magasins sont concernés. Les commandes passées après dix-huit heures iront toujours à une autre date.'],
    ['Los pedidos para entrega vespertina cerrarán a las seis', 'Marova Food Cooperative retrasará el 9 de enero el cierre de pedidos para entregas vespertinas de las cinco a las seis de la tarde. La franja de reparto no cambia y la medida afecta a las seis tiendas. Los pedidos posteriores pasarán a otro día.'],
  ]},
  { family: 'orila-archive-network', key: 'oral-booths', label: 'Orila Archive Network Cedar oral history booths', text: [
    ['Cedar branch adds two oral history booths', 'Orila Archive Network will open two oral history recording booths at its Cedar branch on 6 February. Visitors can book a slot to record a family story; participation is voluntary. The network says recordings will be reviewed with each contributor before any public access is granted.'],
    ['Vestiging Cedar krijgt twee cabines voor levensverhalen', 'Orila Archive Network opent op 6 februari twee opnamecabines voor levensverhalen in vestiging Cedar. Bezoekers kunnen een tijdslot reserveren om een familieverhaal op te nemen; deelname is vrijwillig. Volgens het netwerk worden opnamen met iedere deelnemer besproken voordat ze eventueel openbaar worden.'],
    ['Zweigstelle Cedar erhält zwei Erzählkabinen', 'Orila Archive Network eröffnet am 6. Februar in der Zweigstelle Cedar zwei Aufnahmekabinen für mündliche Familiengeschichten. Besucher können einen Termin buchen; die Teilnahme ist freiwillig. Das Netzwerk will jede Aufnahme mit der beitragenden Person prüfen, bevor ein öffentlicher Zugang möglich wird.'],
    ['Deux cabines de témoignage ouvrent à la branche Cedar', 'Orila Archive Network ouvrira le 6 février deux cabines d’enregistrement de récits familiaux dans sa branche Cedar. Les visiteurs pourront réserver un créneau; la participation reste volontaire. Le réseau examinera chaque enregistrement avec son auteur avant toute ouverture au public.'],
    ['La sede Cedar abrirá dos cabinas de testimonios', 'Orila Archive Network abrirá el 6 de febrero dos cabinas para grabar historias familiares en su sede Cedar. Los visitantes podrán reservar hora y participar de forma voluntaria. La red revisará cada grabación con quien la aporte antes de permitir cualquier acceso público.'],
  ]},
  { family: 'orila-archive-network', key: 'map-release', label: 'Orila Archive Network digitized map release', text: [
    ['Archive publishes six hundred digitized maps', 'Orila Archive Network will publish six hundred scanned district maps in its online catalog on 14 March. The maps cover different decades, and each entry will carry its original date where known. The network says the release adds search access but does not replace the paper collection.'],
    ['Archief publiceert zeshonderd gedigitaliseerde kaarten', 'Orila Archive Network publiceert op 14 maart zeshonderd gescande regiokaarten in zijn online catalogus. De kaarten komen uit verschillende decennia; elke vermelding krijgt waar bekend de oorspronkelijke datum. Volgens het netwerk maakt de publicatie zoeken makkelijker, maar blijft de papieren collectie bestaan.'],
    ['Archiv stellt sechshundert digitalisierte Karten online', 'Orila Archive Network veröffentlicht am 14. März sechshundert gescannte Gebietskarten in seinem Onlinekatalog. Die Karten stammen aus verschiedenen Jahrzehnten; bekannte Originaldaten werden jeweils angegeben. Das Netzwerk erleichtert damit die Suche, ersetzt jedoch nach eigenen Angaben die Papiersammlung nicht.'],
    ['Six cents cartes numérisées mises en ligne', 'Orila Archive Network publiera le 14 mars six cents cartes de district numérisées dans son catalogue en ligne. Elles proviennent de plusieurs décennies; la date d’origine sera indiquée lorsqu’elle est connue. Le réseau précise que cette recherche en ligne ne remplace pas la collection papier.'],
    ['Publicarán seiscientos mapas digitalizados del distrito', 'Orila Archive Network publicará el 14 de marzo seiscientos mapas distritales escaneados en su catálogo digital. Proceden de distintas décadas y cada ficha indicará la fecha original cuando se conozca. La red afirma que la consulta en línea no sustituye la colección en papel.'],
  ]},
  { family: 'orila-archive-network', key: 'mobile-stop', label: 'Orila Archive Network mobile archive village stop', text: [
    ['Mobile archive adds village stop twice monthly', 'Orila Archive Network will add a stop in Alder village to its mobile archive route from 5 April. The van will visit on two Saturdays each month, bringing catalog access and staff assistance. It will not carry original documents; requests for those still go through the main reading room.'],
    ['Rijdend archief stopt twee zaterdagen per maand in Alder', 'Orila Archive Network voegt vanaf 5 april het dorp Alder toe aan de route van zijn rijdende archief. De bus komt twee zaterdagen per maand met catalogustoegang en hulp van medewerkers. Originele documenten reizen niet mee; verzoeken daarvoor lopen via de centrale leeszaal.'],
    ['Mobiles Archiv hält zweimal monatlich im Dorf Alder', 'Orila Archive Network nimmt ab dem 5. April das Dorf Alder in die Route seines mobilen Archivs auf. Der Wagen kommt an zwei Samstagen im Monat und bietet Katalogzugang sowie Beratung. Originaldokumente fährt er nicht mit; Anfragen laufen weiter über den Hauptlesesaal.'],
    ['Les archives mobiles passeront deux samedis par mois à Alder', 'Orila Archive Network ajoutera le village d’Alder à sa tournée mobile dès le 5 avril. Le véhicule passera deux samedis par mois avec accès au catalogue et aide du personnel. Il ne transportera pas les documents originaux, demandés auprès de la salle de lecture principale.'],
    ['El archivo móvil visitará Alder dos sábados al mes', 'Orila Archive Network añadirá el pueblo de Alder a la ruta del archivo móvil desde el 5 de abril. La furgoneta irá dos sábados al mes con acceso al catálogo y ayuda del personal. No llevará documentos originales; esas solicitudes seguirán en la sala principal.'],
  ]},
  { family: 'orila-archive-network', key: 'tuesday-closure', label: 'Orila Archive Network Tuesday reading room roof repair closure', text: [
    ['Reading room closes Tuesdays during June roof repairs', 'Orila Archive Network will close its main reading room on Tuesdays in June while workers repair the roof. It will remain open on its other usual days, and online catalog access will continue. The network says visitors with Tuesday bookings will be offered another available date.'],
    ['Leeszaal sluit dinsdagen in juni wegens dakreparatie', 'Orila Archive Network sluit zijn centrale leeszaal op dinsdagen in juni terwijl het dak wordt gerepareerd. Op de andere gebruikelijke dagen blijft de zaal open en de online catalogus blijft beschikbaar. Bezoekers met een dinsdagreservering krijgen volgens het netwerk een andere beschikbare datum aangeboden.'],
    ['Lesesaal schließt im Juni dienstags wegen Dacharbeiten', 'Orila Archive Network schließt seinen Hauptlesesaal im Juni dienstags, während das Dach repariert wird. An den anderen üblichen Tagen bleibt er geöffnet, der Onlinekatalog ist weiter erreichbar. Besuchern mit einer Dienstagsbuchung soll ein anderer verfügbarer Termin angeboten werden.'],
    ['Salle de lecture fermée les mardis de juin pour le toit', 'Orila Archive Network fermera sa salle de lecture principale les mardis de juin pendant la réparation du toit. Elle restera ouverte les autres jours habituels, et le catalogue en ligne sera accessible. Le réseau proposera une autre date disponible aux visiteurs ayant réservé un mardi.'],
    ['La sala de lectura cerrará los martes de junio por obras', 'Orila Archive Network cerrará su sala de lectura principal los martes de junio durante la reparación del tejado. Abrirá los demás días habituales y el catálogo digital seguirá disponible. La red ofrecerá otra fecha libre a quienes tengan una reserva para un martes.'],
  ]},
];

// One event-specific closing perspective per emitted record, in language order.
// The assignment rotates, so these follow the viewpoint selected below.
const perspectives = [
  [
    'Regular evening riders welcome the shorter wait, especially when a missed bus would otherwise mean half an hour at a stop.',
    'Critici vragen of de extra avondritten genoeg personeel krijgen; een papieren dienstregeling helpt reizigers niet als bussen toch uitvallen.',
    'Die neuen Abstände betreffen nur den Abendverkehr der Linie 7. Für andere Strecken oder Tageszeiten wurde keine Änderung angekündigt.',
    'Des usagers attendent de voir si les bus passeront réellement toutes les vingt minutes, surtout aux heures où les retards s’accumulent.',
    'Quien viaje por la tarde debería consultar las nuevas salidas; las tres paradas no cambian, pero el tiempo previsto de espera sí.',
  ],
  [
    'Riders with limited mobility may face a longer walk to the replacement platform, and critics want more detail about accessible directions.',
    'Voor beide lijnen blijft Bridge de halte. Alleen de plek van het perron verandert tijdens het herstel van de abri.',
    'Skeptiker bezweifeln, dass Schilder am alten Bahnsteig ausreichen, wenn Fahrgäste erst kurz vor Abfahrt zur Haltestelle kommen.',
    'Les voyageurs devront marcher vers l’est depuis l’ancien quai. Les panneaux sur place seront utiles pour trouver le nouvel emplacement.',
    'Quienes apoyan el traslado esperan que permita reparar el refugio sin suprimir la parada ni interrumpir las dos líneas.',
  ],
  [
    'The cap concerns a day of contactless travel on one card. Cash purchases do not count toward that six-credit ceiling.',
    'Sceptici vragen hoe snel de ritbewijzen het maximum tonen en of meerdere tikken met dezelfde kaart correct worden samengevoegd.',
    'Wer den Tagesdeckel nutzen will, muss bei jeder Fahrt dieselbe Karte einsetzen. Bar gekaufte Fahrkarten zählen nicht dazu.',
    'Les partisans saluent un plafond facile à vérifier sur le reçu, susceptible de réduire le coût des journées à plusieurs trajets.',
    'Los críticos señalan que quienes pagan en efectivo no reciben este límite y piden explicar por qué quedan excluidos.',
  ],
  [
    'Skeptics want measured generation figures after activation; the number of panels alone does not show how much depot electricity they will supply.',
    'Voor reizigers verandert er niets aan de ritten of tarieven. Het effect zit eerst in de verlichting van het depot, niet in hun reis.',
    'Befürworter begrüßen, dass der Depotstrom zunächst vor Ort genutzt wird und mögliche Überschüsse ins Netz fließen.',
    'Les critiques demandent combien coûtera l’installation et quelle part de l’éclairage elle couvrira; aucun chiffre de rendement n’est annoncé.',
    'La instalación afecta primero a la iluminación del depósito. No se han anunciado cambios en las rutas ni en las tarifas.',
  ],
  [
    'Member growers who need chilled storage should reserve a pallet space before bringing produce to North Quay; delivery times stay unchanged.',
    'Voorstanders verwachten minder bederf dankzij extra koeling, mits de veertig plaatsen eerlijk onder aangesloten telers worden verdeeld.',
    'Kritiker fragen, nach welchen Regeln die vierzig Plätze vergeben werden, falls mehr angeschlossene Erzeuger Lagerraum benötigen.',
    'La nouvelle salle offre quarante places aux producteurs membres. Les livraisons conservent leurs horaires habituels.',
    'Los escépticos esperarán a comprobar que la cámara mantiene la temperatura adecuada cuando lleguen las primeras remesas.',
  ],
  [
    'Supporters say the added unit price makes it easier to spot value across different pack sizes while preserving the familiar package price.',
    'Critici vragen hoe de winkels fouten in kiloprijzen zullen corrigeren; een verkeerd omgerekend schaplabel kan klanten juist misleiden.',
    'Die sechs Läden zeigen künftig Packungs- und Kilopreis nebeneinander. Die Änderung betrifft die Beschilderung von Obst und Gemüse.',
    'Les sceptiques veulent vérifier que les prix au kilo restent à jour lorsque les formats ou les prix des paquets changent.',
    'Los compradores podrán mirar la cifra por kilo junto al precio del paquete para comparar tamaños sin calcularla por su cuenta.',
  ],
  [
    'Critics warn that the up-front charge could surprise shoppers unless the receipt and return process make the refund obvious.',
    'De klant betaalt twee tokens per krat en krijgt die terug bij inlevering in een van de zes winkels.',
    'Skeptiker wollen prüfen, ob alle sechs Läden leere Kisten tatsächlich problemlos zurücknehmen und das Pfand erstatten.',
    'Les clients devront conserver les caisses vides et les rapporter dans l’un des six magasins pour récupérer deux jetons.',
    'Quienes apoyan la medida esperan que el depósito facilite reutilizar las cajas en vez de desecharlas tras una compra.',
  ],
  [
    'The later cutoff applies to orders for evening delivery, not to the delivery window itself; orders after six move to another day.',
    'Sceptici willen zien of bestellingen tussen vijf en zes uur ook werkelijk op de bedoelde avond geleverd worden.',
    'Wer eine Abendlieferung möchte, kann bis sechs Uhr bestellen. Nach diesem Zeitpunkt ist weiterhin ein späterer Liefertag nötig.',
    'Les partisans apprécient cette heure supplémentaire pour commander, sans changement annoncé du créneau de livraison.',
    'Los críticos preguntan si el personal de reparto podrá absorber más pedidos tardíos sin retrasar las entregas previstas.',
  ],
  [
    'Skeptics want to see the promised contributor review work in practice before treating the recording booths as a safe public archive.',
    'Bezoekers kunnen een tijdslot boeken, maar hoeven niet mee te doen. Over eventuele openbare toegang wordt pas na overleg besloten.',
    'Befürworter begrüßen einen ruhigen Ort für Familiengeschichten und die zugesagte Prüfung jeder Aufnahme mit der beitragenden Person.',
    'Les critiques demandent comment sera documenté l’accord des auteurs avant une éventuelle diffusion de leurs enregistrements.',
    'Las dos cabinas abrirán en Cedar el 6 de febrero. Grabar es voluntario y cada aporte se revisará antes de hacerse público.',
  ],
  [
    'Researchers can search the new scans online, but should still consult the paper collection when an original map matters.',
    'Voorstanders verwelkomen zoektoegang tot zeshonderd kaarten zonder dat de papieren verzameling uit de leeszaal verdwijnt.',
    'Kritiker fragen, wie fehlende Originaldaten gekennzeichnet werden und ob Nutzer alte Scans fälschlich für vollständige Bestände halten.',
    'La mise en ligne porte sur six cents cartes de plusieurs décennies. Les originaux papier restent conservés.',
    'Los escépticos comprobarán si las fichas indican bien las fechas conocidas y permiten encontrar mapas de distintas décadas.',
  ],
  [
    'Supporters welcome catalog help closer to Alder, even though original documents will still require a trip to the main reading room.',
    'Critici vinden twee zaterdagen per maand beperkt voor Alder en vragen wat er gebeurt als bewoners die dagen missen.',
    'Der neue Halt bietet Katalogzugang und Beratung in Alder. Originale bleiben im Hauptlesesaal und fahren nicht im Wagen mit.',
    'Les sceptiques attendent de voir si deux samedis par mois suffisent pour répondre aux demandes du village.',
    'Quien necesite un documento original tendrá que solicitarlo en la sala principal; la furgoneta servirá para búsquedas y consultas.',
  ],
  [
    'Visitors with Tuesday bookings face the inconvenience of rescheduling, and critics want a clear way to secure a suitable replacement date.',
    'De sluiting geldt alleen op dinsdagen in juni. Op andere gewone openingsdagen en online blijft toegang mogelijk.',
    'Skeptiker wollen sehen, ob für alle Dienstagsbuchungen tatsächlich ein passender Ersatztermin gefunden wird.',
    'Les personnes ayant réservé un mardi devront accepter une autre date; les autres jours habituels restent ouverts.',
    'Quienes apoyan la obra consideran razonable una pausa semanal limitada para arreglar el tejado manteniendo el acceso los demás días.',
  ],
];

const rows = [];
for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
  const topic = topics[topicIndex];
  for (let languageIndex = 0; languageIndex < languages.length; languageIndex++) {
    const language = languages[languageIndex];
    const viewpoint = viewpoints[(topicIndex + languageIndex) % viewpoints.length];
    const prefix = titleCues[language][viewpoint];
    const [eventTitle, factText] = topic.text[languageIndex];
    rows.push({
      id: `v6-${topic.key}-${language}`,
      family: topic.family,
      topicLabel: topic.label,
      viewpoint,
      split: 'holdout',
      title: `${prefix} ${eventTitle}`,
      body: `${factText} ${perspectives[topicIndex][languageIndex]}`,
    });
  }
}
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'holdout.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
