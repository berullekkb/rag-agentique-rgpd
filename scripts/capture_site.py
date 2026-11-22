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

SHOTS = [
    # (fichier, sélecteur de section, action éventuelle)
    ("site_accueil.png", "#top", None),
    ("site_agents.png", "#agents", "replay"),
    ("site_exemple.png", "#exemple", None),
    ("site_comparateur.png", "#comparateur", None),
    ("site_carte.png", "#carte", None),
    ("site_benchmark.png", "#resultats", None),
]


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(DOCS))
    handler.log_message = lambda *a, **k: None
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)    # port libre choisi par le système
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    only = set(sys.argv[1:])
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
            page.goto(f"http://127.0.0.1:{port}/index.html")
            page.wait_for_selector("#benchTable tr")
            page.wait_for_timeout(800)   # polices web
            for name, sel, action in SHOTS:
                if only and name not in only:
                    continue
                if action == "replay":
                    page.click("#replayBtn")
                    page.wait_for_timeout(1100 * 12 + 300)   # fin du rejeu
                el = page.locator(sel)
                el.scroll_into_view_if_needed()
                page.wait_for_timeout(300)
                box = el.bounding_box()
                # la section est étroite mais ses figures débordent : on prend toute la largeur utile
                page.screenshot(path=str(IMG / name), full_page=True,
                                clip={"x": 120, "y": box["y"] + page.evaluate("window.scrollY") + 8,
                                      "width": 1040, "height": box["height"] + 16})
                print("✓", name)
            browser.close()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
