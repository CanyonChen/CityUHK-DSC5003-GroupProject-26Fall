"""Publish CityUHK's public CAP event metadata. No login, form submission or third-party fetching."""

import argparse
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen


CAP = "https://cap.cityu.edu.hk/"
HKT = timezone(timedelta(hours=8))
DEFAULT_FILE = Path(__file__).resolve().parents[1] / "pages/data/campus-events.json"
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
BLOCK = set("p div li tr h1 h2 h3 h4 h5 h6".split())


def clean(text):
    return " ".join(text.split())


class Node:
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def nodes(self):
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.nodes()

    def text(self):
        return "".join(c.text() if isinstance(c, Node) else c for c in self.children)

    def with_class(self, name):
        return [n for n in self.nodes() if name in n.attrs.get("class", "").split()]


class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.root = Node("document")
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse_index(html):
    root = Tree(html).root
    table = next((n for n in root.nodes() if n.tag == "table" and n.attrs.get("id") == "pubAnn"), None)
    if table is None:
        raise ValueError("Public CAP table missing")
    found = {}
    for row in (n for n in table.nodes() if n.tag == "tr"):
        cells = [n for n in row.children if isinstance(n, Node) and n.tag == "td"]
        if not cells:
            continue
        if len(cells) < 2:
            raise ValueError("Unrecognised public CAP list row")
        link = next((n for n in cells[0].nodes() if n.tag == "a"), None)
        u = urlsplit(urljoin(CAP, link.attrs.get("href", "") if link else ""))
        ids = parse_qs(u.query).get("id", [])
        if (u.scheme != "https" or u.netloc.lower() != "cap.cityu.edu.hk"
                or u.path.lower() != "/postpublic.aspx" or len(ids) != 1
                or not re.fullmatch(r"[a-zA-Z0-9_-]+", ids[0])):
            raise ValueError("Unrecognised public CAP detail link")
        found[ids[0]] = clean(cells[1].text())
    if not found:
        raise ValueError("No confirmed public listings; keeping the previous snapshot")
    return found


def official_media_url(raw, base=CAP):
    """Return a normalized public HTTPS media link on a CityUHK host."""
    if not isinstance(raw, str) or not raw.strip() or raw.lstrip().startswith(("#", "?")):
        return None
    if "\\" in raw or any(ord(c) < 32 or ord(c) == 127 for c in raw):
        return None
    try:
        url = urlsplit(urljoin(base, raw.strip()))
        host = url.hostname or ""
        if (url.scheme != "https" or url.username is not None or url.password is not None
                or url.port not in (None, 443) or not re.fullmatch(r"(?:[a-z0-9-]+\.)*cityu\.edu\.hk", host)):
            return None
    except ValueError:
        return None
    # urllib does not encode literal spaces, which occur in the HKICE poster filename.
    path = quote(url.path, safe="/%:!$&'()*+,;=@~-._")
    query = quote(url.query, safe="/%?:!$&'()*+,;=@~-._")
    return urlunsplit(("https", host, path, query, ""))


POSTER_LABEL = re.compile(r"(?<![a-z])(?:posters?|flyers?|fliers?)(?![a-z])|海[報报]|宣[傳传][單单]", re.I)
NON_POSTER = re.compile(r"(?<![a-z])(?:logos?|qr(?:[ _-]?codes?)?|icons?|avatars?|headshots?|spacers?|"
                        r"portraits?|signatures?|speaker[ _-]?photos?|social[ _-]?media|tracking[ _-]?pixels?)(?![a-z])"
                        r"|二[維维][碼码]|徽[標标]", re.I)
POSTER_FILE = re.compile(r"\.(?:jpe?g|png|webp|gif|avif|pdf)$", re.I)


