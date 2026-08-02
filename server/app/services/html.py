import re
from html.parser import HTMLParser

import nh3

BREAKS = {"br", "p", "div", "tr", "li", "h1", "h2", "h3", "h4", "blockquote"}
IGNORED = {"script", "style"}

ALLOWED_TAGS = {
    "p",
    "br",
    "hr",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
}

ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
}

ALLOWED_SCHEMES = {"http", "https", "mailto"}

TITLE_LIMIT = 200


def clean(html: str) -> str:
    return nh3.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_SCHEMES,
        link_rel="noopener noreferrer nofollow",
    )


def plain(text: str) -> str:
    return nh3.clean(text, tags=set(), attributes={}).strip()[:TITLE_LIMIT]


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
