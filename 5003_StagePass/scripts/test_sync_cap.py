"""Run with: python -m unittest discover -s scripts -p test_sync_cap.py"""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from sync_cap import CAP, parse_event, parse_index, sync


INDEX = '<table id="pubAnn"><tr><td><a href="postPublic.aspx?id=abc">Notice</a></td><td>SCM</td></tr></table>'


def event(body="", title="Workshop", start="2026-12-04 12:00", end="2026-12-04 13:30"):
    metadata = {"Category": "Others", "Venue": "Not Applicable", "Start Date": start, "End Date": end}
    fields = "".join(f'<div class="cap-body-lower-text"><div class="cap-body-lower-title">{k}:</div>'
                     f'<div class="cap-body-lower-content">{v}</div></div>' for k, v in metadata.items())
    return (f'<div class="cap-header-title">{title}</div><div class="cap-header-time">(POSTED: 2026-11-25 11:21 AM )</div>'
            f'<div class="cap-body-upper">{body}</div>' + fields)


class CapTest(unittest.TestCase):
    def test_workshop_registration_and_deadline(self):
        html = event('<p>More details: <a href="https://cityu.edu.hk/workshop">Event page</a></p>'
                     '<p>Registration: <a href="https://forms.gle/abc">https://forms.gle/abc</a></p>'
                     '<p>R.S.V.P by 3 December 2026, 5:00pm</p>')
        data = parse_event("abc", "SCM", html)
        self.assertEqual(data["actions"], [{"kind":"registration","url":"https://forms.gle/abc"}])
        self.assertEqual(data["deadlines"][0]["at"], "2026-12-03T17:00:00+08:00")
        self.assertEqual(data["sessions"][0]["start"], "2026-12-04T12:00:00+08:00")

    def test_poster_and_plain_url(self):
        html = event('<p><a href="https://cityu.edu.hk/poster"><img src="poster.jpg"></a></p>',
                     start="2026-12-08 00:00", end="2026-12-08 00:00")
        e = parse_event("abc", "LBJ", html)
        self.assertEqual(e["actions"], [])
        self.assertEqual(e["sessions"][0]["start"], "2026-12-08")
        self.assertIsNone(e["venue"])
        e = parse_event("abc", "HKICE", event('<p>Please register using the link below:<br>https://forms.gle/live</p>'))
        self.assertEqual(e["actions"][0]["url"], "https://forms.gle/live")

    def test_conference_and_multiple_sessions(self):
        html = event('<p>Abstract submission deadline: 30 November 2026</p><p>Conference: 1–3 February 2027</p>'
                     '<p>Abstract Submission</p><p><a href="https://example.com/submit">https://example.com/submit</a></p>'
                     '<p>Extended Abstract Template</p><p><a href="https://example.com/template">https://example.com/template</a></p>',
                     "Call for papers", "2026-11-30 23:59", "2026-11-30 23:59")
        e = parse_event("abc", "SCM", html)
        self.assertEqual(e["deadlines"][0]["at"], "2026-11-30T23:59:00+08:00")
        self.assertEqual((e["sessions"][0]["start"],e["sessions"][0]["end"]),("2027-02-01","2027-02-03"))
        self.assertEqual(e["actions"],[{"kind":"submission","url":"https://example.com/submit"}])
        html = event('<p>Guest Lecture</p><p>Date: 10 December, 2026 (Thursday)</p><p>Time: 3:00 pm - 4:30 pm</p><p>Venue: M1052</p>'
                     '<p>Concert</p><p>Date: 12 December, 2026</p><p>Time: 7:30 pm</p><p>Venue: M1060</p>',
                     start="2026-12-10 15:00",end="2026-12-12 21:30")
        sessions = parse_event("abc","SCM",html)["sessions"]
        self.assertEqual([s["venue"] for s in sessions], ["M1052","M1060"])
        self.assertEqual([s["end"] for s in sessions], ["2026-12-10T16:30:00+08:00","2026-12-12T21:30:00+08:00"])

    def test_atomic_update(self):
        with TemporaryDirectory() as tmp:
            out = Path(tmp)/"feed.json"
            def get(url):
                return INDEX if url == CAP else event()
            self.assertEqual(sync(out, out, get)["status"], "updated")
            self.assertEqual(sync(out, out, get)["status"], "unchanged")
            prior = out.read_bytes()
            with self.assertRaises(ValueError):
                sync(out, out, lambda url: INDEX if url == CAP else "<h1>Temporary failure</h1>")
            self.assertEqual(out.read_bytes(), prior)
            with self.assertRaises(ValueError):
                parse_index('<table id="pubAnn"></table>')


if __name__ == "__main__":
    unittest.main()