def event_poster(root, body, title, source):
    """Consider only publication content and labelled attachment areas, never the site chrome."""
    attachment_areas = []
    for node in root.nodes():
        marker = (node.attrs.get("id") or "") + " " + (node.attrs.get("class") or "")
        if "attach" in marker.lower():
            attachment_areas.append(node)
        elif "cap-body-lower-text" in marker.split():
            labels = node.with_class("cap-body-lower-title")
            if labels and re.search(r"attachment|附件", labels[0].text(), re.I):
                attachment_areas.append(node)
    event_words = re.sub(r"[\W_]+", "", title).casefold()
    best, best_score = None, -1
    for area in [body, *attachment_areas]:
        elements = [area, *area.nodes()]
        # The editor may publish “Event poster: [Download]” with only Download inside the link.
        captions = {}
        for block in elements:
            if block.tag in ("p", "li", "td"):
                anchors = [link for link in block.nodes() if link.tag == "a"]
                line = clean(block.text())
                if len(anchors) == 1 and len(line) <= 100 and POSTER_LABEL.search(line):
                    captions[anchors[0]] = line
        for item in elements:
            if item.tag not in ("img", "a"):
                continue
            image = item.tag == "img"
            url = official_media_url(item.attrs.get("src" if image else "href"), source)
            if not url:
                continue
            path = unquote(urlsplit(url).path)
            labels = [item.attrs.get(k) or "" for k in ("alt", "title", "aria-label")]
            if not image:
                labels.append(captions.get(item) or clean(item.text()))
                if not POSTER_FILE.search(path) and not re.search(r"attach|download|getpubatt", path, re.I):
                    continue
            label = " ".join(labels)
            if NON_POSTER.search(path + " " + label):
                continue
            if image:
                # Exclude known small decorations even when the CMS supplies a notice title as the alt.
                style = item.attrs.get("style") or ""
                sizes = [item.attrs.get(k) or "" for k in ("height", "width")]
                sizes.extend(re.findall(r"(?:height|width)\s*:\s*(\d+(?:\.\d+)?px)", style, re.I))
                if any(float(v.removesuffix('px')) < 96 for v in sizes if re.fullmatch(r"\d+(?:\.\d+)?(?:px)?", v)):
                    continue
            title_match = bool(event_words) and any(re.sub(r"[\W_]+", "", v).casefold() == event_words for v in labels)
            labelled = bool(POSTER_LABEL.search(label))
            named = bool(POSTER_LABEL.search(path))
            if not (labelled or named or (image and title_match)):
                continue
            score = 4 * labelled + 2 * named + title_match + image
            if score > best_score:
                best, best_score = url, score
    return {"sourceUrl": best} if best else None


def body_lines(root):
    """Keep paragraph/line boundaries and nearby hrefs; preserve adjacent inline text."""
    lines, parts, links = [], [], []

    def finish():
        text = clean("".join(parts))
        if text or links:
            lines.append((text, list(links)))
        parts.clear()
        links.clear()

    def walk(node):
        if isinstance(node, str):
            parts.append(node)
            return
        if node.tag in ("style", "script"):
            return
        if node.tag in BLOCK or node.tag == "br":
            finish()
        if node.tag == "a":
            links.append((clean(node.text()), node.attrs.get("href", "")))
        for child in node.children:
            walk(child)
        if node.tag in BLOCK:
            finish()

    walk(root)
    finish()
    return lines


def role(text):
    text = text.casefold().strip(" :.-")
    if re.search(r"\b(no|not required|closed|not available|template|deadline|details|instructions)\b", text):
        return None
    if re.match(r"^(?:abstract submission|submit (?:an? |your )?abstract)\b", text):
        return "submission"
    if re.match(r"^(?:registration|register|r\.?s\.?v\.?p\.?)\b", text) or "please register" in text:
        return "registration"
    return None


