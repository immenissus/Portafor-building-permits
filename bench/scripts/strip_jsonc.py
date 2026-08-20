#!/usr/bin/env python3
"""Strip // line and /* */ block comments from a JSONC file, preserving strings.

Used to prepare the worktree's opencode.json for `graphify-ts opencode install`,
whose parser is strict JSON and cannot handle comments (opencode's own config
format is JSONC). Strings (including URLs containing '//') and escapes are
preserved verbatim.
"""
import argparse


def strip_jsonc(text):
    out = []
    i = 0
    n = len(text)
    in_str = False
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if c == '"':
                in_str = False
            i += 1
            continue
        if c == '"':
            in_str = True
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            i += 2
            while i < n and text[i] != "\n":
                i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i < n and not (text[i] == "*" and i + 1 < n and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as fh:
        text = fh.read()
    stripped = strip_jsonc(text)
    with open(args.dst, "w", encoding="utf-8") as fh:
        fh.write(stripped)


if __name__ == "__main__":
    main()