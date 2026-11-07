import json
import csv
import io
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from portfolio import capabilities as c, security_apps as security
from portfolio.db import initialize, connect, SCHEMA
from portfolio.validation import ValidationError, NotFoundError

def enhanced(path, data, function):
    return c.enrich(path, data, function(data))

class AnalysisCapabilities(unittest.TestCase):

    def test_incident_queue_groups_source_not_each_alert(self):
        data = {'text': '\n'.join((json.dumps({'timestamp': f'2026-01-01T00:0{i}:00Z', 'ip': '192.0.2.1', 'user': f'user{i}', 'status': 'failure'}) for i in range(3))), 'threshold': 2}
        result = enhanced('/api/security/logs', data, security.auth_logs)
        rows = result['capabilities']['tables'][0]['rows']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][2], len(result['alerts']))
        self.assertEqual(rows[0][1], 'high')
if __name__ == '__main__':
    unittest.main()
