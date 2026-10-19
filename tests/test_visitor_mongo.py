import os
import unittest
from uuid import uuid4
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
import test_visitor_repository
from test_visitor_validation import NOW
from scorekeeper_remote.visitor_repository import MongoVisitorRepository

@unittest.skipUnless(os.getenv('VISITOR_TEST_MONGODB_URI'), 'isolated MongoDB URI not supplied')
class MongoRepositoryTests(test_visitor_repository.RepositoryTests):
    def setUp(self):
        from pymongo import MongoClient
        self.client=MongoClient(os.environ['VISITOR_TEST_MONGODB_URI'],tz_aware=True,serverSelectionTimeoutMS=3000)
        self.name='courtside_visitor_test_'+uuid4().hex
        self.repo=MongoVisitorRepository(self.client,self.name)
        self.repo.setup()
        self.start,self.end=NOW-timedelta(days=1),NOW+timedelta(hours=1)

    def tearDown(self):
        assert self.name.startswith('courtside_visitor_test_')
        self.client.drop_database(self.name)
        self.client.close()

    def test_setup_validation_and_concurrent_retries(self):
        from pymongo.errors import WriteError
        self.repo.setup()
        self.assertEqual(self.repo.collection.index_information()['visitor_retention']['expireAfterSeconds'],7776000)
        with self.assertRaises(WriteError): self.repo.collection.insert_one({'unexpected':'private'})
        rows=self.rows()
        with ThreadPoolExecutor(max_workers=2) as pool:
            inserted=list(pool.map(self.repo.insert_events,[rows,rows]))
        self.assertEqual(sum(inserted),4)

    def test_partial_failure_can_be_retried(self):
        from pymongo.errors import BulkWriteError
        rows=self.rows()
        with self.assertRaises(BulkWriteError): self.repo.insert_events(rows+[{'event_id':str(uuid4())}])
        self.assertEqual(self.repo.insert_events(rows),0)
        self.assertEqual(self.repo.summary(self.start,self.end)['visits'],2)
