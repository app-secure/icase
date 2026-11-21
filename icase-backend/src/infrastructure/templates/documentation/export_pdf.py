"""Imprime el mismo HTML que se revisa en el navegador; no publica contenido."""
from pathlib import Path
import subprocess
import sys
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    subprocess.run([sys.executable, "-m", "mkdocs", "build", "--strict"], cwd=ROOT, check=True)
    source = ROOT / "site" / "manual-completo.html"
    target = ROOT / "site" / "documentacion.pdf"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=os.environ.get('DOCUMENTATION_BROWSER_CHANNEL') or None)
        page = browser.new_page()
        page.goto(source.as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.evaluate("document.querySelectorAll('details').forEach(item => { item.open = true; })")
        page.pdf(path=str(target), format="A4", print_background=True, prefer_css_page_size=True,
                 display_header_footer=True, header_template="<span></span>",
                 footer_template='<div style="font-size:9px;text-align:center;width:100%">Documentación · <span class="pageNumber"></span> / <span class="totalPages"></span></div>')
        browser.close()
    print(target)


if __name__ == "__main__":
    main()
