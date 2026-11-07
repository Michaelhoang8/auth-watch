from collections import defaultdict

def table(title, headers, rows):
    return {'title': title, 'headers': headers, 'rows': rows}

def enrich(path, data, result):
    """Attach diagnostics without changing existing response fields."""
    tables, notes = ([], [])
    grouped = defaultdict(list)
    for alert in result['alerts']:
        grouped[alert['ip']].append(alert)
    incidents = []
    for ip, alerts in grouped.items():
        incidents.append([ip, 'high' if any((a['severity'] == 'high' for a in alerts)) else 'medium', len(alerts), len({a['user'] for a in alerts}), min((a['timestamp'] for a in alerts)), max((a['timestamp'] for a in alerts)), ', '.join(sorted({a['rule'] for a in alerts}))])
    incidents.sort(key=lambda r: (r[1] != 'high', -r[2], r[0]))
    tables = [table('Source-level incident queue', ['Source IP', 'Priority', 'Alerts', 'Users in alerts', 'First alert', 'Last alert', 'Rules'], incidents)]
    notes = ['Groups alerts by source across the supplied batch, not by threat actor. Shared IPs can represent different users. Users counted here appear in alerts, not all authentication events.']
    if tables or notes:
        result['capabilities'] = {'tables': tables, 'notes': notes}
    return result
