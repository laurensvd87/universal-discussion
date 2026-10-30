// Fixed before provider inference. Manually selected public-source diagnostic,
// not private browsing, a random sample, a crawler capture or population proof.
// Short literal excerpts reviewed with the web tool on 2026-10-30. Missing
// readable content remains empty; no description is invented to fill it.
const freeze = value => { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; };
export const PUBLIC_SUBJECT_CARDS = freeze([
  {id:'P1',url:'https://www.python.org/',title:'Welcome to Python.org',excerpt:'Python is a programming language that lets you work quickly and integrate systems more effectively.',basis:'web-reviewed-title-and-excerpt'},
  {id:'P2',url:'https://docs.python.org/3/tutorial/',title:'The Python Tutorial',excerpt:'Python is an easy to learn, powerful programming language.',basis:'web-reviewed-heading-and-excerpt'},
  {id:'P3',url:'https://www.montypython.com/',title:'Monty Python Official Site',excerpt:'Michael Palin and Terry Gilliam unveiled a World Origin Site plaque',basis:'web-reviewed-title-and-excerpt'},
  {id:'P4',url:'https://apps.kde.org/dolphin/',title:'Dolphin - KDE Applications',excerpt:"Dolphin is KDE's file manager",basis:'web-reviewed-title-and-excerpt'},
  {id:'P5',url:'https://www.worldwildlife.org/species/dolphin-and-porpoise/',title:'Dolphins and Porpoises',excerpt:'All are air-breathing, warm-blooded mammals that nurse their young.',basis:'web-reviewed-heading-and-excerpt'},
  {id:'P6',url:'https://animals.sandiegozoo.org/animals/koala',title:'Koala',excerpt:'They are members of a group of pouched mammals called marsupials.',basis:'web-reviewed-heading-and-excerpt'},
  {id:'P7',url:'https://savethekoala.com/about-koalas/koala-facts/',title:'Koala Facts',excerpt:'In fact, they are marsupials, not bears.',basis:'web-reviewed-heading-and-excerpt'},
  {id:'P8',url:'https://www.rockstargames.com/gta-v',title:'Grand Theft Auto V - Rockstar Games',excerpt:'',basis:'web-reviewed-title-only-no-readable-body'},
  {id:'P9',url:'https://www.rockstargames.com/VI',title:'Grand Theft Auto VI - Rockstar Games',excerpt:'PlayStation 5 Xbox Series X|S',basis:'web-reviewed-title-and-excerpt'},
  {id:'P10',url:'https://www.leukerecepten.nl/recepten/kapsalon-maken/',title:'Kapsalon maken - Met shoarma - Leuke Recepten',excerpt:'krokante frietjes, kruidige shoarma, gesmolten kaas en frisse groenten',basis:'web-reviewed-title-and-excerpt'},
  {id:'P11',url:'https://www.youtube.com/watch?v=rd5EWR83AGs',title:'KIP KAPSALON (met friet) op de KAMADO!',excerpt:'',basis:'user-provided-public-screenshot-title-only-web-fetch-unavailable'},
  {id:'P12',url:'https://apps.kde.org/de/dolphin/',title:'Dolphin - KDE-Anwendungen',excerpt:'Dolphin ist die Dateiverwaltung von KDE',basis:'web-reviewed-title-and-excerpt'},
]);

// Root review, sealed before the provider sees cards. These annotations are
// deliberately separate from buildSubjectQuestion; no gold is sent to AI.
export const PUBLIC_SUBJECT_GOLD = freeze([
  {id:'P1',root:'Technology',subject:'python-language',labels:['Python','Python programming language','Python (programming language)']},
  {id:'P2',root:'Technology',subject:'python-language',labels:['Python','Python programming language','Python (programming language)']},
  {id:'P3',root:'Culture',subject:'monty-python',labels:['Monty Python']},
  {id:'P4',root:'Technology',subject:'dolphin-software',labels:['Dolphin','Dolphin file manager','Dolphin (file manager)','KDE Dolphin']},
  {id:'P5',root:'Nature',subject:'dolphins-porpoises',labels:['Dolphins and porpoises','Dolphins & porpoises','Dolphins and Porpoises']},
  {id:'P6',root:'Nature',subject:'koalas',labels:['Koala','Koalas']},
  {id:'P7',root:'Nature',subject:'koalas',labels:['Koala','Koalas']},
  {id:'P8',root:'Games',subject:'gta-v',labels:['Grand Theft Auto V','GTA V','GTA 5','Grand Theft Auto 5']},
  {id:'P9',root:'Games',subject:'gta-vi',labels:['Grand Theft Auto VI','GTA VI','GTA 6','Grand Theft Auto 6']},
  {id:'P10',root:'Food',subject:'kapsalon',labels:['Kapsalon','Kapsalon (dish)']},
  {id:'P11',root:'Food',subject:'kapsalon',labels:['Kapsalon','Kapsalon (dish)']},
  {id:'P12',root:'Technology',subject:'dolphin-software',labels:['Dolphin','Dolphin file manager','Dolphin (file manager)','KDE Dolphin']},
]);
