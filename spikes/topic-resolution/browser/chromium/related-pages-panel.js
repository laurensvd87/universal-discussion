import { rankRelatedSources } from "../core/related-sources.js";
import { RELATED_SOURCE_FIXTURES } from "../fixtures/related-source-fixtures.js";
import { EN } from "../locales/en.js";

// Independent demo selection: observed tab data never enters this catalog.
export function mountRelatedPagesDemo(document, root, messages = EN) {
  function message(key) {
    return typeof messages?.[key] === "string" ? messages[key] : EN[key];
  }
  function node(tag, text = "", className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  const heading = node("h2", message("relatedPagesHeading"));
  heading.id = "related-pages-heading";
  root.setAttribute("aria-labelledby", heading.id);
  const intro = node("p", message("relatedPagesIntro"));
  const scope = node("p", message("relatedPagesScope"), "field-note");
  const label = node("label", message("relatedPagesSource"));
  const select = node("select");
  select.id = "related-pages-source";
  label.htmlFor = select.id;
  for (const source of RELATED_SOURCE_FIXTURES) {
    const option = node("option", source.title);
    option.value = source.id;
    select.append(option);
  }
  select.value = RELATED_SOURCE_FIXTURES[0].id;
  const currentUrl = node("p", "", "source-url");
  const status = node("p", "", "status-message");
  status.setAttribute("role", "status");
  const noPosts = node("p", message("relatedPagesNoPosts"), "field-note");
  const list = node("ul", "", "related-pages-list");
  root.replaceChildren(heading, intro, scope, label, select, currentUrl, status, noPosts, list);

  function render() {
    list.replaceChildren();
    currentUrl.textContent = "";
    try {
      const query = RELATED_SOURCE_FIXTURES.find(({ id }) => id === select.value);
      const results = rankRelatedSources(query, RELATED_SOURCE_FIXTURES);
      currentUrl.textContent = query.url;
      status.textContent = results.length === 0
        ? message("relatedPagesEmpty")
        : message("relatedPagesCount").replace("{count}", String(results.length));
      for (const result of results) {
        const item = node("li");
        item.append(
          node("p", result.title, "source-title"),
          node("p", result.url, "source-url"),
          node("p", message(result.relationship === "same-topic"
            ? "relatedPagesSameTopic" : "relatedPagesRelated"), "field-note"),
        );
        list.append(item);
      }
    } catch {
      list.replaceChildren();
      currentUrl.textContent = "";
      status.textContent = message("relatedPagesUnavailable");
    }
  }
  select.addEventListener("change", render);
  render();

  return Object.freeze({
    dispose() {
      select.removeEventListener("change", render);
      root.replaceChildren();
    },
  });
}
