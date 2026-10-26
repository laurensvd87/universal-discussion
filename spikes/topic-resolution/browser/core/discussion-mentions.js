// Only a deliberately submitted standalone handle invokes the assistant.
// Quoted examples, code, email addresses and future bot handles are inert.
export function hasAiMention(body) {
  if (typeof body !== "string" || body.length > 8000) return false;
  const prose = body.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/gu, "")
    .replace(/(`+)[^\n]*?\1/gu, "")
    .replace(/`[^`\n]*$/gmu, "")
    .replace(/"(?:\\.|[^"\\])*"|“[^”]*”|‘[^’]*’/gu, "")
    .replace(/(^|[\s(\[{:])'(?:\\.|[^'\\])*'(?=$|[\s)\]}.!,?:;])/gu, "$1")
    .replace(/!?\[[^\]\n]*\]\([^\)\n]*\)/gu, "")
    .split(/\r?\n/u).filter(line => !/^\s*>/u.test(line)).join("\n");
  return /(?:^|\s)@ai(?=$|[\s,:;!?]|\.(?:\s|$))/iu.test(prose);
}
