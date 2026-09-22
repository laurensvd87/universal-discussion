export function collectPageMetadata(expectedNormalizedUrl) {
  const CONTRACT_VERSION = "page-metadata-candidates/1.0.0";
  const MAXIMUM_HEAD_CHILDREN = 256;
  const MAXIMUM_CANDIDATES = 32;
  const MAXIMUM_SELECTOR_CODE_UNITS = 128;
  const VALUE_LIMITS = {
    canonical: 8_192,
    description: 512,
    publishedAtHint: 64,
    robots: 256,
    tdmReservation: 64,
    title: 256,
  };

  function rejected() {
    return { contractVersion: CONTRACT_VERSION, status: "rejected" };
  }

  try {
    if (globalThis.top !== globalThis) return rejected();
    const documentUrl = globalThis.location.href;
    if (
      typeof documentUrl !== "string" ||
      documentUrl.length === 0 ||
      documentUrl.length > VALUE_LIMITS.canonical
    ) {
      return rejected();
    }
    const queryIndex = documentUrl.indexOf("?");
    const fragmentIndex = documentUrl.indexOf("#");
    if (
      typeof expectedNormalizedUrl !== "string" ||
      expectedNormalizedUrl.length === 0 ||
      expectedNormalizedUrl.length > VALUE_LIMITS.canonical ||
      (queryIndex !== -1 &&
        (fragmentIndex === -1 || queryIndex < fragmentIndex))
    ) {
      return rejected();
    }
    const parsedDocumentUrl = new URL(documentUrl);
    if (
      parsedDocumentUrl.username !== "" ||
      parsedDocumentUrl.password !== ""
    ) {
      return rejected();
    }
    parsedDocumentUrl.hash = "";
    if (parsedDocumentUrl.toString() !== expectedNormalizedUrl) {
      return rejected();
    }

    const head = globalThis.document.head;
    if (head === null || typeof head !== "object") return rejected();
    const children = head.children;
    if (children === null || typeof children !== "object") return rejected();
    const childCount = children.length;
    if (
      !Number.isSafeInteger(childCount) ||
      childCount < 0 ||
      childCount > MAXIMUM_HEAD_CHILDREN ||
      typeof children.item !== "function"
    ) {
      return rejected();
    }

    const candidates = {
      canonical: [],
      description: [],
      publishedAtHint: [],
      robots: [],
      tdmReservation: [],
      title: [],
    };
    let candidateCount = 0;

    function addCandidate(field, source, value) {
      if (
        typeof value !== "string" ||
        value.length > VALUE_LIMITS[field] ||
        candidateCount >= MAXIMUM_CANDIDATES
      ) {
        throw new TypeError("Page metadata exceeds its bounded envelope");
      }
      candidates[field].push({ source, value });
      candidateCount += 1;
    }

    function readSelectorAttribute(element, attribute) {
      const value = element.getAttribute(attribute);
      if (value === null) return "";
      if (
        typeof value !== "string" ||
        value.length > MAXIMUM_SELECTOR_CODE_UNITS
      ) {
        throw new TypeError("Page metadata selector is invalid");
      }
      return value.trim().toLowerCase();
    }

    for (let index = 0; index < childCount; index += 1) {
      const element = children.item(index);
      if (element === null || typeof element !== "object") return rejected();
      const tagName = element.tagName;
      if (typeof tagName !== "string") return rejected();
      const normalizedTagName = tagName.toUpperCase();

      if (normalizedTagName === "TITLE") {
        addCandidate("title", "title-element", element.textContent);
        continue;
      }
      if (normalizedTagName === "META") {
        const name = readSelectorAttribute(element, "name");
        const property = readSelectorAttribute(element, "property");
        if (property === "og:title") {
          addCandidate(
            "title",
            "meta-property-og-title",
            element.getAttribute("content"),
          );
        }
        if (name === "twitter:title") {
          addCandidate(
            "title",
            "meta-name-twitter-title",
            element.getAttribute("content"),
          );
        }
        if (property === "og:description") {
          addCandidate(
            "description",
            "meta-property-og-description",
            element.getAttribute("content"),
          );
        }
        if (name === "description") {
          addCandidate(
            "description",
            "meta-name-description",
            element.getAttribute("content"),
          );
        }
        if (name === "twitter:description") {
          addCandidate(
            "description",
            "meta-name-twitter-description",
            element.getAttribute("content"),
          );
        }
        if (property === "article:published_time") {
          addCandidate(
            "publishedAtHint",
            "meta-property-article-published-time",
            element.getAttribute("content"),
          );
        }
        if (name === "robots") {
          addCandidate(
            "robots",
            "meta-name-robots",
            element.getAttribute("content"),
          );
        }
        if (name === "tdm-reservation") {
          addCandidate(
            "tdmReservation",
            "meta-name-tdm-reservation",
            element.getAttribute("content"),
          );
        }
        continue;
      }
      if (normalizedTagName === "LINK") {
        const rel = readSelectorAttribute(element, "rel");
        const relTokens = rel.split(/\s+/u).filter(Boolean);
        if (relTokens.includes("canonical")) {
          addCandidate(
            "canonical",
            "link-rel-canonical",
            element.getAttribute("href"),
          );
        }
      }
    }

    return {
      candidates,
      contractVersion: CONTRACT_VERSION,
      documentUrl,
      isTopLevel: true,
      status: "collected",
    };
  } catch {
    return rejected();
  }
}

