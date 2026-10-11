// A conservative lexical policy, not a semantic or complete multilingual
// classifier. Only already validated, bounded published messages belong here.
// Page text, titles, candidate URLs and client-selected modes never select it.
function requestText(value) {
  return (typeof value === "string" ? value.slice(0, 2_000) : "")
    .replace(/^\s*>.*$/gmu, " ")
    .replace(/```[\s\S]*?```|`[^`]*`|"[^"\n]+"|“[^”\n]+”|‘[^’\n]+’|«[^»\n]+»/gu, " ")
    .toLowerCase().trim();
}
const OPT_OUT = /\b(?:do not|don't|dont|without|no need to|never)\s+(?:web\s+)?(?:search|searching|research|browse|browsing|find|finding|check|checking|compare|comparing|google|googling|look up|looking up|look\s+(?:this|that|it)\s+up)\b|\b(?:only|just)\s+(?:this|the|supplied|current)\s+(?:page|article|context)\b|\b(?:nicht|ohne)\s+(?:suchen|suche|recherchieren)|\b(?:niet zoeken|zonder zoeken|ne cherche pas|sans recherche)\b/u;
const SEARCH = /\b(?:search|look up|research|browse|find|check|compare)\b[^.!?\n]{0,70}\b(?:online|the web|internet|websites?|shops?|stores?|offers?|prices?|retailers?|sellers?)\b|\b(?:search online|web search|online search|search the web|look it up|google it|search for)\b|\b(?:please|can you|could you)\s+(?:search|research|browse)\b|\b(?:such(?:e|en)?|recherchier(?:e|en)?|zoek|zoeken|cherche|chercher|recherche)\b[^.!?\n]{0,50}\b(?:online|internet|web|prix|preise|prijzen)\b/u;
const DIRECTED_RESEARCH = /^(?:please\s+)?research\s+(?:this|that|the claim|whether)\b|\b(?:please|can you|could you)\s+look\s+(?:this|that|it)\s+up\b|\bfind\s+(?:external|outside|independent)\s+(?:sources|evidence)\b/u;
const SHOPPING = /\b(?:cheapest|cheaper|lowest price|best price|current price|price now|buy|buying|purchase|costs?|price|prices|günstigsten|günstiger|billigsten|preis|preise|kaufen|goedkoopste|goedkoper|prijs|prijzen|kopen|moins cher|meilleur prix|prix|acheter)\b/u;
const PRICE_REQUEST = /\b(?:where|which|what|how much|can you|could you|find|compare|show|is there|wo|was|wie viel|welche|waar|wat|hoeveel|où|quel|combien|trouve)\b|\?/u;
const EXPLANATION = /\b(?:explain|meaning|mean|means|definition|define|why|how does|how do|difference|understand|erkläre|bedeutet|uitleg|betekent|explique|signifie)\b/u;
const VARIANT = /\b(?:inch|mm|cm|size|variant|version|model|colour|color|delivery|shipping|deliver|ship|country|germany|netherlands|france|größe|variante|lieferung|versand|maat|bezorging|livraison|taille)\b|\b\d+\s*\/\s*\d+\b/u;
function shoppingRequest(value) {
  return SHOPPING.test(value) && PRICE_REQUEST.test(value) && !EXPLANATION.test(value);
}
export function replyResearchToolChoice({ questionBody, parentBody }) {
  const selected = requestText(questionBody);
  if (!selected || OPT_OUT.test(selected)) return "auto";
  if (SEARCH.test(selected) || DIRECTED_RESEARCH.test(selected) || shoppingRequest(selected)) return "required";
  // A concise published variant/delivery answer can continue an opener's
  // explicit shopping request. Generic acknowledgements do not inherit it.
  const opener = requestText(parentBody);
  if (selected.length <= 160 && VARIANT.test(selected) && !EXPLANATION.test(selected) &&
      !OPT_OUT.test(opener) && (SEARCH.test(opener) || shoppingRequest(opener))) return "required";
  return "auto";
}
