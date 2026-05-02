# -*- coding: utf-8 -*-
"""
Epaminondas - Local server + SSH tunnel
Run: python start.py
"""
import http.server
import threading
import subprocess
import webbrowser
import socket
import json
import uuid
import queue
import re
import sys
import os
import time
from urllib.parse import urlparse, parse_qs

# ── ANSI colors ────────────────────────────────────────────────────────────────
def _c(code, text): return f'\033[{code}m{text}\033[0m'
def green(t):  return _c('32;1', t)
def yellow(t): return _c('33;1', t)
def cyan(t):   return _c('36;1', t)
def magenta(t):return _c('35;1', t)
def red(t):    return _c('31;1', t)
def dim(t):    return _c('2',   t)
def bold(t):   return _c('1',   t)

BASE_PORT = 8080
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))

# ── Room state ─────────────────────────────────────────────────────────────────
rooms      = {}
rooms_lock = threading.Lock()


def make_room():
    room_id = str(uuid.uuid4())[:8].upper()
    host_id = str(uuid.uuid4())
    with rooms_lock:
        rooms[room_id] = {
            'players': {host_id: 'white'},
            'queues':  {host_id: queue.Queue()},
            'guest_id': None,
        }
    return room_id, host_id


def join_room(room_id):
    with rooms_lock:
        room = rooms.get(room_id)
        if not room:
            return None, None, 'Room not found'
        if len(room['players']) >= 2:
            return None, None, 'Room is full'
        guest_id = str(uuid.uuid4())
        room['players'][guest_id] = 'black'
        room['queues'][guest_id]  = queue.Queue()
        room['guest_id'] = guest_id
        host_id = next(pid for pid, col in room['players'].items() if col == 'white')
        room['queues'][host_id].put({'event': 'opponent_joined', 'data': {}})
        return guest_id, 'black', None


def broadcast(room_id, sender_id, event, data):
    with rooms_lock:
        room = rooms.get(room_id)
        if not room:
            return False
        for pid, q in room['queues'].items():
            if pid != sender_id:
                q.put({'event': event, 'data': data})
        return True


