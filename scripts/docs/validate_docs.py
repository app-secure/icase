"""Comprueba contrato OpenAPI, cobertura de routers, enlaces y estructura APE."""
from pathlib import Path
import argparse
from html.parser import HTMLParser
import re
import sys
from urllib.parse import unquote
import yaml

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
ROUTERS = {
    "authRoutes.js": "/auth",
    "proyectoRoutes.js": "/proyectos",
    "codificacionRoutes.js": "/proyectos",
    "requerimientoRoutes.js": "/requerimientos",
    "diagramaRoutes.js": "/diagramas",
    "fuenteRoutes.js": "",
    "mockupRoutes.js": "/mockups",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", action="store_true", help="Comprueba enlaces HTML tras mkdocs build.")
    args = parser.parse_args()
    errors = []
    spec = yaml.safe_load((DOCS / "api/openapi.yaml").read_text(encoding="utf-8"))
    try:
        from openapi_spec_validator import validate
        validate(spec)
    except ImportError:
        errors.append("Falta openapi-spec-validator: instala requirements-docs.txt.")
    except Exception as exc:
        errors.append("OpenAPI inválido: " + str(exc))
    documented = {
        (method.upper(), path)
        for path, item in spec.get("paths", {}).items()
        for method in item if method in {"get", "post", "put", "patch", "delete"}
    }
    actual = {("GET", "/health")}
    routes_root = ROOT / "icase-backend/src/routes"
    for filename, prefix in ROUTERS.items():
        source = (routes_root / filename).read_text(encoding="utf-8")
        for method, route in re.findall(r"router\.(get|post|put|patch|delete)\(['\"]([^'\"]+)['\"]", source):
            route = re.sub(r":(\w+)", r"{\1}", route)
            actual.add((method.upper(), (prefix + route).rstrip("/") or "/"))
    for method, path in sorted(actual - documented):
        errors.append(f"Ruta sin documentar: {method} {path}")
    for method, path in sorted(documented - actual):
        errors.append(f"Ruta documentada que no está registrada: {method} {path}")
    # Referencias locales Markdown: se omiten bloques de código y enlaces externos.
    for source in DOCS.rglob("*.md"):
        content = source.read_text(encoding="utf-8")
        content = re.sub(r"(?ms)^(`{3,}|~{3,})[^\n]*\n.*?^\1\s*$", "", content)
        for raw in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", content):
            target = raw.split()[0].strip("<>")
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            target = unquote(target.split("#")[0])
            if target and not (source.parent / target).resolve().exists():
                errors.append(f"Enlace roto: {source.relative_to(ROOT)} -> {target}")
    required = ["index.md", "usuario/primeros-pasos.md", "usuario/requisitos-y-diagramas.md",
                "usuario/mockups-y-exportacion.md", "usuario/codificacion.md", "usuario/caso-de-estudio.md",
                "api/guia.md", "api/openapi.yaml", "ia/funcionamiento.md", "ia/prompts.md",
                "desarrollo/instalacion.md", "desarrollo/arquitectura.md",
                "pruebas/plan-y-ejecucion.md", "pruebas/resultados.md", "despliegue/guia.md"]
    for name in required:
        if not (DOCS / name).is_file():
            errors.append("Falta página requerida: " + name)
    for name in ["README.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "mkdocs.yml"]:
        if not (ROOT / name).is_file():
            errors.append("Falta archivo principal: " + name)
    if args.site:
        class Links(HTMLParser):
            def __init__(self):
                super().__init__()
                self.targets = []

            def handle_starttag(self, tag, attrs):
                for key, value in attrs:
                    if key in {"href", "src"} and value:
                        self.targets.append(value)

        site = ROOT / "site"
        if not (site / "index.html").exists():
            errors.append("Construye el sitio antes de usar --site.")
        for page in site.rglob("*.html"):
            links = Links()
            links.feed(page.read_text(encoding="utf-8"))
            for value in links.targets:
                if value.startswith(("#", "//", "/")) or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", value):
                    continue
                value = unquote(value.split("#")[0].split("?")[0])
                target = (page.parent / value).resolve()
                if not target.exists():
                    errors.append(f"Enlace HTML roto: {page.relative_to(ROOT)} -> {value}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"Documentación válida: {len(actual)} operaciones HTTP cubiertas, OpenAPI y enlaces locales correctos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
