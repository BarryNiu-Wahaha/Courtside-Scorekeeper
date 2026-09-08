import hmac
import re
import time
import threading
from collections import defaultdict, deque
from itsdangerous import BadSignature, URLSafeTimedSerializer

class Authenticator:
    def __init__(self,secret,scorekeeper_pin,admin_pin,ttl=3600,attempts=5,window=300):
        if not isinstance(secret,str) or len(secret)<32:raise ValueError('SECRET_KEY must contain at least 32 characters')
        if any(not isinstance(p,str) or not re.fullmatch(r'[0-9]{8,}',p) for p in (scorekeeper_pin,admin_pin)) or scorekeeper_pin==admin_pin:raise ValueError('Configure distinct PINs of at least eight ASCII digits')
        self.serializer=URLSafeTimedSerializer(secret,salt='scorekeeper-session')
        self.pins={'scorekeeper':scorekeeper_pin,'admin':admin_pin}
        self.ttl=int(ttl);self.attempts=attempts;self.window=window;self.failures=defaultdict(deque);self.lock=threading.Lock()
    def login(self,role,pin,client):
        if not isinstance(role,str) or role not in self.pins:return None,'invalid role',400
        with self.lock:
            now=time.monotonic()
            for key in list(self.failures):
                while self.failures[key] and now-self.failures[key][0]>self.window:self.failures[key].popleft()
                if not self.failures[key]:del self.failures[key]
            failures=self.failures[(client,role)]
            if len(failures)>=self.attempts:return None,'too many PIN attempts',429
            if not isinstance(pin,str) or not pin.isascii() or not hmac.compare_digest(pin,self.pins[role]):
                failures.append(now);return None,'invalid PIN',401
            failures.clear();return self.serializer.dumps({'role':role}),None,200
    def verify(self,token):
        try:
            role=self.serializer.loads(token,max_age=self.ttl)['role']
            return role if isinstance(role,str) and role in self.pins else None
        except (BadSignature,KeyError,TypeError,ValueError):return None
