// Fixed URLs and manual expectations BEFORE actual network capture/encoding.
// Real static-prefix integration stress set; overlap with earlier publishers
// and the user recipe is deliberate. Not an independent population holdout.
export const CAPTURED_TOPIC_URLS=Object.freeze([
 {id:'R1',url:'https://www.python.org/downloads/windows/'},
 {id:'R2',url:'https://apps.kde.org/de/dolphin/'},
 {id:'R3',url:'https://savethekoala.com/about-koalas/koala-facts/'},
 {id:'R4',url:'https://www.leukerecepten.nl/recepten/kapsalon-maken/'},
 {id:'R5',url:'https://www.rockstargames.com/gta-v'},
 {id:'R6',url:'https://nodejs.org/en/about'},
 {id:'R7',url:'https://www.nature.com/'},
 {id:'R8',url:'https://dolphin-emu.org/'},
].map(Object.freeze));
