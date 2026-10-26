/* Local UniFi Network 10.6.106 audit. GET-only; no raw export or credential storage.
 * Run only on your trusted local HTTPS UniFi console. See README before use.
 */
(function (factory) {
  "use strict";
  // Page bundles may expose CommonJS globals. A browser document takes priority,
  // without reading or replacing the host page's module/exports properties.
  try {
    if (typeof window !== "undefined" || typeof document !== "undefined") void factory().bootstrap(globalThis);
    else if (typeof module === "object" && module.exports) module.exports = factory();
    else void factory().bootstrap(globalThis);
  } catch {
    void factory().bootstrap(globalThis);
  }
})(function () {
  "use strict";
  const VERSION = "10.6.106";
  const BOOTSTRAP_MESSAGES = Object.freeze({
    ready: "[Murmingle UniFi export] Dialog ready. Enter the temporary key in the password field, not the Console.",
    noDocument: "[Murmingle UniFi export] No usable page document. Select top in the Console context selector, wait for the page to load, and run the script again.",
    failed: "[Murmingle UniFi export] Dialog startup failed. Select top in the Console context selector, wait for the page to load, and run the script again."
  });
  async function bootstrap(env, start = run) {
    function report(message) {
      // Report only fixed operator guidance; console failures must not escape.
      try { env.console?.info(message); } catch {}
    }
    try {
      const doc = env.document;
      if (!doc?.createElement || !doc.body) { report(BOOTSTRAP_MESSAGES.noDocument); return false; }
      await start(env);
      report(BOOTSTRAP_MESSAGES.ready);
      return true;
    } catch {
      report(BOOTSTRAP_MESSAGES.failed);
      return false;
    }
  }
  const BASE = "/proxy/network/integration/v1";
  const LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, pages: 50, records: 5000, requests: 180,
    networks: 50, pairs: 64, timeoutMs: 10000, criteria: 2000 });
  const NOT_COLLECTED = Object.freeze(["PORT_FORWARDING", "NAT_RULES", "UPNP", "ACL_RULES",
    "DNS_POLICIES", "SWITCH_CONFIGURATION", "HOST_SERVICES_AND_FIREWALL", "LIVE_REACHABILITY"]);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const integer = (n, low, high) => Number.isSafeInteger(n) && n >= low && n <= high;
  const failure = code => Object.assign(new Error(code), { auditCode: code });
  function ipv4(value) {
    if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return null;
    const parts = value.split(".").map(Number);
    return parts.every(n => n <= 255) ? parts : null;
  }
  function privateV4(parts) {
    return Boolean(parts && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)));
  }
  function localOrigin(value) {
    let url;
    try { url = new URL(value); } catch { throw failure("local-https-origin-required"); }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/"
      || url.search || url.hash || !privateV4(ipv4(url.hostname))) throw failure("local-https-origin-required");
    return url.origin;
  }
  function createSanitizer() {
    const maps = new Map();
    const issues = [];
    let issueCount = 0;
    const mark = code => { issueCount++; if (issues.length < 10000) issues.push(code); };
    function id(kind, value) {
      if (!new Set(["site", "network", "zone", "policy", "list", "vpn", "tunnel"]).has(kind)
        || typeof value !== "string" || !UUID.test(value)) { mark("invalid-resource-reference"); return "UNKNOWN"; }
      if (!maps.has(kind)) maps.set(kind, new Map());
      const map = maps.get(kind), key = value.toLowerCase();
      if (!map.has(key)) map.set(key, `${kind}-${map.size + 1}`);
      return map.get(key);
    }
    function external(value, prefix) {
      if (!maps.has("address")) maps.set("address", new Map());
      const map = maps.get("address");
      if (!map.has(value)) map.set(value, `external-address-${map.size + 1}`);
      return map.get(value) + (prefix === null ? "" : `/${prefix}`);
    }
    function address(value) {
      if (typeof value !== "string" || value.length > 90) { mark("invalid-address"); return "UNKNOWN"; }
      const parts = value.split("/");
      if (parts.length > 2 || (parts.length === 2 && !/^(0|[1-9]\d{0,2})$/.test(parts[1]))) {
        mark("invalid-address"); return "UNKNOWN";
      }
      const prefix = parts.length === 2 ? Number(parts[1]) : null;
      const v4 = ipv4(parts[0]);
      if (v4) {
        if (prefix !== null && prefix > 32) { mark("invalid-address"); return "UNKNOWN"; }
        if (prefix === 0) return "0.0.0.0/0";
        const number = v4.reduce((n, octet) => n * 256 + octet, 0);
        const size = 2 ** (32 - (prefix ?? 32));
        const first = Math.floor(number / size) * size;
        const toParts = n => [Math.floor(n / 16777216), Math.floor(n / 65536) % 256,
          Math.floor(n / 256) % 256, n % 256];
        return privateV4(toParts(first)) && privateV4(toParts(first + size - 1))
          ? value : external(parts[0], prefix);
      }
      if (!/^[0-9a-f:.]+$/i.test(parts[0]) || !parts[0].includes(":") || (prefix !== null && prefix > 128)) {
        mark("invalid-address"); return "UNKNOWN";
      }
      let canonical;
      try { canonical = new URL(`https://[${parts[0]}]/`).hostname.slice(1, -1); }
      catch { mark("invalid-address"); return "UNKNOWN"; }
      if (prefix === 0) return "::/0";
      // Preserve only whole subnets inside unique-local IPv6; mask global/link-local addresses.
      return /^f[cd][0-9a-f]{2}:/i.test(canonical) && (prefix === null || prefix >= 7)
        ? canonical + (prefix === null ? "" : `/${prefix}`) : external(canonical, prefix);
    }
    function bool(value) {
      if (typeof value === "boolean") return value;
      mark("invalid-boolean"); return "UNKNOWN";
    }
    function num(value, low, high) {
      if (integer(value, low, high)) return value;
      mark("invalid-number"); return "UNKNOWN";
    }
    function choice(value, allowed) {
      if (allowed.includes(value)) return value;
      mark("unsupported-enum"); return "UNKNOWN";
    }
    function array(value, transform) {
      if (!Array.isArray(value) || value.length > LIMITS.criteria) { mark("invalid-or-oversized-criteria"); return []; }
      return value.map(transform);
    }
    function known(value, allowed) {
      if (!object(value)) { mark("invalid-object"); return {}; }
      // Do not export unknown field names (they themselves can contain a secret).
      if (Object.keys(value).some(key => !allowed.includes(key))) mark("unrecognized-fields-omitted");
      return value;
    }
    function origin(metadata) {
      return choice(object(metadata) ? metadata.origin : undefined, ["SYSTEM_DEFINED", "USER_DEFINED", "DERIVED", "ORCHESTRATED"]);
    }
    function addressItem(item) {
      const v = known(item, ["type", "value", "start", "stop"]);
      const type = choice(v.type, ["IP_ADDRESS", "SUBNET", "IP_ADDRESS_RANGE"]);
      if (type === "IP_ADDRESS_RANGE") {
        const facts = raw => {
          if (typeof raw !== "string" || raw.includes("/") || raw.length > 90) return null;
          const v4 = ipv4(raw);
          if (v4) return { family: 4, value: v4.reduce((n, octet) => n * 256n + BigInt(octet), 0n) };
          if (!/^[0-9a-f:.]+$/i.test(raw) || !raw.includes(":")) return null;
          try {
            const canonical = new URL(`https://[${raw}]/`).hostname.slice(1, -1);
            const halves = canonical.split("::"), left = halves[0] ? halves[0].split(":") : [];
            const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
            const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
            if (words.length !== 8) return null;
            return { family: 6, value: words.reduce((n, word) => n * 65536n + BigInt(`0x${word}`), 0n) };
          } catch { return null; }
        };
        const first = facts(v.start), last = facts(v.stop);
        if (!first || !last || first.family !== last.family || first.value > last.value) mark("invalid-address-range");
        const start = address(v.start), stop = address(v.stop);
        if (start.startsWith("external-") || stop.startsWith("external-")) mark("masked-range-semantics");
        return { type, start, stop };
      }
      if (type === "UNKNOWN") return { type };
      if (typeof v.value !== "string" || (type === "SUBNET") !== v.value.includes("/")) mark("invalid-address-item");
      return { type, value: address(v.value) };
    }
    function portItem(item) {
      const v = known(item, ["type", "value", "start", "stop"]);
      const type = choice(v.type, ["PORT_NUMBER", "PORT_NUMBER_RANGE"]);
      if (type === "PORT_NUMBER") return { type, value: num(v.value, 1, 65535) };
      if (type === "PORT_NUMBER_RANGE") {
        if (integer(v.start, 1, 65535) && integer(v.stop, 1, 65535) && v.start > v.stop) mark("reversed-port-range");
        return { type, start: num(v.start, 1, 65535), stop: num(v.stop, 1, 65535) };
      }
      return { type };
    }
    function filter(value, port, required = false) {
      if (value == null && !required) return { type: "ANY" };
      const v = known(value, ["type", "matchOpposite", "items", "trafficMatchingListId"]);
      const type = choice(v.type, [port ? "PORTS" : "IP_ADDRESSES", "TRAFFIC_MATCHING_LIST"]);
      const result = { type, matchOpposite: bool(v.matchOpposite) };
      if ((type === "TRAFFIC_MATCHING_LIST" && v.items != null)
        || (type !== "TRAFFIC_MATCHING_LIST" && v.trafficMatchingListId != null)) mark("conflicting-filter-fields");
      if (type === "TRAFFIC_MATCHING_LIST") result.trafficMatchingListId = id("list", v.trafficMatchingListId);
      else if (type !== "UNKNOWN") {
        result.items = array(v.items, port ? portItem : addressItem);
        if (!result.items.length) mark("empty-required-criteria");
      }
      return result;
    }
    function endpoint(value) {
      const v = known(value, ["zoneId", "trafficFilter"]);
      const result = { zoneId: id("zone", v.zoneId) };
      if (v.trafficFilter == null) { result.trafficFilter = { type: "ANY" }; return result; }
      const t = known(v.trafficFilter, ["type", "networkFilter", "ipAddressFilter", "portFilter", "macAddressFilter",
        "domainFilter", "regionFilter", "ipv6IidFilter", "applicationFilter", "applicationCategoryFilter",
        "vpnServerFilter", "siteToSiteVpnTunnelFilter"]);
      const type = choice(t.type, ["NETWORK", "IP_ADDRESS", "PORT", "MAC_ADDRESS", "DOMAIN", "REGION",
        "IPV6_IID", "APPLICATION", "APPLICATION_CATEGORY", "VPN_SERVER", "SITE_TO_SITE_VPN_TUNNEL"]);
      const expected = { NETWORK: "networkFilter", IP_ADDRESS: "ipAddressFilter", DOMAIN: "domainFilter",
        REGION: "regionFilter", IPV6_IID: "ipv6IidFilter", APPLICATION: "applicationFilter",
        APPLICATION_CATEGORY: "applicationCategoryFilter", VPN_SERVER: "vpnServerFilter", SITE_TO_SITE_VPN_TUNNEL: "siteToSiteVpnTunnelFilter" };
      if (Object.keys(t).some(k => !["type", "portFilter", "macAddressFilter", expected[type]].includes(k) && t[k] != null)) mark("conflicting-selector-fields");
      const target = { type, portFilter: filter(t.portFilter, true, type === "PORT") };
      if (type === "NETWORK") {
        const n = known(t.networkFilter, ["matchOpposite", "networkIds"]);
        target.networkFilter = { matchOpposite: bool(n.matchOpposite), networkIds: array(n.networkIds, x => id("network", x)) };
        if (!target.networkFilter.networkIds.length) mark("empty-required-criteria");
      } else if (type === "IP_ADDRESS") target.ipAddressFilter = filter(t.ipAddressFilter, false, true);
      else if (!["PORT", "UNKNOWN"].includes(type)) { target.criteria = "REDACTED_UNSUPPORTED"; mark("redacted-selector-semantics"); }
      if (t.macAddressFilter != null) { target.additionalMacFilter = "REDACTED"; mark("redacted-mac-filter"); }
      result.trafficFilter = target;
      return result;
    }
    const PROTOCOLS = ["ah", "ax.25", "dccp", "ddp", "egp", "eigrp", "encap", "esp", "etherip", "fc", "ggp", "gre",
      "hip", "hmp", "icmp", "icmpv6", "idpr-cmtp", "idrp", "igmp", "igp", "ip", "ipcomp", "ipencap", "ipip", "ipv6",
      "ipv6-frag", "ipv6-nonxt", "ipv6-opts", "ipv6-route", "isis", "iso-tp4", "l2tp", "manet", "mobility-header",
      "mpls-in-ip", "ospf", "pim", "pup", "rdp", "rohc", "rspf", "rsvp", "sctp", "shim6", "skip", "st", "tcp",
      "tcp_udp", "udp", "udplite", "vmtp", "vrrp", "wesp", "xns-idp", "xtp"];
    function protocol(value) {
      const v = known(value, ["ipVersion", "protocolFilter"]);
      const result = { ipVersion: choice(v.ipVersion, ["IPV4", "IPV6", "IPV4_AND_IPV6"]) };
      if (v.protocolFilter == null) { result.protocolFilter = { type: "ANY" }; return result; }
      const f = known(v.protocolFilter, ["type", "matchOpposite", "protocol", "protocolNumber", "preset"]);
      const type = choice(f.type, ["NAMED_PROTOCOL", "PROTOCOL_NUMBER", "PRESET"]);
      const target = { type };
      if (type === "PRESET") target.preset = { name: choice(object(f.preset) ? f.preset.name : undefined, ["TCP_UDP"]) };
      else if (type !== "UNKNOWN") {
        target.matchOpposite = bool(f.matchOpposite);
        if (type === "PROTOCOL_NUMBER") target.protocolNumber = num(f.protocolNumber, 0, 255);
        else {
          const p = known(f.protocol, ["name", "typenameFilter"]);
          target.protocol = { name: choice(p.name, PROTOCOLS) };
          if (p.typenameFilter != null) { target.protocol.typenameFilter = "REDACTED_UNSUPPORTED"; mark("icmp-subtype-omitted"); }
        }
      }
      result.protocolFilter = target;
      return result;
    }
    function semantic(project) {
      return function (value) {
        const before = issueCount, result = project(value);
        result.semanticStatus = issueCount === before ? "COMPLETE" : "INCOMPLETE";
        return result;
      };
    }
    const network = semantic(value => {
      const v = known(value, ["id", "name", "management", "default", "enabled", "metadata", "vlanId", "zoneId",
        "dhcpGuarding", "cellularBackupEnabled", "internetAccessEnabled", "ipv4Configuration", "ipv6Configuration",
        "isolationEnabled", "mdnsForwardingEnabled", "switchId"]);
      const result = { id: id("network", v.id), vlanId: num(v.vlanId, 1, 4009), enabled: bool(v.enabled), default: bool(v.default),
        management: choice(v.management, ["GATEWAY", "SWITCH", "UNMANAGED"]), origin: origin(v.metadata) };
      if (v.zoneId != null) result.zoneId = id("zone", v.zoneId);
      if (result.management === "GATEWAY") {
        result.isolationEnabled = bool(v.isolationEnabled); result.internetAccessEnabled = bool(v.internetAccessEnabled);
        result.mdnsForwardingEnabled = bool(v.mdnsForwardingEnabled);
        const c = known(v.ipv4Configuration, ["hostIpAddress", "prefixLength", "additionalHostIpSubnets", "autoScaleEnabled",
          "dhcpConfiguration", "natOutboundIpAddressConfiguration"]);
        if (!ipv4(c.hostIpAddress)) mark("invalid-network-host-address");
        result.ipv4Configuration = { hostIpAddress: address(c.hostIpAddress), prefixLength: num(c.prefixLength, 8, 30),
          additionalHostIpSubnets: c.additionalHostIpSubnets == null ? [] : array(c.additionalHostIpSubnets, address) };
        if (object(c.dhcpConfiguration)) result.dhcpConfigured = true;
        else if (c.dhcpConfiguration == null) result.dhcpConfigured = false;
        else { result.dhcpConfigured = "UNKNOWN"; mark("invalid-dhcp-configuration"); }
        if (c.natOutboundIpAddressConfiguration != null) result.outboundNatConfigured = true;
        result.ipv6Configured = v.ipv6Configuration != null;
        if (v.ipv6Configuration != null) {
          const c6 = known(v.ipv6Configuration, ["interfaceType", "additionalHostIpSubnets", "clientAddressAssignment",
            "dnsServerIpAddressesOverride", "routerAdvertisement", "hostIpAddress", "prefixLength", "wanInterfaceId", "prefixId"]);
          result.ipv6Configuration = { interfaceType: choice(c6.interfaceType, ["STATIC", "PREFIX_DELEGATION"]),
            additionalHostIpSubnets: c6.additionalHostIpSubnets == null ? [] : array(c6.additionalHostIpSubnets, address) };
          if (c6.hostIpAddress != null) result.ipv6Configuration.hostIpAddress = address(c6.hostIpAddress);
          if (c6.prefixLength != null) result.ipv6Configuration.prefixLength = num(c6.prefixLength, 0, 128);
        }
      }
      return result;
    });
    const zone = semantic(value => {
      const v = known(value, ["id", "name", "metadata", "networkIds"]);
      const result = { id: id("zone", v.id), origin: origin(v.metadata), networkIds: array(v.networkIds, x => id("network", x)) };
      if (result.origin === "SYSTEM_DEFINED" && ["External", "Internal", "Gateway", "VPN", "Hotspot", "DMZ"].includes(v.name)) result.role = v.name;
      else { result.role = "UNIDENTIFIED"; mark("zone-role-unknown"); }
      return result;
    });
    const policy = semantic(value => {
      const v = known(value, ["id", "name", "description", "enabled", "index", "action", "source", "destination", "ipProtocolScope",
        "connectionStateFilter", "ipsecFilter", "loggingEnabled", "schedule", "metadata"]);
      const a = known(v.action, ["type", "allowReturnTraffic"]);
      const action = { type: choice(a.type, ["ALLOW", "BLOCK", "REJECT"]) };
      if (action.type === "ALLOW") action.allowReturnTraffic = bool(a.allowReturnTraffic);
      const result = { id: id("policy", v.id), index: num(v.index, -2147483648, 2147483647), enabled: bool(v.enabled), origin: origin(v.metadata),
        action, source: endpoint(v.source), destination: endpoint(v.destination), ipProtocolScope: protocol(v.ipProtocolScope),
        connectionStateFilter: v.connectionStateFilter == null ? null : array(v.connectionStateFilter,
          x => choice(x, ["NEW", "INVALID", "ESTABLISHED", "RELATED"])),
        ipsecFilter: v.ipsecFilter == null ? null : choice(v.ipsecFilter, ["MATCH_ENCRYPTED", "MATCH_NOT_ENCRYPTED"]),
        loggingEnabled: bool(v.loggingEnabled), scheduleConfigured: v.schedule != null };
      if (v.schedule != null) mark("schedule-details-omitted");
      if (Array.isArray(v.connectionStateFilter) && (!v.connectionStateFilter.length
        || new Set(v.connectionStateFilter).size !== v.connectionStateFilter.length)) mark("invalid-connection-state-filter");
      if (result.origin === "ORCHESTRATED") mark("unsupported-policy-origin");
      return result;
    });
    const matchingList = semantic(value => {
      const v = known(value, ["id", "name", "type", "items"]);
      const type = choice(v.type, ["IPV4_ADDRESSES", "IPV6_ADDRESSES", "PORTS"]);
      const result = { id: id("list", v.id), type, items: type === "UNKNOWN" ? [] : array(v.items, type === "PORTS" ? portItem : addressItem) };
      if (Array.isArray(v.items) && ["IPV4_ADDRESSES", "IPV6_ADDRESSES"].includes(type)) for (const item of v.items) {
        const values = item?.type === "IP_ADDRESS_RANGE" ? [item.start, item.stop] : [item?.value];
        if (values.some(raw => typeof raw !== "string" || (type === "IPV4_ADDRESSES"
          ? !ipv4(raw.split("/")[0]) : !raw.split("/")[0].includes(":")))
          || (type === "IPV6_ADDRESSES" && item?.type === "IP_ADDRESS_RANGE")) mark("matching-list-family-mismatch");
      }
      if (!result.items.length) mark("empty-required-criteria");
      return result;
    });
    const order = semantic(value => {
      const v = known(value, ["orderedFirewallPolicyIds"]);
      const ids = known(v.orderedFirewallPolicyIds, ["beforeSystemDefined", "afterSystemDefined"]);
      const before = array(ids.beforeSystemDefined, x => id("policy", x));
      const after = array(ids.afterSystemDefined, x => id("policy", x));
      if (new Set([...before, ...after]).size !== before.length + after.length) mark("duplicate-order-reference");
      return { beforeSystemDefined: before, afterSystemDefined: after };
    });
    return { id, address, network, zone, policy, matchingList, order, issues, mark, get issueCount() { return issueCount; } };
  }
  async function collect(env, key, siteIndex) {
    const origin = localOrigin(env.location?.origin);
    if (typeof key !== "string" || key.length < 8 || key.length > 1024 || /[\x00-\x20\x7f]/.test(key)) throw failure("invalid-api-key");
    const sanitizer = createSanitizer(), coverage = {};
    const startedAt = new Date().toISOString();
    let requests = 0, recordsRead = 0;
    const safeCode = e => typeof e?.auditCode === "string" && /^[a-z0-9-]{1,70}$/.test(e.auditCode) ? e.auditCode : "request-failed";
    function allowPath(path) {
      if (["/info", "/sites"].includes(path.split("?")[0])) return true;
      const uuid = "[0-9a-f-]{36}";
      return new RegExp(`^/sites/${uuid}/(?:networks(?:/${uuid})?|firewall/(?:zones|policies(?:/ordering)?)|traffic-matching-lists)(?:\\?.*)?$`, "i").test(path);
    }
    async function get(path) {
      if (!allowPath(path)) throw failure("route-not-allowed");
      if (++requests > LIMITS.requests) throw failure("request-limit");
      if (env.signal?.aborted) throw failure("export-cancelled");
      const controller = new (env.AbortController ?? AbortController)();
      let reader, timer, abort;
      const abortFromUI = () => controller.abort();
      env.signal?.addEventListener("abort", abortFromUI, { once: true });
      const task = (async () => {
        let response;
        try {
          response = await env.fetch(origin + BASE + path, { method: "GET", credentials: "omit", redirect: "error",
            cache: "no-store", mode: "same-origin", headers: { Accept: "application/json", "X-API-Key": key }, signal: controller.signal });
        } catch { throw failure(env.signal?.aborted ? "export-cancelled" : "request-failed"); }
        if (response.status !== 200) throw failure(response.status === 401 || response.status === 403 ? "api-access-denied"
          : response.status === 404 ? "endpoint-unavailable" : "http-error");
        if (response.redirected || (response.url && new URL(response.url).origin !== origin)) throw failure("redirect-not-allowed");
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get("content-type") ?? "")) throw failure("non-json-response");
        const length = response.headers?.get("content-length");
        if (length && (!/^\d+$/.test(length) || Number(length) > LIMITS.bytes)) throw failure("response-size-limit");
        if (!response.body?.getReader) throw failure("stream-reader-required");
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0, text = "";
        try {
          while (true) {
            if (controller.signal.aborted) throw failure("export-cancelled");
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > LIMITS.bytes) throw failure("response-size-limit");
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
          return JSON.parse(text);
        } catch (e) { throw failure(e?.auditCode ? safeCode(e) : "invalid-json-response"); }
      })();
      const deadline = new Promise((_, reject) => {
        timer = (env.setTimeout ?? setTimeout)(() => { controller.abort(); reject(failure("request-timeout")); }, LIMITS.timeoutMs);
        abort = () => { controller.abort(); reject(failure("export-cancelled")); };
        env.signal?.addEventListener("abort", abort, { once: true });
      });
      try { return await Promise.race([task, deadline]); }
      finally {
        (env.clearTimeout ?? clearTimeout)(timer);
        env.signal?.removeEventListener("abort", abortFromUI);
        env.signal?.removeEventListener("abort", abort);
        controller.abort();
        if (reader) void reader.cancel().catch(() => {});
      }
    }
    async function list(path, policyAudit) {
      let offset = 0, total, pages = 0;
      const rows = [], seen = new Set();
      do {
        if (++pages > LIMITS.pages) throw failure("page-limit");
        const v = await get(`${path}?offset=${offset}&limit=200`);
        if (!object(v) || !Array.isArray(v.data) || !integer(v.count, 0, 200) || v.count !== v.data.length
          || v.offset !== offset || !integer(v.limit, 1, 200) || v.count > v.limit
          || !integer(v.totalCount, 0, LIMITS.records) || (total !== undefined && v.totalCount !== total)) throw failure("pagination-invalid");
        total = v.totalCount;
        if (offset + v.count > total || (v.count === 0 && offset < total)) throw failure("pagination-invalid");
        if (recordsRead + v.count > LIMITS.records) throw failure("record-limit");
        recordsRead += v.count;
        if (policyAudit) { policyAudit.diagnostics.pagesAccepted++; policyAudit.diagnostics.rowsRead += v.count; }
        for (const [index, row] of v.data.entries()) {
          if (policyAudit) { policyAudit.accept(row, offset + index + 1); continue; }
          if (!object(row) || typeof row.id !== "string" || !UUID.test(row.id) || seen.has(row.id.toLowerCase())) throw failure("pagination-invalid");
          seen.add(row.id.toLowerCase()); rows.push(row);
        }
        offset += v.count;
      } while (offset < total);
      return rows;
    }
    async function resource(name, task) {
      try {
        const rows = await task(); coverage[name] = { status: "COLLECTED", recordCount: rows.length }; return rows;
      } catch (e) {
        if (env.signal?.aborted) throw failure("export-cancelled");
        coverage[name] = { status: "ERROR", recordCount: 0, code: safeCode(e) }; return [];
      }
    }
    try {
      const info = await get("/info");
      if (!object(info) || info.applicationVersion !== VERSION) throw failure("network-version-mismatch");
      const sites = await list("/sites");
      if (!sites.length) throw failure("no-sites");
      if (siteIndex === undefined) siteIndex = sites.length === 1 ? 0 : await env.chooseSite?.(sites.length);
      if (!integer(siteIndex, 0, sites.length - 1)) throw failure("site-selection-required");
      const siteId = sites[siteIndex].id, site = { id: sanitizer.id("site", siteId) }, scope = `/sites/${siteId}`;
      const networks = await resource("networks", async () => {
        const rows = await list(`${scope}/networks`);
        if (rows.length > LIMITS.networks) throw failure("network-detail-limit");
        rows.forEach(row => sanitizer.id("network", row.id));
        const result = [];
        for (const row of rows) {
          const detail = await get(`${scope}/networks/${row.id}`);
          if (!object(detail) || typeof detail.id !== "string" || detail.id.toLowerCase() !== row.id.toLowerCase()) throw failure("network-detail-mismatch");
          result.push(sanitizer.network(detail));
        }
        return result;
      });
      const zones = await resource("zones", async () => (await list(`${scope}/firewall/zones`)).map(sanitizer.zone));
      let rawPolicies = [];
      // Recovery is limited to row identity, after every page envelope passes.
      // Numeric row locators are audit evidence only, never route/reference IDs.
      const policyRows = [], policyIds = new Map();
      const policyDiagnostics = { pagesAccepted: 0, rowsRead: 0, omittedNonObjectRows: 0,
        missingIdRows: 0, invalidIdTypeRows: 0, invalidIdFormatRows: 0, duplicateIdRows: 0 };
      const policyAudit = {
        diagnostics: policyDiagnostics,
        accept(row, auditRow) {
          if (!object(row)) { policyDiagnostics.omittedNonObjectRows++; return; }
          let identityStatus = "VALID_UUID";
          if (!Object.hasOwn(row, "id")) { identityStatus = "MISSING_ID"; policyDiagnostics.missingIdRows++; }
          else if (typeof row.id !== "string") { identityStatus = "INVALID_ID_TYPE"; policyDiagnostics.invalidIdTypeRows++; }
          else if (!UUID.test(row.id)) { identityStatus = "INVALID_ID_FORMAT"; policyDiagnostics.invalidIdFormatRows++; }
          const entry = { row, auditRow, identityStatus };
          if (identityStatus === "VALID_UUID") {
            const key = row.id.toLowerCase(), previous = policyIds.get(key);
            if (previous) {
              if (previous.identityStatus !== "DUPLICATE_ID") {
                previous.identityStatus = "DUPLICATE_ID"; policyDiagnostics.duplicateIdRows++;
              }
              entry.identityStatus = "DUPLICATE_ID"; policyDiagnostics.duplicateIdRows++;
            } else policyIds.set(key, entry);
          }
          policyRows.push(entry);
        }
      };
      const policies = await resource("policies", async () => {
        await list(`${scope}/firewall/policies`, policyAudit);
        rawPolicies = policyRows.map(entry => entry.row);
        return policyRows.map(({ row, auditRow, identityStatus }) => {
          // Ambiguous IDs must never enter the policy alias/reference map.
          const projection = sanitizer.policy(identityStatus === "VALID_UUID" ? row : { ...row, id: null });
          if (identityStatus !== "VALID_UUID") projection.semanticStatus = "INCOMPLETE";
          return { ...projection, auditRow, identityStatus };
        });
      });
      coverage.policies.diagnostics = policyDiagnostics;
      if (coverage.policies.status === "COLLECTED" && (policyDiagnostics.omittedNonObjectRows
        || policyDiagnostics.missingIdRows || policyDiagnostics.invalidIdTypeRows
        || policyDiagnostics.invalidIdFormatRows || policyDiagnostics.duplicateIdRows)) {
        coverage.policies.status = policies.length ? "PARTIAL" : "ERROR";
        coverage.policies.code = "policy-identity-invalid";
      }
      const trafficMatchingLists = await resource("trafficMatchingLists", async () => (await list(`${scope}/traffic-matching-lists`)).map(sanitizer.matchingList));
      const networkIds = new Set(networks.map(v => v.id)), zoneIds = new Set(zones.map(v => v.id));
      const listsById = new Map(trafficMatchingLists.map(v => [v.id, v]));
      function unresolved(record) { record.semanticStatus = "INCOMPLETE"; sanitizer.mark("unresolved-resource-reference"); }
      for (const network of networks) if (network.zoneId && !zoneIds.has(network.zoneId)) unresolved(network);
      for (const zone of zones) if (zone.networkIds.some(id => !networkIds.has(id))) unresolved(zone);
      for (const policy of policies) for (const end of [policy.source, policy.destination]) {
        if (!zoneIds.has(end.zoneId)) unresolved(policy);
        const traffic = end.trafficFilter;
        if (traffic.networkFilter?.networkIds.some(id => !networkIds.has(id))) unresolved(policy);
        for (const [kind, filter] of [["port", traffic.portFilter], ["address", traffic.ipAddressFilter]]) {
          if (filter?.type === "TRAFFIC_MATCHING_LIST") {
            const list = listsById.get(filter.trafficMatchingListId);
            if (!list || (kind === "port" ? list.type !== "PORTS" : !["IPV4_ADDRESSES", "IPV6_ADDRESSES"].includes(list.type))
              || list.semanticStatus !== "COMPLETE") unresolved(policy);
          }
        }
      }
      const ordering = await resource("ordering", async () => {
        if (coverage.policies.status !== "COLLECTED") throw failure("policy-inventory-unavailable");
        const pairs = new Map();
        for (const p of rawPolicies) {
          const source = p.source?.zoneId, destination = p.destination?.zoneId;
          if (typeof source !== "string" || typeof destination !== "string" || !UUID.test(source) || !UUID.test(destination)) throw failure("policy-zone-invalid");
          pairs.set(`${source.toLowerCase()}:${destination.toLowerCase()}`, [source, destination]);
        }
        if (pairs.size > LIMITS.pairs) throw failure("ordering-pair-limit");
        const result = [];
        for (const [source, destination] of pairs.values()) {
          const order = await get(`${scope}/firewall/policies/ordering?sourceFirewallZoneId=${source}&destinationFirewallZoneId=${destination}`);
          const projection = sanitizer.order(order);
          const pairPolicies = rawPolicies.filter(p => p.source?.zoneId?.toLowerCase() === source.toLowerCase()
            && p.destination?.zoneId?.toLowerCase() === destination.toLowerCase());
          const expected = new Set(pairPolicies.filter(p => p.metadata?.origin === "USER_DEFINED").map(p => p.id.toLowerCase()));
          const actual = new Set();
          for (const segment of ["beforeSystemDefined", "afterSystemDefined"]) {
            const ids = order?.orderedFirewallPolicyIds?.[segment];
            if (Array.isArray(ids)) for (const x of ids) {
              if (typeof x !== "string" || !expected.has(x.toLowerCase())) {
                projection.semanticStatus = "INCOMPLETE"; sanitizer.mark("unresolved-order-reference");
              } else actual.add(x.toLowerCase());
            }
          }
          if (actual.size !== expected.size || pairPolicies.some(p => !["USER_DEFINED", "SYSTEM_DEFINED", "DERIVED"].includes(p.metadata?.origin))) {
            projection.semanticStatus = "INCOMPLETE"; sanitizer.mark("incomplete-user-policy-order");
          }
          result.push({ sourceZoneId: sanitizer.id("zone", source), destinationZoneId: sanitizer.id("zone", destination), ...projection });
        }
        return result;
      });
      rawPolicies = [];
      const semanticsIssues = Object.fromEntries([...new Set(sanitizer.issues)].map(code => [code, sanitizer.issues.filter(x => x === code).length]));
      return { schemaVersion: 1, applicationVersion: VERSION, startedAt, finishedAt: new Date().toISOString(),
        collectionStatus: Object.values(coverage).every(v => v.status === "COLLECTED") ? "COMPLETE" : "PARTIAL",
        auditStatus: "INCOMPLETE", atomicSnapshot: false, privateTopologyRetained: true, notCollected: [...NOT_COLLECTED],
        coverage, site, networks, zones, policies, trafficMatchingLists, ordering, semanticsIssues,
        semanticsIssueCount: sanitizer.issueCount, semanticsIssuesTruncated: sanitizer.issueCount > sanitizer.issues.length,
        recordsRead, requestsMade: Math.min(requests, LIMITS.requests), limits: { ...LIMITS } };
    } finally { key = ""; }
  }
  async function run(env) {
    const doc = env.document;
    if (!doc?.createElement || !doc.body) throw failure("document-unavailable");
    let dialog, input, controller;
    try {
      dialog = doc.createElement("dialog");
      const heading = doc.createElement("h2"), status = doc.createElement("p"), label = doc.createElement("label");
      input = doc.createElement("input");
      const start = doc.createElement("button"), cancel = doc.createElement("button");
      controller = new (env.AbortController ?? AbortController)();
      let key = "", running = false, closed = false;
      heading.textContent = "Export UniFi firewall settings";
      status.textContent = "GET-only. No passwords or raw responses in the file. Private network addresses remain.";
      label.textContent = "Temporary local Network API key ";
      input.type = "password"; input.autocomplete = "off"; input.maxLength = 1024; input.spellcheck = false;
      start.textContent = "Export"; cancel.textContent = "Close";
      label.append(input); dialog.append(heading, status, label, doc.createElement("br"), start, cancel);
      function close() {
        closed = true; controller.abort(); key = ""; input.value = ""; dialog.close(); dialog.remove();
      }
      cancel.addEventListener("click", close);
      dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
      doc.body.append(dialog);
      try { localOrigin(env.location?.origin); }
      catch { status.textContent = "Open this script on your trusted local HTTPS UDR IP address, not the cloud website."; input.disabled = true; start.disabled = true; }
      await dialog.showModal(); await input.focus();
      async function chooseSite(count) {
        if (closed) throw failure("export-cancelled");
        status.textContent = `Choose one of ${count} sites. Names are omitted from this private export.`;
        const select = doc.createElement("select");
        for (let i = 0; i < count; i++) {
          const option = doc.createElement("option"); option.value = String(i); option.textContent = `Site ${i + 1}`; select.append(option);
        }
        const button = doc.createElement("button"); button.textContent = "Use selected site";
        dialog.append(select, button); select.focus();
        try {
          return await new Promise((resolve, reject) => {
            const aborted = () => reject(failure("export-cancelled"));
            controller.signal.addEventListener("abort", aborted, { once: true });
            button.addEventListener("click", () => { controller.signal.removeEventListener("abort", aborted); resolve(Number(select.value)); }, { once: true });
          });
        } finally { select.remove(); button.remove(); }
      }
      start.addEventListener("click", async () => {
        if (running || closed) return;
        running = true; start.disabled = true; input.disabled = true;
        key = input.value; input.value = "";
        status.textContent = "Reading selected network and firewall settings…";
        try {
          const output = await collect({ location: env.location, fetch: env.fetch.bind(env), AbortController: env.AbortController,
            signal: controller.signal, chooseSite }, key);
          key = "";
          if (closed) return;
          const blob = new env.Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
          const url = env.URL.createObjectURL(blob), link = doc.createElement("a");
          try {
            link.href = url; link.download = `murmingle-unifi-audit-${new Date().toISOString().slice(0, 10)}.json`;
            doc.body.append(link); link.click();
          } finally { link.remove(); env.setTimeout(() => env.URL.revokeObjectURL(url), 1000); }
          status.textContent = output.collectionStatus === "COMPLETE"
            ? "Export downloaded. Review the file before sharing. Port forwarding and UPnP still need a separate check."
            : "Partial export downloaded. Its coverage report lists missing reads; no network safety conclusion is possible.";
          start.textContent = "Done";
        } catch (e) {
          if (!closed) {
            const allowed = ["local-https-origin-required", "invalid-api-key", "api-access-denied", "endpoint-unavailable", "http-error",
              "request-failed", "request-timeout", "export-cancelled", "redirect-not-allowed", "non-json-response", "response-size-limit",
              "stream-reader-required", "invalid-json-response", "network-version-mismatch", "no-sites", "site-selection-required",
              "pagination-invalid", "record-limit", "request-limit", "page-limit", "route-not-allowed"];
            status.textContent = `Export failed (${allowed.includes(e?.auditCode) ? e.auditCode : "export-failed"}). No raw response was saved.`;
            start.disabled = false; input.disabled = false; input.focus();
          }
        } finally { key = ""; input.value = ""; running = false; }
      });
    } catch {
      try { controller?.abort(); } catch {}
      try { if (input) input.value = ""; } catch {}
      try { dialog?.remove(); } catch {}
      throw failure("dialog-startup-failed");
    }
  }
  return { createSanitizer, collect, run, bootstrap, BOOTSTRAP_MESSAGES, localOrigin, VERSION, LIMITS, NOT_COLLECTED };
});