export function attestPageDocument(expectedNormalizedUrl) {
  const CONTRACT_VERSION = "page-document-attestation/1.0.0";
  function rejected() {
    return { contractVersion: CONTRACT_VERSION, status: "rejected" };
  }
  try {
    if (globalThis.top !== globalThis) return rejected();
    const documentUrl = globalThis.location.href;
    if (
      typeof expectedNormalizedUrl !== "string" ||
      expectedNormalizedUrl.length === 0 ||
      expectedNormalizedUrl.length > 8_192 ||
      typeof documentUrl !== "string" ||
      documentUrl.length === 0 ||
      documentUrl.length > 8_192
    ) {
      return rejected();
    }
    const queryIndex = documentUrl.indexOf("?");
    const fragmentIndex = documentUrl.indexOf("#");
    if (
      queryIndex !== -1 &&
      (fragmentIndex === -1 || queryIndex < fragmentIndex)
    ) {
      return rejected();
    }
    const parsedDocumentUrl = new URL(documentUrl);
    if (
      parsedDocumentUrl.username !== "" ||
      parsedDocumentUrl.password !== ""
    ) {
      return rejected();
    }
    parsedDocumentUrl.hash = "";
    if (parsedDocumentUrl.toString() !== expectedNormalizedUrl) {
      return rejected();
    }
    return {
      contractVersion: CONTRACT_VERSION,
      documentUrl,
      isTopLevel: true,
      status: "attested",
    };
  } catch {
    return rejected();
  }
}

function ownDataValue(record, field) {
  if (record === null || typeof record !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  if (
    descriptor === undefined ||
    descriptor.get ||
    descriptor.set ||
    !descriptor.enumerable
  ) {
    return undefined;
  }
  return descriptor.value;
}

function isDocumentIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/u.test(value)
  );
}

export function createPageMetadataReader(scriptingApi) {
  if (
    scriptingApi === null ||
    typeof scriptingApi !== "object" ||
    typeof scriptingApi.executeScript !== "function"
  ) {
    throw new TypeError("Page metadata reader requires an executeScript function");
  }

  async function read(tabId, expectedNormalizedUrl) {
    if (
      !Number.isSafeInteger(tabId) ||
      tabId < 0 ||
      typeof expectedNormalizedUrl !== "string" ||
      expectedNormalizedUrl.length === 0 ||
      expectedNormalizedUrl.length > 8_192
    ) {
      throw new TypeError("Page metadata read failed");
    }
    try {
      const results = await scriptingApi.executeScript({
        args: [expectedNormalizedUrl],
        func: collectPageMetadata,
        target: { frameIds: [0], tabId },
        world: "ISOLATED",
      });
      if (!Array.isArray(results) || results.length !== 1) {
        throw new TypeError("Page metadata read failed");
      }
      const frameId = ownDataValue(results[0], "frameId");
      const documentId = ownDataValue(results[0], "documentId");
      const result = ownDataValue(results[0], "result");
      if (
        frameId !== 0 ||
        !isDocumentIdentifier(documentId) ||
        result === undefined
      ) {
        throw new TypeError("Page metadata read failed");
      }
      return Object.freeze({ documentId, result });
    } catch {
      throw new TypeError("Page metadata read failed");
    }
  }

  async function attest(tabId, documentId, expectedNormalizedUrl) {
    if (
      !Number.isSafeInteger(tabId) ||
      tabId < 0 ||
      !isDocumentIdentifier(documentId) ||
      typeof expectedNormalizedUrl !== "string" ||
      expectedNormalizedUrl.length === 0 ||
      expectedNormalizedUrl.length > 8_192
    ) {
      throw new TypeError("Page document attestation failed");
    }
    try {
      const results = await scriptingApi.executeScript({
        args: [expectedNormalizedUrl],
        func: attestPageDocument,
        target: { documentIds: [documentId], tabId },
        world: "ISOLATED",
      });
      if (!Array.isArray(results) || results.length !== 1) {
        throw new TypeError("Page document attestation failed");
      }
      const returnedDocumentId = ownDataValue(results[0], "documentId");
      const frameId = ownDataValue(results[0], "frameId");
      const result = ownDataValue(results[0], "result");
      if (
        frameId !== 0 ||
        returnedDocumentId !== documentId ||
        result === undefined
      ) {
        throw new TypeError("Page document attestation failed");
      }
      return result;
    } catch {
      throw new TypeError("Page document attestation failed");
    }
  }

  return Object.freeze({ attest, read });
}
