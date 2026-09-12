#!/usr/bin/env python3
"""Terminal ADR renumbering: walk docs/adr/NNNN-*.md in numeric order,
renumber to 0001..N with no gaps, and rewrite every cross-reference form
in docs/adr/, docs/spec/, and gubbins-spec.md."""
import re
import subprocess
import sys
from pathlib import Path

ADR_DIR = Path('docs/adr')
FILENAME_RE = re.compile(r'^(\d{4})-(.+)\.md$')


def build_mapping() -> dict[int, tuple[int, str]]:
    """old_number -> (new_number, slug)"""
    entries = []
    for f in sorted(ADR_DIR.glob('*.md')):
        m = FILENAME_RE.match(f.name)
        if not m:
            continue  # skips 0000-adr-template.md and README.md
        old_num, slug = int(m.group(1)), m.group(2)
        if old_num == 0:
            continue  # 0000-adr-template.md is not a real ADR; never renumbered
        entries.append((old_num, slug))
    entries.sort(key=lambda e: e[0])
    mapping = {}
    for new_num, (old_num, slug) in enumerate(entries, start=1):
        mapping[old_num] = (new_num, slug)
    return mapping


def rename_files(mapping: dict[int, tuple[int, str]], dry_run: bool) -> None:
    # Two-phase rename (via a temp suffix) so a shift never overwrites a
    # not-yet-renamed file when new numbers cross old ones.
    moves = []
    for old_num, (new_num, slug) in mapping.items():
        if old_num == new_num:
            continue
        old_path = ADR_DIR / f'{old_num:04d}-{slug}.md'
        new_path = ADR_DIR / f'{new_num:04d}-{slug}.md'
        moves.append((old_path, new_path))
    for old_path, _ in moves:
        tmp = old_path.with_suffix('.md.tmp-renumber')
        print(f'git mv {old_path} {tmp}')
        if not dry_run:
            subprocess.run(['git', 'mv', str(old_path), str(tmp)], check=True)
    for old_path, new_path in moves:
        tmp = old_path.with_suffix('.md.tmp-renumber')
        print(f'git mv {tmp} {new_path}')
        if not dry_run:
            subprocess.run(['git', 'mv', str(tmp), str(new_path)], check=True)


LINK_RE = re.compile(
    r'(ADR-)?\[(\d{3,4})\]\(((?:\.{1,2}/)?(?:adr/)?)(\d{4})-([a-z0-9-]+)\.md\)'
)
BARE_RE = re.compile(r'\bADR-(\d{1,4})\b(?!\]|\()')
H1_RE = re.compile(r'^# (\d{4})\. ')


def rewrite_text(text: str, mapping: dict[int, tuple[int, str]]) -> str:
    def link_sub(m: re.Match) -> str:
        prefix, _label, path_prefix, num_str, slug = m.groups()
        old_num = int(num_str)
        if old_num not in mapping:
            return m.group(0)  # points at a deleted ADR; leave as-is
        new_num, new_slug = mapping[old_num]
        new_label = f'{new_num:03d}'
        new_path_num = f'{new_num:04d}'
        return f'{prefix or ""}[{new_label}]({path_prefix}{new_path_num}-{new_slug}.md)'

    text = LINK_RE.sub(link_sub, text)

    def bare_sub(m: re.Match) -> str:
        digits = m.group(1)
        old_num = int(digits)
        if old_num not in mapping:
            return m.group(0)  # deleted ADR (e.g. the historical "ADR-022"
                                # / "ADR-038" mentions) - leave untouched
        new_num, _ = mapping[old_num]
        return f'ADR-{new_num:0{len(digits)}d}'

    text = BARE_RE.sub(bare_sub, text)
    return text


def rewrite_h1(text: str, old_num: int, mapping: dict[int, tuple[int, str]]) -> str:
    new_num, _ = mapping[old_num]
    return H1_RE.sub(f'# {new_num:04d}. ', text, count=1)


def main() -> int:
    dry_run = '--dry-run' in sys.argv
    mapping = build_mapping()
    changed = sum(1 for old, (new, _) in mapping.items() if old != new)
    print(f'{len(mapping)} surviving ADRs; {changed} need renumbering.')
    for old_num in sorted(mapping):
        new_num, slug = mapping[old_num]
        if old_num != new_num:
            print(f'  {old_num:04d} -> {new_num:04d}  ({slug})')

    # Rewrite each ADR's own H1 before renaming (path still has old number).
    for old_num, (new_num, slug) in mapping.items():
        if old_num == new_num:
            continue
        path = ADR_DIR / f'{old_num:04d}-{slug}.md'
        text = path.read_text(encoding='utf-8')
        text = rewrite_h1(text, old_num, mapping)
        if not dry_run:
            path.write_text(text, encoding='utf-8')

    rename_files(mapping, dry_run)

    targets = list(ADR_DIR.glob('*.md')) + list(Path('docs/spec').glob('*.md')) + [Path('gubbins-spec.md')]
    for path in targets:
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8')
        new_text = rewrite_text(text, mapping)
        if new_text != text:
            print(f'rewrite refs: {path}')
            if not dry_run:
                path.write_text(new_text, encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
