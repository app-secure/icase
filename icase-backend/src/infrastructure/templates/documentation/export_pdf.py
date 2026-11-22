"""Imprime el mismo HTML que se revisa en el navegador; no publica contenido."""
from pathlib import Path
import subprocess
import sys
import os
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    subprocess.run([sys.executable, "-m", "mkdocs", "build", "--strict"], cwd=ROOT, check=True)
    subprocess.run([sys.executable, str(ROOT / "tools" / "check_links.py")], cwd=ROOT, check=True)
    source = ROOT / "site" / "print_page.html"
    target = ROOT / "site" / "documentacion.pdf"
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT / 'site')))
    Thread(target=server.serve_forever, daemon=True).start()
    with sync_playwright() as playwright:
        channel = os.environ.get('DOCUMENTATION_BROWSER_CHANNEL')
        try:
            browser = playwright.chromium.launch(channel=channel or None)
        except Exception:
            if channel:
                raise
            browser = playwright.chromium.launch(channel='chrome')
        page = browser.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}/print_page.html', wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.evaluate("Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})))")
        page.evaluate("document.querySelectorAll('details').forEach(item => { item.open = true; })")
        page.pdf(path=str(target), format="A4", print_background=True, prefer_css_page_size=True,
                 display_header_footer=True, header_template="<span></span>",
                 footer_template='<div style="font-size:9px;text-align:center;width:100%">Documentación · <span class="pageNumber"></span> / <span class="totalPages"></span></div>')
        browser.close()
    server.shutdown()
    server.server_close()
    print(target)


if __name__ == "__main__":
    main()
