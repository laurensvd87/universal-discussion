import { INSIGHT_VOICES, normalizeInsightVoice } from "../core/insight-voices.js";
import { EN } from "../locales/en.js";

// A separate corner button chooses tone. The original generation button and
// its guards/listeners remain intact; opening or choosing never generates.
export function mountAssistantVoicePicker(document, { button, messages = EN, onVoiceSelect }) {
  const text = key => messages?.[key] ?? EN[key];
  const element = document.createElement("span"); element.className = "assistant-voice-control";
  const toggle = document.createElement("button"); toggle.type = "button";
  toggle.className = "assistant-voice-toggle";
  if (button.id) toggle.id = `${button.id}-voice-toggle`;
  toggle.setAttribute("aria-haspopup", "menu"); toggle.setAttribute("aria-expanded", "false");
  const arrow = document.createElement("span"); arrow.textContent = "▾";
  arrow.setAttribute("aria-hidden", "true"); toggle.append(arrow);
  const menu = document.createElement("div"); menu.className = "assistant-voice-menu";
  menu.setAttribute("popover", "auto"); menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", text("assistantVoice")); menu.hidden = true;
  const handlers = [], rows = [];
  let state = { voice: "standard", disabled: false, hidden: false }, opened = false, disposed = false;
  const listen = (node, event, handler) => { node.addEventListener(event, handler); handlers.push([node,event,handler]); };
  function close(restoreFocus = false) {
    if (typeof menu.hidePopover === "function") { try { menu.hidePopover(); } catch { /* Already closed. */ } }
    menu.hidden = true; opened = false; toggle.setAttribute("aria-expanded", "false");
    if (restoreFocus && !disposed && !toggle.disabled && !element.hidden) toggle.focus?.({preventScroll:true});
  }
  function place() {
    const rect = toggle.getBoundingClientRect?.(), view = document.defaultView;
    if (!rect || !menu.style || !view) return;
    const width = Math.min(208, Math.max(120, view.innerWidth - 16));
    const height = Math.min(336, Math.max(80, view.innerHeight - 16));
    menu.style.width = `${width}px`; menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, view.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.top - height - 6, view.innerHeight - height - 8))}px`;
  }
  function open() {
    if (disposed || toggle.disabled || element.hidden) return;
    menu.hidden = false; place();
    if (typeof menu.showPopover === "function") { try { menu.showPopover(); } catch { close(); return; } }
    opened = true; toggle.setAttribute("aria-expanded", "true");
    rows.find(row => row.id === state.voice)?.node.focus?.({preventScroll:true});
  }
  function focusRow(index) {
    rows.forEach((row,i) => { row.node.tabIndex = i === index ? 0 : -1; });
    rows[index]?.node.focus?.({preventScroll:true});
  }
  for (const choice of INSIGHT_VOICES) {
    const item = document.createElement("button"); item.type = "button";
    item.className = "assistant-voice-option"; item.setAttribute("role", "menuitemradio");
    item.setAttribute("data-voice", choice.id); item.textContent = text(choice.labelKey);
    rows.push({id:choice.id,node : item}); menu.append(item);
    listen(item,"click",event => {
      event.stopPropagation?.();
      if (disposed || !opened || toggle.disabled || element.hidden) return;
      if (typeof onVoiceSelect === "function" && onVoiceSelect(choice.id) !== false) update({voice:choice.id});
      close(true);
    });
    listen(item,"keydown",event => {
      let index = rows.findIndex(row => row.node === item);
      if (event.key === "Escape") { event.preventDefault?.(); event.stopPropagation?.(); close(true); return; }
      if (event.key === "ArrowDown") index = (index+1)%rows.length;
      else if (event.key === "ArrowUp") index = (index+rows.length-1)%rows.length;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = rows.length-1;
      else return;
      event.preventDefault?.(); focusRow(index);
    });
  }
  listen(toggle,"click",event => { event.stopPropagation?.(); if (opened) close(true); else open(); });
  listen(toggle,"keydown",event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault?.(); open(); }
  });
  listen(menu,"toggle",event => {
    opened = event.newState === "open"; toggle.setAttribute("aria-expanded",String(opened));
    if (!opened) menu.hidden = true;
  });
  element.append(button,toggle,menu);
  function update(value = {}) {
    if (disposed) return;
    state = {...state,...value};
    try { state.voice = normalizeInsightVoice(state.voice); } catch { state.voice = "standard"; }
    element.hidden = Boolean(state.hidden || button.hidden);
    toggle.disabled = Boolean(state.disabled);
    const label = INSIGHT_VOICES.find(choice => choice.id === state.voice);
    const accessible = `${text("assistantVoice")}: ${text(label.labelKey)}`;
    toggle.setAttribute("aria-label",accessible); toggle.title = accessible;
    button.setAttribute("aria-description",accessible);
    for (const row of rows) {
      row.node.setAttribute("aria-checked",String(row.id === state.voice));
      row.node.tabIndex = row.id === state.voice ? 0 : -1;
    }
    if (toggle.disabled || element.hidden) close();
  }
  update();
  return Object.freeze({element,update,dispose() {
    if (disposed) return; close(); disposed = true;
    for (const [node,event,handler] of handlers) node.removeEventListener(event,handler);
    handlers.length = 0;
  }});
}
