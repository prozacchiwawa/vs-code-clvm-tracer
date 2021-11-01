# A VS code examining chialisp code traces from clvm_tools_rs' cldb

[https://prozacchiwawa.github.io/clvm_tools_rs/](clvm_tools_rs) contains user oriented tools
for working with chialisp code.

In this case, executing the "View CLVM Trace' command in a text buffer containing trace output
from clvm_tools_rs' cldb will show a web view that associates each entry with its location
in the source file it was read from, allowing easier inspection of traces.  Arguments to each
operation are given in the trace as well so tracking down errors or unexpected outputs should
be a bit easier.
