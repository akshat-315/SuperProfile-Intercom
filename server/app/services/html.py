import re
from html.parser import HTMLParser

BREAKS = {"br", "p", "div", "tr", "li", "h1", "h2", "h3", "h4", "blockquote"}
IGNORED = {"script", "style"}


class _Stripper(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skipping = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in IGNORED:
            self.skipping = True
        elif tag in BREAKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in IGNORED:
            self.skipping = False

    def handle_data(self, data: str) -> None:
        if not self.skipping:
            self.parts.append(data)


def to_text(html: str) -> str:
    stripper = _Stripper()
    stripper.feed(html)
    text = "".join(stripper.parts)
    return re.sub(r"\n{3,}", "\n\n", text).strip()
