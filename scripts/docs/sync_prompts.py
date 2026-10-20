"""Sincroniza referencias documentales desde las plantillas reales (sin IA)."""
from pathlib import Path
import argparse
import hashlib
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "icase-backend/src/infrastructure/prompts"
TARGET = ROOT / "docs/ia/plantillas"
INDEX = ROOT / "docs/ia/prompts.md"


def outputs():
    links = []
    result = {}
    for source in sorted(SOURCE.glob("*.md")):
        content = source.read_text(encoding="utf-8").replace("\r\n", "\n")
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        name = source.stem.replace("_", "-") + ".md"
        result[TARGET / name] = (
            f"# Referencia: {source.stem}\n\n"
            f"Fuente: `{source.relative_to(ROOT).as_posix()}`.\n\n"
            f"SHA-256 del contenido normalizado: `{digest}`.\n\n"
            "Copia generada. Edita la fuente y ejecuta el sincronizador.\n\n"
            f"## Plantilla completa\n\n~~~~text\n{content.rstrip()}\n~~~~\n"
        )
        links.append(f"- [{source.stem}](plantillas/{name})")
    original = INDEX.read_text(encoding="utf-8")
    block = "<!-- PROMPT_INDEX -->\n\n" + "\n".join(links) + "\n\n<!-- /PROMPT_INDEX -->"
    if "<!-- /PROMPT_INDEX -->" in original:
        updated = re.sub(r"<!-- PROMPT_INDEX -->.*?<!-- /PROMPT_INDEX -->", lambda _: block, original, flags=re.S)
    else:
        updated = original.replace("<!-- PROMPT_INDEX -->", block)
    result[INDEX] = updated
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    changed = []
    for target, content in outputs().items():
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            changed.append(target.relative_to(ROOT).as_posix())
            if not args.check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
    if args.check and changed:
        print("Referencias desactualizadas: " + ", ".join(changed))
        return 1
    print(f"Referencias de prompts: {'correctas' if args.check else 'sincronizadas'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
