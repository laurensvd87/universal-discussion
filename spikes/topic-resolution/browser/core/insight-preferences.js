// Local optional discussion settings. Codes are data, never provider instructions.
import { normalizeInsightVoice } from "./insight-voices.js";
export const DEFAULT_INSIGHT_PREFERENCES = Object.freeze({ replyLanguage: "en" });
const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const CURRENCY_CODES = "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VED VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG".split(" ");
const countries = new Set(COUNTRY_CODES);
const currencies = new Set(CURRENCY_CODES);
const labels = (codes, type) => {
  const names = new Intl.DisplayNames(["en"], { type });
  return Object.freeze(codes.map((value) => Object.freeze({ value,
    label: type === "currency" ? `${names.of(value)} (${value})` : names.of(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en")));
};
export const REPLY_LANGUAGE_OPTIONS = labels(
  "en ar bn bg ca cs da de el es et fa fi fil fr gu he hi hr hu id is it ja ko lt lv ml mr ms nb nl pl pt pt-BR ro ru sk sl sr sv sw ta te th tr uk ur vi zh-Hans zh-Hant".split(" "), "language");
export const DELIVERY_COUNTRY_OPTIONS = labels(COUNTRY_CODES, "region");
export const CURRENCY_OPTIONS = labels(CURRENCY_CODES, "currency");

function language(value) {
  // Bounded BCP47 language/script/region/variant tags; reject all singleton
  // extension and private-use subtags rather than carrying hidden metadata.
  if (typeof value !== "string" || value.length > 35 ||
      !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/u.test(value)) {
    throw new TypeError("Invalid Insight preferences");
  }
  try { return Intl.getCanonicalLocales(value)[0]; }
  catch { throw new TypeError("Invalid Insight preferences"); }
}

export function normalizeInsightPreferences(value) {
  if (value === undefined) return { ...DEFAULT_INSIGHT_PREFERENCES };
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).some((key) => typeof key !== "string" ||
        !["replyLanguage", "browserLanguage", "deliveryCountry", "currency", "voice"].includes(key)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((field) => !Object.hasOwn(field, "value") || !field.enumerable)) {
    throw new TypeError("Invalid Insight preferences");
  }
  const result = { replyLanguage: Object.hasOwn(value, "replyLanguage") ? language(value.replyLanguage) : "en" };
  if (Object.hasOwn(value, "voice")) {
    if (value.voice === undefined) throw new TypeError("Invalid Insight preferences");
    const voice = normalizeInsightVoice(value.voice);
    if (voice !== "standard") result.voice = voice;
  }
  if (Object.hasOwn(value, "browserLanguage")) result.browserLanguage = language(value.browserLanguage);
  for (const [key, allowed] of [["deliveryCountry", countries], ["currency", currencies]]) {
    if (!Object.hasOwn(value, key)) continue;
    const code = value[key];
    if (typeof code !== "string" || !allowed.has(code.toUpperCase())) throw new TypeError("Invalid Insight preferences");
    result[key] = code.toUpperCase();
  }
  return result;
}
