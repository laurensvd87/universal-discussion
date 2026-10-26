"""Invented TAP fixtures only: no child, application import or database."""
import hashlib
import json
import unittest

from report import (EXPECTED_TREE, EXPECTED_POINTS, STDOUT_LIMIT, STDERR_LIMIT,
                    REPORT_LIMIT, validate_completion)


def valid_tap():
    """Exported synthetic valid fixed-tree fixture for supervisor fake tests."""
    lines = ['TAP version 13']

    def point(title, number, depth, children=()):
        indent = ' ' * depth
        lines.append(indent + '# Subtest: ' + title)
        for index, child in enumerate(children, 1):
            point(child, index, depth + 4)
        if children:
            lines.append(indent + '    1..' + str(len(children)))
        lines.extend([indent + 'ok ' + str(number) + ' - ' + title,
                      indent + '  ---', indent + '  duration_ms: 0.125',
                      indent + "  type: 'test'", indent + '  ...'])

    for index, (title, children) in enumerate(EXPECTED_TREE, 1):
        point(title, index, 0, children)
    lines.extend(['1..3', '# tests 25', '# suites 0', '# pass 25', '# fail 0',
                  '# cancelled 0', '# skipped 0', '# todo 0', '# duration_ms 12.5'])
    return ('\n'.join(lines) + '\n').encode('utf-8')


