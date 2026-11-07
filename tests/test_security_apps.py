import json
import unittest
from portfolio import security_apps as s
from portfolio.validation import ValidationError

def event(minute, status='failure', user='alice', ip='192.0.2.10'):
    return json.dumps({'timestamp': f'2026-01-01T10:{minute:02}:00Z', 'ip': ip, 'user': user, 'status': status})

class SecurityTests(unittest.TestCase):

    def test_logs_sort_and_correlate_success(self):
        text = '\n'.join([event(5, 'success'), event(4), event(0), event(3), event(1), event(2)])
        r = s.auth_logs({'text': text})
        self.assertEqual([a['rule'] for a in r['alerts']], ['Failure burst', 'Success after failures'])
        self.assertEqual(r['alerts'][1]['line'], 1)

    def test_alert_evidence_uses_original_lines_in_event_time_order(self):
        text = '\n'.join([event(5, 'success'), event(4), event(0), event(3), event(1), event(2)])
        report = s.auth_logs({'text': text})
        for alert in report['alerts']:
            self.assertEqual(alert['evidence_lines'], [3, 5, 6, 4, 2])
            self.assertEqual(alert['evidence_total'], 5)
            self.assertFalse(alert['evidence_truncated'])
            self.assertEqual(alert['evidence_start'], '2026-01-01T10:00:00+00:00')
            self.assertEqual(alert['evidence_end'], '2026-01-01T10:04:00+00:00')
            self.assertEqual(alert['count_unit'], 'failure events')
        self.assertEqual(report['alerts'][1]['line'], 1)
        self.assertNotIn(1, report['alerts'][1]['evidence_lines'])

    def test_alert_evidence_is_bounded_and_distinguishes_accounts_from_events(self):
        text = '\n'.join([event(index) for index in range(60)] + [event(59, 'success')])
        report = s.auth_logs({'text': text, 'threshold': 2, 'window_minutes': 60})
        success = next((alert for alert in report['alerts'] if alert['rule'] == 'Success after failures'))
        self.assertEqual(success['evidence_lines'], list(range(11, 61)))
        self.assertEqual(success['evidence_total'], 60)
        self.assertTrue(success['evidence_truncated'])
        self.assertEqual(success['evidence_start'], '2026-01-01T10:00:00+00:00')
        spray = s.auth_logs({'text': '\n'.join([event(0), event(1), event(2, user='bob')]), 'threshold': 2})
        alert = next((alert for alert in spray['alerts'] if alert['rule'] == 'Multiple accounts targeted'))
        self.assertEqual((alert['count'], alert['count_unit'], alert['evidence_total']), (2, 'distinct accounts', 3))
        self.assertEqual(alert['evidence_lines'], [1, 2, 3])

    def test_window_is_inclusive_and_success_clears_account(self):
        r = s.auth_logs({'text': '\n'.join([event(0), event(10), event(10, 'success'), event(11, 'success')]), 'threshold': 2})
        self.assertEqual(sum((a['rule'] == 'Success after failures' for a in r['alerts'])), 1)
        outside = s.auth_logs({'text': '\n'.join([event(0), event(11)]), 'threshold': 2})
        self.assertEqual(outside['alerts'], [])

    def test_spraying_requires_distinct_users_and_no_cross_account_success(self):
        r = s.auth_logs({'text': '\n'.join([event(i, user=f'user-{i}') for i in range(5)] + [event(6, 'success', 'other')])})
        self.assertIn('Multiple accounts targeted', [a['rule'] for a in r['alerts']])
        self.assertNotIn('Success after failures', [a['rule'] for a in r['alerts']])

    def test_bad_events_are_reported_without_echoing_input(self):
        r = s.auth_logs({'text': 'not-json\n[]\n{"timestamp":"2026-01-01T00:00:00","ip":"bad","user":"x","status":"failure"}'})
        self.assertEqual((r['accepted'], len(r['rejected'])), (0, 3))
        self.assertNotIn('not-json', json.dumps(r))
        with self.assertRaises(ValidationError):
            s.auth_logs({'text': event(0), 'threshold': True})

    def test_logs_reject_ambiguous_json_and_numeric_ip_addresses(self):
        duplicate = event(0)[:-1] + ',"status":"success"}'
        deep = event(0)[:-1] + ',"extra":' + '[' * 100 + '0' + ']' * 100 + '}'
        invalid = [event(0, ip=1), event(0, ip=True), duplicate, deep, event(0)[:-1] + ',"extra":NaN}']
        result = s.auth_logs({'text': '\n'.join([event(0), *invalid])})
        self.assertEqual(result['accepted'], 1)
        self.assertEqual(len(result['rejected']), 5)
        self.assertEqual(result['failures'], 1)

    def test_failure_burst_rearms_after_window_expires(self):
        r = s.auth_logs({'text': '\n'.join([event(0), event(1), event(20), event(21)]), 'threshold': 2})
        self.assertEqual(sum((a['rule'] == 'Failure burst' for a in r['alerts'])), 2)

    def test_distinct_user_counter_rearms_after_users_leave_window(self):
        result = s.auth_logs({'text': '\n'.join([event(0, user='alice'), event(1, user='bob'), event(11, user='bob'), event(12, user='charlie')]), 'threshold': 2, 'window_minutes': 10})
        spray = [alert for alert in result['alerts'] if alert['rule'] == 'Multiple accounts targeted']
        self.assertEqual([alert['line'] for alert in spray], [2, 4])
        self.assertEqual([alert['count'] for alert in spray], [2, 2])

    def test_distinct_user_counter_keeps_users_with_unexpired_failures(self):
        result = s.auth_logs({'text': '\n'.join([event(0, user='alice'), event(5, user='alice'), event(6, user='bob'), event(11, user='charlie')]), 'threshold': 3, 'window_minutes': 10})
        spray = [alert for alert in result['alerts'] if alert['rule'] == 'Multiple accounts targeted']
        self.assertEqual(len(spray), 1)
        self.assertEqual((spray[0]['line'], spray[0]['count']), (4, 3))
