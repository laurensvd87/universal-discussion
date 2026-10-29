// Public research IDs/URLs chosen after freezing the literal-focus policy.
// No local-library titles, URL inventory, accounts or vectors enter this list.
export const WIKI_ENTITY_PILOT=Object.freeze([
 ['Q251','Java language',['Java (programming language)','Java (Programmiersprache)','Java (programmeertaal)']],
 ['Q3757','Java island',['Java','Java (Insel)','Java (eiland)']],
 ['Q308','Mercury planet',['Mercury (planet)','Merkur (Planet)','Mercurius (planeet)']],
 ['Q925','Mercury element',['Mercury (element)','Quecksilber','Kwik']],
 ['Q575650','Rust language',['Rust (programming language)','Rust (Programmiersprache)','Rust (programmeertaal)']],
 ['Q28865','Python language',['Python (programming language)','Python (Programmiersprache)','Python (programmeertaal)']],
 ['Q111','Mars planet',['Mars','Mars (Planet)','Mars (planeet)']],
 ['Q112','Mars deity',['Mars (mythology)','Mars (Mythologie)','Mars (mythologie)']],
].map(([id,annotation,titles])=>Object.freeze({id,annotation,pages:Object.freeze(titles.map((title,i)=>Object.freeze({language:['en','de','nl'][i],title,
 url:'https://'+['en','de','nl'][i]+'.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'))})))})));