def action_links(lines, source):
    actions, last_label = [], None
    for text, links in lines:
        plain = re.sub(r"https?://\S+", "", text).strip()
        kind = role(plain)
        candidates = list(links)
        # CAP authors sometimes type the URL on the next line without creating an anchor.
        if not candidates:
            candidates.extend(("", u.rstrip(".,);")) for u in re.findall(r"https?://[^\s<>]+", text))
        for label, raw in candidates:
            action = role(label) or kind or (last_label if not plain else None)
            url = urljoin(source, raw)
            u = urlsplit(url)
            if (not raw or not action or u.scheme != "https" or not u.hostname or u.username or u.password
                    or u.path.lower().endswith((".ics", ".pdf", ".doc", ".docx"))
                    or url == source):
                continue
            item = {"kind": action, "url": url}
            if item not in actions:
                actions.append(item)
        last_label = kind if not candidates else None
    return actions


MONTH = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE = rf"\b(\d{{1,2}})(?:\s*[-–]\s*(\d{{1,2}}))?\s+({MONTH})\.?\s*,?\s*(\d{{4}})\b"
CLOCK = r"(?<!\d)([0-2]?\d):([0-5]\d)\s*(am|pm)?\b"


def days(text):
    match = re.search(DATE, text, re.I)
    if not match:
        return None
    first, last, month, year = match.groups()
    month_no = datetime.strptime(month[:3].title(), "%b").month
    return [datetime(int(year), month_no, int(day)).date().isoformat() for day in (first, last or first)]


def clocks(text):
    times = []
    for hour, minute, period in re.findall(CLOCK, text, re.I):
        hour = int(hour)
        if period:
            hour = hour % 12 + (12 if period.lower() == "pm" else 0)
        if hour < 24:
            times.append(f"{hour:02d}:{minute}:00+08:00")
    return times


def meta_instant(value):
    """CAP uses paired midnight timestamps for date-only items, e.g. image-only notices."""
    dt = datetime.strptime(value, "%Y-%m-%d %H:%M").replace(tzinfo=HKT)
    return dt.isoformat()


def session(start, end, venue, label=None):
    return {"label": label, "start": start, "end": end, "precision": "minute" if "T" in start else "day", "venue": venue}


def event_schedule(title, lines, metadata):
    texts = [text for text, _ in lines if text]
    start = meta_instant(metadata["start date"])
    end = meta_instant(metadata["end date"])
    venue = metadata.get("venue") or None
    if venue and venue.lower() in {"not applicable", "n/a", "tbc", "-"}:
        venue = None
    if not venue:
        venue = next((s.split(":", 1)[1].strip() for s in texts if re.match(r"^venue\s*:\s*\S", s, re.I)), None)
    deadlines = []
    for line in texts:
        if re.search(r"\b(?:submission|abstract)\s+deadline", line, re.I):
            kind = "submission"
        elif re.search(r"(?:registration\s+deadline|(?:register|r\.?s\.?v\.?p\.?)\s+by)", line, re.I):
            kind = "registration"
        else:
            continue
        span = days(line)
        if not span:
            continue
        date = span[0]
        time = clocks(line)
        if time:
            date += "T" + time[0]
        elif date == start[:10] and start == end and "T00:00" not in start:
            date = start
        deadlines.append({"kind": kind, "at": date, "precision": "minute" if "T" in date else "day"})

    if re.search(r"\bcall for (?:papers|abstracts|submissions)\b", title, re.I):
        conference = next((days(s) for s in texts if re.match(r"^conference\s*:", s, re.I) and days(s)), None)
        return venue, ([session(*conference, venue, label="Conference")] if conference else []), deadlines

    # Collect separate explicitly labelled dates, times and venues in multi-session notices.
    marks = [i for i, s in enumerate(texts) if re.match(r"^date\s*:", s, re.I) and days(s)]
    if len(marks) > 1:
        sessions = []
        for index, pos in enumerate(marks):
            day = days(texts[pos])[0]
            block = texts[pos + 1:marks[index + 1] if index + 1 < len(marks) else len(texts)]
            times = next((clocks(s) for s in block if re.match(r"^time\s*:", s, re.I)), [])
            place = next((s.split(":", 1)[1].strip() for s in block if re.match(r"^venue\s*:", s, re.I)), None)
            label = next((s for s in reversed(texts[max(0, pos - 2):pos]) if re.fullmatch(
                r"(?:guest lecture|concert|lecture|seminar|workshop|screening|performance)", s, re.I)), None)
            begins = day + "T" + times[0] if times else day
            ends = day + "T" + times[1] if len(times) > 1 else None
            if ends is None and index == len(marks) - 1 and end[:10] == day and "T00:00" not in end:
                ends = end
            sessions.append(session(begins, ends, place, label))
        return venue, sessions, deadlines

    if "T00:00" in start and "T00:00" in end:
        return venue, [session(start[:10], end[:10] if start != end else None, venue)], deadlines
    return venue, [session(start, end if end != start else None, venue)], deadlines


