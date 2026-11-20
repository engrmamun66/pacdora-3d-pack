#!/usr/bin/env python3
"""Collect /dielines-detail/ links from a client-side paginated listing by clicking "next".

Usage:
    python3 collect_links.py --url https://www.pacdora.com/dielines --first 2 --last 36 [--delay 2.5]

Prints one JSON object on stdout; progress goes to stderr.
Only Python's standard library and a local Chrome are used (no packages to install).
The listing is paginated in the browser (no URL change), so the script starts at page 1,
clicks the "next" arrow one page at a time, and records the links of pages first..last.
It never opens a detail page and never runs more than one page change at a time.
"""
import argparse
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
from urllib.parse import urlparse

CHROME_CANDIDATES = [
    os.environ.get("CHROME_BIN", ""),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
]

STATE_JS = r"""(() => {
  const re = /^https:\/\/www\.pacdora\.com\/dielines-detail\/[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  const seen = new Set(), links = [];
  document.querySelectorAll('a[href*="/dielines-detail/"]').forEach(a => {
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
    const abs = 'https://www.pacdora.com' + u.pathname.replace(/\/$/, '');
    if (re.test(abs) && !seen.has(abs)) { seen.add(abs); links.push(abs); }
  });
  const act = document.querySelector('.pagination-item.active');
  const nums = [...document.querySelectorAll('.pagination-item.center-item')]
    .map(e => parseInt(e.textContent, 10)).filter(n => n > 0);
  return JSON.stringify({ links, active: act ? parseInt(act.textContent, 10) : null,
                          last: nums.length ? Math.max(...nums) : null, url: location.href });
})()"""

CLICK_NEXT_JS = r"""(() => {
  const b = document.querySelector('.pagination-item.arrow:not(.flip):not(.disabled)');
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  b.click();
  return true;
})()"""


def log(*a):
    print(*a, file=sys.stderr, flush=True)


class WS:
    """Tiny WebSocket client (enough for the Chrome DevTools protocol)."""

    def __init__(self, url):
        u = urlparse(url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("websocket handshake failed")
            buf += chunk
        if b" 101 " not in buf.split(b"\r\n", 1)[0]:
            raise RuntimeError("websocket handshake refused")
        self.rest = buf.split(b"\r\n\r\n", 1)[1]

    def _read(self, n):
        while len(self.rest) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("websocket closed")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def send(self, text):
        data = text.encode()
        n = len(data)
        head = bytearray([0x81])
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126)
            head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127)
            head += struct.pack(">Q", n)
        mask = os.urandom(4)
        head += mask
        self.sock.sendall(bytes(head) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        message = b""
        while True:
            b0, b1 = self._read(2)
            fin, opcode, n = b0 & 0x80, b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            if opcode == 8:
                raise RuntimeError("browser closed the connection")
            if opcode in (1, 0):
                message += payload
                if fin:
                    return message.decode()


class CDP:
    def __init__(self, ws_url):
        self.ws, self.n = WS(ws_url), 0

    def call(self, method, params=None):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def eval(self, js):
        r = self.call("Runtime.evaluate", {"expression": js, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            raise RuntimeError("page script error")
        return r["result"].get("value")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def state(cdp):
    return json.loads(cdp.eval(STATE_JS))


def wait_for(cdp, ok, timeout, what):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        try:
            last = state(cdp)
            if ok(last):
                return last
        except Exception:
            pass
        time.sleep(0.5)
    raise TimeoutError(f"timed out waiting for {what} (last state: {last and {k: v for k, v in last.items() if k != 'links'}})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://www.pacdora.com/dielines")
    ap.add_argument("--first", type=int, default=1)
    ap.add_argument("--last", type=int, default=1)
    ap.add_argument("--delay", type=float, default=2.5, help="seconds to wait after each page change (min 2)")
    ap.add_argument("--chrome", default="")
    a = ap.parse_args()

    host = urlparse(a.url)
    if host.scheme != "https" or host.hostname != "www.pacdora.com" or host.query or host.fragment:
        sys.exit("url must be an https://www.pacdora.com/... page without a query string")
    if a.first < 1 or a.last < a.first or a.last > 60:
        sys.exit("pages must satisfy 1 <= first <= last <= 60")
    delay = max(a.delay, 2.0)

    chrome = next((c for c in [a.chrome] + CHROME_CANDIDATES if c and os.path.exists(c)), None)
    if not chrome:
        sys.exit("Chrome not found: pass --chrome or set CHROME_BIN")

    profile = tempfile.mkdtemp(prefix="dieline-links-")
    port = free_port()
    proc = subprocess.Popen(
        [chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
         f"--remote-debugging-port={port}", f"--user-data-dir={profile}", "--window-size=1400,1200", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    result = {"source": a.url, "requested": [a.first, a.last], "site_last_page": None, "pages": {}, "errors": []}
    try:
        targets = None
        for _ in range(40):
            try:
                targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=2))
                if any(t.get("type") == "page" for t in targets):
                    break
            except Exception:
                pass
            time.sleep(0.5)
        page = next(t for t in (targets or []) if t.get("type") == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Page.navigate", {"url": a.url})
        st = wait_for(cdp, lambda s: s["links"] and s["active"] == 1 and s["last"], 60, "the first page")
        result["site_last_page"] = st["last"]
        last = min(a.last, st["last"])
        cur = 1
        if a.first <= 1 <= last:
            result["pages"]["1"] = st["links"]
        log(f"page 1: {len(st['links'])} links; site has {st['last']} pages")
        while cur < last:
            before = st["links"]
            if not cdp.eval(CLICK_NEXT_JS):
                result["errors"].append(f"no 'next' button after page {cur}")
                break
            want = cur + 1
            try:
                st = wait_for(cdp, lambda s: s["active"] == want and s["links"] and s["links"] != before, 30, f"page {want}")
            except TimeoutError as e:
                result["errors"].append(str(e))
                break
            cur = want
            if st["url"].split("#")[0] != a.url and "?" in st["url"]:
                result["errors"].append(f"address changed to a query URL on page {cur}: stopped")
                break
            if cur >= a.first:
                result["pages"][str(cur)] = st["links"]
            log(f"page {cur}: {len(st['links'])} links")
            time.sleep(delay)
    except Exception as e:  # report, never loop
        result["errors"].append(f"{type(e).__name__}: {e}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
