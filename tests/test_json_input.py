import unittest
import io
from unittest.mock import patch
from portfolio.json_input import decode, read_exact

class UnicodeJSONTests(unittest.TestCase):

    def test_unpaired_surrogates_are_rejected_in_keys_values_and_nested_arrays(self):
        for raw in ('{"secret":"PRIVATE_PREFIX_\\ud800"}', '{"\\udfff":1}', '{"rows":[{"name":"\\udc00"}]}', '["\\ud800x\\udfff"]'):
            with self.subTest(raw=raw), self.assertRaisesRegex(ValueError, '^Malformed JSON body$'):
                decode(raw)

    def test_valid_surrogate_pairs_and_unicode_round_trip(self):
        value = decode('{"name":"\\ud83d\\ude80 café","rows":["\\u0000","\\ufffd"]}')
        self.assertEqual(value, {'name': '🚀 café', 'rows': ['\x00', '�']})
        self.assertEqual(decode('{"日本語":"résumé"}'.encode('utf-8')), {'日本語': 'résumé'})

    def test_invalid_utf8_does_not_reflect_submitted_content(self):
        with self.assertRaisesRegex(ValueError, '^Malformed JSON body$'):
            decode(b'{"secret":"PRIVATE_PREFIX_\xff"}')

class BodyDeadlineTests(unittest.TestCase):

    def test_partial_reads_are_assembled_without_consuming_the_next_message(self):

        class Partial(io.BytesIO):

            def read1(self, size):
                return super().read(min(size, 2))
        stream = Partial(b'abcdefNEXT')
        self.assertEqual(read_exact(stream, 6), b'abcdef')
        self.assertEqual(stream.read(), b'NEXT')
        with self.assertRaisesRegex(ValueError, 'Incomplete request body'):
            read_exact(io.BytesIO(b'short'), 20)

    def test_continuous_progress_cannot_extend_the_absolute_deadline(self):
        clock = [0.0]

        class Trickle(io.BytesIO):

            def read1(self, size):
                clock[0] += 0.1
                return super().read(1)

        class Connection:

            def __init__(self):
                self.timeouts = []

            def gettimeout(self):
                return 10

            def settimeout(self, value):
                self.timeouts.append(value)
        connection = Connection()
        with patch('portfolio.json_input.time.monotonic', side_effect=lambda: clock[0]):
            with self.assertRaises(TimeoutError):
                read_exact(Trickle(b'123456789'), 9, connection, timeout=0.25)
        self.assertAlmostEqual(clock[0], 0.3)
        self.assertEqual(connection.timeouts[-1], 10)
        self.assertAlmostEqual(connection.timeouts[0], 0.25)
        self.assertAlmostEqual(connection.timeouts[-2], 0.05)

    def test_socket_timeout_is_restored_after_success_and_eof(self):

        class Connection:
            value = 0.5

            def gettimeout(self):
                return self.value

            def settimeout(self, value):
                self.value = value
        connection = Connection()
        self.assertEqual(read_exact(io.BytesIO(b'{}'), 2, connection), b'{}')
        self.assertEqual(connection.value, 0.5)
        with self.assertRaises(ValueError):
            read_exact(io.BytesIO(b''), 2, connection)
        self.assertEqual(connection.value, 0.5)
