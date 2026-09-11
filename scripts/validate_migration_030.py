#!/usr/bin/env python3
"""Validate migration 030 (phase 7) with pglast — parse every statement,
splitting on semons at top level only (skip ; inside $$ dollar-quoted bodies).
Mirrors the phase-6 validation approach."""
import re
import sys

from pglast import parse_sql
from pglast.parser import ParseError

PATH = "supabase/migrations/030_phase7_community.sql"


def split_statements(sql: str):
    """Split on top-level semicolons, respecting $$ ... $$ quoting."""
    stmts, buf, i, n = [], [], 0, len(sql)
    while i < n:
        ch = sql[i]
        if ch == "$" and sql[i : i + 2] == "$$":
            end = sql.find("$$", i + 2)
            if end == -1:
                raise ValueError("Unbalanced $$ quoting")
            buf.append(sql[i : end + 2])
            i = end + 2
            continue
        if ch == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            buf.append(sql[i : j + 1])
            i = j + 1
            continue
        if ch == ";":
            stmts.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    if buf:
        tail = "".join(buf).strip()
        if tail:
            stmts.append(tail)
    return stmts


def main():
    sql = open(PATH, encoding="utf-8").read()
    stmts = [s.strip() for s in split_statements(sql) if s.strip()]
    ok = 0
    failures = []
    for idx, stmt in enumerate(stmts, 1):
        # pglast needs the statement to be parseable standalone
        try:
            parse_sql(stmt)
            ok += 1
        except ParseError as e:
            failures.append((idx, str(e), stmt[:160]))
    print(f"statements: {len(stmts)} | parsed OK: {ok} | failures: {len(failures)}")
    for idx, err, preview in failures:
        print(f"  [FAIL #{idx}] {err}\n    preview: {preview!r}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