def parse_event(event_id, department, html):
    root = Tree(html).root
    def required(name):
        items = root.with_class(name)
        if len(items) != 1:
            raise ValueError(f"{event_id}: missing or ambiguous {name}")
        return items[0]
    title = clean(required("cap-header-title").text())
    posted = clean(required("cap-header-time").text()).strip("() ").removeprefix("POSTED:").strip()
    posted_at = datetime.strptime(posted, "%Y-%m-%d %I:%M %p").replace(tzinfo=HKT).isoformat()
    body = required("cap-body-upper")
    lines = body_lines(body)
    metadata = {}
    for field in root.with_class("cap-body-lower-text"):
        label = field.with_class("cap-body-lower-title")
        value = field.with_class("cap-body-lower-content")
        if label and value:
            metadata[clean(label[0].text()).lower().rstrip(":")] = clean(value[0].text())
    if not title or not department or not {"start date", "end date", "category"}.issubset(metadata):
        raise ValueError(f"{event_id}: incomplete official event metadata")
    venue, sessions, deadlines = event_schedule(title, lines, metadata)
    url = CAP + "postPublic.aspx?id=" + event_id
    event = {"id":event_id, "sourceUrl":url, "title":title, "department":department, "category":metadata["category"],
            "postedAt":posted_at, "venue":venue, "status":"cancelled" if re.match(r"^\s*[(\[]?cancel(?:l?ed|lation)\b", title, re.I) else "announced",
            "sessions":sessions, "deadlines":deadlines, "actions":action_links(lines, url)}
    poster = event_poster(root, body, title, url)
    if poster:
        event["poster"] = poster
    return event


def fetch(url):
    request = Request(url, headers={"User-Agent":"CityUHK-Events-Hub/1.0 (+https://github.com/CanyonChen/CityUHK-DSC5003-GroupProject-26Fall)"})
    with urlopen(request, timeout=15) as result:
        if urlsplit(result.geturl()).netloc.lower() != "cap.cityu.edu.hk":
            raise ValueError("CAP redirected to a different service")
        raw = result.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("Unexpectedly large CAP response")
        return raw.decode(result.headers.get_content_charset() or "utf-8-sig")


def sync(previous, output, get=fetch):
    ids = parse_index(get(CAP))
    events = [parse_event(i, dept, get(CAP+"postPublic.aspx?id="+i)) for i, dept in ids.items()]
    prior = json.loads(previous.read_text(encoding="utf-8")) if previous.exists() else {}
    status = "unchanged" if prior.get("events") == events else "updated"
    feed = {"sourceUrl":CAP, "checkedAt":datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "timeZone":"Asia/Hong_Kong", "events":events}
    output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as tmp:
        json.dump(feed, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
    os.replace(tmp.name, output)
    return {"status":status,"count":len(events),"checkedAt":feed["checkedAt"]}


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--previous", type=Path, default=DEFAULT_FILE)
    cli.add_argument("--output", type=Path, default=DEFAULT_FILE)
    args = cli.parse_args()
    try:
        print(json.dumps(sync(args.previous, args.output)))
    except (OSError, ValueError, KeyError) as exc:
        print(json.dumps({"status":"error","reason":str(exc)}), file=sys.stderr)
        sys.exit(1)