class CompletionTests(unittest.TestCase):
    def reject(self, stdout, stderr=b'', exit_code=0):
        result = validate_completion(stdout, stderr, exit_code)
        self.assertFalse(result['accepted'])
        self.assertLess(len(json.dumps(result).encode()), REPORT_LIMIT)
        return result

    def test_complete_tree_and_hashes(self):
        data = valid_tap()
        result = validate_completion(data, b'', 0)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['testPoints'], 25)
        self.assertEqual(EXPECTED_POINTS, 25)
        self.assertEqual(tuple(len(children) for _, children in EXPECTED_TREE), (0, 20, 2))
        self.assertEqual(result['outerTests'], 3)
        self.assertEqual(result['stdoutSha256'], hashlib.sha256(data).hexdigest())

    def test_bounded_stderr_is_opaque_even_non_utf8(self):
        warning = b'private warning\x00\xff'
        result = validate_completion(valid_tap(), warning, 0)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['stderrSha256'], hashlib.sha256(warning).hexdigest())
        self.assertNotIn('private', json.dumps(result))

    def test_crlf_preserves_raw_hash(self):
        data = valid_tap().replace(b'\n', b'\r\n')
        result = validate_completion(data, b'', 0)
        self.assertTrue(result['accepted'])
        self.assertEqual(result['stdoutSha256'], hashlib.sha256(data).hexdigest())

    def test_every_line_boundary_truncation(self):
        data = valid_tap()
        for index, byte in enumerate(data):
            if byte == 10:
                self.reject(data[:index + 1]) if index + 1 < len(data) else None
        self.reject(data[:-1])
        self.reject(b'')

    def test_original_exit_required(self):
        for code in (-1, 1, 3221225477):
            self.assertEqual(self.reject(valid_tap(), exit_code=code)['code'], 'exit-status')

    def test_exact_builtin_types_no_hooks(self):
        class Hostile:
            def __len__(self):
                raise AssertionError('hook')
            def __bytes__(self):
                raise AssertionError('hook')
        class ByteSubclass(bytes):
            def __len__(self):
                raise AssertionError('hook')
        for value in (Hostile(), ByteSubclass(b'a'), bytearray(b'a'), memoryview(b'a'), None):
            self.assertEqual(self.reject(value)['code'], 'input-type')
            self.assertEqual(self.reject(valid_tap(), value)['code'], 'input-type')
        for code in (True, 0.0, Hostile(), None):
            self.assertEqual(self.reject(valid_tap(), exit_code=code)['code'], 'input-type')

    def test_byte_bounds(self):
        self.assertEqual(self.reject(b'a' * (STDOUT_LIMIT + 1))['code'], 'stdout-limit')
        self.assertEqual(self.reject(valid_tap(), b'a' * (STDERR_LIMIT + 1))['code'], 'stderr-limit')
        self.assertTrue(validate_completion(valid_tap(), b'a' * STDERR_LIMIT, 0)['accepted'])

    def test_line_bounds(self):
        self.assertEqual(self.reject(b'a' * 4097 + b'\n')['code'], 'tap-lines')
        self.assertEqual(self.reject(b'\n' * 4097)['code'], 'tap-lines')

    def test_unsafe_encoding_and_controls(self):
        for prefix in (b'\xff', b'\xef\xbb\xbf', b'\x00', b'\x1b', b'\t', b'\r', b'\x7f', b'\xed\xa0\x80'):
            self.reject(prefix + valid_tap())

    def test_any_bad_result_or_directive(self):
        data = valid_tap()
        for old, new in ((b'ok 1 -', b'not ok 1 -'), (b"type: 'test'", b"type: 'suite'"),
                         (b'1..3\n', b'1..3 # SKIP\n'), (b'# pass 25', b'# pass 24'),
                         (b'# fail 0', b'# fail 1'), (b'# skipped 0', b'# skipped 1'),
                         (b'# cancelled 0', b'# cancelled 1'), (b'# todo 0', b'# todo 1'),
                         (b'# suites 0', b'# suites 1'), (b'# tests 25', b'# tests 24')):
            self.reject(data.replace(old, new, 1))
        self.reject(data.replace(b' - conflict\n', b' - conflict # TODO\n'))
        self.reject(b'Bail out!\n' + data)

    def test_exact_order_titles_numbers_nesting_and_plans(self):
        data = valid_tap()
        for old, new in ((b'# Subtest: conflict', b'# Subtest: stop'),
                         (b'ok 2 - stop', b'ok 1 - stop'),
                         (b'    # Subtest: conflict', b'# Subtest: conflict'),
                         (b'    1..20', b'    1..19'), (b'    1..2', b'    1..3'),
                         (b'TAP version 13', b'TAP version 14')):
            self.reject(data.replace(old, new, 1))
        self.reject(data.replace(b'    1..20\n', b'    1..20\n    1..20\n'))
        self.reject(data + b'1..3\n')
        self.reject(data.replace(b'# duration_ms ', b'# duration_ms: '))

    def test_diagnostics_are_not_a_yaml_language(self):
        data = valid_tap()
        for value in (b'NaN', b'Infinity', b'-0', b'-1', b'1e999', b'.5', b'01', b'0x10',
                      b'&anchor 1', b'*anchor', b'!!python/object:bad', b'1\n  raw: private'):
            self.reject(data.replace(b'0.125', value, 1))
        self.reject(data.replace(b'  ...\n', b'  raw: private\n  ...\n', 1))
        for value in (b'0', b'1', b'1.25', b'1e-7', b'1e+3'):
            self.assertTrue(validate_completion(data.replace(b'0.125', value, 1), b'', 0)['accepted'])

    def test_unknown_stdout_cannot_be_a_success_side_channel(self):
        for extra in (b'# private diagnostic\n', b'private database row\n', b'\n'):
            self.reject(valid_tap() + extra)
            self.reject(extra + valid_tap())

    def test_closed_finite_projection_no_raw_input(self):
        result = self.reject(b'private body: secret\n', b'private error')
        self.assertEqual(set(result), {'schema', 'accepted', 'code', 'stdoutBytes', 'stderrBytes',
                                      'stdoutSha256', 'stderrSha256', 'testPoints', 'outerTests'})
        self.assertNotIn('private', json.dumps(result))
        self.assertLess(len(json.dumps(result).encode()), 1024)


if __name__ == '__main__':
    unittest.main()
