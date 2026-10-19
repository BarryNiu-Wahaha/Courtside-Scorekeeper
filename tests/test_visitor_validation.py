import unittest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from scorekeeper_remote.visitor_validation import validate_batch, validate_report_range
from scorekeeper_pipeline.validation import ValidationError

NOW = datetime.now(timezone.utc)

def event(**changes):
    row = dict(event_id=str(uuid4()), visitor_id=str(uuid4()), session_id=str(uuid4()),
               event='page_view', page='dashboard', properties={},
               occurred_at=NOW.isoformat(), device='mobile', browser='safari')
    row.update(changes)
    return row

class ValidationTests(unittest.TestCase):
    def valid(self, row):
        return validate_batch({'events': [row]}, NOW)

    def test_unknown_fields_rejected(self):
        for row in [event(email='private'), event(properties={'search': 'private'}), event(event_id='bad')]:
            with self.assertRaises(ValidationError): self.valid(row)

    def test_wrong_json_types_rejected_as_validation_errors(self):
        for key in ('event','page','browser','device'):
            with self.assertRaises(ValidationError): self.valid(event(**{key:{'unexpected':'value'}}))

    def test_batch_limits(self):
        self.assertEqual(len(validate_batch({'events': [event() for _ in range(20)]}, NOW)), 20)
        for rows in [[], [event() for _ in range(21)]]:
            with self.assertRaises(ValidationError): validate_batch({'events': rows}, NOW)

    def test_clock_bounds(self):
        for delta in [timedelta(hours=-25), timedelta(minutes=6)]:
            with self.assertRaises(ValidationError): self.valid(event(occurred_at=(NOW+delta).isoformat()))
        self.assertEqual(self.valid(event())[0]['received_at'], NOW)

    def test_event_properties(self):
        self.valid(event(event='engagement', properties={'active_ms': 15000}))
        self.valid(event(event='player_open', properties={'player_id': 'P012'}))
        for value in [15001, -1, True, 1.5]:
            with self.assertRaises(ValidationError): self.valid(event(event='engagement', properties={'active_ms': value}))
        self.valid(event(event='filter_change', properties={'control': 'category', 'value': 'official'}))
        with self.assertRaises(ValidationError): self.valid(event(event='filter_change', properties={'control':'search','value':'private'}))

    def test_report_range(self):
        start, end = validate_report_range({}, NOW)
        self.assertEqual(end-start, timedelta(days=7))
        with self.assertRaises(ValidationError): validate_report_range({'start': (NOW-timedelta(days=91)).isoformat(), 'end': NOW.isoformat()}, NOW)
