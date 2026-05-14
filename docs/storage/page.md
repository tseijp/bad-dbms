src/backend/storage/page/README

## Checksum

data page の checksum は、I/O system による破損を検出するように設計されています。
私たちは buffer を修正不能な memory error から保護していません。なぜなら、これらは
大規模 server farm に関する研究によると、測定された発生率が非常に低いからです。
http://www.cs.toronto.edu/~bianca/papers/sigmetrics09.pdf を参照し、
2010/12/22 に -hackers list で議論されました。

現在の実装では、initdb 時に system 全体で有効化するか、offline cluster で
pg_checksums tool を使用してこれを有効化する必要があります。Checksum は
pg_enable_data_checksums() を使用して runtime でも有効化でき、
pg_disable_data_checksums() を使用して無効化できます。

data page において checksum は常に valid というわけではありません!!
page が shared pool から出るときに checksum が valid になり、I/O の結果として後に
shared pool に再入する際に check されます。
shared pool 内の buffer の checksum は、buffer を flush する直前に設定します。
その結果、data 変更や hint のために page を変更すると、page の checksum が
暗黙的に invalidate されます。これは、shared buffer 内の多くまたはほとんどの page が
invalid な page checksum を持っていることを意味するため、pd_checksum field の
解釈には注意してください。

これは、page への WAL-logged 変更が page checksum を update しないことを意味するため、
full page image には valid な checksum がない可能性があります。しかし、それらの page image は
WAL CRC で cover されているため、この mechanism とは別に検証されます。WAL replay は
full-page image の checksum を test すべきではありません。

これを理解する最良の方法は、WAL CRC は WAL stream に入る record を保護し、
data page verification は shared buffer pool に入る block を保護する、ということです。
これらは目的が類似していますが、完全に別個のものです。これらを合わせて、
PostgreSQL が制御する memory に再入する data の error を検出できることを保証します。
また、WAL checksum は 32-bit CRC ですが、page checksum は 16-bit のみで
あることにも注意してください。

data block の write が失敗した場合、torn page を引き起こす可能性があります。
WAL に格納される full page write がそれから私たちを保護します。page が既に dirty な
ときに hint bit を設定するのは OK です。なぜなら最後の checkpoint 以来、
その full page write が既に書き込まれているはずだからです。それ以外は clean な
page に hint bit を設定すると torn page を許容する可能性があります; これらは
単なる hint なので通常は問題になりませんが、page が checksum を持っている場合、
数 bit の損失で checksum が invalid になります。したがって full_page_writes = on
かつ checksum が有効な場合、WAL に full page image を記録するために
WAL record を特別に write する必要があります。Hint bit の update は
MarkBufferDirtyHint() を使用して保護されるべきです。これは必要に応じて full-page
image を write する責任があります。

page checksum を write するときには、標準 page の中央にある hole を形成する
ゼロであることが望ましい byte も含めることに注意してください。したがって、storage から
block を読み戻すとき、hole がまだ全部ゼロであるかを暗黙的に check します。
これにより、data を破壊する可能性のあった error (たとえ実際にそうしていなくても) を
発見できることを保証するためにこれを行います。WAL に格納された full page image は
hole がすべてゼロかを check_しません_; hole の data は単純に skip され、
backup block が再適用される際に再ゼロ化されます。WAL の失敗は致命的な error で
さらなる recovery を妨げるため、これを行います。一方、通常の data block での checksum 失敗は
hard error ですが、user にとって非常に悪いことであっても、server にとっては
critical なものではありません。

recovery 中に新しい WAL record を write することはできないので、checksum が有効な場合、
recovery 中に設定された hint bit は、buffer が既に dirty でない限り page を
dirty にしてはいけません。Hot-Standby mode の system は hint bit が
設定されていることから恩恵を受ける可能性がありますが、checksum が有効な場合、
hint bit 設定後に page を dirty にすることはできません (torn page の risk のため)。
そのため、hint bit の update を含む full-page image が primary から到着するのを
待たなければなりません。
