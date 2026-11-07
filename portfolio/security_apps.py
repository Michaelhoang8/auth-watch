import ipaddress
from itertools import islice
from .json_input import decode
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from .validation import ValidationError, integer

def source(data):
    value = data.get('text')
    if not isinstance(value, str) or not value.strip() or len(value.encode('utf-8')) > 500000:
        raise ValidationError('Provide nonempty text of at most 500 KB')
    if len(value.splitlines()) > 5000:
        raise ValidationError('Limit input to 5,000 lines')
    return value

def auth_logs(data):
    text = source(data)
    threshold = integer(data, 'threshold', 2, 100) if 'threshold' in data else 5
    window = integer(data, 'window_minutes', 1, 60) if 'window_minutes' in data else 10
    events, rejected = ([], [])
    for line, raw in enumerate(text.splitlines(), 1):
        if not raw.strip():
            continue
        try:
            item = decode(raw)
            if not isinstance(item, dict):
                raise ValueError()
            stamp = item.get('timestamp')
            if not isinstance(stamp, str):
                raise ValueError()
            time = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if time.utcoffset() is None:
                raise ValueError()
            time = time.astimezone(timezone.utc)
            raw_ip = item.get('ip')
            if not isinstance(raw_ip, str):
                raise ValueError()
            ip = str(ipaddress.ip_address(raw_ip))
            user = item.get('user')
            if not isinstance(user, str) or not user.strip() or len(user) > 120:
                raise ValueError()
            status = item.get('status')
            if status not in ('failure', 'success'):
                raise ValueError()
            events.append(dict(time=time, ip=ip, user=user.strip(), status=status, line=line))
        except (ValueError, TypeError, OverflowError):
            rejected.append({'line': line, 'reason': 'Expected timestamp with timezone, valid IP, nonempty user, and success/failure status'})
    events.sort(key=lambda e: (e['time'], e['line']))
    ip_windows, user_windows = (defaultdict(deque), defaultdict(deque))
    ip_users = defaultdict(Counter)
    alerts, active = ([], set())
    failures = Counter()
    for event in events:
        ip, user, now = (event['ip'], event['user'], event['time'])
        recent = ip_windows[ip]
        account = user_windows[ip, user]
        source_users = ip_users[ip]
        while recent and (now - recent[0]['time']).total_seconds() > window * 60:
            expired = recent.popleft()['user']
            source_users[expired] -= 1
            if not source_users[expired]:
                del source_users[expired]
        while account and (now - account[0]['time']).total_seconds() > window * 60:
            account.popleft()
        if len(recent) < threshold:
            active.discard(('burst', ip))
        if len(source_users) < threshold:
            active.discard(('spray', ip))

        def alert(rule, severity, count, detail, evidence, count_unit='failure events'):
            recent_evidence = list(islice(reversed(evidence), 50))[::-1]
            alerts.append({'rule': rule, 'severity': severity, 'ip': ip, 'user': user, 'timestamp': now.isoformat(), 'line': event['line'], 'count': count, 'count_unit': count_unit, 'detail': detail, 'evidence_lines': [item['line'] for item in recent_evidence], 'evidence_total': len(evidence), 'evidence_truncated': len(evidence) > 50, 'evidence_start': evidence[0]['time'].isoformat(), 'evidence_end': evidence[-1]['time'].isoformat()})
        if event['status'] == 'failure':
            failures[ip] += 1
            recent.append(event)
            source_users[user] += 1
            account.append(event)
            if len(recent) >= threshold and ('burst', ip) not in active:
                alert('Failure burst', 'medium', len(recent), 'Repeated failures from one source within the rolling window', recent)
                active.add(('burst', ip))
            users = len(source_users)
            if users >= threshold and ('spray', ip) not in active:
                alert('Multiple accounts targeted', 'high', users, 'Failures against distinct accounts from one source; investigate possible spraying', recent, 'distinct accounts')
                active.add(('spray', ip))
        else:
            if len(account) >= threshold:
                alert('Success after failures', 'high', len(account), 'Same account and source succeeded after repeated failures; verify with the account owner', account)
            account.clear()
    return {'accepted': len(events), 'rejected': rejected, 'failures': sum(failures.values()), 'sources': len({e['ip'] for e in events}), 'alerts': alerts, 'top_sources': [{'ip': ip, 'failures': count} for ip, count in failures.most_common(10)], 'threshold': threshold, 'window_minutes': window}
