"""Exercise the deployed ARM64 binary with synthetic, isolated local stores.

Run as the feedback service user. Never opens the production feedback store.
"""
import base64
import contextlib
import http.client
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time
import uuid
import zlib

BINARY = '/opt/rift-buddy-feedback/rust-9b3bddd5/rift-buddy-feedback'
BODY_LIMIT = 14 * 1024 * 1024
GOOD = {'version': 1, 'appVersion': '0.59.27',
        'text': 'Synthetic transport check', 'images': []}
RESULTS = []


def record(name, fn):
    start = time.monotonic()
    try:
        detail = fn()
        RESULTS.append({'name': name, 'passed': True,
                        'seconds': round(time.monotonic()-start, 3), 'detail': detail})
        print(json.dumps(RESULTS[-1]), flush=True)
    except Exception as error:
        RESULTS.append({'name': name, 'passed': False,
                        'seconds': round(time.monotonic()-start, 3),
                        'error': str(error) or type(error).__name__})
        print(json.dumps(RESULTS[-1]), flush=True)


class Service:
    def __init__(self, root, prepare=None):
        self.root = root
        if prepare:
            prepare(root)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            self.port = probe.getsockname()[1]
        self.child = subprocess.Popen([BINARY, str(root)],
                                      env={**os.environ, 'RIFT_FEEDBACK_PORT': str(self.port)},
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def ready(self):
        deadline = time.monotonic()+4
        while time.monotonic() < deadline:
            if self.child.poll() is not None:
                raise RuntimeError('isolated service exited before readiness')
            try:
                assert self.call('/healthz', method='GET')[0] == 200
                return self
            except OSError:
                time.sleep(.02)
        raise TimeoutError('isolated readiness timeout')

    def call(self, route='/v1/feedback', method='POST', body=GOOD, ip='192.0.2.1', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            payload = json.dumps(body).encode() if method == 'POST' else None
            connection.request(method, route, payload,
                               {'Content-Type': 'application/json', 'X-Feedback-Client-IP': ip,
                                **(headers or {})})
            response = connection.getresponse()
            return response.status, json.loads(response.read()), dict(response.getheaders())
        finally:
            connection.close()

    def raw(self, data):
        connection = socket.create_connection(('127.0.0.1', self.port), timeout=6)
        connection.sendall(data)
        return connection

    def stop(self):
        if self.child.poll() is None:
            self.child.terminate()
            try:
                self.child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.child.kill()
                self.child.wait()


@contextlib.contextmanager
def isolated(prepare=None):
    with tempfile.TemporaryDirectory(prefix='rift-feedback-transport-') as name:
        service = Service(Path(name), prepare)
        try:
            yield service.ready()
        finally:
            service.stop()


def read_raw(connection):
    try:
        response = http.client.HTTPResponse(connection)
        response.begin()
        body = response.read()
        return response.status, body
    finally:
        connection.close()


def post_head(length=None, chunked=False, ip='192.0.2.1'):
    framing = 'Transfer-Encoding: chunked' if chunked else f'Content-Length: {length}'
    return (f'POST /v1/feedback HTTP/1.1\r\nHost: localhost\r\n'
            f'Content-Type: application/json\r\nX-Feedback-Client-IP: {ip}\r\n'
            f'{framing}\r\n\r\n').encode()


def basic_and_png():
    def chunk(tag, data):
        return struct.pack('!I', len(data))+tag+data+struct.pack('!I', zlib.crc32(tag+data))
    png = (b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('!IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
           +chunk(b'IDAT', zlib.compress(b'\x00\x00\x00\x00\xff'))+chunk(b'IEND', b''))
    with isolated() as app:
        assert app.call(method='GET')[0] == 405
        status, result, _ = app.call(body={**GOOD, 'images': [
            {'type': 'image/png', 'data': base64.b64encode(png).decode()}],
            'credentials': 'synthetic-must-not-persist'})
        assert status == 201, status
        path = app.root / (result['id']+'.json')
        row = json.loads(path.read_text())
        assert set(row) == {'id', 'receivedAt', 'version', 'appVersion', 'text', 'images'}
        assert path.stat().st_mode & 0o777 == 0o600
        assert app.root.stat().st_mode & 0o777 == 0o700
        assert base64.b64decode(row['images'][0]['data']) == png
    return 'PNG, whitelist, directory 0700 / record 0600'


def chunked_body():
    with isolated() as app:
        body = json.dumps(GOOD).encode()
        pieces = [body[:17], body[17:]]
        framed = b''.join(f'{len(piece):x}\r\n'.encode()+piece+b'\r\n' for piece in pieces)
        assert read_raw(app.raw(post_head(chunked=True)+framed+b'0\r\n\r\n'))[0] == 201
    return 'fragmented chunked JSON accepted'


def body_limit():
    with isolated() as app:
        assert read_raw(app.raw(post_head(BODY_LIMIT+1)))[0] == 413
        connection = app.raw(post_head(chunked=True, ip='192.0.2.2'))
        try:
            piece = b'x' * (64*1024)
            framed = f'{len(piece):x}\r\n'.encode()+piece+b'\r\n'
            for _ in range(BODY_LIMIT//len(piece)+1):
                connection.sendall(framed)
            try:
                connection.sendall(b'0\r\n\r\n')
            except BrokenPipeError:
                pass
            assert read_raw(connection)[0] == 413
        finally:
            connection.close()
    return 'declared and streamed bodies above 14 MiB rejected'


def inflight_disconnect():
    with isolated() as app:
        sockets = [app.raw(post_head(100, ip=f'192.0.2.{i}')+b'{') for i in (1, 2)]
        try:
            time.sleep(.1)
            assert app.call(ip='192.0.2.3')[0] == 429
        finally:
            for connection in sockets:
                connection.close()
        time.sleep(.1)
        assert app.call(ip='192.0.2.4')[0] == 201
    return 'third inflight submission refused; aborted slots recovered'


def slow_headers():
    with isolated() as app:
        start = time.monotonic()
        connection = app.raw(b'GET /healthz HTTP/1.1\r\nHost: localhost\r\nX-Slow: ')
        connection.settimeout(8)
        try:
            assert connection.recv(1024) == b''
            elapsed = time.monotonic()-start
            assert 4 <= elapsed <= 7, elapsed
        finally:
            connection.close()
        assert app.call('/healthz', method='GET')[0] == 200
    return 'incomplete headers closed after %.3fs' % elapsed


def slow_body():
    with isolated() as app:
        start = time.monotonic()
        connection = app.raw(post_head(100)+b'{')
        connection.settimeout(24)
        assert read_raw(connection)[0] == 408
        elapsed = time.monotonic()-start
        assert 18 <= elapsed <= 23, elapsed
        assert app.call(ip='192.0.2.2')[0] == 201
    return 'incomplete body returned 408 after %.3fs; slot recovered' % elapsed


def header_limit():
    with isolated() as app:
        request = b'GET /healthz HTTP/1.1\r\nHost: localhost\r\nX-Large: '+b'x'*4097+b'\r\n\r\n'
        assert read_raw(app.raw(request))[0] == 431
        assert app.call('/healthz', method='GET')[0] == 200
    return 'oversized complete headers refused; health intact'


def connection_limit():
    with isolated() as app:
        sockets = []
        try:
            for _ in range(16):
                sockets.append(app.raw(b'GET /healthz HTTP/1.1\r\nHost: '))
            time.sleep(.1)
            extra = app.raw(b'GET /healthz HTTP/1.1\r\nHost: localhost\r\n\r\n')
            try:
                try:
                    result = extra.recv(1024)
                    assert result == b'', result
                except ConnectionResetError:
                    pass
            finally:
                extra.close()
        finally:
            for connection in sockets:
                connection.close()
        time.sleep(.1)
        assert app.call('/healthz', method='GET')[0] == 200
    return '17th connection closed; capacity recovers after disconnect'


def disk_quotas():
    def count(root):
        for _ in range(200):
            (root / (str(uuid.uuid4())+'.json')).write_text('{}')
    def size(root):
        with (root / (str(uuid.uuid4())+'.json')).open('wb') as file:
            file.truncate(256*1024*1024)  # sparse fixture, no large allocation
    for prepare in (count, size):
        with isolated(prepare) as app:
            assert app.call()[0] == 503
    return '200-record cap and 256 MiB cap enforced'


def ttl_and_neighbours():
    expired = str(uuid.uuid4())+'.json'
    current = str(uuid.uuid4())+'.json'
    def prepare(root):
        for name in (expired, current, 'synthetic-neighbour.txt'):
            (root/name).write_text('{}')
        old = time.time()-8*86400
        for name in (expired, 'synthetic-neighbour.txt'):
            os.utime(root/name, (old, old))
    with isolated(prepare) as app:
        assert set(path.name for path in app.root.iterdir()) == {current, 'synthetic-neighbour.txt'}
    return '8-day UUID record expired; current and unrelated fixtures retained'


def symlink_refusal():
    with tempfile.TemporaryDirectory(prefix='rift-feedback-symlink-') as name:
        root = Path(name)
        target = root/'target'
        target.mkdir()
        alias = root/'alias'
        alias.symlink_to(target, target_is_directory=True)
        service = Service(alias)
        try:
            assert service.child.wait(timeout=5) != 0
        finally:
            service.stop()
        sentinel = root/'sentinel'
        sentinel.write_text('synthetic-keep')
        (target/(str(uuid.uuid4())+'.json')).symlink_to(sentinel)
        service = Service(target)
        try:
            assert service.child.wait(timeout=5) != 0
            assert sentinel.read_text() == 'synthetic-keep'
        finally:
            service.stop()
    return 'symlink store and UUID record refused without touching target'


def shutdown_active():
    with isolated() as app:
        connection = app.raw(post_head(100)+b'{')
        try:
            time.sleep(.05)
            start = time.monotonic()
            app.child.terminate()
            assert app.child.wait(timeout=10) == 0
            elapsed = time.monotonic()-start
            assert elapsed <= 9.5
        finally:
            connection.close()
    return 'SIGTERM with incomplete request finished in %.3fs' % elapsed


for label, case in [
    ('png_whitelist_permissions', basic_and_png), ('chunked_json', chunked_body),
    ('body_limits', body_limit), ('inflight_and_disconnect', inflight_disconnect),
    ('header_timeout', slow_headers), ('body_timeout', slow_body),
    ('header_limit', header_limit), ('connection_limit', connection_limit),
    ('disk_quotas', disk_quotas), ('ttl_neighbours', ttl_and_neighbours),
    ('symlink_refusal', symlink_refusal), ('bounded_shutdown', shutdown_active),
]:
    record(label, case)

print(json.dumps({'passed': sum(row['passed'] for row in RESULTS),
                  'failed': sum(not row['passed'] for row in RESULTS),
                  'production_writes': 0}), flush=True)
raise SystemExit(any(not row['passed'] for row in RESULTS))
