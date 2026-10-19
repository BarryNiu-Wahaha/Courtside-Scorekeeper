import unittest
from datetime import timedelta
from test_visitor_validation import NOW, event
from scorekeeper_remote.visitor_validation import validate_batch
from scorekeeper_remote.visitor_repository import MemoryVisitorRepository

class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.repo = MemoryVisitorRepository()
        self.start, self.end = NOW-timedelta(days=1), NOW+timedelta(hours=1)

    def rows(self):
        first = event()
        second = event(visitor_id=first['visitor_id'], session_id=first['session_id'])
        third = event(device='desktop', browser='chrome')
        active = event(visitor_id=first['visitor_id'], session_id=first['session_id'], event='engagement', properties={'active_ms':1200})
        return validate_batch({'events':[first,second,third,active]}, NOW)

    def test_retry_and_summary(self):
        rows = self.rows()
        self.assertEqual(self.repo.insert_events(rows), 4)
        self.assertEqual(self.repo.insert_events(rows), 0)
        summary = self.repo.summary(self.start,self.end)
        self.assertEqual([summary[k] for k in ('visits','unique_visitors','page_views','active_ms')], [2,2,3,1200])
        self.assertEqual(sum(x['count'] for x in summary['devices']),2)

    def test_pagination_with_equal_timestamps(self):
        self.repo.insert_events(self.rows())
        page = self.repo.sessions(self.start,self.end,limit=1)
        next_page = self.repo.sessions(self.start,self.end,cursor=page['next_cursor'],limit=1)
        self.assertEqual(len(next_page['items']),1)
        self.assertNotEqual(page['items'][0]['session_id'],next_page['items'][0]['session_id'])
        self.assertIsNone(next_page['next_cursor'])

    def test_expired_excluded_and_timeline(self):
        rows=self.rows(); old={**rows[0], 'event_id':event()['event_id'], 'received_at':NOW-timedelta(days=91)}
        self.repo.insert_events(rows+[old])
        self.assertEqual(self.repo.summary(NOW-timedelta(days=100),self.end)['page_views'],3)
        sid=rows[0]['session_id']; page=self.repo.timeline(sid,self.start,self.end,limit=2)
        rest=self.repo.timeline(sid,self.start,self.end,cursor=page['next_cursor'],limit=2)
        self.assertEqual(len(page['items'])+len(rest['items']),3)
        self.assertEqual(len({x['event_id'] for x in page['items']+rest['items']}),3)

    def test_invalid_cursor(self):
        from scorekeeper_pipeline.validation import ValidationError
        with self.assertRaises(ValidationError): self.repo.sessions(self.start,self.end,cursor='invalid')