# ── HTTP handler ───────────────────────────────────────────────────────────────
class GameHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # Suppress default access log

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_cors(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_cors()

    def do_POST(self):
        path = urlparse(self.path).path

        if path == '/room':
            room_id, host_id = make_room()
            self.send_json(200, {'roomId': room_id, 'playerId': host_id, 'color': 'white'})

        elif path == '/join':
            body    = self.read_body()
            room_id = body.get('roomId', '').upper()
            guest_id, color, err = join_room(room_id)
            if err:
                self.send_json(400, {'error': err})
            else:
                self.send_json(200, {'playerId': guest_id, 'color': color, 'roomId': room_id})

        elif path == '/move':
            body      = self.read_body()
            room_id   = body.get('roomId', '').upper()
            player_id = body.get('playerId', '')
            move      = body.get('move', {})
            ok        = broadcast(room_id, player_id, 'move', move)
            self.send_json(200 if ok else 400, {'ok': ok})

        elif path == '/event':
            body      = self.read_body()
            room_id   = body.get('roomId', '').upper()
            player_id = body.get('playerId', '')
            event     = body.get('event', 'ping')
            data      = body.get('data', {})
            ok        = broadcast(room_id, player_id, event, data)
            self.send_json(200 if ok else 400, {'ok': ok})

        else:
            self.send_json(404, {'error': 'Not found'})

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        if path == '/events':
            qs        = parse_qs(parsed.query)
            room_id   = qs.get('roomId',   [''])[0].upper()
            player_id = qs.get('playerId', [''])[0]

            with rooms_lock:
                room = rooms.get(room_id)
                if not room or player_id not in room['queues']:
                    self.send_json(400, {'error': 'Invalid room/player'})
                    return
                q = room['queues'][player_id]

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                self.wfile.write(b': ping\n\n')
                self.wfile.flush()
            except Exception:
                return

            while True:
                try:
                    item = q.get(timeout=25)
                    msg  = f"event: {item['event']}\ndata: {json.dumps(item['data'])}\n\n"
                    self.wfile.write(msg.encode())
                    self.wfile.flush()
                except queue.Empty:
                    try:
                        self.wfile.write(b': keepalive\n\n')
                        self.wfile.flush()
                    except Exception:
                        return
                except Exception:
                    return

        else:
            # Serve static files
            if path in ('/', ''):
                path = '/index.html'
            rel_path  = path.lstrip('/').replace('/', os.sep)
            file_path = os.path.join(BASE_DIR, rel_path)
            # Security: prevent path traversal
            if not os.path.abspath(file_path).startswith(os.path.abspath(BASE_DIR)):
                self.send_json(403, {'error': 'Forbidden'})
                return
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                ext  = os.path.splitext(file_path)[1].lower()
                mime = {
                    '.html': 'text/html',
                    '.css':  'text/css',
                    '.js':   'application/javascript',
                    '.json': 'application/json',
                    '.png':  'image/png',
                    '.ico':  'image/x-icon',
                }.get(ext, 'application/octet-stream')
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self.send_json(404, {'error': 'Not found'})


# ── Networking helpers ─────────────────────────────────────────────────────────
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def find_free_port(start):
    """Return the first free TCP port >= start."""
    port = start
    while port < start + 20:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                return port
        except OSError:
            port += 1
    return start  # fallback


def _try_tunnel(provider, cmd, pattern, timeout_s):
    """Run SSH tunnel command, return (url, proc) or (None, None)."""
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            line = proc.stdout.readline()
            if not line:
                break
            m = re.search(pattern, line)
            if m:
                return m.group(0), proc
        proc.kill()
        return None, None
    except FileNotFoundError:
        return None, None
    except Exception:
        return None, None


def start_tunnel(port):
    """Try localhost.run first (15s), then serveo.net (15s)."""
    print(f'  {dim("Trying localhost.run ...")}', flush=True)
    url, proc = _try_tunnel(
        'localhost.run',
        ['ssh', '-o', 'StrictHostKeyChecking=no',
         '-o', 'ServerAliveInterval=30',
         '-R', f'80:localhost:{port}', 'localhost.run'],
        r'https?://\S+\.localhost\.run',
        15
    )
    if url:
        return url, proc

    print(f'  {dim("localhost.run unavailable, trying serveo.net ...")}', flush=True)
    url, proc = _try_tunnel(
        'serveo.net',
        ['ssh', '-o', 'StrictHostKeyChecking=no',
         '-o', 'ServerAliveInterval=30',
         '-R', f'80:localhost:{port}', 'serveo.net'],
        r'https?://\S+\.serveo\.net',
        15
    )
    return url, proc


def print_banner(port, local_ip, public_url):
    W = 58
    bar  = '═' * W
    bar2 = '─' * W

    lines = [
        '',
        cyan('╔' + bar + '╗'),
        cyan('║') + bold('  EPAMINONDAS  —  Online Strategy Board Game'.center(W)) + cyan('║'),
        cyan('╠' + bar2.replace('─','═') + '╣'),
        cyan('║') + '  ' + green('●') + f'  Local:     {yellow(f"http://localhost:{port}")}   '.ljust(W - 2) + cyan('║'),
        cyan('║') + '  ' + green('●') + f'  LAN:       {yellow(f"http://{local_ip}:{port}")}   '.ljust(W - 2) + cyan('║'),
    ]

    if public_url:
        lines.append(
            cyan('║') + '  ' + green('●') + f'  Internet:  {yellow(public_url)}   '.ljust(W - 2) + cyan('║')
        )
    else:
        lines.append(
            cyan('║') + '  ' + dim('  Internet:  tunnel unavailable (SSH required)').ljust(W) + cyan('║')
        )

    lines += [
        cyan('╠' + bar2.replace('─','═') + '╣'),
        cyan('║') + cyan('  Share the Internet URL for cross-network play.'.ljust(W)) + cyan('║'),
        cyan('║') + cyan('  Press Ctrl+C to stop the server.'.ljust(W)) + cyan('║'),
        cyan('╚' + bar + '╝'),
        '',
    ]

    for line in lines:
        print(line)
    sys.stdout.flush()


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    port = find_free_port(BASE_PORT)
    if port != BASE_PORT:
        print(yellow(f'  Port {BASE_PORT} in use — using port {port} instead.'))

    try:
        server = http.server.ThreadingHTTPServer(('', port), GameHandler)
    except OSError as e:
        print(red(f'  Failed to bind port {port}: {e}'))
        sys.exit(1)

    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    local_ip = get_local_ip()

    print()
    print(cyan('  Starting Epaminondas server...'))
    print(cyan(f'  Attempting internet tunnel (this may take ~15s)...'))
    sys.stdout.flush()

    public_url, tunnel_proc = start_tunnel(port)

    print_banner(port, local_ip, public_url)

    # Open browser on localhost
    webbrowser.open(f'http://localhost:{port}')

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print()
        print(yellow('  Shutting down Epaminondas server...'))
        server.shutdown()
        if tunnel_proc:
            try:
                tunnel_proc.kill()
            except Exception:
                pass
        print(green('  Goodbye!'))
        print()


if __name__ == '__main__':
    main()
