import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "radio_atlas_update_data",
    Path(__file__).resolve().parents[1] / "scripts" / "update_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def row(freq, hours, days, start="01Oct", stop="31Oct", station="Radio Cairo"):
    return ";".join([
        str(freq), hours, days, "EG", station, "Arabic", "North Africa",
        "Test schedule", "100", start, stop,
    ])


class EiBiScheduleTests(unittest.TestCase):
    def test_season_candidates_roll_over_and_fallback(self):
        now = datetime(2026, 10, 30, 12, tzinfo=timezone.utc)
        self.assertEqual(
            MODULE.eibi_season_candidates(now),
            [
                "http://www.eibispace.de/dx/sked-b26.csv",
                "http://www.eibispace.de/dx/sked-a26.csv",
                "http://www.eibispace.de/dx/eibi.txt",
            ],
        )

    def test_summer_uses_current_and_previous_season(self):
        now = datetime(2026, 7, 1, 12, tzinfo=timezone.utc)
        self.assertEqual(
            MODULE.eibi_season_candidates(now)[:2],
            [
                "http://www.eibispace.de/dx/sked-a26.csv",
                "http://www.eibispace.de/dx/sked-b25.csv",
            ],
        )

    def test_parses_weekday_abbreviations_and_display_fields(self):
        now = datetime(2026, 10, 30, 12, 30, tzinfo=timezone.utc)  # Friday
        parsed = MODULE.parse_eibi(row(15000, "1200-1300", "Mo-Fr"), now)
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0], {
            "f": 15000, "s": "1200", "e": "1300",
            "n": "EG | Radio Cairo | Arabic | North Africa",
        })

    def test_parses_numeric_weekday_codes(self):
        now = datetime(2026, 10, 30, 12, 30, tzinfo=timezone.utc)  # Friday = 5
        self.assertEqual(len(MODULE.parse_eibi(row(15000, "1200-1300", "1245"), now)), 1)

    def test_parses_date_specific_days(self):
        now = datetime(2026, 10, 24, 12, 30, tzinfo=timezone.utc)
        self.assertEqual(len(MODULE.parse_eibi(row(15000, "1200-1300", "24Oct"), now)), 1)
        self.assertEqual(len(MODULE.parse_eibi(row(15000, "1200-1300", "24Oct"), now.replace(day=25))), 0)

    def test_honors_validity_dates(self):
        now = datetime(2026, 10, 30, 12, 30, tzinfo=timezone.utc)
        self.assertEqual(len(MODULE.parse_eibi(row(15000, "1200-1300", "5", "01Nov", "30Nov"), now)), 0)

    def test_overnight_transmission_uses_previous_schedule_day(self):
        now = datetime(2026, 10, 31, 0, 30, tzinfo=timezone.utc)  # Saturday
        parsed = MODULE.parse_eibi(row(15000, "2300-0100", "5"), now)
        self.assertEqual(len(parsed), 1)

    def test_ignores_rows_not_currently_on_air_and_header(self):
        now = datetime(2026, 10, 30, 12, 30, tzinfo=timezone.utc)
        data = "kHz;Time(UTC);Days;ITU;Station name;Language;Target area;Remarks;P;Start date;Stop date\n"
        data += row(15000, "1300-1400", "5")
        self.assertEqual(MODULE.parse_eibi(data, now), [])


if __name__ == "__main__":
    unittest.main()
