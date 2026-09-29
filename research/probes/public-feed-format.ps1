param(
  [ValidateSet('Discover', 'Feed', 'SelfTest')][string]$Mode = 'SelfTest',
  [string]$Url
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$limit = 1048576
$approvedHosts = @('meta.discourse.org', 'forums.macrumors.com', 'unknowns.de', 'kretaforum.info')
$atomNs = 'http://www.w3.org/2005/Atom'
$slashNs = 'http://purl.org/rss/1.0/modules/slash/'

function Fail([string]$reason, [int]$status = 0, [int]$bytes = 0) {
  return @{ mode = $Mode; status = $status; bytes = $bytes; failure = $reason }
}
function HrefUri([string]$value) {
  $uri = $null
  if (-not [uri]::TryCreate($value, [UriKind]::Absolute, [ref]$uri)) { return $null }
  if (@('http', 'https') -notcontains $uri.Scheme -or $uri.UserInfo -or $uri.IsLoopback -or
      $uri.HostNameType -ne [UriHostNameType]::Dns -or $uri.Host -notmatch '\.' -or
      $uri.Host -match '(?i)(^|\.)(local|internal|localhost|test|invalid)$') { return $null }
  return $uri
}
function PublicUri([string]$value) {
  $uri = HrefUri $value
  if (-not $uri -or $uri.Scheme -ne 'https' -or $uri.Port -ne 443 -or
      $approvedHosts -notcontains $uri.Host.ToLowerInvariant()) { return $null }
  return $uri
}
function ChildText($node, [string[]]$names) {
  foreach ($name in $names) {
    foreach ($child in $node.ChildNodes) {
      if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element -and $child.LocalName -eq $name -and
          -not [string]::IsNullOrWhiteSpace($child.InnerText)) { return $child.InnerText }
    }
  }
  return $null
}
function ChildElement($node, [string[]]$names) {
  foreach ($child in $node.ChildNodes) {
    if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element -and $names -contains $child.LocalName) { return $child }
  }
  return $null
}
function ChildElementNs($node, [string]$name, [string]$namespace) {
  foreach ($child in $node.ChildNodes) {
    if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element -and
        $child.LocalName -eq $name -and $child.NamespaceURI -eq $namespace) { return $child }
  }
  return $null
}
function HasOffOriginHref($node, [uri]$feedUri) {
  foreach ($part in $node.ChildNodes) {
    if ($part.NodeType -ne [System.Xml.XmlNodeType]::Element -or
        @('description', 'summary', 'content', 'encoded') -notcontains $part.LocalName) { continue }
    $markup = [System.Net.WebUtility]::HtmlDecode($part.InnerXml)
    foreach ($match in [regex]::Matches($markup, '(?is)<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|''([^'']*)'')')) {
      $value = [System.Net.WebUtility]::HtmlDecode(($match.Groups[1].Value + $match.Groups[2].Value))
      $linked = HrefUri $value
      if ($linked -and $linked.Host -ine $feedUri.Host) { return $true }
    }
  }
  return $false
}
function InspectFeed([byte[]]$body, [uri]$feedUri) {
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver = $null
  $settings.MaxCharactersInDocument = 2097152
  $stream = New-Object System.IO.MemoryStream(,$body)
  try {
    $reader = [System.Xml.XmlReader]::Create($stream, $settings)
    try {
      $doc = New-Object System.Xml.XmlDocument
      $doc.XmlResolver = $null
      $doc.Load($reader)
    } finally { $reader.Dispose() }
  } finally { $stream.Dispose() }
  $root = $doc.DocumentElement
  if ($root.LocalName -eq 'rss' -and $root.NamespaceURI -eq '') {
    $format = 'RSS'; $entries = @($root.SelectNodes("./*[local-name()='channel']/*[local-name()='item']") |
      Where-Object { $_.NamespaceURI -eq '' })
  } elseif ($root.LocalName -eq 'feed' -and $root.NamespaceURI -eq $atomNs) {
    $format = 'Atom'; $entries = @($root.SelectNodes("./*[local-name()='entry']") |
      Where-Object { $_.NamespaceURI -eq $atomNs })
  } else { throw 'unsupported-format' }
  $result = @{ mode = 'Feed'; format = $format; totalEntries = $entries.Count;
    inspected = [Math]::Min(10, $entries.Count); titlePresent = 0; linkPresent = 0;
    commentsPresent = 0; datePresent = 0; descriptionPresent = 0; creatorPresent = 0;
    offOriginHrefPresent = 0; replyCountFieldPresent = 0; itemLinkOffHost = 0;
    commentsSameHostAsItem = 0; itemAbsoluteHttpLinkPresent = 0;
    commentsAbsoluteHttpLinkPresent = 0 }
  foreach ($entry in ($entries | Select-Object -First 10)) {
    if (ChildText $entry @('title')) { $result.titlePresent++ }
    # RSS item link / Atom alternate is the item permalink, not necessarily an article URL.
    $itemLink = $null; $commentsLink = $null
    if ($format -eq 'RSS') {
      $link = ChildElementNs $entry 'link' ''
      if ($link) { $itemLink = $link.InnerText.Trim() }
    } else {
      foreach ($child in $entry.ChildNodes) {
        if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element -and $child.LocalName -eq 'link' -and
            $child.NamespaceURI -eq $atomNs -and
            @('', 'alternate') -contains $child.GetAttribute('rel') -and $child.GetAttribute('href')) {
          $itemLink = $child.GetAttribute('href'); break
        }
      }
    }
    if ($itemLink) { $result.linkPresent++ }
    $itemUri = HrefUri $itemLink
    if ($itemUri) { $result.itemAbsoluteHttpLinkPresent++ }
    if ($itemUri -and $itemUri.Host -ine $feedUri.Host) { $result.itemLinkOffHost++ }
    $comments = if ($format -eq 'RSS') { ChildElementNs $entry 'comments' '' } else { $null }
    if ($comments) { $commentsLink = $comments.InnerText.Trim() }
    if ($format -eq 'Atom') {
      foreach ($child in $entry.ChildNodes) {
        if ($child.NodeType -eq [System.Xml.XmlNodeType]::Element -and $child.LocalName -eq 'link' -and
            $child.NamespaceURI -eq $atomNs -and
            $child.GetAttribute('rel') -eq 'replies' -and $child.GetAttribute('href')) {
          $commentsLink = $child.GetAttribute('href'); break
        }
      }
    }
    if ($commentsLink) { $result.commentsPresent++ }
    $commentsUri = HrefUri $commentsLink
    if ($commentsUri) { $result.commentsAbsoluteHttpLinkPresent++ }
    if ($itemUri -and $commentsUri -and $itemUri.Host -ieq $commentsUri.Host) { $result.commentsSameHostAsItem++ }
    if (ChildText $entry @('pubDate', 'published', 'updated', 'date')) { $result.datePresent++ }
    if (ChildElement $entry @('description', 'summary', 'content', 'encoded')) { $result.descriptionPresent++ }
    if (ChildElement $entry @('creator', 'author')) { $result.creatorPresent++ }
    if (HasOffOriginHref $entry $feedUri) { $result.offOriginHrefPresent++ }
    foreach ($part in $entry.ChildNodes) {
      if ($part.NodeType -eq [System.Xml.XmlNodeType]::Element -and
          ((@('total', 'reply_count', 'num_comments') -contains $part.LocalName) -or
           ($part.LocalName -eq 'comments' -and $part.NamespaceURI -eq $slashNs)) -and
          $part.InnerText -match '^\s*\d+\s*$') { $result.replyCountFieldPresent++; break }
    }
  }
  return $result
}
function DiscoverFeeds([byte[]]$body, [uri]$baseUri) {
  $html = [System.Text.Encoding]::UTF8.GetString($body)
  $found = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($tag in [regex]::Matches($html, '(?is)<(link|a)\b[^>]*>')) {
    $href = [regex]::Match($tag.Value, '(?is)\bhref\s*=\s*(?:"([^"]*)"|''([^'']*)'')')
    if (-not $href.Success) { continue }
    $value = [System.Net.WebUtility]::HtmlDecode(($href.Groups[1].Value + $href.Groups[2].Value))
    $candidate = $null
    if (-not [uri]::TryCreate($baseUri, $value, [ref]$candidate)) { continue }
    $publicQuery = $candidate.AbsolutePath -match '(?i)/external\.php$' -and
      $candidate.Query -match '(?i)^\?type=RSS2&forumids=\d{1,6}(?:,\d{1,6})*$'
    if ($candidate.Scheme -ne 'https' -or $candidate.Port -ne 443 -or $candidate.Host -ine $baseUri.Host -or
        $candidate.UserInfo -or ($candidate.Query -and -not $publicQuery) -or $candidate.Fragment -or
        $candidate.AbsolutePath -match '(?i)/(?:front|inbox|modlog)\.xml/' -or
        @($candidate.Segments | Where-Object { $_.Length -gt 64 }).Count) { continue }
    $typed = $tag.Value -match '(?i)\btype\s*=\s*["'']application/(?:rss|atom)\+xml["'']'
    $pathLike = $candidate.AbsolutePath -match '(?i)(?:\.rss|\.atom|\.xml|/feed/?|/feeds/?|/feed\.php|/external\.php)$'
    if ($typed -or $pathLike) { [void]$found.Add($candidate.AbsoluteUri) }
  }
  return @{ mode = 'Discover'; feedHrefs = @($found | Sort-Object) }
}
function Probe([uri]$uri) {
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect = $false; $handler.UseCookies = $false
  $handler.UseDefaultCredentials = $false; $handler.UseProxy = $false
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan
  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $uri)
  [void]$request.Headers.UserAgent.ParseAdd('UDL-Research/0.1')
  $cancel = [System.Threading.CancellationTokenSource]::new(15000)
  $response = $null; $stream = $null; $memory = $null
  try {
    $send = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $cancel.Token)
    if ([System.Threading.Tasks.Task]::WhenAny($send, [System.Threading.Tasks.Task]::Delay(-1, $cancel.Token)).GetAwaiter().GetResult() -ne $send) {
      return (Fail 'timeout')
    }
    $response = $send.GetAwaiter().GetResult()
    $status = [int]$response.StatusCode
    if ($status -lt 200 -or $status -ge 300) { return (Fail 'http-status' $status) }
    if ($response.Content.Headers.ContentLength -gt $limit) { return (Fail 'response-too-large' $status) }
    $streamTask = $response.Content.ReadAsStreamAsync()
    if ([System.Threading.Tasks.Task]::WhenAny($streamTask, [System.Threading.Tasks.Task]::Delay(-1, $cancel.Token)).GetAwaiter().GetResult() -ne $streamTask) {
      return (Fail 'timeout' $status)
    }
    $stream = $streamTask.GetAwaiter().GetResult()
    $memory = New-Object System.IO.MemoryStream
    $buffer = New-Object byte[] 8192
    while ($true) {
      $remaining = $limit - $memory.Length
      if ($remaining -le 0) { return (Fail 'response-too-large' $status) }
      $readTask = $stream.ReadAsync($buffer, 0, [Math]::Min($buffer.Length, $remaining), $cancel.Token)
      if ([System.Threading.Tasks.Task]::WhenAny($readTask, [System.Threading.Tasks.Task]::Delay(-1, $cancel.Token)).GetAwaiter().GetResult() -ne $readTask) {
        return (Fail 'timeout' $status)
      }
      $read = $readTask.GetAwaiter().GetResult()
      if ($read -eq 0) { break }
      $memory.Write($buffer, 0, $read)
    }
    $body = $memory.ToArray() # Transient in memory; never persisted or output.
    try {
      if ($Mode -eq 'Discover') { $result = DiscoverFeeds $body $uri }
      else { $result = InspectFeed $body $uri }
      $result.status = $status; $result.bytes = $body.Length
      return $result
    } catch { return (Fail 'invalid-document' $status $body.Length) }
  } catch {
    if ($cancel.IsCancellationRequested) { return (Fail 'timeout') }
    return (Fail 'request-failed')
  }
  finally {
    if ($memory) { $memory.Dispose() }; if ($stream) { $stream.Dispose() }
    if ($response) { $response.Dispose() }; $request.Dispose(); $client.Dispose(); $handler.Dispose(); $cancel.Dispose()
  }
}
function SelfTest {
  $uri = [uri]'https://example.com/feed.xml'
  $rss = '<rss><channel><item><title>One</title><link>https://example.com/thread</link><comments>https://example.com/comments</comments><pubDate>Tue, 01 Jan 2030 00:00:00 GMT</pubDate><description><![CDATA[<a href="https://news.example.org/story">story</a>]]></description></item></channel></rss>'
  $atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Two</title><link href="https://example.com/thread"/><updated>2030-01-01T00:00:00Z</updated><summary>Summary</summary><author><name>A</name></author></entry></feed>'
  $external = '<rss><channel><item><link>https://news.example.org/story</link><comments>https://example.com/thread</comments></item></channel></rss>'
  $atomReplies = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><link rel="alternate" href="https://news.example.org/story"/><link rel="replies" href="https://news.example.org/comments"/></entry></feed>'
  $slashCount = '<rss xmlns:slash="http://purl.org/rss/1.0/modules/slash/"><channel><item><link>https://example.com/thread</link><slash:comments>12</slash:comments></item></channel></rss>'
  $relative = '<rss><channel><item><link>/thread</link><comments>/comments</comments></item></channel></rss>'
  $eleven = '<rss><channel>' + ('<item><link>https://example.com/thread</link><comments>https://example.com/comments</comments></item>' * 10) +
    '<item><link>https://news.example.org/eleventh</link></item></channel></rss>'
  $a = InspectFeed ([Text.Encoding]::UTF8.GetBytes($rss)) $uri
  $b = InspectFeed ([Text.Encoding]::UTF8.GetBytes($atom)) $uri
  $c = InspectFeed ([Text.Encoding]::UTF8.GetBytes($external)) $uri
  $d = InspectFeed ([Text.Encoding]::UTF8.GetBytes($atomReplies)) $uri
  $e = InspectFeed ([Text.Encoding]::UTF8.GetBytes($eleven)) $uri
  $f = InspectFeed ([Text.Encoding]::UTF8.GetBytes($slashCount)) $uri
  $g = InspectFeed ([Text.Encoding]::UTF8.GetBytes($relative)) $uri
  $encoded = @($a, $b, $c, $d, $e, $f, $g) | ConvertTo-Json -Compress
  if ($a.totalEntries -ne 1 -or $a.commentsPresent -ne 1 -or $a.offOriginHrefPresent -ne 1 -or
      $a.itemLinkOffHost -ne 0 -or $a.commentsSameHostAsItem -ne 1 -or
      $a.itemAbsoluteHttpLinkPresent -ne 1 -or $a.commentsAbsoluteHttpLinkPresent -ne 1 -or
      $b.totalEntries -ne 1 -or $b.linkPresent -ne 1 -or $b.creatorPresent -ne 1 -or
      $c.itemLinkOffHost -ne 1 -or $c.commentsSameHostAsItem -ne 0 -or
      $c.itemAbsoluteHttpLinkPresent -ne 1 -or $c.commentsAbsoluteHttpLinkPresent -ne 1 -or
      $d.itemLinkOffHost -ne 1 -or $d.commentsPresent -ne 1 -or $d.commentsSameHostAsItem -ne 1 -or
      $d.itemAbsoluteHttpLinkPresent -ne 1 -or $d.commentsAbsoluteHttpLinkPresent -ne 1 -or
      $e.totalEntries -ne 11 -or $e.inspected -ne 10 -or $e.itemLinkOffHost -ne 0 -or $e.commentsSameHostAsItem -ne 10 -or
      $f.commentsPresent -ne 0 -or $f.commentsAbsoluteHttpLinkPresent -ne 0 -or $f.replyCountFieldPresent -ne 1 -or
      $g.linkPresent -ne 1 -or $g.commentsPresent -ne 1 -or $g.itemAbsoluteHttpLinkPresent -ne 0 -or
      $g.commentsAbsoluteHttpLinkPresent -ne 0 -or $g.commentsSameHostAsItem -ne 0 -or
      $encoded.Contains('story') -or $encoded.Contains('https://')) { throw 'self-test-failed' }
  foreach ($bad in @('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel/></rss>', '<rss><channel>')) {
    try { $null = InspectFeed ([Text.Encoding]::UTF8.GetBytes($bad)) $uri; throw 'self-test-failed' }
    catch { if ($_.Exception.Message -eq 'self-test-failed') { throw } }
  }
  return @{ mode = 'SelfTest'; result = 'PASS'; cases = 9 }
}

if ($Mode -eq 'SelfTest') { $result = SelfTest }
elseif (-not $Url -or -not (PublicUri $Url)) { $result = Fail 'invalid-public-https-url' }
else { $result = Probe (PublicUri $Url) }
$result | ConvertTo-Json -Depth 3 -Compress
