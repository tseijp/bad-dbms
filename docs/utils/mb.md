src/backend/utils/mb/README

# Encodings

conv.c: code conversion のための static function と public table
mbutils.c: backend 専用の public function。
stringinfo_mb.c: backend 専用の multibyte 対応 stringinfo public function
wstrcmp.c: mb 用の strcmp
wstrncmp.c: mb 用の strncmp

src/common/ も参照:

encnames.c: encoding 名のための public function
wchar.c: 主に static function と、mb string および
multibyte 変換のための public table

## Introduction

    http://www.cprogramming.com/tutorial/unicode.html
