// Frozen before inference, 30 October 2026. Public title/short excerpt cards;
// manually selected stress cases, not browser captures or a random web sample.
// No card is added to the training bank. Body fields are literal source excerpts.
export const CACHED_TOPIC_TRANSFER_CARDS = Object.freeze([
 {id:'H1',title:'4. More Control Flow Tools — Python 3.15.2 documentation',body:'Python uses a few more that we will encounter in this chapter.',url:'https://docs.python.org/3/tutorial/controlflow.html',basis:'web-reviewed-title-and-excerpt'},
 {id:'H2',title:'The Dolphin Handbook',body:'Dolphin is the default file manager by KDE, designed with usability as a primary focus.',url:'https://docs.kde.org/stable_kf6/en/dolphin/dolphin/index.html',basis:'web-reviewed-heading-and-excerpt'},
 {id:'H3',title:'Koala',body:"The Koala is one of Australia's best-known animals. The Koala lives in eucalypt forests.",url:'https://australian.museum/learn/animals/mammals/koala/',basis:'web-reviewed-heading-and-two-short-excerpts'},
 {id:'H4',title:'Kapsalon ‘gezond’',body:'Na wat borrels wil je niets liever eten dan de kapsalon.',url:'https://www.ah.nl/allerhande/recept/R-R1188296/kapsalon-gezond',basis:'web-reviewed-heading-and-excerpt'},
 {id:'H5',title:'Grand Theft Auto VI - PS5 Games | PlayStation (US)',body:'The game is not playable on PlayStation 4.',url:'https://www.playstation.com/en-us/games/grand-theft-auto-vi/',basis:'web-reviewed-title-and-excerpt'},
 {id:'H6',title:'Grand Theft Auto V Enhanced',body:'',url:'https://store.steampowered.com/app/3240220/Grand_Theft_Auto_V_Enhanced/',basis:'web-reviewed-title-only-age-gate-no-body'},
 {id:'H7',title:'JavaScript Guide',body:'The JavaScript Guide shows you how to use JavaScript and gives an overview of the language.',url:'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',basis:'web-reviewed-heading-and-excerpt'},
 {id:'H8',title:'Reticulated python',body:'The longest snakes in the world, reticulated pythons',url:'https://www.chesterzoo.org/animals/reticulated-python',basis:'web-reviewed-heading-and-excerpt'},
 {id:'H9',title:'Atlantic Mahi Mahi',body:'They are pelagic fish found in off-shore temperate, tropical, and subtropical waters.',url:'https://www.fisheries.noaa.gov/species/atlantic-mahi-mahi',basis:'web-reviewed-heading-and-excerpt'},
 {id:'H10',title:'Pizza',body:'Make your own pizza with a crispy base, mozzarella cheese and a fresh tomato sauce.',url:'https://tollbit.bbcgoodfood.com/recipes/pizza',basis:'web-reviewed-heading-and-excerpt'},
 {id:'H11',title:'Journal Information | Nature',body:'Nature is a weekly international journal publishing the finest peer-reviewed research in all fields of science and technology',url:'https://www.nature.com/nature/journal-information',basis:'web-search-reviewed-title-and-excerpt-open-redirect-unavailable'},
 {id:'H12',title:'Antidetect Browser for Multi-Accounting ⭐️ Dolphin Anty ⭐️',body:'Manage any number of accounts for advertising platforms and social networks',url:'https://dolphin-anty.com/',basis:'web-reviewed-title-and-excerpt'},
].map(Object.freeze));

export const CACHED_TOPIC_TRANSFER_PROTOCOL = Object.freeze({
 schema:'cached-topic-transfer-protocol/v1',
 training:'Only retained teacher graph and original twelve public cards; no holdout card or gold in the bank',
 encoder:'Same packaged E5 query prefix; one serial single-WASM-thread session',
 scoring:'Fixed cosine minimum 0.8 and context margin 0.015, not calibrated probabilities; no parameter sweep',
 primaryKnownSubjectTarget:4,primaryKnownSubjectTotal:6,maximumWrongAssignments:0,
 unknownSubjectPolicy:'Only an annotated valid ancestor or unresolved; never an arbitrary known leaf',
 lookupP95TargetMs:1,ownerDepth:8,
 representative:false,fullPageCapture:false,publisherIndependent:false,productionPolicySelected:false,
});
