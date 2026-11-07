import json
import math
import time

def decode(raw):
    """Reject ambiguous keys, non-finite numbers, invalid Unicode, and deep JSON."""

    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON fields')
            result[key] = value
        return result

    def finite(raw_number):
        value = float(raw_number)
        if not math.isfinite(value):
            raise ValueError('Non-finite JSON number')
        return value

    def reject_constant(_):
        raise ValueError('Non-finite JSON number')
    try:
        value = json.loads(raw, object_pairs_hook=unique, parse_float=finite, parse_constant=reject_constant)
        pending = [(value, 0)]
        while pending:
            node, depth = pending.pop()
            if isinstance(node, str):
                node.encode('utf-8')
            if isinstance(node, dict):
                for key in node:
                    key.encode('utf-8')
            if isinstance(node, (dict, list)):
                if depth >= 64:
                    raise ValueError('JSON nesting limit exceeded')
                children = node.values() if isinstance(node, dict) else node
                pending.extend(((child, depth + 1) for child in children))
        return value
    except (ValueError, UnicodeError, RecursionError):
        raise ValueError('Malformed JSON body') from None

def read_exact(stream, length, connection=None, timeout=15):
    """Read a bounded body with one absolute deadline, even if bytes keep arriving."""
    deadline = time.monotonic() + timeout
    original_timeout = connection.gettimeout() if connection is not None else None
    read = getattr(stream, 'read1', stream.read)
    data = bytearray()
    try:
        while len(data) < length:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError('Request body timed out')
            if connection is not None:
                connection.settimeout(min(remaining, original_timeout) if original_timeout is not None else remaining)
            chunk = read(min(65536, length - len(data)))
            if time.monotonic() > deadline:
                raise TimeoutError('Request body timed out')
            if not chunk:
                raise ValueError('Incomplete request body')
            data.extend(chunk)
        return bytes(data)
    finally:
        if connection is not None:
            connection.settimeout(original_timeout)
