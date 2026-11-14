"""Bounded, read-only HTTP latency comparison on the feedback host."""
import concurrent.futures
import http.client
import json
import random
import statistics
import subprocess
import tempfile
import time


def summarize(rows):
    result = {}
    for key in ('connect_ms', 'response_ms', 'total_ms'):
        values = sorted(row[key] for row in rows)
        result[key] = {
            'median': round(statistics.median(values), 3),
            'p95': round(values[int((len(values) - 1) * .95)], 3),
            'max': round(max(values), 3),
        }
    return {'requests': len(rows), **result}


def request(port, route):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        start = time.perf_counter()
        conn.connect()
        connected = time.perf_counter()
        conn.request('GET', route)
        response = conn.getresponse()
        body = json.loads(response.read())
        end = time.perf_counter()
        assert response.status == (200 if route == '/healthz' else 405)
        assert body.get('ok') if route == '/healthz' else body.get('error')
        return {'connect_ms': (connected-start)*1000,
                'response_ms': (end-connected)*1000,
                'total_ms': (end-start)*1000}
    finally:
        conn.close()


with tempfile.TemporaryDirectory(prefix='rift-feedback-benchmark-') as directory:
    source = """
import {createFeedbackServer} from '/opt/rift-buddy-feedback/current/relay/feedback-server.mjs';
const app=await createFeedbackServer({directory:process.argv[1]});
app.server.listen(0,'127.0.0.1',()=>console.log(app.server.address().port));
process.on('SIGTERM',async()=>{await app.stop();process.exit(0)});
"""
    node = subprocess.Popen([
        '/opt/rift-buddy-runtime/node-v24.21.0-linux-arm64/bin/node',
        '--input-type=module', '-e', source, directory,
    ], stdout=subprocess.PIPE, text=True)
    try:
        port = int(node.stdout.readline().strip())
        ports = {'node_baseline': port, 'rust_active': 8790}
        output = {'clock': 'perf_counter', 'new_tcp_connection_each_request': True,
                  'synthetic_writes': 0, 'results': {}}
        rng = random.Random(20261023)
        for route in ('/healthz', '/v1/feedback'):
            rows = {name: [] for name in ports}
            for _ in range(20):
                for name, target in ports.items():
                    request(target, route)
            for _ in range(300):
                names = list(ports)
                rng.shuffle(names)
                for name in names:
                    rows[name].append(request(ports[name], route))
            output['results'][route] = {name: summarize(items) for name, items in rows.items()}
        # Small bounded concurrent probe, far below an Internet load test.
        for name, target in ports.items():
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                rows = list(pool.map(lambda _: request(target, '/healthz'), range(100)))
            output['results']['health_concurrency_4_' + name] = summarize(rows)
        print(json.dumps(output, indent=2))
    finally:
        node.terminate()
        try:
            node.wait(timeout=5)
        except subprocess.TimeoutExpired:
            node.kill()
            node.wait()
