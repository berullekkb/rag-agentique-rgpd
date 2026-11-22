"""
Captures d'écran du site (docs/images/site_*.png) pour le README.

    pip install playwright && python -m playwright install chromium
    python scripts/capture_site.py
"""
import http.server
import os
import socketserver
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = Path(os.environ.get("SITE_DIR", ROOT / "docs"))
IMG = Path(os.environ.get("SHOTS_DIR", DOCS / "images"))
PORT = 8765

SHOTS = [
    # (fichier, sélecteur de section, action éventuelle)
    ("site_accueil.png", ".hero", None),
    ("site_agents.png", "#agents", "replay"),
    ("site_comparateur.png", "#comparateur", None),
    ("site_carte.png", "#carte", None),
    ("site_benchmark.png", "#benchmark", None),
]


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(DOCS))
    handler.log_message = lambda *a, **k: None
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    only = set(sys.argv[1:])
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
            page.goto(f"http://127.0.0.1:{PORT}/index.html")
            page.wait_for_selector("#benchTable tr")
            page.add_style_tag(content=".topnav{position:static}")
            for name, sel, action in SHOTS:
                if only and name not in only:
                    continue
                if action == "replay":
                    page.click("#replayBtn")
                    page.wait_for_timeout(1100 * 5 + 300)
                el = page.locator(sel)
                el.scroll_into_view_if_needed()
                page.wait_for_timeout(300)
                el.screenshot(path=str(IMG / name))
                print("✓", name)
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
