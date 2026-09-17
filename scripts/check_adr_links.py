#!/usr/bin/env python3
"""Resolve every relative markdown link and #anchor under the given paths
against real files and real headings. Exits 1 if any link is broken."""
import re
import sys
from pathlib import Path

LINK_RE = re.compile(r'\[[^\]]*\]\(([^)\s]+)\)')
HEADING_RE = re.compile(r'^(#{1,6})\s+(.*)$', re.MULTILINE)


def slugify(heading: str) -> str:
    # GitHub-style heading slug: lowercase, strip non-word/space/hyphen,
    # spaces -> hyphens.
    s = heading.strip().lower()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'\s+', '-', s)
    return s


def headings_for(path: Path) -> set[str]:
    text = path.read_text(encoding='utf-8')
    slugs = []
    seen = {}
    for _, heading in HEADING_RE.findall(text):
        base = slugify(heading)
        n = seen.get(base, 0)
        seen[base] = n + 1
        slugs.append(base if n == 0 else f'{base}-{n}')
    return set(slugs)


def iter_markdown_files(paths: list[str]) -> list[Path]:
    files = []
    for p in paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.rglob('*.md')))
        elif path.is_file():
            files.append(path)
    return files


def check(paths: list[str]) -> list[str]:
    errors = []
    files = iter_markdown_files(paths)
    for md_file in files:
        text = md_file.read_text(encoding='utf-8')
        for target in LINK_RE.findall(text):
            if target.startswith(('http://', 'https://', 'mailto:')):
                continue
            file_part, _, anchor = target.partition('#')
            if file_part == '':
                # Same-file anchor.
                resolved = md_file
            else:
                resolved = (md_file.parent / file_part).resolve()
            if not resolved.exists():
                errors.append(f'{md_file}: {target} (file not found: {resolved})')
                continue
            if anchor:
                slugs = headings_for(resolved)
                if anchor not in slugs:
                    errors.append(
                        f'{md_file}: {target} (anchor #{anchor} not found in {resolved})'
                    )
    return errors


def main() -> int:
    paths = sys.argv[1:] or ['docs/adr', 'docs/spec', 'gubbins-spec.md']
    errors = check(paths)
    for e in errors:
        print(e)
    if errors:
        print(f'{len(errors)} broken link(s)')
        return 1
    print('All links resolve.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
