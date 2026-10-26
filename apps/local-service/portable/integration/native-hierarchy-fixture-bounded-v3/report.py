"""Pure, bounded completion grammar for the fixed ADR220 Node TAP tree.

This validates bytes only. It does not establish process ownership, pipe EOF,
resource compliance, SQL correctness beyond the assertions, or publication rights.
"""
import hashlib
import math
import re

STDOUT_LIMIT = 262144
STDERR_LIMIT = 65536
LINE_LIMIT = 4096
LINE_COUNT_LIMIT = 4096
REPORT_LIMIT = 65536

EXPECTED_TREE = (
    ('pure wire and factory capability preconditions do not open any DB', ()),
    ('actual canonical native queue, historical topology and ancestor feeds (separately gated)', (
        'full143/depth8 publication and canonical admission preserve both signed-zero wires',
        'SQL publication rejects missing parents, cycles, duplicates and genuine depth9 atomically',
        'real root/snapshot/ancestor edges commit atomically; owner prefix is display only',
        'all15 outside-detail roots use actual protected preparation and canonical writes',
        'fresh observation with unchanged material appends evidence without material-version inflation',
        'page A\u2192B/replay preserves original Source/Topic/Discussion/root and real reply hydration',
        'owner-wide CAS affects both authors, not semantic membership or existing root prefix',
        'unresolved actual native observation creates canonical root with NO semantic edges',
        'inherited versus explicit owner subtree cut changes posting projection without rescoring/edge rewrites',
        'ancestor keyset pages deduplicate, exclude siblings and fence only related feed changes',
        'pre-enqueue failure retains bounded original issued command; explicit same request resumes only handoff',
        'committed attestation without issuance quarantines retries before allocation or preparation',
        'lease/token/prior mismatches and one-use attestation cannot create duplicate canonical Sources',
        'private attestation revocation and expired prequeue commands fail closed and scrub without renewal',
        'completion rejoins publication head and Source incarnation before any canonical mutation',
        'actual mutation before original authority expiry still rolls back at late literal COMMIT',
        'actual canonical mutation rollback and destructive wrappers restore all history/edges atomically',
        'two accepted revisions SAME publication family preserve old ancestry; family revoke hides edges only',
        'unissued/forged refs/direct old publication or node enqueue refuse without canonical mutation',
        'Source erasure scrubs vectors/evidence and retires operations but keeps original discussion',
    )),
    ('actual local-detail conflict and STOP persist root-only canonical membership (separately gated)', ('conflict', 'stop')),
)
EXPECTED_POINTS = sum(1 + len(children) for _, children in EXPECTED_TREE)
_NUMBER = re.compile(r'(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?\Z')


class _Invalid(Exception):
    pass


def _duration(value):
    if len(value) > 64 or not _NUMBER.fullmatch(value):
        raise _Invalid('tap-diagnostic')
    if not math.isfinite(float(value)):
        raise _Invalid('tap-diagnostic')


def _parse(lines):
    position = 0
    points = 0

    def take(expected, code='tap-structure'):
        nonlocal position
        if position >= len(lines) or lines[position] != expected:
            raise _Invalid(code)
        position += 1

    def duration(prefix):
        nonlocal position
        if position >= len(lines) or not lines[position].startswith(prefix):
            raise _Invalid('tap-diagnostic')
        _duration(lines[position][len(prefix):])
        position += 1

    def point(title, number, depth, children=()):
        nonlocal points
        indent = ' ' * depth
        take(indent + '# Subtest: ' + title, 'tap-coverage')
        for index, child in enumerate(children, 1):
            point(child, index, depth + 4)
        if children:
            take(indent + '    1..' + str(len(children)), 'tap-plan')
        take(indent + 'ok ' + str(number) + ' - ' + title, 'tap-result')
        take(indent + '  ---', 'tap-diagnostic')
        duration(indent + '  duration_ms: ')
        take(indent + "  type: 'test'", 'tap-diagnostic')
        take(indent + '  ...', 'tap-diagnostic')
        points += 1

    take('TAP version 13')
    for index, (title, children) in enumerate(EXPECTED_TREE, 1):
        point(title, index, 0, children)
    take('1..3', 'tap-plan')
    for summary in ('tests 25', 'suites 0', 'pass 25', 'fail 0', 'cancelled 0', 'skipped 0', 'todo 0'):
        take('# ' + summary, 'tap-summary')
    duration('# duration_ms ')
    if position != len(lines) or points != EXPECTED_POINTS:
        raise _Invalid('tap-trailing')
    return points


def validate_completion(stdout: bytes, stderr: bytes, exit_code: int) -> dict:
    """Return only closed finite metadata; never return input/error excerpts.

    Exact built-in input types avoid invoking caller hooks. Hashes are omitted
    for oversized input: no unbounded scan is performed after a bound refusal.
    Stderr is opaque because the fixed imports may emit runtime warnings.
    """
    result = {'schema': 'native-hierarchy-fixture-tap-report/v1', 'accepted': False,
              'code': 'input-type', 'stdoutBytes': 0, 'stderrBytes': 0,
              'stdoutSha256': None, 'stderrSha256': None,
              'testPoints': 0, 'outerTests': 0}
    if type(stdout) is not bytes or type(stderr) is not bytes or type(exit_code) is not int:
        return result
    result['stdoutBytes'], result['stderrBytes'] = len(stdout), len(stderr)
    if len(stdout) > STDOUT_LIMIT:
        result['code'] = 'stdout-limit'
        return result
    if len(stderr) > STDERR_LIMIT:
        result['code'] = 'stderr-limit'
        return result
    result['stdoutSha256'] = hashlib.sha256(stdout).hexdigest()
    result['stderrSha256'] = hashlib.sha256(stderr).hexdigest()
    if exit_code != 0:
        result['code'] = 'exit-status'
        return result
    if not stdout.endswith(b'\n'):
        result['code'] = 'tap-lines'
        return result
    raw_lines = stdout[:-1].split(b'\n')
    if len(raw_lines) > LINE_COUNT_LIMIT or any(len(line) > LINE_LIMIT for line in raw_lines):
        result['code'] = 'tap-lines'
        return result
    try:
        lines = [line.decode('utf-8', errors='strict').removesuffix('\r') for line in raw_lines]
    except UnicodeDecodeError:
        result['code'] = 'tap-encoding'
        return result
    if any(any(ord(char) < 32 or ord(char) == 127 for char in line) for line in lines):
        result['code'] = 'tap-encoding'
        return result
    try:
        points = _parse(lines)
    except _Invalid as error:
        result['code'] = error.args[0]
        return result
    result.update(accepted=True, code='complete', testPoints=points, outerTests=len(EXPECTED_TREE))
    return result
